const NAVER_SESSION_ERROR_PATTERNS = [
  /naver session is missing/i,
  /saved naver session expired/i,
  /please log in again from the desktop app/i,
  /log in again from the desktop app first/i,
]

export function isNaverSessionError(message = '') {
  return NAVER_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(String(message)))
}

export function normalizeNaverHelperMessage(message = '') {
  if (!isNaverSessionError(message)) {
    return message
  }

  return 'AutoForm Naver RPA에서 네이버 로그인이 필요합니다. desktop helper 앱을 열어 다시 로그인해 주세요.'
}
