import { getExtractionById } from './storage'
import { getBlogUploadServerBase, shouldUseRemoteBlogPublish } from '../utils/blogUploadServer.js'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { formatDesktopHelperStatus, getDesktopHelperStatus } from '../utils/desktopHelperStatus.js'
import { normalizeNaverHelperMessage } from '../utils/naverHelperMessage.js'
import { stripMarkdownEmphasis } from '../utils/platformFormatter.js'
import { fetchWithTimeout, withTimeout } from '../utils/requestTimeout.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const UPLOAD_BLOG_SERVER = getBlogUploadServerBase()
const USE_REMOTE_BLOG_PUBLISH = shouldUseRemoteBlogPublish()
const BLOG_UPLOAD_SOURCE = USE_REMOTE_BLOG_PUBLISH ? 'server-api' : 'desktop-helper'
const BLOG_UPLOAD_ENDPOINT = USE_REMOTE_BLOG_PUBLISH
  ? `${API_BASE}/api/naver/publish`
  : `${UPLOAD_BLOG_SERVER}/api/upload`
const BLOG_UPLOAD_REQUEST_TIMEOUT_MS = 120000
const API_RESPONSE_TIMEOUT_MS = 10000
const MEDIA_DOWNLOAD_TIMEOUT_MS = 15000
const API_SECRET = import.meta.env.VITE_API_SECRET || ''
const apiHeaders = (extra = {}) => ({
  'Content-Type': 'application/json',
  'x-app-secret': API_SECRET,
  ...extra,
})
const blogHeaders = { 'x-autoform-client': 'web-client' }

function stripMarkdown(md) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    // 취소선 마커 제거 (네이버 에디터 auto-format 방지)
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^-\n]+)--/g, '$1')
    // 굵게/이탤릭/언더스코어 마커 제거
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*]*[^*\s])\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\s][^_]*[^_\s])_/g, '$1')
    // 링크/인라인코드/인용/리스트
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    // 잔여 단일 마커 제거 (안전망)
    .replace(/~/g, '')
    .trim()
}

async function buildDesktopHelperRequestError(error) {
  const normalizedMessage = normalizeNaverHelperMessage(error.message)
  error = { ...error, message: normalizedMessage }
  const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
  if (helperStatus) {
    return `네이버 블로그 업로드 실패: ${error.message} ${helperStatus} [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`
  }

  return `로컬 RPA 서버(${UPLOAD_BLOG_SERVER}) 연결 실패. 본인 PC에서 RPA 서버를 실행해주세요. [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`
}

export async function uploadToBlog(extractionId, options = {}) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const blog = ext.data?.blogContent || ext.blogContent || ext.blog_content
  if (!blog) throw new Error('블로그 콘텐츠가 없습니다')

  const title = blog.title || blog.uploadTitle || '제목 없음'
  let rawContent = blog.body || blog.content || ''

  if (!rawContent && Array.isArray(blog.sections)) {
    rawContent = blog.sections
      .map((section) => {
        const heading = section.heading ? `## ${section.heading}\n\n` : ''
        const keyPhrase = section.keyPhrase ? `${section.keyPhrase}\n\n` : ''
        const body = section.content || section.body || ''
        return `${heading}${keyPhrase}${body}`
      })
      .join('\n\n')
  }

  if (!rawContent && blog.summary) {
    rawContent = blog.summary
  }

  if (!title || !rawContent) {
    throw new Error('블로그 제목 또는 본문이 없습니다')
  }

  const normalizedContent = stripMarkdown(rawContent)
  const normalizedTags = (blog.tags || blog.hashtags || []).map((tag) => String(tag).replace(/^#/, ''))
  const scheduledAt = options.scheduledAtOverride || ext.uploadStatus?.blog?.scheduledAt || null

  if (USE_REMOTE_BLOG_PUBLISH) {
    const remoteRes = await fetchWithTimeout(
      `${API_BASE}/api/naver/publish`,
      {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          title,
          content: normalizedContent,
          scheduledAt,
          tags: normalizedTags,
        }),
      },
      BLOG_UPLOAD_REQUEST_TIMEOUT_MS,
      'Remote blog upload request',
    )

    const remoteData = await withTimeout(
      () => readApiResponse(remoteRes),
      API_RESPONSE_TIMEOUT_MS,
      'Remote upload response parsing',
    )
    if (!remoteRes.ok || !remoteData.success) {
      throw new Error(
        `${getApiErrorMessage(remoteData, `네이버 블로그 업로드 실패 (${remoteRes.status})`)} [source=${remoteData?.source || BLOG_UPLOAD_SOURCE} endpoint=${remoteData?.endpoint || BLOG_UPLOAD_ENDPOINT}]`,
      )
    }

    return { url: remoteData.url }
  }

  const formData = new FormData()
  formData.append('title', title)
  formData.append('content', normalizedContent)
  formData.append('tags', JSON.stringify(normalizedTags))
  formData.append('showBrowser', 'true')
  if (scheduledAt) {
    formData.append('scheduledAt', scheduledAt)
  }

  const images = ext.data?.blogImages || ext.blogImages || []
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i]
    const imageUrl = image?.url || image?.src
    if (!imageUrl) continue

    try {
      const response = await fetchWithTimeout(
        imageUrl,
        {},
        MEDIA_DOWNLOAD_TIMEOUT_MS,
        `Blog image download ${i + 1}`,
      )
      if (!response.ok) continue
      const blob = await response.blob()
      const extName = (blob.type.split('/')[1] || 'png').split('+')[0]
      formData.append('photos', blob, `image_${i + 1}.${extName}`)
    } catch (error) {
      console.warn(`[uploadToBlog] image ${i + 1} download failed:`, error.message)
    }
  }

  const res = await fetchWithTimeout(
    `${UPLOAD_BLOG_SERVER}/api/upload`,
    {
      method: 'POST',
      headers: blogHeaders,
      body: formData,
    },
    BLOG_UPLOAD_REQUEST_TIMEOUT_MS,
    'Desktop helper upload request',
  ).catch(async (error) => {
    throw new Error(await buildDesktopHelperRequestError(error))
  })

  const data = await withTimeout(
    () => readApiResponse(res),
    API_RESPONSE_TIMEOUT_MS,
    'Desktop helper response parsing',
  ).catch(async (error) => {
    const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
    throw new Error(`${normalizeNaverHelperMessage(error.message)}${helperStatus ? ` ${helperStatus}` : ''}`)
  })

  if (!res.ok || !data.success) {
    throw new Error(
      `${getApiErrorMessage(data, `네이버 블로그 업로드 실패 (${res.status})`)} [source=${data?.source || BLOG_UPLOAD_SOURCE} endpoint=${data?.endpoint || BLOG_UPLOAD_ENDPOINT}]`,
    )
  }

  return {
    mode: data.mode,
    scheduled: Boolean(data.scheduled),
    scheduledAt: data.scheduledAt || scheduledAt,
    url: data.url,
  }
}

export async function uploadToYoutube(extractionId, options = {}) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const video = ext.data?.shortsVideo || ext.shortsVideo
  const script = ext.data?.shortsScript || ext.shortsScript
  if (!video?.url) throw new Error('숏폼 영상이 없습니다')

  const rawTitle = stripMarkdownEmphasis(script?.uploadTitle || script?.title || ext.fileName || '유튜브 숏츠')
  const title = rawTitle.includes('#Shorts') ? rawTitle.slice(0, 100) : `${rawTitle} #Shorts`.slice(0, 100)

  const descParts = []
  if (script?.hook) descParts.push(stripMarkdownEmphasis(script.hook))
  if (Array.isArray(script?.scenes)) {
    script.scenes.forEach((scene, index) => {
      if (scene.narration) {
        descParts.push(`${index + 1}. ${stripMarkdownEmphasis(scene.narration)}`)
      }
    })
  }
  if (script?.cta) descParts.push(`\n${stripMarkdownEmphasis(script.cta)}`)
  const description = stripMarkdownEmphasis(script?.uploadDescription || descParts.join('\n') || '').slice(0, 5000)

  const rawTags = (script?.hashtags || script?.tags || []).map((tag) => String(tag).replace(/^#/, ''))
  if (!rawTags.includes('Shorts')) rawTags.unshift('Shorts')
  const scheduledAt = options.scheduledAtOverride || ext.uploadStatus?.shorts?.scheduledAt || null

  const requestBody = {
    snippet: {
      title,
      description,
      tags: rawTags,
      categoryId: '22',
    },
    status: scheduledAt
      ? { privacyStatus: 'private', publishAt: scheduledAt, selfDeclaredMadeForKids: false }
      : { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    scheduledAt,
    videoUrl: video.url?.startsWith('/output/') && API_BASE ? `${API_BASE}${video.url}` : video.url,
  }

  const res = await fetchWithTimeout(
    `${API_BASE}/api/youtube/upload`,
    {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(requestBody),
    },
    BLOG_UPLOAD_REQUEST_TIMEOUT_MS,
    'YouTube upload request',
  )

  const data = await withTimeout(
    () => readApiResponse(res),
    API_RESPONSE_TIMEOUT_MS,
    'YouTube upload response parsing',
  )
  if (!res.ok || !data.success) {
    throw new Error(getApiErrorMessage(data, `YouTube 업로드 실패 (${res.status})`))
  }

  return {
    url: data.url,
    videoId: data.videoId,
    scheduled: Boolean(data.scheduled || scheduledAt),
    scheduledAt: data.scheduledAt || scheduledAt || null,
  }
}

export async function uploadToInstagram(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const images = ((ext.data?.instagramImages || ext.instagramImages) || [])
    .map((image) => image?.url || image?.imageUrl)
    .filter(Boolean)
  if (!images.length) throw new Error('인스타그램 이미지가 없습니다')

  const igContent = ext.data?.instagramContent || ext.instagramContent || {}
  const hashtags = (igContent.hashtags || [])
    .map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const caption = `${stripMarkdownEmphasis(igContent.caption || igContent.body || igContent.title || '')}\n\n${hashtags}`.trim()

  const res = await fetchWithTimeout(
    `${API_BASE}/api/instagram/publish`,
    {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ imageUrls: images.slice(0, 10), caption }),
    },
    BLOG_UPLOAD_REQUEST_TIMEOUT_MS,
    'Instagram upload request',
  )

  const data = await withTimeout(
    () => readApiResponse(res),
    API_RESPONSE_TIMEOUT_MS,
    'Instagram upload response parsing',
  )
  if (!res.ok || !data.success) {
    throw new Error(getApiErrorMessage(data, `인스타그램 업로드 실패 (${res.status})`))
  }

  return { url: data.permalink, mediaId: data.mediaId }
}

export async function uploadToPlatform(platform, extractionId, options = {}) {
  if (platform === 'blog') {
    try {
      return await uploadToBlog(extractionId, options)
    } catch (error) {
      throw new Error(normalizeNaverHelperMessage(error.message))
    }
  }
  if (platform === 'shorts') return uploadToYoutube(extractionId, options)
  if (platform === 'instagram') return uploadToInstagram(extractionId)
  if (platform === 'newsletter') throw new Error('뉴스레터 자동 발송은 아직 구현되지 않았습니다')
  throw new Error(`지원하지 않는 플랫폼: ${platform}`)
}
