export async function readApiResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text }
  }
}

export function getApiErrorMessage(data, fallbackMessage) {
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  if (typeof data?.rawText === 'string' && data.rawText.trim()) {
    return data.rawText.trim()
  }

  return fallbackMessage
}
