function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isInstagramMediaIdUnavailableError(error) {
  return /media id is not available/i.test(String(error?.message || error || ''))
}

export async function publishInstagramMediaWithRetry({
  creationId,
  publish,
  waitUntilReady = null,
  maxAttempts = 4,
  baseDelayMs = 1500,
  logger = console,
}) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await publish()
    } catch (error) {
      lastError = error
      const shouldRetry = isInstagramMediaIdUnavailableError(error) && attempt < maxAttempts
      if (!shouldRetry) {
        throw error
      }

      const delayMs = baseDelayMs * attempt
      logger?.warn?.(
        `[Instagram] media_publish retry ${attempt}/${maxAttempts - 1} for ${creationId}: ${error.message}`
      )

      if (typeof waitUntilReady === 'function') {
        await waitUntilReady()
      }

      await sleep(delayMs)
    }
  }

  throw lastError || new Error('Instagram media publish failed')
}
