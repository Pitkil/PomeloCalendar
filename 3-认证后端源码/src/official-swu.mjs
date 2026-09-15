import vm from 'node:vm'
import { CookieJar } from './cookie-jar.mjs'

const JW_SERVICE = 'https://jw.swu.edu.cn/sso/zllogin?federalEnable=true'
const CAS_LOGIN = `https://uaaap.swu.edu.cn/cas/login?service=${encodeURIComponent(JW_SERVICE)}`
// Keep the complete SSO chain on HTTPS. The IDP sets Secure cookies; an HTTP
// OAuth hop would silently drop them before the authorization redirect.
const oauthUrl = new URL('https://idm.swu.edu.cn/am/oauth2/authorize')
oauthUrl.search = new URLSearchParams({
  service: 'initService',
  response_type: 'code',
  client_id: '7c1zokoljl9bbiho6yuo',
  scope: 'uid cn userIdCode',
  redirect_uri: CAS_LOGIN,
  decision: 'Allow'
}).toString()

const loginEntry = new URL('https://idm.swu.edu.cn/am/UI/Login')
loginEntry.search = new URLSearchParams({
  realm: '/',
  service: 'initService',
  goto: oauthUrl.toString()
}).toString()

const DEFAULT_ENDPOINTS = {
  loginEntry: loginEntry.toString(),
  loginPost: 'https://idm.swu.edu.cn/am/UI/Login',
  desScript: 'https://idm.swu.edu.cn/am/bjcaportal/js/des.js',
  schedule: 'https://jw.swu.edu.cn/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151'
}
const OFFICIAL_HOSTS = new Set(['idm.swu.edu.cn', 'uaaap.swu.edu.cn', 'jw.swu.edu.cn'])

export class SwuError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'SwuError'
    this.code = code
    this.status = status
  }
}

function getInputValue(html, target) {
  const tags = html.match(/<input\b[^>]*>/gi) || []
  for (const tag of tags) {
    const attributes = {}
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi)) {
      attributes[match[1].toLowerCase()] = match[3]
    }
    if (attributes.name === target || attributes.id === target) return attributes.value || ''
  }
  return ''
}

function assertOfficialUrl(urlValue) {
  const url = new URL(urlValue)
  if (!OFFICIAL_HOSTS.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    throw new SwuError('UNSAFE_REDIRECT', '统一认证返回了不受信任的跳转地址')
  }
  return url
}

async function fetchWithJar(urlValue, options, jar, signal, redirects = 10) {
  let url = assertOfficialUrl(urlValue)
  let method = options.method || 'GET'
  let body = options.body
  const headers = new Headers(options.headers || {})

  for (let count = 0; count <= redirects; count += 1) {
    const cookie = jar.header(url)
    if (cookie) headers.set('Cookie', cookie)
    else headers.delete('Cookie')

    const response = await fetch(url, { method, headers, body, redirect: 'manual', signal })
    jar.store(url, response.headers)

    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (count === redirects) throw new SwuError('TOO_MANY_REDIRECTS', '统一认证跳转次数过多')

    url = assertOfficialUrl(new URL(location, url))
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET'
      body = undefined
      headers.delete('Content-Type')
    }
  }

  throw new SwuError('TOO_MANY_REDIRECTS', '统一认证跳转次数过多')
}

let desCache = null
let desCacheExpiresAt = 0

async function loadOfficialDes(sourceUrl, signal) {
  if (desCache && Date.now() < desCacheExpiresAt) return desCache
  const response = await fetch(assertOfficialUrl(sourceUrl), { signal })
  assertOfficialUrl(response.url)
  if (!response.ok) throw new SwuError('AUTH_SCRIPT_UNAVAILABLE', '统一认证加密脚本暂时不可用')
  const source = await response.text()
  if (source.length > 100_000 || !/function\s+strEnc\s*\(/.test(source)) {
    throw new SwuError('AUTH_SCRIPT_INVALID', '统一认证加密脚本格式异常')
  }
  desCache = source
  desCacheExpiresAt = Date.now() + 6 * 60 * 60 * 1000
  return source
}

export function encryptCredential(source, value, randomKey) {
  const sandbox = Object.create(null)
  sandbox.input = String(value)
  sandbox.key = String(randomKey)
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
  vm.runInContext(source, sandbox, { timeout: 1000 })
  const encrypted = vm.runInContext('strEnc(input, key, "", "")', sandbox, { timeout: 1000 })
  if (!/^[0-9A-F]+$/.test(encrypted)) throw new SwuError('AUTH_ENCRYPTION_FAILED', '统一认证加密失败')
  return encrypted
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function numberValue(value) {
  const number = Number.parseInt(stringValue(value), 10)
  return Number.isFinite(number) ? number : 0
}

export function normalizeCourse(course, index = 0) {
  const title = stringValue(course.kcmc || course.title) || '未命名课程'
  const weekday = Math.max(1, Math.min(7, numberValue(course.xqj || course.weekday) || 1))
  const sessions = stringValue(course.jc || course.sessions) || '1-2节'
  const weeks = stringValue(course.zcd || course.weeks) || '1-19周'
  const place = stringValue(course.cdmc || course.place)
  const teacher = stringValue(course.xm || course.jsxm || course.zfjmc || course.teacher)
  const sourceId = stringValue(course.kch_id || course.course_id || course.kch)

  return {
    id: sourceId || `swu-${index + 1}-${weekday}-${sessions}`,
    course_id: sourceId,
    title,
    teacher,
    place,
    weekday,
    sessions,
    weeks,
    campus: stringValue(course.xqmc || course.campus),
    className: stringValue(course.jxbmc || course.class_name),
    credit: stringValue(course.xf || course.credit)
  }
}

export function validateScheduleInput(body) {
  const username = stringValue(body?.username)
  const password = typeof body?.password === 'string' ? body.password : ''
  const year = Number(body?.year)
  const term = Number(body?.term)

  if (!/^[A-Za-z0-9_.-]{4,32}$/.test(username)) {
    throw new SwuError('INVALID_USERNAME', '请输入有效学号', 400)
  }
  if (!password || password.length > 128) {
    throw new SwuError('INVALID_PASSWORD', '请输入有效统一认证密码', 400)
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new SwuError('INVALID_YEAR', '学年起始年格式不正确', 400)
  }
  if (term !== 1 && term !== 2) {
    throw new SwuError('INVALID_TERM', '学期只能是 1 或 2', 400)
  }
  return { username, password, year, term }
}

export async function fetchSchedule(input, options = {}) {
  const endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints }
  const timeoutMs = options.timeoutMs || 20_000
  const signal = AbortSignal.timeout(timeoutMs)
  const jar = new CookieJar()

  try {
    const entryResponse = await fetchWithJar(endpoints.loginEntry, {
      headers: { 'User-Agent': 'SWU-Campus-Calendar/1.0' }
    }, jar, signal)
    if (!entryResponse.ok) throw new SwuError('AUTH_UNAVAILABLE', '统一认证入口暂时不可用')
    const loginHtml = await entryResponse.text()

    const randomKey = getInputValue(loginHtml, 'random')
    const goto = getInputValue(loginHtml, 'goto')
    const query = getInputValue(loginHtml, 'SunQueryParamsString')
    if (!randomKey || !goto || !query) {
      throw new SwuError('AUTH_PAGE_CHANGED', '统一认证页面结构已变化，请更新后端')
    }

    const desSource = await loadOfficialDes(endpoints.desScript, signal)
    const form = new URLSearchParams({
      IDToken1: encryptCredential(desSource, input.username, randomKey),
      IDToken2: encryptCredential(desSource, input.password, randomKey),
      IDToken3: '',
      goto,
      SunQueryParamsString: query,
      encoded: getInputValue(loginHtml, 'encoded') || 'true',
      gx_charset: getInputValue(loginHtml, 'gx_charset') || 'UTF-8'
    })

    const loginResponse = await fetchWithJar(endpoints.loginPost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'SWU-Campus-Calendar/1.0',
        Referer: endpoints.loginEntry
      },
      body: form.toString()
    }, jar, signal)

    const loginResult = await loginResponse.text()
    if (process.env.DEBUG_AUTH === '1') {
      console.info(`auth target-host=${new URL(loginResponse.url).hostname} status=${loginResponse.status}`)
    }
    const loginTargetHost = new URL(loginResponse.url).hostname
    if (!loginResponse.ok || loginTargetHost === 'idm.swu.edu.cn' || /统一认证管理系统|用户名密码|IDToken1/i.test(loginResult)) {
      throw new SwuError('AUTH_FAILED', '学号或密码错误，或统一认证需要额外验证', 401)
    }

    const termCode = input.term * input.term * 3
    const scheduleResponse = await fetchWithJar(endpoints.schedule, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'SWU-Campus-Calendar/1.0',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://jw.swu.edu.cn/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151'
      },
      body: new URLSearchParams({ xnm: String(input.year), xqm: String(termCode) }).toString()
    }, jar, signal)

    const contentType = scheduleResponse.headers.get('content-type') || ''
    const responseText = await scheduleResponse.text()
    if (process.env.DEBUG_AUTH === '1') {
      console.info(`schedule target-host=${new URL(scheduleResponse.url).hostname} status=${scheduleResponse.status} type=${contentType}`)
    }
    if ([401, 403, 901].includes(scheduleResponse.status) || /<html|统一认证|用户登录/i.test(responseText)) {
      throw new SwuError('AUTH_FAILED', '统一认证失败或登录状态已过期', 401)
    }
    if (!scheduleResponse.ok) throw new SwuError('SCHEDULE_UNAVAILABLE', '教务系统暂时无法查询课表')
    if (!contentType.includes('json') && !responseText.trim().startsWith('{')) {
      throw new SwuError('SCHEDULE_FORMAT_CHANGED', '教务系统返回了无法识别的课表格式')
    }

    let payload
    try {
      payload = JSON.parse(responseText)
    } catch {
      throw new SwuError('SCHEDULE_FORMAT_CHANGED', '课表数据解析失败')
    }

    const rawCourses = Array.isArray(payload.kbList)
      ? payload.kbList
      : (Array.isArray(payload.courses) ? payload.courses : [])
    const courses = rawCourses.map(normalizeCourse)
    return {
      courses,
      meta: {
        year: input.year,
        term: input.term,
        count: courses.length,
        provider: 'swu-official',
        fetchedAt: new Date().toISOString()
      }
    }
  } catch (error) {
    if (error instanceof SwuError) throw error
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new SwuError('UPSTREAM_TIMEOUT', '统一认证或教务系统响应超时', 504)
    }
    throw new SwuError('UPSTREAM_ERROR', '无法连接西南大学统一认证或教务系统')
  } finally {
    jar.clear()
  }
}
