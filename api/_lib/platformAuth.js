const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { isAuthorizedRequest } = require('./requestAuth')

const ROOT_DIR = process.cwd()
const IG_GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
const GOOGLE_REFRESH_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INSTAGRAM_STATE_TTL_MS = 10 * 60 * 1000

function readJsonFileIfExists(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath)
  if (!fs.existsSync(fullPath)) return null

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeJsonFile(relativePath, value) {
  const fullPath = path.join(ROOT_DIR, relativePath)

  try {
    fs.writeFileSync(fullPath, JSON.stringify(value, null, 2))
    return true
  } catch {
    return false
  }
}

function deleteFile(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath)

  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    return true
  } catch {
    return false
  }
}

function loadInstagramTokens() {
  return (
    readJsonFileIfExists('server/.instagram_tokens.json') ||
    readJsonFileIfExists('api/.instagram_tokens.json')
  )
}

function loadYoutubeTokens() {
  return (
    readJsonFileIfExists('server/.youtube_tokens.json') ||
    readJsonFileIfExists('api/.youtube_tokens.json')
  )
}

function saveInstagramTokens(tokens) {
  return writeJsonFile('server/.instagram_tokens.json', tokens) || writeJsonFile('api/.instagram_tokens.json', tokens)
}

function saveYoutubeTokens(tokens) {
  return writeJsonFile('server/.youtube_tokens.json', tokens) || writeJsonFile('api/.youtube_tokens.json', tokens)
}

function clearInstagramTokens() {
  deleteFile('server/.instagram_tokens.json')
  deleteFile('api/.instagram_tokens.json')
}

function clearYoutubeTokens() {
  deleteFile('server/.youtube_tokens.json')
  deleteFile('api/.youtube_tokens.json')
}

function getYoutubeCredentials() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }

  const raw =
    readJsonFileIfExists('server/client_secret.json') ||
    readJsonFileIfExists('api/client_secret.json')

  const credentials = raw?.web || raw?.installed
  if (!credentials?.client_id || !credentials?.client_secret) {
    return null
  }

  return {
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
  }
}

function isInstagramOAuthConfigured() {
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || process.env.instagram_redirect_uri

  return Boolean(appId && appSecret && redirectUri)
}

function getInstagramOAuthConfig() {
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || process.env.instagram_redirect_uri || 'http://localhost:3001/api/instagram/oauth/callback'

  if (!appId || !appSecret || !redirectUri) {
    return null
  }

  return { appId, appSecret, redirectUri }
}

function getInstagramAuthMaterial() {
  const serverToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const serverBusinessId = process.env.INSTAGRAM_BUSINESS_ID
  if (serverToken && serverBusinessId) {
    return {
      accessToken: serverToken,
      businessId: serverBusinessId,
      mode: 'server-token',
      username: null,
    }
  }

  const oauthTokens = loadInstagramTokens()
  if (oauthTokens?.accessToken && oauthTokens?.businessId) {
    return {
      accessToken: oauthTokens.accessToken,
      businessId: oauthTokens.businessId,
      mode: 'oauth',
      username: oauthTokens.username || null,
    }
  }

  return null
}

function getYoutubeOAuthConfig() {
  const credentials = getYoutubeCredentials()
  if (!credentials?.clientId || !credentials?.clientSecret) {
    return null
  }

  return {
    ...credentials,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/youtube/oauth/callback',
  }
}

function getApiSecret() {
  return process.env.API_SECRET || ''
}

function isApiSecretValid(req) {
  return isAuthorizedRequest(req)
}

function createSignedState(scope, secret) {
  const payload = {
    scope,
    nonce: crypto.randomBytes(16).toString('hex'),
    ts: Date.now(),
  }
  const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex')
  return `${rawPayload}.${signature}`
}

function readSignedState(state, expectedScope, secret) {
  const [rawPayload, signature] = String(state || '').split('.')
  if (!rawPayload || !signature) {
    throw new Error('state missing')
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex')
  if (signature !== expectedSignature) {
    throw new Error('state mismatch')
  }

  const payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf-8'))
  if (payload.scope !== expectedScope) {
    throw new Error('state scope mismatch')
  }
  if (!payload.ts || Date.now() - payload.ts > INSTAGRAM_STATE_TTL_MS) {
    throw new Error('state expired')
  }

  return payload
}

async function validateInstagramSession() {
  const auth = getInstagramAuthMaterial()
  const oauthConfigured = isInstagramOAuthConfigured()

  if (!auth?.accessToken || !auth?.businessId) {
    return {
      connected: false,
      hasAccessToken: false,
      hasBusinessId: false,
      mode: oauthConfigured ? 'oauth' : 'server-token',
      state: oauthConfigured ? 'expired' : 'unconfigured',
      username: null,
      validationError: null,
      canReconnect: oauthConfigured,
      canDisconnect: false,
    }
  }

  try {
    const response = await fetch(
      `${IG_GRAPH_BASE}/${auth.businessId}?fields=id,username&access_token=${encodeURIComponent(auth.accessToken)}`
    )
    const data = await response.json()

    if (!response.ok || data?.error || !data?.id) {
      const detail = data?.error?.message || `Instagram auth validation failed (${response.status})`
      return {
        connected: false,
        hasAccessToken: true,
        hasBusinessId: true,
        mode: auth.mode,
        state: oauthConfigured ? 'expired' : 'unconfigured',
        username: auth.username,
        validationError: detail,
        canReconnect: oauthConfigured,
        canDisconnect: auth.mode === 'oauth',
      }
    }

    return {
      connected: true,
      hasAccessToken: true,
      hasBusinessId: true,
      mode: auth.mode,
      state: 'connected',
      username: data.username || auth.username || null,
      validationError: null,
      canReconnect: oauthConfigured,
      canDisconnect: auth.mode === 'oauth',
    }
  } catch (error) {
    return {
      connected: false,
      hasAccessToken: true,
      hasBusinessId: true,
      mode: auth.mode,
      state: oauthConfigured ? 'expired' : 'unconfigured',
      username: auth.username,
      validationError: error.message,
      canReconnect: oauthConfigured,
      canDisconnect: auth.mode === 'oauth',
    }
  }
}

function buildInstagramAuthUrl() {
  const config = getInstagramOAuthConfig()
  if (!config) {
    throw new Error(
      'Instagram OAuth is not configured. META_APP_ID or INSTAGRAM_APP_ID, META_APP_SECRET or INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI are required.'
    )
  }

  const stateSecret = getApiSecret() || config.appSecret
  const state = createSignedState('instagram', stateSecret)
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', config.appId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('auth_type', 'rerequest')
  url.searchParams.set('return_scopes', 'true')
  url.searchParams.set(
    'scope',
    [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(',')
  )
  url.searchParams.set('state', state)

  return { url: url.toString(), state }
}

async function handleInstagramOAuthCallback({ code, state }) {
  const config = getInstagramOAuthConfig()
  if (!config) {
    throw new Error('Instagram OAuth is not configured.')
  }

  readSignedState(state, 'instagram', getApiSecret() || config.appSecret)

  const shortUrl = new URL(`${IG_GRAPH_BASE}/oauth/access_token`)
  shortUrl.searchParams.set('client_id', config.appId)
  shortUrl.searchParams.set('client_secret', config.appSecret)
  shortUrl.searchParams.set('redirect_uri', config.redirectUri)
  shortUrl.searchParams.set('code', String(code))

  const shortResponse = await fetch(shortUrl)
  const shortData = await shortResponse.json()
  if (!shortResponse.ok || !shortData.access_token) {
    throw new Error(shortData?.error?.message || 'Failed to exchange Instagram auth code')
  }

  const longUrl = new URL(`${IG_GRAPH_BASE}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', config.appId)
  longUrl.searchParams.set('client_secret', config.appSecret)
  longUrl.searchParams.set('fb_exchange_token', shortData.access_token)

  const longResponse = await fetch(longUrl)
  const longData = await longResponse.json()
  if (!longResponse.ok || !longData.access_token) {
    throw new Error(longData?.error?.message || 'Failed to upgrade Instagram access token')
  }

  const accessToken = longData.access_token
  const pagesUrl = new URL(`${IG_GRAPH_BASE}/me/accounts`)
  pagesUrl.searchParams.set('access_token', accessToken)
  pagesUrl.searchParams.set('fields', 'id,name,instagram_business_account{id,username}')
  const pagesResponse = await fetch(pagesUrl)
  const pages = await pagesResponse.json()
  const page = (pages.data || []).find((item) => item.instagram_business_account?.id)

  if (!pagesResponse.ok || !page?.instagram_business_account?.id) {
    throw new Error('No Instagram Business account is linked to this Meta account.')
  }

  const business = page.instagram_business_account
  saveInstagramTokens({
    accessToken,
    businessId: business.id,
    username: business.username || null,
    pageId: page.id,
    updatedAt: new Date().toISOString(),
  })
}

async function fetchGoogleTokenInfo(accessToken) {
  const url = new URL(GOOGLE_TOKENINFO_URL)
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url)
  const data = await response.json()
  return { response, data }
}

async function refreshYoutubeAccessToken(tokens, credentials) {
  if (!tokens?.refresh_token || !credentials?.clientId || !credentials?.clientSecret) {
    return null
  }

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  })

  const response = await fetch(GOOGLE_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await response.json()

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'Failed to refresh YouTube access token')
  }

  const nextTokens = {
    ...tokens,
    access_token: data.access_token,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : tokens.expiry_date,
  }

  saveYoutubeTokens(nextTokens)
  return nextTokens
}

async function validateYoutubeSession() {
  const credentials = getYoutubeCredentials()
  if (!credentials) {
    return {
      authenticated: false,
      hasCredentials: false,
      state: 'unconfigured',
      validationError: null,
    }
  }

  let tokens = loadYoutubeTokens()
  if (!tokens) {
    return {
      authenticated: false,
      hasCredentials: true,
      state: 'expired',
      validationError: null,
    }
  }

  try {
    let accessToken = tokens.access_token

    if (!accessToken || (tokens.expiry_date && tokens.expiry_date <= Date.now())) {
      tokens = await refreshYoutubeAccessToken(tokens, credentials)
      accessToken = tokens?.access_token
    }

    if (!accessToken) {
      throw new Error('YouTube access token is missing')
    }

    const { response, data } = await fetchGoogleTokenInfo(accessToken)
    if (!response.ok || data?.error_description || data?.error) {
      const detail = data?.error_description || data?.error || `YouTube auth validation failed (${response.status})`
      throw new Error(detail)
    }

    return {
      authenticated: true,
      hasCredentials: true,
      state: 'connected',
      validationError: null,
    }
  } catch (error) {
    return {
      authenticated: false,
      hasCredentials: true,
      state: 'expired',
      validationError: error.message,
    }
  }
}

function buildYoutubeAuthUrl() {
  const config = getYoutubeOAuthConfig()
  if (!config) {
    throw new Error('Google OAuth is not configured.')
  }

  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set(
    'scope',
    ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'].join(' ')
  )

  return { url: url.toString() }
}

async function exchangeYoutubeCode(code) {
  const config = getYoutubeOAuthConfig()
  if (!config) {
    throw new Error('Google OAuth is not configured.')
  }

  const body = new URLSearchParams({
    code: String(code),
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await response.json()

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'Failed to exchange YouTube auth code')
  }

  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    scope: data.scope,
    token_type: data.token_type,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  }

  saveYoutubeTokens(tokens)
}

module.exports = {
  buildInstagramAuthUrl,
  buildYoutubeAuthUrl,
  clearInstagramTokens,
  clearYoutubeTokens,
  exchangeYoutubeCode,
  handleInstagramOAuthCallback,
  isApiSecretValid,
  validateInstagramSession,
  validateYoutubeSession,
}
