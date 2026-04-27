import { fetchWithTimeout } from './requestTimeout.js'
import { readApiResponse, getApiErrorMessage } from './apiResponse.js'
import { getBlogUploadServerBase } from './blogUploadServer.js'
import { extractDesktopHelperStatus, formatDesktopHelperStatus } from './desktopHelperStatus.js'
import { normalizeNaverHelperMessage } from './naverHelperMessage.js'

const BASE = getBlogUploadServerBase()
const HEADERS = { 'x-autoform-client': 'web-client' }

const DEFAULT_INTERVAL_MS = 3000
const DEFAULT_MAX_WAIT_MS = 600000
const POLL_REQUEST_TIMEOUT_MS = 10000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildHelperSuffix(data) {
  const helperStatus = formatDesktopHelperStatus(extractDesktopHelperStatus(data?.uploadRuntime))
  return helperStatus ? ` ${helperStatus}` : ''
}

export async function pollUploadCompletion(jobId, options = {}) {
  if (!jobId) {
    throw new Error('업로드 작업 ID가 없습니다.')
  }

  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS
  const maxWaitMs = options.maxWaitMs || DEFAULT_MAX_WAIT_MS
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const signal = options.signal || null

  const startedAt = Date.now()
  let lastStageLabel = null

  while (Date.now() - startedAt < maxWaitMs) {
    if (signal?.aborted) {
      throw new Error('업로드 폴링이 취소되었습니다.')
    }

    const url = `${BASE}/api/upload/${encodeURIComponent(jobId)}`
    let res
    try {
      res = await fetchWithTimeout(
        url,
        { headers: HEADERS, signal: signal || undefined },
        POLL_REQUEST_TIMEOUT_MS,
        'Desktop helper upload status poll',
      )
    } catch {
      if (signal?.aborted) {
        throw new Error('업로드 폴링이 취소되었습니다.')
      }
      // 네트워크 일시 장애로 간주하고 다음 주기에 재시도
      await sleep(intervalMs)
      continue
    }

    if (res.status === 404) {
      throw new Error('업로드 작업을 찾을 수 없습니다 (데스크톱 헬퍼가 재시작되었을 수 있습니다).')
    }

    const data = await readApiResponse(res)

    if (data.status === 'completed') {
      return data
    }

    if (data.status === 'failed') {
      const message = normalizeNaverHelperMessage(getApiErrorMessage(data, '네이버 블로그 업로드 실패'))
      throw new Error(`${message}${buildHelperSuffix(data)}`)
    }

    if (!res.ok) {
      throw new Error(
        `${getApiErrorMessage(data, `상태 조회 실패 (${res.status})`)}${buildHelperSuffix(data)}`,
      )
    }

    if (onProgress && data.upload) {
      const stageLabel = data.upload.stageLabel || data.upload.stage || null
      if (stageLabel !== lastStageLabel) {
        lastStageLabel = stageLabel
        try {
          onProgress(data.upload)
        } catch (callbackError) {
          console.warn('[blogUploadPolling] onProgress callback threw', callbackError)
        }
      }
    }

    await sleep(intervalMs)
  }

  throw new Error(`업로드가 ${Math.floor(maxWaitMs / 60000)}분 안에 완료되지 않았습니다.`)
}
