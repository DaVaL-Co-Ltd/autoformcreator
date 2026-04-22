const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

export function shouldUseRemoteBlogPublish() {
  // Naver blog publishing requires a user-owned browser session and cookies.
  // Remote server publishing is intentionally disabled so deployed clients
  // always target the local desktop helper running on the user's machine.
  return false
}

export function getBlogUploadServerBase() {
  // Oracle/legacy remote upload server override is disabled during Render/Vercel-only testing.
  // const configuredServer = import.meta.env.VITE_UPLOAD_BLOG_SERVER?.trim()
  // if (configuredServer) {
  //   return configuredServer.replace(/\/$/, '')
  // }

  if (typeof window !== 'undefined' && LOOPBACK_HOSTS.has(window.location.hostname)) {
    return `http://${window.location.hostname}:3000`
  }

  return 'http://127.0.0.1:3000'
}
