function defaultPath(pathname) {
  if (!pathname || !pathname.startsWith('/') || pathname === '/') return '/'
  const index = pathname.lastIndexOf('/')
  return index <= 0 ? '/' : pathname.slice(0, index)
}

function domainMatches(hostname, cookie) {
  return cookie.hostOnly
    ? hostname === cookie.domain
    : hostname === cookie.domain || hostname.endsWith(`.${cookie.domain}`)
}

function pathMatches(pathname, cookiePath) {
  if (pathname === cookiePath) return true
  if (!pathname.startsWith(cookiePath)) return false
  return cookiePath.endsWith('/') || pathname.charAt(cookiePath.length) === '/'
}

export class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  store(urlValue, headers) {
    const url = new URL(urlValue)
    const setCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : [])

    for (const header of setCookies) {
      const parts = header.split(';').map((part) => part.trim())
      const separator = parts[0].indexOf('=')
      if (separator <= 0) continue

      const cookie = {
        name: parts[0].slice(0, separator),
        value: parts[0].slice(separator + 1),
        domain: url.hostname.toLowerCase(),
        hostOnly: true,
        path: defaultPath(url.pathname),
        secure: false,
        expiresAt: null
      }

      for (const attribute of parts.slice(1)) {
        const [rawName, ...rawValue] = attribute.split('=')
        const name = rawName.toLowerCase()
        const value = rawValue.join('=')
        if (name === 'domain' && value) {
          cookie.domain = value.replace(/^\./, '').toLowerCase()
          cookie.hostOnly = false
        } else if (name === 'path' && value) {
          cookie.path = value
        } else if (name === 'secure') {
          cookie.secure = true
        } else if (name === 'max-age') {
          cookie.expiresAt = Date.now() + Number(value) * 1000
        } else if (name === 'expires') {
          const timestamp = Date.parse(value)
          if (Number.isFinite(timestamp)) cookie.expiresAt = timestamp
        }
      }

      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`
      if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) this.cookies.delete(key)
      else this.cookies.set(key, cookie)
    }
  }

  header(urlValue) {
    const url = new URL(urlValue)
    const now = Date.now()
    const values = []

    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
        this.cookies.delete(key)
        continue
      }
      if (cookie.secure && url.protocol !== 'https:') continue
      if (!domainMatches(url.hostname.toLowerCase(), cookie)) continue
      if (!pathMatches(url.pathname, cookie.path)) continue
      values.push(cookie)
    }

    return values
      .sort((left, right) => right.path.length - left.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  clear() {
    this.cookies.clear()
  }
}
