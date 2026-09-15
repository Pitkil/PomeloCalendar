import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { fetchSchedule, SwuError, validateScheduleInput } from './src/official-swu.mjs'

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 20_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 8),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 600_000),
  corsOrigin: process.env.CORS_ORIGIN || '*'
}

const attempts = new Map()

function applyHeaders(response, origin) {
  const allowedOrigin = config.corsOrigin === '*' ? '*' : (origin === config.corsOrigin ? origin : config.corsOrigin)
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

function sendJson(response, status, value, origin = '') {
  applyHeaders(response, origin)
  response.writeHead(status)
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 16_384) throw new SwuError('PAYLOAD_TOO_LARGE', '请求内容过大', 413)
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new SwuError('INVALID_JSON', '请求必须是有效 JSON', 400)
  }
}

function checkRateLimit(request) {
  const key = request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || now >= current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs })
    return
  }
  current.count += 1
  if (current.count > config.rateLimitMax) {
    throw new SwuError('RATE_LIMITED', '同步请求过于频繁，请稍后再试', 429)
  }
}

export function createServer(dependencies = {}) {
  const scheduleFetcher = dependencies.fetchSchedule || fetchSchedule
  return http.createServer(async (request, response) => {
    const startedAt = Date.now()
    const origin = request.headers.origin || ''
    let status = 500

    try {
      if (request.method === 'OPTIONS') {
        applyHeaders(response, origin)
        response.writeHead(204)
        response.end()
        status = 204
        return
      }
      if (request.method === 'GET' && request.url === '/health') {
        status = 200
        sendJson(response, status, { status: 'ok', service: 'swu-calendar-auth', provider: 'swu-official' }, origin)
        return
      }
      if (request.method === 'POST' && request.url === '/api/swu/schedule') {
        checkRateLimit(request)
        const input = validateScheduleInput(await readJson(request))
        const result = await scheduleFetcher(input, { timeoutMs: config.timeoutMs })
        status = 200
        sendJson(response, status, result, origin)
        return
      }
      status = 404
      sendJson(response, status, { error: { code: 'NOT_FOUND', message: '接口不存在' } }, origin)
    } catch (error) {
      const safeError = error instanceof SwuError
        ? error
        : new SwuError('INTERNAL_ERROR', '服务器内部错误', 500)
      status = safeError.status
      sendJson(response, status, { error: { code: safeError.code, message: safeError.message } }, origin)
    } finally {
      console.info(`${request.method} ${request.url} ${status} ${Date.now() - startedAt}ms`)
    }
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const server = createServer()
  server.listen(config.port, config.host, () => {
    console.info(`SWU auth server listening on http://${config.host}:${config.port}`)
  })
}
