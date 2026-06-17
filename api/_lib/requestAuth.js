function parseAllowedOrigins(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function normalizeOrigin(rawValue) {
  if (!rawValue) return null

  try {
    return new URL(String(rawValue)).origin
  } catch {
    return null
  }
}

function getExpectedHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
}

function getExpectedProtocol(req) {
  return String(req.headers['x-forwarded-proto'] || 'https').trim()
}

function getRequestOrigin(req) {
  const originHeader = normalizeOrigin(req.headers.origin)
  if (originHeader) return originHeader

  return normalizeOrigin(req.headers.referer)
}

function hasValidApiSecret(req) {
  const expected = String(process.env.API_SECRET || '').trim()
  if (!expected) return true

  const providedAppSecret = String(req.headers['x-app-secret'] || '').trim()
  const providedApiSecret = String(req.headers['x-api-secret'] || '').trim()
  return providedAppSecret === expected || providedApiSecret === expected
}

function isAllowedBrowserRequest(req) {
  const requestOrigin = getRequestOrigin(req)
  const expectedHost = getExpectedHost(req)
  const expectedProtocol = getExpectedProtocol(req)
  const expectedOrigin = expectedHost ? `${expectedProtocol}://${expectedHost}` : null

  if (requestOrigin && expectedOrigin && requestOrigin === expectedOrigin) {
    return true
  }

  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return true
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase()
  return fetchSite === 'same-origin' || fetchSite === 'same-site'
}

function isAuthorizedRequest(req) {
  return hasValidApiSecret(req) || isAllowedBrowserRequest(req)
}

function rejectUnauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' })
}

module.exports = {
  hasValidApiSecret,
  isAllowedBrowserRequest,
  isAuthorizedRequest,
  rejectUnauthorized,
}
