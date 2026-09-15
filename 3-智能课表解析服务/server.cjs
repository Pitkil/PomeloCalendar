require('dotenv').config()

const express = require('express')
const multer = require('multer')
const pdf = require('pdf-parse')

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } })
const port = Number(process.env.PORT || 8788)
const baseUrl = String(process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
const model = process.env.OPENAI_MODEL || 'deepseek-v4-flash'
const requestWindows = new Map()
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT = 8

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (req, res) => res.json({ ok: true, model }))

const limitParseRequests = (req, res, next) => {
  const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
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

app.post('/api/schedule/parse', limitParseRequests, upload.single('schedule'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('服务端未配置 OPENAI_API_KEY')
    if (!baseUrl) throw new Error('服务端未配置 OPENAI_BASE_URL')
    if (!req.file || !/pdf$/i.test(req.file.originalname || '') && req.file.mimetype !== 'application/pdf') throw new Error('只接受 PDF 课表文件')

    const extracted = await pdf(req.file.buffer)
    if (!extracted.text.trim()) throw new Error('PDF 未包含可读取文本')
    const prompt = `你是西南大学课程表结构化助手。将以下教务系统导出的课表 PDF 文本转换为 JSON。只输出一个 JSON 对象，绝不能附加解释。格式：{"courses":[{"title":"课程名称","teacher":"教师","place":"教室或场地","weekday":1,"sessions":"1-2节","weeks":"1-16周"}]}。weekday 中星期一到星期日为 1-7；保留单双周、多个周次和节次信息；同一门课在不同星期/节次/周次需要分别输出。不要凭空补课程。\n\nPDF 文本：\n${extracted.text}`
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result?.error?.message || `模型服务返回 ${response.status}`)
    const courses = cleanJson(result?.choices?.[0]?.message?.content)
    if (!courses.length) throw new Error('模型未识别到有效课程')
    res.json({ courses })
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : '课表解析失败' })
  }
})

app.listen(port, () => console.log(`SWU AI schedule parser listening on ${port}`))
