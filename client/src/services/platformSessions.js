import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { getBlogUploadServerBase } from '../utils/blogUploadServer.js'
import { fetchWithTimeout } from '../utils/requestTimeout.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const BLOG_HELPER_BASE = getBlogUploadServerBase()
const REQUEST_TIMEOUT_MS = 10000
const LOGIN_TIMEOUT_MS = 6 * 60 * 1000
const helperHeaders = { 'x-autoform-client': 'web-client' }

async function readJsonOrThrow(response, fallbackMessage) {
  const data = await readApiResponse(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, fallbackMessage))
  }
  return data
}

export async function fetchNaverSessionStatus() {
  try {
    const response = await fetchWithTimeout(
      `${BLOG_HELPER_BASE}/api/health`,
      {},
      REQUEST_TIMEOUT_MS,
      'Desktop helper status request'
    )
    const data = await readJsonOrThrow(response, 'Desktop helper status request failed.')

    return {
      appVersion: data.appVersion || null,
      chromiumReady: Boolean(data.chromiumReady),
      connected: Boolean(data.sessionReady),
      helperReachable: true,
      state: data.sessionReady ? 'connected' : 'expired',
      uploadRuntime: data.uploadRuntime || null,
    }
  } catch (error) {
    return {
      appVersion: null,
      chromiumReady: false,
      connected: false,
      helperReachable: false,
      state: 'offline',
      error: error.message,
      uploadRuntime: null,
    }
  }
}

export async function reconnectNaverSession() {
  const response = await fetchWithTimeout(
    `${BLOG_HELPER_BASE}/api/session/naver/login`,
    {
      method: 'POST',
      headers: helperHeaders,
    },
    LOGIN_TIMEOUT_MS,
    'Naver helper login request'
  )

  return readJsonOrThrow(response, 'Failed to start the Naver desktop login flow.')
}

export async function fetchYoutubeSessionStatus() {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/youtube/auth-status`,
    {},
    REQUEST_TIMEOUT_MS,
    'YouTube auth status request'
  )
  const data = await readJsonOrThrow(response, 'Failed to read YouTube auth status.')
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  const connected = Boolean(data.authenticated) && accounts.length > 0
  const state = connected
    ? 'connected'
    : (data.hasCredentials ? 'expired' : 'unconfigured')

  return {
    connected,
    hasCredentials: Boolean(data.hasCredentials),
    state,
    validationError: data.validationError || null,
    accounts,
  }
}

export async function beginYoutubeReconnect() {
  const popup = window.open('', '_blank', 'width=520,height=760')
  if (!popup) {
    throw new Error('Browser popup was blocked. Allow popups and try again.')
  }

  const response = await fetchWithTimeout(
    `${API_BASE}/api/youtube/auth-url`,
    {},
    REQUEST_TIMEOUT_MS,
    'YouTube auth URL request'
  )
  const data = await readJsonOrThrow(response, 'Failed to create the YouTube auth URL.')
  if (!data.url) {
    popup.close()
    throw new Error('YouTube auth URL is missing.')
  }

  popup.location = data.url

  return { ...data, popup }
}

export async function disconnectYoutubeSession() {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/youtube/logout`,
    { method: 'POST' },
    REQUEST_TIMEOUT_MS,
    'YouTube logout request'
  )

  return readJsonOrThrow(response, 'Failed to disconnect the YouTube account.')
}

export async function disconnectYoutubeAccount(accountId) {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/platform-accounts/${encodeURIComponent(accountId)}?platform=youtube`,
    { method: 'DELETE' },
    REQUEST_TIMEOUT_MS,
    'YouTube account disconnect request'
  )

  return readJsonOrThrow(response, 'Failed to disconnect the YouTube account.')
}

export async function fetchInstagramSessionStatus() {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/instagram/auth-status`,
    {},
    REQUEST_TIMEOUT_MS,
    'Instagram auth status request'
  )
  const data = await readJsonOrThrow(response, 'Failed to read Instagram auth status.')

  return {
    connected: Boolean(data.connected),
    hasAccessToken: Boolean(data.hasAccessToken),
    hasBusinessId: Boolean(data.hasBusinessId),
    mode: data.mode || 'server-token',
    state: data.state || (data.connected ? 'connected' : 'expired'),
    username: data.username || null,
    validationError: data.validationError || null,
    canReconnect: Boolean(data.canReconnect),
    canDisconnect: Boolean(data.canDisconnect),
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  }
}

export async function beginInstagramReconnect() {
  const popup = window.open('', '_blank', 'width=520,height=760')
  if (!popup) {
    throw new Error('Browser popup was blocked. Allow popups and try again.')
  }

  const response = await fetchWithTimeout(
    `${API_BASE}/api/instagram/auth-url`,
    {},
    REQUEST_TIMEOUT_MS,
    'Instagram auth URL request'
  )
  const data = await readJsonOrThrow(response, 'Failed to create the Instagram auth URL.')
  if (!data.url) {
    popup.close()
    throw new Error('Instagram auth URL is missing.')
  }

  popup.location = data.url

  return { ...data, popup }
}

export async function disconnectInstagramSession() {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/instagram/logout`,
    { method: 'POST' },
    REQUEST_TIMEOUT_MS,
    'Instagram logout request'
  )

  return readJsonOrThrow(response, 'Failed to disconnect the Instagram account.')
}

export async function disconnectInstagramAccount(accountId) {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/platform-accounts/${encodeURIComponent(accountId)}?platform=instagram`,
    { method: 'DELETE' },
    REQUEST_TIMEOUT_MS,
    'Instagram account disconnect request'
  )

  return readJsonOrThrow(response, 'Failed to disconnect the Instagram account.')
}

export async function fetchPlatformAccounts(platform) {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/platform-accounts?platform=${encodeURIComponent(platform)}`,
    {},
    REQUEST_TIMEOUT_MS,
    `${platform} accounts request`
  )
  const data = await readJsonOrThrow(response, `Failed to read ${platform} accounts.`)
  return Array.isArray(data.accounts) ? data.accounts : []
}

export async function waitForYoutubeReconnect({
  timeoutMs = 180000,
  intervalMs = 2000,
  popup = null,
} = {}) {
  const startedAt = Date.now()
  let popupClosedAt = null

  while (Date.now() - startedAt < timeoutMs) {
    const status = await fetchYoutubeSessionStatus()
    if (status.connected && status.accounts.length > 0) {
      return status
    }

    if (popup && popup.closed && !popupClosedAt) {
      popupClosedAt = Date.now()
    }

    if (popupClosedAt && Date.now() - popupClosedAt > 30000 && status.state !== 'connected') {
      throw new Error('Google 인증 창이 닫혔지만 연결 완료가 확인되지 않았습니다.')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`YouTube reconnect timed out after ${timeoutMs}ms`)
}

export async function waitForInstagramReconnect({
  timeoutMs = 180000,
  intervalMs = 2000,
  popup = null,
} = {}) {
  const startedAt = Date.now()
  let popupClosedAt = null

  while (Date.now() - startedAt < timeoutMs) {
    const status = await fetchInstagramSessionStatus()
    if (status.connected) {
      return status
    }

    if (popup && popup.closed && !popupClosedAt) {
      popupClosedAt = Date.now()
    }

    if (popupClosedAt && Date.now() - popupClosedAt > 30000 && status.state !== 'connected') {
      throw new Error('Instagram 인증 창이 닫혔지만 연결 완료가 확인되지 않았습니다.')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Instagram reconnect timed out after ${timeoutMs}ms`)
}
