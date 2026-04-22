export function shouldUseRemoteBlogPublish() {
  // Naver blog publishing requires a user-owned browser session and cookies.
  // Remote server publishing is intentionally disabled so deployed clients
  // always target the local desktop helper running on the user's machine.
  return false
}

export function getBlogUploadServerBase() {
  return 'http://127.0.0.1:3000'
}
