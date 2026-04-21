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

  const blog = ext.data?.blogContent || ext.blogContent
  if (!blog) throw new Error('블로그 콘텐츠가 없습니다')

  const title = blog.title || '제목 없음'
  const content = stripMarkdown(blog.body || blog.content || '')
  const tags = blog.tags || blog.hashtags || []

  const res = await fetch(`${API_BASE}/api/naver/publish`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ title, content, tags }),
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

  const video = ext.data?.shortsVideo || ext.shortsVideo
  const script = ext.data?.shortsScript || ext.shortsScript
  if (!video?.url) throw new Error('숏폼 영상이 없습니다')

  const rawTitle = script?.uploadTitle || script?.title || ext.fileName || '숏폼 영상'
  const title = rawTitle.includes('#Shorts') ? rawTitle.slice(0, 100) : `${rawTitle} #Shorts`.slice(0, 100)

  const descParts = []
  if (script?.hook) descParts.push(script.hook)
  if (Array.isArray(script?.scenes)) {
    script.scenes.forEach((s, i) => s.narration && descParts.push(`${i + 1}. ${s.narration}`))
  }
  if (script?.cta) descParts.push(`\n${script.cta}`)
  const description = (script?.uploadDescription || descParts.join('\n') || '').slice(0, 5000)

  const rawTags = (script?.hashtags || script?.tags || []).map(t => String(t).replace(/^#/, ''))
  if (!rawTags.includes('Shorts')) rawTags.unshift('Shorts')

  const requestBody = {
    snippet: {
      title,
      description,
      tags: rawTags,
      categoryId: '22',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    videoUrl: video.url,
  }

  const res = await fetch(`${API_BASE}/api/youtube/upload`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(requestBody),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `YouTube 업로드 실패 (${res.status})`)
  }
  return { url: data.url, videoId: data.videoId }
}

export async function uploadToInstagram(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const images = ((ext.data?.instagramImages || ext.instagramImages) || []).map(img => img?.url || img?.imageUrl).filter(Boolean)
  if (!images.length) throw new Error('인스타그램 이미지가 없습니다')

  const igContent = ext.data?.instagramContent || ext.instagramContent || {}
  const hashtags = (igContent.hashtags || []).map(t => String(t).startsWith('#') ? t : `#${t}`).join(' ')
  const caption = `${igContent.caption || ''}\n\n${hashtags}`.trim()

  const res = await fetch(`${API_BASE}/api/instagram/publish`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ imageUrls: images, caption }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `인스타그램 업로드 실패 (${res.status})`)
  }
  return { url: data.permalink, mediaId: data.mediaId }
}

export async function uploadToPlatform(platform, extractionId) {
  if (platform === 'blog') return uploadToBlog(extractionId)
  if (platform === 'shorts') return uploadToYoutube(extractionId)
  if (platform === 'instagram') return uploadToInstagram(extractionId)
  if (platform === 'newsletter') throw new Error('뉴스레터 자동 발송은 아직 구현되지 않았습니다')
  throw new Error(`알 수 없는 플랫폼: ${platform}`)
}
