const fs = require('fs')
const { app, safeStorage } = require('electron')
const path = require('path')

const NAVER_WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver'
const NAVER_SESSION_VALIDATION_TTL_MS = 30 * 1000

let lastSessionValidation = {
  checkedAt: 0,
  result: false,
}

function getSessionPath() {
  return path.join(app.getPath('userData'), 'naver-session.json')
}

function isAuthCookie(cookie) {
  return cookie?.name === 'NID_AUT' || cookie?.name === 'NID_SES'
}

function isCookieExpired(cookie) {
  if (!cookie || typeof cookie.expires !== 'number') {
    return false
  }

  if (cookie.expires <= 0) {
    return false
  }

  return cookie.expires * 1000 <= Date.now()
}

function wrapSessionPayload(storageState) {
  const serialized = JSON.stringify(storageState)

  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      payload: safeStorage.encryptString(serialized).toString('base64'),
      version: 1,
    }
  }

  return {
    encrypted: false,
    payload: serialized,
    version: 1,
  }
}

function unwrapSessionPayload(rawPayload) {
  if (!rawPayload) {
    return null
  }

  if (rawPayload.version === 1 && typeof rawPayload.payload === 'string') {
    if (rawPayload.encrypted) {
      const decrypted = safeStorage.decryptString(Buffer.from(rawPayload.payload, 'base64'))
      return JSON.parse(decrypted)
    }

    return JSON.parse(rawPayload.payload)
  }

  return rawPayload
}

function loadSessionState() {
  const sessionPath = getSessionPath()
  if (!fs.existsSync(sessionPath)) {
    return null
  }

  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'))
  return unwrapSessionPayload(raw)
}

function saveSessionState(storageState) {
  const sessionPath = getSessionPath()
  fs.writeFileSync(sessionPath, JSON.stringify(wrapSessionPayload(storageState), null, 2), 'utf8')
  return sessionPath
}

function clearSessionState() {
  const sessionPath = getSessionPath()
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { force: true })
  }
}

function hasUsableSessionState() {
  try {
    const state = loadSessionState()
    if (!state) {
      return false
    }

    return (state.cookies || []).some((cookie) => isAuthCookie(cookie) && !isCookieExpired(cookie))
  } catch {
    return false
  }
}

function cookieMatchesUrl(cookie, targetUrl) {
  try {
    const url = new URL(targetUrl)
    const hostname = url.hostname
    const cookieDomain = String(cookie?.domain || '').replace(/^\./, '')
    const cookiePath = String(cookie?.path || '/')

    if (!cookieDomain || (hostname !== cookieDomain && !hostname.endsWith(`.${cookieDomain}`))) {
      return false
    }

    return url.pathname.startsWith(cookiePath)
  } catch {
    return false
  }
}

function buildCookieHeader(cookies, targetUrl) {
  return (cookies || [])
    .filter((cookie) => !isCookieExpired(cookie) && cookieMatchesUrl(cookie, targetUrl))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

function isNaverLoginUrl(url = '') {
  return /^https:\/\/nid\.naver\.com\/nidlogin\.login/i.test(String(url))
}

function hasNaverLoginMarker(text = '') {
  return /nidlogin\.login|nid\.naver\.com\/nidlogin|id="log\.login"|name="id"|name="pw"/i.test(String(text || ''))
}

async function validateStoredNaverSession({ bypassCache = false } = {}) {
  if (!hasUsableSessionState()) {
    lastSessionValidation = { checkedAt: Date.now(), result: false }
    return false
  }

  if (!bypassCache && Date.now() - lastSessionValidation.checkedAt < NAVER_SESSION_VALIDATION_TTL_MS) {
    return lastSessionValidation.result
  }

  try {
    const state = loadSessionState()
    if (!state) {
      lastSessionValidation = { checkedAt: Date.now(), result: false }
      return false
    }

    const cookieHeader = buildCookieHeader(state.cookies || [], NAVER_WRITE_URL)
    if (!cookieHeader) {
      lastSessionValidation = { checkedAt: Date.now(), result: false }
      return false
    }

    const response = await fetch(NAVER_WRITE_URL, {
      headers: {
        cookie: cookieHeader,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
    })

    const redirectedTo = response.headers.get('location') || ''
    const finalUrl = response.url || ''
    let bodyText = ''
    const contentType = response.headers.get('content-type') || ''
    if (/text\/html|application\/xhtml/i.test(contentType)) {
      bodyText = await response.text().catch(() => '')
    }

    const isValid =
      !isNaverLoginUrl(redirectedTo) &&
      !isNaverLoginUrl(finalUrl) &&
      !hasNaverLoginMarker(bodyText) &&
      response.status < 400

    lastSessionValidation = { checkedAt: Date.now(), result: isValid }
    return isValid
  } catch {
    lastSessionValidation = { checkedAt: Date.now(), result: false }
    return false
  }
}

module.exports = {
  clearSessionState,
  getSessionPath,
  hasNaverLoginMarker,
  hasUsableSessionState,
  loadSessionState,
  saveSessionState,
  validateStoredNaverSession,
}
