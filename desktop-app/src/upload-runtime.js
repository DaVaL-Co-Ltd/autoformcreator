const runtimeState = {
  activeUpload: null,
  lastCompletedUpload: null,
  lastFailedUpload: null,
}

function now() {
  return new Date().toISOString()
}

function startUpload(meta = {}) {
  const startedAt = now()
  runtimeState.activeUpload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stage: 'queued',
    stageLabel: 'queued',
    startedAt,
    updatedAt: startedAt,
    meta,
  }
  return runtimeState.activeUpload
}

function updateUploadStage(stage, extras = {}) {
  if (!runtimeState.activeUpload) {
    return null
  }

  runtimeState.activeUpload = {
    ...runtimeState.activeUpload,
    ...extras,
    stage,
    stageLabel: extras.stageLabel || stage,
    updatedAt: now(),
  }

  return runtimeState.activeUpload
}

function finishUpload(result = {}) {
  if (!runtimeState.activeUpload) {
    return null
  }

  const completedAt = now()
  runtimeState.lastCompletedUpload = {
    ...runtimeState.activeUpload,
    ...result,
    completedAt,
    updatedAt: completedAt,
    status: 'completed',
  }
  runtimeState.activeUpload = null
  return runtimeState.lastCompletedUpload
}

function failUpload(error) {
  if (!runtimeState.activeUpload) {
    return null
  }

  const failedAt = now()
  runtimeState.lastFailedUpload = {
    ...runtimeState.activeUpload,
    failedAt,
    updatedAt: failedAt,
    status: 'failed',
    error: error?.message || String(error || 'Unknown error'),
  }
  runtimeState.activeUpload = null
  return runtimeState.lastFailedUpload
}

function getUploadRuntimeState() {
  return {
    activeUpload: runtimeState.activeUpload,
    lastCompletedUpload: runtimeState.lastCompletedUpload,
    lastFailedUpload: runtimeState.lastFailedUpload,
  }
}

function getUploadById(id) {
  if (!id) {
    return null
  }

  if (runtimeState.activeUpload?.id === id) {
    return { state: 'active', upload: runtimeState.activeUpload }
  }

  if (runtimeState.lastCompletedUpload?.id === id) {
    return { state: 'completed', upload: runtimeState.lastCompletedUpload }
  }

  if (runtimeState.lastFailedUpload?.id === id) {
    return { state: 'failed', upload: runtimeState.lastFailedUpload }
  }

  return null
}

module.exports = {
  failUpload,
  finishUpload,
  getUploadById,
  getUploadRuntimeState,
  startUpload,
  updateUploadStage,
}
