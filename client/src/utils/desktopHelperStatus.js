import { fetchWithTimeout, withTimeout } from './requestTimeout.js'
import { getBlogUploadServerBase } from './blogUploadServer.js'
import { readApiResponse } from './apiResponse.js'

const DESKTOP_HELPER_BASE = getBlogUploadServerBase()
const STATUS_TIMEOUT_MS = 2500

function pickStage(upload) {
  if (!upload) {
    return null
  }

  return {
    id: upload.id || null,
    stage: upload.stage || null,
    stageLabel: upload.stageLabel || upload.stage || null,
    updatedAt: upload.updatedAt || null,
    status: upload.status || null,
    error: upload.error || null,
  }
}

export function extractDesktopHelperStatus(uploadRuntime) {
  if (!uploadRuntime) {
    return null
  }

  return {
    activeUpload: pickStage(uploadRuntime.activeUpload),
    lastFailedUpload: pickStage(uploadRuntime.lastFailedUpload),
    lastCompletedUpload: pickStage(uploadRuntime.lastCompletedUpload),
  }
}

export async function getDesktopHelperStatus() {
  try {
    const response = await fetchWithTimeout(`${DESKTOP_HELPER_BASE}/api/health`, {
      headers: { 'x-autoform-client': 'web-client' },
    }, STATUS_TIMEOUT_MS, 'Desktop helper health check')

    const data = await withTimeout(() => readApiResponse(response), STATUS_TIMEOUT_MS, 'Desktop helper health parsing')
    if (!response.ok) {
      return null
    }

    return {
      status: data.status || null,
      ...extractDesktopHelperStatus(data.uploadRuntime),
    }
  } catch {
    return null
  }
}

export function formatDesktopHelperStatus(status) {
  if (!status) {
    return ''
  }

  if (status.activeUpload?.stageLabel || status.activeUpload?.stage) {
    const stage = status.activeUpload.stageLabel || status.activeUpload.stage
    const error = status.activeUpload.error ? ` helper-error=${status.activeUpload.error}` : ''
    return `helper-stage=${stage}${error}`
  }

  if (status.lastFailedUpload?.stageLabel || status.lastFailedUpload?.stage) {
    const stage = status.lastFailedUpload.stageLabel || status.lastFailedUpload.stage
    const error = status.lastFailedUpload.error ? ` helper-error=${status.lastFailedUpload.error}` : ''
    return `last-failed-stage=${stage}${error}`
  }

  if (status.lastCompletedUpload?.stageLabel || status.lastCompletedUpload?.stage) {
    const stage = status.lastCompletedUpload.stageLabel || status.lastCompletedUpload.stage
    return `last-completed-stage=${stage}`
  }

  return ''
}
