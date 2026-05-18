import { getExtractionById } from './storage'
import { getBlogUploadServerBase, shouldUseRemoteBlogPublish } from '../utils/blogUploadServer.js'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { formatDesktopHelperStatus, getDesktopHelperStatus } from '../utils/desktopHelperStatus.js'
import { normalizeNaverHelperMessage } from '../utils/naverHelperMessage.js'
import { formatInstagramReelsRequest, stripMarkdownEmphasis } from '../utils/platformFormatter.js'
import { fetchWithTimeout, withTimeout } from '../utils/requestTimeout.js'
import { pollUploadCompletion } from '../utils/blogUploadPolling.js'
import { buildInstagramScheduledUploadContent } from '../utils/scheduledPayloads.js'
import { normalizeBlogTags } from '../utils/blogTags.js'
import { getBlogUploadShowBrowser } from '../utils/blogUploadBrowserPreference.js'
import { buildBlogUploadImageDataUrls } from '../utils/uploadImageComposite.js'
import { sanitizeBlogBodyForUpload } from '../utils/blogBodySanitizer.js'
import { getAll as getPlatformConnections } from '../utils/platformConnections.js'
import { appendBlogFooterText, getBlogFooterConfig } from '../utils/blogFooterLinks.js'
import {
  BLOG_HEADING_STYLE,
  buildBlogHeadingPrefix,
  resolveBlogHeadingStyle,
} from '../utils/blogHeadingStyle.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const UPLOAD_BLOG_SERVER = getBlogUploadServerBase()
const USE_REMOTE_BLOG_PUBLISH = shouldUseRemoteBlogPublish()
const BLOG_UPLOAD_SOURCE = USE_REMOTE_BLOG_PUBLISH ? 'server-api' : 'desktop-helper'
const BLOG_UPLOAD_ENDPOINT = USE_REMOTE_BLOG_PUBLISH
  ? `${API_BASE}/api/naver/publish`
  : `${UPLOAD_BLOG_SERVER}/api/upload`
const BLOG_UPLOAD_REQUEST_TIMEOUT_MS = 120000
const BLOG_UPLOAD_START_TIMEOUT_MS = 30000
const BLOG_UPLOAD_MAX_WAIT_MS = 600000
const API_RESPONSE_TIMEOUT_MS = 10000
const MEDIA_DOWNLOAD_TIMEOUT_MS = 15000
const BLOG_DIVIDER_MARKER = '[DIVIDER]'
const BLOG_UPLOAD_HEADERS = { 'x-autoform-client': 'web-client' }
const apiHeaders = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...extra,
})
const BLOG_TEXT_STYLE_PRESET = {
  ADMISSIONS_KEYWORD: 'admissions_style_2',
}

function stripMarkdown(md) {
  return sanitizeBlogBodyForUpload(md)
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
  const platformConnections = getPlatformConnections() || {}
  const blogConnection = platformConnections.blog || {}
  const savedBlogFooterEnabled = ext.data?.blogFooterEnabled ?? ext.blogFooterEnabled
  const blogFooterConfig = savedBlogFooterEnabled === false
    ? { heading: '', links: [], hasCustomLinks: false }
    : getBlogFooterConfig(platformConnections)
  const categoryPath = String(blogConnection.categoryPath || blog.categoryPath || '').trim()
  const sections = Array.isArray(blog.sections) ? blog.sections : []
  const blogImagesList = ext.data?.blogImages || ext.blogImages || []
  const hasThumbnailImage = Array.isArray(blogImagesList)
    && blogImagesList.some((img) => img?.isThumbnail && (img?.imageUrl || img?.renderedImageUrl || img?.pngUrl))
  // 썸네일이 있으면 buildBlogUploadImageDataUrls 가 uploads[0] 에 썸네일을 넣고
  // 섹션 이미지를 uploads[1..] 에 넣는다. 그래서 본문 마커도 동일한 오프셋을 따라야
  // 섹션 i 의 마커가 자기 자신의 이미지를 가리키게 된다.
  const imageMarkerOffset = hasThumbnailImage ? 2 : 1
  // 스타일 결정용 카테고리 ID 는 네이버 폴더 경로와 별개로 categoryInfo 에서 보완 폴백.
  const stylingCategoryId = String(categoryPath || blog?.categoryInfo?.finalCategoryId || '').trim()
  const headingStyle = resolveBlogHeadingStyle(stylingCategoryId, sections)
  const quoteStyle = headingStyle === BLOG_HEADING_STYLE.HEADING ? '' : headingStyle
  const textStylePreset = stylingCategoryId === 'admissions_strategy_style_2'
    ? BLOG_TEXT_STYLE_PRESET.ADMISSIONS_KEYWORD
    : ''
  let rawContent = ''

  if (sections.length) {
    const isCardNewsCategory = stylingCategoryId === 'knowledge_insight' || stylingCategoryId === 'interview_prep'
    const joinDelimiter = !USE_REMOTE_BLOG_PUBLISH && isCardNewsCategory
      ? `\n\n${BLOG_DIVIDER_MARKER}\n\n`
      : '\n\n'

    const sectionBlock = sections
      .map((section, index) => {
        const heading = buildBlogHeadingPrefix(section.heading, headingStyle)
        const keyPhrase = section.keyPhrase ? `${section.keyPhrase}\n\n` : ''
        const imageMarker = `[IMG:${index + imageMarkerOffset}]\n`
        const body = section.content || section.body || ''
        return `${heading}${imageMarker}${keyPhrase}${body}`
      })
      .join(joinDelimiter)

    // 썸네일이 있으면 본문 최상단에 별도 마커로 삽입해 [썸네일]-[섹션1 제목]-[섹션1 이미지]-...
    // 순서를 보장한다. 썸네일이 없으면 기존처럼 섹션 마커가 [IMG:1] 부터 시작한다.
    rawContent = hasThumbnailImage ? `[IMG:1]\n\n${sectionBlock}` : sectionBlock
  }

  if (!rawContent) {
    rawContent = blog.body || blog.content || ''
  }

  if (!rawContent && blog.summary) {
    rawContent = blog.summary
  }

  if (!title || !rawContent) {
    throw new Error('블로그 제목 또는 본문이 없습니다')
  }

  const normalizedContent = appendBlogFooterText(stripMarkdown(rawContent), blogFooterConfig)
  const normalizedTags = normalizeBlogTags(blog)
  const scheduledAt = Object.prototype.hasOwnProperty.call(options, 'scheduledAtOverride')
    ? options.scheduledAtOverride
    : null

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
          categoryPath,
          quoteStyle,
          textStylePreset,
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
  formData.append('showBrowser', getBlogUploadShowBrowser() ? 'true' : 'false')
  if (categoryPath) {
    formData.append('categoryPath', categoryPath)
  }
  if (quoteStyle) {
    formData.append('quoteStyle', quoteStyle)
  }
  if (textStylePreset) {
    formData.append('textStylePreset', textStylePreset)
  }
  if (scheduledAt) {
    formData.append('scheduledAt', scheduledAt)
  }

  const images = ext.data?.blogImages || ext.blogImages || []
  const uploadImageUrls = await buildBlogUploadImageDataUrls({
    blogImages: images,
    sections,
  })

  for (let i = 0; i < uploadImageUrls.length; i += 1) {
    const imageUrl = uploadImageUrls[i]
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

  const startRes = await fetchWithTimeout(
    `${UPLOAD_BLOG_SERVER}/api/upload`,
    {
      method: 'POST',
      headers: BLOG_UPLOAD_HEADERS,
      body: formData,
    },
    BLOG_UPLOAD_START_TIMEOUT_MS,
    'Desktop helper upload start',
  ).catch(async (error) => {
    throw new Error(await buildDesktopHelperRequestError(error))
  })

  const startData = await withTimeout(
    () => readApiResponse(startRes),
    API_RESPONSE_TIMEOUT_MS,
    'Desktop helper start response parsing',
  ).catch(async (error) => {
    const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
    throw new Error(`${normalizeNaverHelperMessage(error.message)}${helperStatus ? ` ${helperStatus}` : ''}`)
  })

  if (!startRes.ok || !startData.success || !startData.jobId) {
    throw new Error(
      `${getApiErrorMessage(startData, `네이버 블로그 업로드 시작 실패 (${startRes.status})`)} [source=${startData?.source || BLOG_UPLOAD_SOURCE} endpoint=${startData?.endpoint || BLOG_UPLOAD_ENDPOINT}]`,
    )
  }

  const completion = await pollUploadCompletion(startData.jobId, {
    maxWaitMs: BLOG_UPLOAD_MAX_WAIT_MS,
    onProgress: options.onProgress,
  }).catch((error) => {
    throw new Error(`${error.message} [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`)
  })

  return {
    mode: completion.mode,
    scheduled: Boolean(completion.scheduled),
    scheduledAt: completion.scheduledAt || scheduledAt,
    url: completion.url,
  }
}

export async function uploadToYoutube(extractionId, options = {}) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const video = ext.data?.shortsVideo || ext.shortsVideo
  const script = ext.data?.shortsScript || ext.shortsScript
  const sourceVideoUrl = video?.combinedVideoUrl || video?.url || video?.videoUrl
  if (!sourceVideoUrl) throw new Error('쇼츠/릴스 영상이 없습니다')

  const rawTitle = stripMarkdownEmphasis(script?.uploadTitle || script?.title || ext.fileName || '유튜브 쇼츠/릴스')
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
    videoUrl: sourceVideoUrl.startsWith('/output/') && API_BASE ? `${API_BASE}${sourceVideoUrl}` : sourceVideoUrl,
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

export async function uploadToInstagramReels(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const video = ext.data?.shortsVideo || ext.shortsVideo
  const script = ext.data?.shortsScript || ext.shortsScript
  if (!video?.url && !video?.videoUrl && !video?.combinedVideoUrl) throw new Error('쇼츠/릴스 영상이 없습니다')

  const videoUrl = video.combinedVideoUrl || video.url || video.videoUrl
  const requestBody = formatInstagramReelsRequest(script, videoUrl?.startsWith('/output/') && API_BASE ? `${API_BASE}${videoUrl}` : videoUrl)

  const res = await fetchWithTimeout(
    `${API_BASE}/api/instagram/reel`,
    {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(requestBody),
    },
    BLOG_UPLOAD_REQUEST_TIMEOUT_MS,
    'Instagram Reels upload request',
  )

  const data = await withTimeout(
    () => readApiResponse(res),
    API_RESPONSE_TIMEOUT_MS,
    'Instagram Reels upload response parsing',
  )
  if (!res.ok || !data.success) {
    throw new Error(getApiErrorMessage(data, `인스타그램 릴스 업로드 실패 (${res.status})`))
  }

  return { url: data.permalink || data.url, mediaId: data.mediaId || data.id || null }
}

export async function uploadToShortsTargets(extractionId, options = {}) {
  const targets = options.targets || { instagram: true, youtube: true }
  const order = options.uploadOrder || ['instagram', 'youtube']
  const results = {}
  const failures = []

  for (const target of order) {
    if (target === 'instagram' && targets.instagram) {
      try {
        results.instagram = await uploadToInstagramReels(extractionId)
      } catch (error) {
        failures.push(`인스타그램: ${error.message}`)
      }
    }
    if (target === 'youtube' && targets.youtube) {
      try {
        results.youtube = await uploadToYoutube(extractionId, options)
      } catch (error) {
        failures.push(`유튜브: ${error.message}`)
      }
    }
  }

  const uploadedUrls = {
    youtube: results.youtube?.url || null,
    instagram: results.instagram?.url || null,
  }
  const hasSuccess = Boolean(uploadedUrls.youtube || uploadedUrls.instagram)
  if (failures.length && !hasSuccess) {
    throw new Error(failures.join(' / '))
  }

  return {
    failures,
    scheduled: Boolean(results.youtube?.scheduled || options.scheduledAtOverride),
    scheduledAt: results.youtube?.scheduledAt || options.scheduledAtOverride || null,
    uploadedUrls,
    url: uploadedUrls.instagram || uploadedUrls.youtube || null,
  }
}

export async function uploadToInstagram(extractionId) {
  const ext = await getExtractionById(extractionId)
  if (!ext) throw new Error('추출 데이터를 찾을 수 없습니다')

  const igContent = ext.data?.instagramContent || ext.instagramContent || {}
  const renderedContent = await buildInstagramScheduledUploadContent({
    instagramContent: igContent,
    instagramImages: ext.data?.instagramImages || ext.instagramImages || [],
    instaPngUrls: ext.data?.instaPngUrls || ext.instaPngUrls || [],
  })
  const images = (renderedContent.imageUrls || []).filter(Boolean)
  if (!images.length) throw new Error('인스타그램 카드 이미지가 없습니다')

  const hashtags = (igContent.hashtags || [])
    .map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const captionBody = stripMarkdownEmphasis(renderedContent.caption || igContent.caption || igContent.body || igContent.title || '')
  const caption = `${captionBody}\n\n${hashtags}`.trim()

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
  if (platform === 'shorts') return uploadToShortsTargets(extractionId, options)
  if (platform === 'instagram') return uploadToInstagram(extractionId)
  if (platform === 'newsletter') throw new Error('뉴스레터 자동 발송은 아직 구현되지 않았습니다')
  throw new Error(`지원하지 않는 플랫폼: ${platform}`)
}
