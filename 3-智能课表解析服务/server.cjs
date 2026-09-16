require('dotenv').config()

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const cloudbase = require('@cloudbase/node-sdk')
const express = require('express')
const multer = require('multer')

const execFileAsync = promisify(execFile)
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } })
const port = Number(process.env.PORT || 8788)
const baseUrl = String(process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
const model = process.env.OPENAI_MODEL || 'deepseek-v4-flash'
const secretId = String(process.env.TENCENTCLOUD_SECRETID || '').trim()
const secretKey = String(process.env.TENCENTCLOUD_SECRETKEY || '').trim()
const cloudCredentials = secretId && secretKey
  ? { secretId, secretKey, sessionToken: String(process.env.TENCENTCLOUD_SESSIONTOKEN || '').trim() || undefined }
  : {}
const cloudEnvId = String(process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || '').trim()
const cloud = cloudbase.init({ env: cloudEnvId || cloudbase.SYMBOL_CURRENT_ENV, ...cloudCredentials })
const db = cloud.database()
const jobs = db.collection('schedule_parse_jobs')
const requestWindows = new Map()
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT = 8
const JOB_STALE_MS = 10 * 60 * 1000
const inCloudRuntime = Boolean(process.env.TCB_ENV || process.env.TENCENTCLOUD_RUNENV || process.env.TENCENTCLOUD_SECRETID)
let collectionReady
let workerRunning = false
let lastRecoveryAt = 0

// CloudBase SDK may surface credential errors through a detached promise in a
// local development process. Keep the HTTP service alive so it can report a
// normal 503 response instead of being terminated by Node's default policy.
process.on('unhandledRejection', (error) => console.error('Unhandled CloudBase error:', error?.message || 'unknown error'))

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '128kb' }))

app.get('/health', (req, res) => res.json({ ok: true, model }))

const openIdOf = (req) => String(req.headers['x-wx-openid'] || req.headers['x-wx-open-id'] || '').trim()

const limitParseRequests = (req, res, next) => {
  const key = openIdOf(req) || String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const window = requestWindows.get(key) || { startedAt: now, count: 0 }
  if (now - window.startedAt >= RATE_WINDOW_MS) {
    window.startedAt = now
    window.count = 0
  }
  window.count += 1
  requestWindows.set(key, window)
  if (window.count > RATE_LIMIT) return res.status(429).json({ error: '解析请求过于频繁，请 15 分钟后再试' })
  next()
}

const ensureCollection = () => {
  if (!collectionReady) {
    try {
      collectionReady = Promise.resolve(jobs.limit(1).get()).catch(async () => {
        try {
          await db.createCollection('schedule_parse_jobs')
        } catch (error) {
          const message = String(error?.message || error)
          if (!/exist|already|已存在/i.test(message)) throw error
        }
      }).catch((error) => {
        collectionReady = undefined
        throw error
      })
    } catch (error) {
      collectionReady = undefined
      return Promise.reject(error)
    }
  }
  return collectionReady
}

const cleanJson = (content) => {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed.courses) || !parsed.courses.length) throw new Error('模型返回中缺少 courses 数组')
  return parsed.courses.map((course, index) => ({
    id: `ai-${index + 1}`,
    title: String(course.title || '').trim(),
    teacher: String(course.teacher || '').trim(),
    place: String(course.place || '').trim(),
    weekday: Number(course.weekday),
    sessions: String(course.sessions || '').trim(),
    weeks: String(course.weeks || '').trim()
  })).filter((course) => course.title && course.weekday >= 1 && course.weekday <= 7 && course.sessions)
}

const friendlyError = (error) => {
  const message = String(error instanceof Error ? error.message : error || '')
  if (/insufficient balance|余额/i.test(message)) return '大模型账户余额不足，请联系管理员充值后重试'
  if (/abort|timeout|timed out|超时/i.test(message)) return '大模型解析超时，请稍后重试'
  if (/PDF 未包含|无法读取该 PDF|只接受/.test(message)) return message
  if (/OPENAI_API_KEY|OPENAI_BASE_URL/.test(message)) return '解析服务尚未完成模型配置'
  if (/模型未识别|模型返回/.test(message)) return message
  return '课表解析失败，请稍后重试'
}

const extractPdfText = async (buffer) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swu-schedule-'))
  const pdfPath = path.join(tempDir, 'schedule.pdf')
  try {
    await fs.writeFile(pdfPath, buffer)
    const { stdout } = await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    })
    if (!stdout.trim()) throw new Error('PDF 未包含可读取文本')
    return stdout
  } catch (error) {
    if (error instanceof Error && error.message === 'PDF 未包含可读取文本') throw error
    throw new Error('无法读取该 PDF，请确认它不是加密或损坏文件')
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

const parseSchedule = async (buffer) => {
  if (!process.env.OPENAI_API_KEY) throw new Error('服务端未配置 OPENAI_API_KEY')
  if (!baseUrl) throw new Error('服务端未配置 OPENAI_BASE_URL')
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 12 * 1024 * 1024 || buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('只接受不超过 12MB 的 PDF 课表文件')
  const pdfText = await extractPdfText(buffer)
  const prompt = `你是西南大学课程表结构化助手。将以下教务系统导出的课表 PDF 文本转换为 JSON。只输出一个 JSON 对象，绝不能附加解释。格式：{"courses":[{"title":"课程名称","teacher":"教师","place":"教室或场地","weekday":1,"sessions":"1-2节","weeks":"1-16周"}]}。weekday 中星期一到星期日为 1-7；保留单双周、多个周次和节次信息；同一门课在不同星期/节次/周次需要分别输出。不要凭空补课程。\n\nPDF 文本：\n${pdfText}`
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(50000)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error?.message || `模型服务返回 ${response.status}`)
  const courses = cleanJson(result?.choices?.[0]?.message?.content)
  if (!courses.length) throw new Error('模型未识别到有效课程')
  return courses
}

const sendParsedSchedule = async (res, buffer) => {
  try {
    res.json({ courses: await parseSchedule(buffer) })
  } catch (error) {
    res.status(422).json({ error: friendlyError(error) })
  }
}

const recoverStaleJobs = async () => {
  if (Date.now() - lastRecoveryAt < 60000) return
  lastRecoveryAt = Date.now()
  const result = await jobs.where({ status: 'running' }).limit(20).get()
  const stale = (result.data || []).filter((job) => Number(job.updatedAt) < Date.now() - JOB_STALE_MS)
  await Promise.all(stale.map((job) => jobs.doc(job._id).update({ status: 'pending', updatedAt: Date.now() })))
}

const processJob = async (job) => {
  try {
    const downloaded = await cloud.downloadFile({ fileID: job.fileID })
    const buffer = Buffer.isBuffer(downloaded.fileContent) ? downloaded.fileContent : Buffer.from(downloaded.fileContent || '')
    const courses = await parseSchedule(buffer)
    await jobs.doc(job._id).update({ status: 'succeeded', courses, error: '', updatedAt: Date.now(), finishedAt: Date.now() })
  } catch (error) {
    await jobs.doc(job._id).update({ status: 'failed', error: friendlyError(error), updatedAt: Date.now(), finishedAt: Date.now() })
  } finally {
    try {
      await cloud.deleteFile({ fileList: [job.fileID] })
    } catch (error) {
      console.warn('Unable to delete temporary schedule file:', error?.message || 'unknown error')
    }
  }
}

const runPendingJobs = async () => {
  if (workerRunning) return
  workerRunning = true
  try {
    await ensureCollection()
    await recoverStaleJobs()
    while (true) {
      const result = await jobs.where({ status: 'pending' }).limit(10).get()
      const job = (result.data || []).sort((left, right) => Number(left.createdAt) - Number(right.createdAt))[0]
      if (!job) break
      const claim = await jobs.where({ _id: job._id, status: 'pending' }).update({ status: 'running', updatedAt: Date.now() })
      if (!claim.updated) continue
      await processJob(job)
    }
  } catch (error) {
    console.error('Schedule worker error:', error?.message || 'unknown error')
  } finally {
    workerRunning = false
  }
}

app.post('/api/schedule/parse', limitParseRequests, upload.single('schedule'), (req, res) => {
  if (!req.file || (!/pdf$/i.test(req.file.originalname || '') && req.file.mimetype !== 'application/pdf')) return res.status(422).json({ error: '只接受 PDF 课表文件' })
  return sendParsedSchedule(res, req.file.buffer)
})

app.post('/api/schedule/jobs', limitParseRequests, async (req, res) => {
  const openId = openIdOf(req)
  if (!openId) return res.status(401).json({ error: '请从关联的微信小程序发起导入' })
  const fileID = String(req.body?.fileID || '')
  const fileName = String(req.body?.fileName || '').slice(0, 160)
  if (!/\.pdf$/i.test(fileName) || !fileID.startsWith('cloud://') || !fileID.includes('/schedule-imports/')) return res.status(422).json({ error: '课表文件无效，请重新选择 PDF' })
  try {
    await ensureCollection()
    const jobId = crypto.randomUUID()
    const now = Date.now()
    await jobs.doc(jobId).set({ ownerOpenId: openId, fileID, fileName, status: 'pending', courses: [], error: '', attempts: 0, createdAt: now, updatedAt: now })
    res.status(202).json({ jobId, status: 'pending' })
    setImmediate(() => void runPendingJobs())
  } catch (error) {
    console.error('Unable to create schedule job:', error?.message || 'unknown error')
    res.status(503).json({ error: '云数据库暂时不可用，请稍后重试' })
  }
})

app.get('/api/schedule/jobs/:jobId', async (req, res) => {
  const openId = openIdOf(req)
  if (!openId) return res.status(401).json({ error: '请从关联的微信小程序查询任务' })
  try {
    await ensureCollection()
    const result = await jobs.doc(String(req.params.jobId || '')).get()
    const job = result.data?.[0]
    if (!job || job.ownerOpenId !== openId) return res.status(404).json({ error: '解析任务不存在或已失效' })
    res.json({ status: job.status, courses: job.status === 'succeeded' ? job.courses : undefined, error: job.status === 'failed' ? job.error : undefined })
  } catch (error) {
    res.status(503).json({ error: '暂时无法查询解析进度' })
  }
})

app.listen(port, () => {
  console.log(`SWU AI schedule parser listening on ${port}`)
  if (inCloudRuntime) void runPendingJobs()
})

if (inCloudRuntime) {
  const workerTimer = setInterval(() => void runPendingJobs(), 5000)
  workerTimer.unref()
}
