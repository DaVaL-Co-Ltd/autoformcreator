import { getExtractionById } from './storage'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const UPLOAD_BLOG_SERVER = import.meta.env.VITE_UPLOAD_BLOG_SERVER || 'http://localhost:3000'
const API_SECRET = import.meta.env.VITE_API_SECRET || ''
const apiHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', 'x-app-secret': API_SECRET, ...extra })

function stripMarkdown(md) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .trim()
}

export async function uploadToBlog(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const blog = ext.blogContent
  if (!blog) throw new Error('블로그 콘텐츠가 없습니다')

  const formData = new FormData()
  formData.append('title', blog.title || '제목 없음')
  formData.append('content', stripMarkdown(blog.body || blog.content || ''))
  formData.append('tags', JSON.stringify(blog.tags || blog.hashtags || []))
  formData.append('showBrowser', 'false')

  const images = ext.blogImages || []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const imgUrl = img?.url || img?.src
    if (!imgUrl) continue
    try {
      const r = await fetch(imgUrl)
      if (!r.ok) continue
      const blob = await r.blob()
      const ext = (blob.type.split('/')[1] || 'png').split('+')[0]
      formData.append('photos', blob, `image_${i + 1}.${ext}`)
    } catch (err) {
      console.warn(`[uploadToBlog] 이미지 ${i + 1} 다운로드 실패:`, err.message)
    }
  }

  const res = await fetch(`${UPLOAD_BLOG_SERVER}/api/upload`, {
    method: 'POST',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `네이버 블로그 업로드 실패 (${res.status})`)
  }
  return { url: data.url }
}

export async function uploadToYoutube(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const video = ext.shortsVideo
  const script = ext.shortsScript
  if (!video?.url) throw new Error('숏폼 영상이 없습니다')

  const title = script?.title || ext.fileName || '숏폼 영상'
  const description = (script?.scenes || []).map(s => s.narration).filter(Boolean).join(' ').slice(0, 5000)
  const tags = script?.tags || script?.hashtags || []

  const res = await fetch(`${API_BASE}/api/youtube/upload`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      title,
      description,
      tags,
      videoUrl: video.url,
      privacyStatus: 'private',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `YouTube 업로드 실패 (${res.status})`)
  }
  return { url: data.url, videoId: data.videoId }
}

export async function uploadToPlatform(platform, extractionId) {
  if (platform === 'blog') return uploadToBlog(extractionId)
  if (platform === 'shorts') return uploadToYoutube(extractionId)
  if (platform === 'instagram') throw new Error('인스타그램 자동 업로드는 아직 구현되지 않았습니다')
  if (platform === 'newsletter') throw new Error('뉴스레터 자동 발송은 아직 구현되지 않았습니다')
  throw new Error(`알 수 없는 플랫폼: ${platform}`)
}
