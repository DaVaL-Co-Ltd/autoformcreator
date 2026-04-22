export function createTimeoutError(label, timeoutMs) {
  const safeLabel = label || 'Request'
  return new Error(`${safeLabel} timed out after ${timeoutMs}ms`)
}

export async function withTimeout(task, timeoutMs, label) {
  let timerId = null

  try {
    return await Promise.race([
      typeof task === 'function' ? task() : task,
      new Promise((_, reject) => {
        timerId = setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
  }
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = 30000, label = 'Request') {
  const controller = new AbortController()
  const externalSignal = init.signal

  if (externalSignal?.aborted) {
    throw createTimeoutError(label, timeoutMs)
  }

  const forwardAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    externalSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  const timerId = setTimeout(() => controller.abort(createTimeoutError(label, timeoutMs)), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw error?.name === 'AbortError' ? createTimeoutError(label, timeoutMs) : error
    }
    throw error
  } finally {
    clearTimeout(timerId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', forwardAbort)
    }
  }
}
