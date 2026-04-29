const STORAGE_KEY = 'blog_upload_show_browser'

export function getBlogUploadShowBrowser() {
  if (typeof window === 'undefined') return true

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === 'false') return false
  if (raw === 'true') return true
  return true
}

export function setBlogUploadShowBrowser(value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
}
