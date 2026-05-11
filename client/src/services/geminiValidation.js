import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { fetchWithTimeout } from '../utils/requestTimeout.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const REQUEST_TIMEOUT_MS = 15000

export async function validateGeminiEnvironment(model = 'gemini-2.5-flash-lite') {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/gemini/validate?model=${encodeURIComponent(model)}`,
    {},
    REQUEST_TIMEOUT_MS,
    'Gemini validation request'
  )

  const data = await readApiResponse(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Failed to validate the Gemini API key.'))
  }

  return data
}
