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

// Chrome LNA(Local Network Access) 정책 호환: https origin 에서 127.0.0.1/localhost 같은 루프백 주소로
// 보내는 요청은 fetch 옵션에 targetAddressSpace='local' 을 명시해야 차단되지 않는다.
function isLoopbackTarget(input) {
  try {
    const raw = typeof input === 'string'
      ? input
      : (input && typeof input.url === 'string' ? input.url : null)
    if (!raw) return false
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
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

  const finalInit = {
    ...init,
    signal: controller.signal,
  }
  if (isLoopbackTarget(input) && !('targetAddressSpace' in finalInit)) {
    finalInit.targetAddressSpace = 'local'
  }

  try {
    return await fetch(input, finalInit)
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
