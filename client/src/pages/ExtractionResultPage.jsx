import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  FileText, Image, Mail, Film, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Clock, ChevronLeft, ChevronRight, ExternalLink,
  Upload, Loader2, AlertCircle, Calendar, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import ScheduleDialog from '../components/ScheduleDialog'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { saveExtraction, getExtractionById, updateExtractionMedia, updateUploadStatus } from '../services/storage'
import { create as createScheduledUpload, getAll as getAllScheduledUploads, remove as removeScheduledUpload } from '../utils/scheduledUploads'
import { formatInstagramRequest, formatYouTubeRequest } from '../utils/platformFormatter'
import { buildInstagramCaption, buildInstagramScheduledContent, buildInstagramScheduledUploadContent } from '../utils/scheduledPayloads'
import {
  getAll as getPlatformConnections,
  loadAll as loadPlatformConnections,
  subscribe as subscribePlatformConnections,
} from '../utils/platformConnections'
import { getBlogUploadServerBase, shouldUseRemoteBlogPublish } from '../utils/blogUploadServer.js'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { extractDesktopHelperStatus, formatDesktopHelperStatus, getDesktopHelperStatus } from '../utils/desktopHelperStatus.js'
import { normalizeNaverHelperMessage } from '../utils/naverHelperMessage.js'
import { fetchWithTimeout, withTimeout } from '../utils/requestTimeout.js'
import { pollUploadCompletion } from '../utils/blogUploadPolling.js'
import { normalizeBlogTags } from '../utils/blogTags'
import { getBlogUploadShowBrowser } from '../utils/blogUploadBrowserPreference.js'
import { BlogImageArtwork, InstagramImageArtwork } from '../components/contentImageOverlays'
import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
} from '../utils/contentImageOverlay'
import {
  sanitizeBlogBodyForDisplay,
  sanitizeBlogBodyForUpload,
} from '../utils/blogBodySanitizer'
import { buildBlogUploadImageDataUrls } from '../utils/uploadImageComposite'
import {
  buildInstagramDisplayCards,
  getInstagramCardNumber,
  getInstagramOverlayLines,
  getInstagramOverlayTitle,
} from '../utils/instagramCarousel'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const BLOG_UPLOAD_SERVER = getBlogUploadServerBase()
const USE_REMOTE_BLOG_PUBLISH = shouldUseRemoteBlogPublish()

const ensureArray = (value) => Array.isArray(value) ? value : []
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const nlToBr = (value = '') => escapeHtml(value).replace(/\n/g, '<br />')
const FIXED_NEWSLETTER_GREETING = '안녕하세요 구독자 여러분.'
const stripResultCtaText = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''

  const lines = value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !(
      /프로필\s*링크/i.test(line) ||
      /자세한\s*내용/i.test(line) ||
      /더\s*자세한\s*(분석|내용|데이터|인사이트)/i.test(line) ||
      /링크에서\s*확인/i.test(line) ||
      /전체\s*리포트/i.test(line) ||
      /확인해보세요/i.test(line) ||
      /확인하세요/i.test(line)
    ))

  return lines.join('\n').trim()
}
const BLOG_UPLOAD_SOURCE = USE_REMOTE_BLOG_PUBLISH ? 'server-api' : 'desktop-helper'
const BLOG_UPLOAD_ENDPOINT = USE_REMOTE_BLOG_PUBLISH ? `${API_BASE}/api/naver/publish` : `${BLOG_UPLOAD_SERVER}/api/upload`
const BLOG_UPLOAD_HEADERS = { 'x-autoform-client': 'web-client' }
const BLOG_IMAGE_CAPTURE_TIMEOUT_MS = 15000
const BLOG_UPLOAD_REQUEST_TIMEOUT_MS = 120000
const BLOG_UPLOAD_START_TIMEOUT_MS = 30000
const BLOG_UPLOAD_MAX_WAIT_MS = 600000
const API_RESPONSE_TIMEOUT_MS = 10000

const attachRenderedImageUrls = (images, urls) => ensureArray(images).map((image, index) => {
  const renderedImageUrl = urls[index] || image?.renderedImageUrl || image?.pngUrl || null
  return renderedImageUrl
    ? { ...image, renderedImageUrl, pngUrl: renderedImageUrl }
    : image
})

async function captureElementPng(el, label) {
  return withTimeout(
    () => domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } }),
    BLOG_IMAGE_CAPTURE_TIMEOUT_MS,
    label
  )
}

function formatBlogUploadError(data, fallbackMessage) {
  const message = normalizeNaverHelperMessage(getApiErrorMessage(data, fallbackMessage))
  const source = data?.source || BLOG_UPLOAD_SOURCE
  const endpoint = data?.endpoint || BLOG_UPLOAD_ENDPOINT
  const helperStatus = formatDesktopHelperStatus(extractDesktopHelperStatus(data?.uploadRuntime))
  return `${message}${helperStatus ? ` ${helperStatus}` : ''} [source=${source} endpoint=${endpoint}]`
}

const menuItems = [
  { id: 'blog',       label: '네이버 블로그', icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'newsletter', label: '뉴스레터',      icon: Mail,     color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  { id: 'instagram',  label: '인스타그램',    icon: Image,    color: 'text-pink-400',    bg: 'bg-pink-400/10' },
  { id: 'shorts',     label: '유튜브 숏츠',   icon: Film,     color: 'text-red-500',     bg: 'bg-red-500/10' },
]

const footerLinkMeta = {
  blog: { badge: 'N', badgeBg: '#03C75A', badgeColor: '#ffffff', bg: '#03C75A', fallbackLabel: '블로그 바로가기' },
  newsletter: { badge: '✉', bg: '#2563eb', fallbackLabel: '뉴스레터 바로가기' },
  instagram: { badge: '◐', bg: '#E1306C', fallbackLabel: '인스타그램 바로가기' },
  shorts: { badge: '▶', bg: '#FF0000', fallbackLabel: '유튜브 바로가기' },
}

export default function ExtractionResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [resolvedState, setResolvedState] = useState(location.state || null)
  const [isPageLoading, setIsPageLoading] = useState(
    Boolean(location.state?.fromContents && location.state?.extractionId)
  )
  const state = useMemo(
    () => resolvedState || location.state || {},
    [resolvedState, location.state]
  )
  const dataMap = { blog: state.blogContent, newsletter: state.newsletterContent, instagram: state.instagramContent, shorts: state.shortsScript }
  const firstAvailable = state.activeChannel && dataMap[state.activeChannel] ? state.activeChannel : menuItems.find(m => dataMap[m.id])?.id || 'blog'
  const [activeMenu, setActiveMenu] = useState(firstAvailable)
  const [copied, setCopied] = useState(false)
  const [copiedKey, setCopiedKey] = useState(null) // 뉴스레터 제목/본문 복사 버튼 구분
  const flashCopied = (key) => {
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000)
  }
  const [instaSlide, setInstaSlide] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const blogImagesRef = useRef([])
  const instaCardsRef = useRef([])
  const [blogPngUrls, setBlogPngUrls] = useState([])
  const [instaPngUrls, setInstaPngUrls] = useState([])
  const [uploadStatus, setUploadStatus] = useState({}) // { blog: 'idle'|'loading'|'done'|'error', ... }
  const [uploadError, setUploadError] = useState(null)
  const [extractionId, setExtractionId] = useState(null)
  const [scheduleDialog, setScheduleDialog] = useState({ open: false, platform: 'blog', content: {} })
  const [blogServerStatus, setBlogServerStatus] = useState('checking') // checking | online | offline
  const [blogUploadResult, setBlogUploadResult] = useState(null) // { url } | null
  const [blogTitle, setBlogTitle] = useState('')
  const [blogBody, setBlogBody] = useState('')
  const [platformConnections, setPlatformConnections] = useState(() => getPlatformConnections())

  useEffect(() => {
    const stateData = location.state || null
    let cancelled = false

    if (!stateData) {
      setResolvedState(null)
      setIsPageLoading(false)
      return () => { cancelled = true }
    }

    if (!stateData.fromContents || !stateData.extractionId) {
      setResolvedState(stateData)
      setIsPageLoading(false)
      return () => { cancelled = true }
    }

    setIsPageLoading(true)

    ;(async () => {
      try {
        const extraction = await getExtractionById(stateData.extractionId)
        if (cancelled) return

        if (extraction?.data) {
          setResolvedState({
            ...extraction.data,
            activeChannel: stateData.activeChannel,
            extractionId: stateData.extractionId,
            uploadStatus: stateData.uploadStatus || extraction.uploadStatus || {},
            fromContents: true,
          })
        } else {
          setResolvedState(stateData)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[ExtractionResultPage 상세 데이터 복원 실패]', err)
          setResolvedState(stateData)
        }
      } finally {
        if (!cancelled) setIsPageLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [location.state])

  useEffect(() => {
    let active = true

    ;(async () => {
      const nextConnections = await loadPlatformConnections()
      if (active) {
        setPlatformConnections(nextConnections)
      }
    })()

    const unsubscribe = subscribePlatformConnections(setPlatformConnections)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const mergeStoredUploadMeta = useCallback((channel, info = {}) => {
    setResolvedState((prev) => {
      const baseState = prev || location.state
      if (!baseState) return prev

      const currentUploadStatus = baseState.uploadStatus && typeof baseState.uploadStatus === 'object'
        ? baseState.uploadStatus
        : {}
      const currentChannelStatus = currentUploadStatus[channel] && typeof currentUploadStatus[channel] === 'object'
        ? currentUploadStatus[channel]
        : {}

      return {
        ...baseState,
        uploadStatus: {
          ...currentUploadStatus,
          [channel]: {
            ...currentChannelStatus,
            ...info,
          },
        },
      }
    })
  }, [location.state])

  const handleUpload = async (channel, options = {}) => {
    setUploadStatus(p => ({ ...p, [channel]: 'loading' }))
    setUploadError(null)

    if (channel === 'blog') {
      try {
        setBlogUploadResult(null)
        const uploadImageUrls = await buildBlogUploadImageDataUrls({
          blogImages,
          sections: ensureArray(blogContent?.sections),
        })

        const title = blogTitle || blogContent?.title || ''
        const content = sanitizeBlogUploadContent(blogBody || compileBlogBody(ensureArray(blogContent?.sections)))
        const tags = normalizeBlogTags(blogContent)
        const scheduledAt = options.scheduledAtOverride || scheduleInfo.blog?.scheduledAt || null

        let data
        let responseStatus = 0
        if (USE_REMOTE_BLOG_PUBLISH) {
          const remoteContent = content.replace(/\[IMG:\d+\]\s*/g, '').trim()
          const response = await fetchWithTimeout(`${API_BASE}/api/naver/publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-app-secret': import.meta.env.VITE_API_SECRET || '',
            },
            body: JSON.stringify({ title, content: remoteContent, scheduledAt, tags }),
          }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'Naver blog upload request')
          responseStatus = response.status

          try {
            data = await withTimeout(
              () => readApiResponse(response),
              API_RESPONSE_TIMEOUT_MS,
              'Upload response parsing'
            )
          } catch (error) {
            const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
            throw new Error(`${normalizeNaverHelperMessage(error.message)}${helperStatus ? ` ${helperStatus}` : ''}`)
          }

          if (!response.ok) {
            data = { ...data, success: false }
          }
        } else {
          const formData = new FormData()
          formData.append('title', title)
          formData.append('content', content)
          formData.append('tags', JSON.stringify(tags))
          formData.append('showBrowser', getBlogUploadShowBrowser() ? 'true' : 'false')
          if (scheduledAt) {
            formData.append('scheduledAt', scheduledAt)
          }

          for (let i = 0; i < uploadImageUrls.length; i++) {
            const url = uploadImageUrls[i]
            if (!url) continue
            const res = await fetchWithTimeout(url, {}, BLOG_IMAGE_CAPTURE_TIMEOUT_MS, `Blog image fetch ${i + 1}`)
            const blob = await res.blob()
            formData.append('photos', new File([blob], `section_${i + 1}.png`, { type: 'image/png' }))
          }

          let startResponse
          try {
            startResponse = await fetchWithTimeout(`${BLOG_UPLOAD_SERVER}/api/upload`, {
              method: 'POST',
              headers: BLOG_UPLOAD_HEADERS,
              body: formData,
            }, BLOG_UPLOAD_START_TIMEOUT_MS, 'Desktop helper upload start')
          } catch (error) {
            const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
            throw new Error(`${normalizeNaverHelperMessage(error.message)}${helperStatus ? ` ${helperStatus}` : ''}`)
          }

          responseStatus = startResponse.status

          let startData
          try {
            startData = await withTimeout(
              () => readApiResponse(startResponse),
              API_RESPONSE_TIMEOUT_MS,
              'Upload start response parsing'
            )
          } catch (error) {
            const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
            throw new Error(`${normalizeNaverHelperMessage(error.message)}${helperStatus ? ` ${helperStatus}` : ''}`)
          }

          if (!startResponse.ok || !startData.success || !startData.jobId) {
            data = { ...startData, success: false }
          } else {
            try {
              data = await pollUploadCompletion(startData.jobId, {
                maxWaitMs: BLOG_UPLOAD_MAX_WAIT_MS,
              })
            } catch (error) {
              throw new Error(error.message)
            }
          }
        }

        if (data.success) {
          const nextUploadMeta = {
            nativeSchedule: Boolean(data.scheduled || scheduledAt),
            scheduledAt: data.scheduledAt || scheduledAt || null,
            status: 'uploaded',
            uploadedAt: new Date().toISOString(),
            uploadedUrl: data.url || null,
          }
          setUploadStatus(p => ({ ...p, blog: 'done' }))
          mergeStoredUploadMeta('blog', nextUploadMeta)
          if (extractionId) {
            updateUploadStatus(extractionId, 'blog', nextUploadMeta)
              .catch(err => console.warn('[uploadStatus 저장 실패]', err))
          }
          setBlogUploadResult({
            endpoint: data.endpoint || BLOG_UPLOAD_ENDPOINT,
            mode: data.mode || (scheduledAt ? 'scheduled' : 'published'),
            scheduled: Boolean(data.scheduled || scheduledAt),
            scheduledAt: data.scheduledAt || scheduledAt || null,
            source: data.source || BLOG_UPLOAD_SOURCE,
            url: data.url,
          })
        } else {
          setUploadStatus(p => ({ ...p, blog: 'error' }))
          setUploadError(`네이버 블로그 업로드 실패: ${formatBlogUploadError(data, `네이버 블로그 업로드 실패 (${responseStatus || 'unknown'})`)}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, blog: 'error' }))
        setUploadError(`네이버 블로그 업로드 실패: ${err.message} [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`)
      }
      return
    }

    if (channel === 'instagram') {
      try {
        const renderedContent = await buildInstagramScheduledUploadContent({ instagramContent, instagramImages })
        const urls = (renderedContent.imageUrls || []).filter(Boolean)
        if (!urls.length) throw new Error('인스타그램 카드 이미지가 없습니다. 먼저 인스타그램 탭을 열어주세요.')
        const formatted = formatInstagramRequest(instagramContent, urls)
        console.log('[ExtractionResultPage] 인스타그램 업로드 요청:', formatted)
        const response = await fetchWithTimeout(`${API_BASE}/api/instagram/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-secret': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify(formatted),
        }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'Instagram upload request')
        const data = await withTimeout(
          () => readApiResponse(response),
          API_RESPONSE_TIMEOUT_MS,
          'Instagram upload response parsing'
        )
        if (data.success) {
          const nextUploadMeta = {
            status: 'uploaded',
            uploadedAt: new Date().toISOString(),
            uploadedUrl: data.permalink || null,
          }
          setUploadStatus(p => ({ ...p, instagram: 'done' }))
          mergeStoredUploadMeta('instagram', nextUploadMeta)
          if (extractionId) {
            updateUploadStatus(extractionId, 'instagram', nextUploadMeta)
              .catch(err => console.warn('[uploadStatus 저장 실패]', err))
          }
        } else {
          setUploadStatus(p => ({ ...p, instagram: 'error' }))
          setUploadError(`인스타그램 업로드 실패: ${getApiErrorMessage(data, `인스타그램 업로드 실패 (${response.status})`)}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, instagram: 'error' }))
        setUploadError(`인스타그램 업로드 실패: ${err.message}`)
      }
      return
    }

    if (channel === 'shorts') {
      try {
        // 상대 경로면 현재 origin을 붙여 서버가 fetch 가능한 URL로 변환
        let absVideoUrl = shortsVideo?.url || ''
        if (absVideoUrl.startsWith('/output/') && API_BASE) {
          absVideoUrl = `${API_BASE}${absVideoUrl}`
        } else if (absVideoUrl.startsWith('/')) {
          absVideoUrl = `${window.location.origin}${absVideoUrl}`
        }
        const scheduledAt = options.scheduledAtOverride || scheduleInfo.shorts?.scheduledAt || null
        const formatted = formatYouTubeRequest(shortsScript, absVideoUrl, scheduledAt)
        console.log('[ExtractionResultPage] 유튜브 숏츠 업로드 요청:', formatted)
        const response = await fetchWithTimeout(`${API_BASE}/api/youtube/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-secret': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify(formatted),
        }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'YouTube upload request')
        const data = await withTimeout(
          () => readApiResponse(response),
          API_RESPONSE_TIMEOUT_MS,
          'YouTube upload response parsing'
        )
        if (data.success) {
          setUploadStatus(p => ({ ...p, shorts: 'done' }))
          const ytUrl = data.url || (data.videoId ? `https://youtu.be/${data.videoId}` : null)
          const resolvedScheduledAt = data.scheduledAt || scheduledAt || null
          const nextUploadMeta = {
            nativeSchedule: Boolean(data.scheduled || scheduledAt),
            scheduledAt: resolvedScheduledAt,
            status: 'uploaded',
            uploadedAt: new Date().toISOString(),
            uploadedUrl: ytUrl,
          }
          mergeStoredUploadMeta('shorts', nextUploadMeta)
          if (extractionId) {
            updateUploadStatus(extractionId, 'shorts', nextUploadMeta)
              .catch(err => console.warn('[uploadStatus 저장 실패]', err))
          }
          if (resolvedScheduledAt) {
            setScheduleInfo(p => ({ ...p, shorts: { scheduledAt: resolvedScheduledAt } }))
          }
          if (ytUrl) {
            console.log('[YouTube 업로드 완료]', ytUrl)
            alert(`유튜브 업로드 완료!\n\n${ytUrl}\n\n링크가 클립보드에 복사되었습니다.`)
            try {
              await navigator.clipboard.writeText(ytUrl)
            } catch {
              // 클립보드 권한이 없으면 업로드 완료만 유지한다.
            }
            window.open(ytUrl, '_blank')
          } else {
            alert('업로드 완료 (URL 없음)')
          }
        } else {
          setUploadStatus(p => ({ ...p, shorts: 'error' }))
          setUploadError(`유튜브 숏츠 업로드 실패: ${getApiErrorMessage(data, `유튜브 숏츠 업로드 실패 (${response.status})`)}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, shorts: 'error' }))
        setUploadError(`유튜브 숏츠 업로드 실패: ${err.message}`)
      }
    }
  }

  const downloadAllImages = async (type) => {
    setDownloading(true)
    try {
      const captureElement = async (el, filename) => {
        const dataUrl = await captureElementPng(el, `Download capture ${filename}`)
        const link = document.createElement('a')
        link.download = filename
        link.href = dataUrl
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      if (type === 'blog') {
        if (blogPngUrls.length > 0) {
          // 캐시된 PNG 사용
          for (let idx = 0; idx < blogPngUrls.length; idx++) {
            if (!blogPngUrls[idx]) continue
            const link = document.createElement('a')
            link.download = `블로그_${idx + 1}.png`
            link.href = blogPngUrls[idx]
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            await new Promise(r => setTimeout(r, 300))
          }
        } else {
          for (let idx = 0; idx < blogImagesRef.current.length; idx++) {
            const el = blogImagesRef.current[idx]
            if (!el) continue
            await captureElement(el, `블로그_${idx + 1}.png`)
            await new Promise(r => setTimeout(r, 500))
          }
        }
      } else {
        // 인스타그램: 숨겨진 컨테이너에 모든 카드가 마운트되어 있으므로 슬라이드 이동 없이 순서대로 캡처
        const cards = buildInstagramDisplayCards(instagramContent)
        for (let idx = 0; idx < cards.length; idx++) {
          const el = instaCardsRef.current[idx]
          if (!el) continue
          await captureElement(el, `인스타그램_${idx + 1}.png`)
          await new Promise(r => setTimeout(r, 500))
        }
      }
    } catch (err) {
      console.error('다운로드 실패:', err)
    }
    setDownloading(false)
  }

  const downloadShortsVideo = async (videoUrl, filename = '숏츠_영상.webm') => {
    if (!videoUrl) return
    setDownloading(true)
    try {
      const response = await fetch(videoUrl)
      if (!response.ok) {
        throw new Error(`Video download failed: ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('영상 다운로드 실패:', err)
      window.alert('영상 저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setDownloading(false)
    }
  }

  const {
    blogContent, newsletterContent, instagramContent,
    shortsScript, blogImages: initialBlogImages,
    instagramImages: initialInstagramImages,
    shortsVideo: initialShortsVideo,
    shortsNarration: initialShortsNarration,
  } = state

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)
  const [instagramImages, setInstagramImages] = useState(initialInstagramImages || null)
  const [shortsVideo, setShortsVideo] = useState(initialShortsVideo || null)
  const [shortsNarration, setShortsNarration] = useState(initialShortsNarration || null)
  const showBlogImageTextOverlay = (blogContent?.imageTextOverlay || 'with-text') !== 'without-text'
  const shortsVideoRef = useRef(null)
  const shortsAudioRefs = useRef([])
  const [currentScene, setCurrentScene] = useState(-1)
  const playingSceneRef = useRef(-1)

  // blogImages / shorts 미디어가 없으면 Supabase에서 불러오기
  useEffect(() => {
    setBlogImages(initialBlogImages || null)
    setInstagramImages(initialInstagramImages || null)
    setShortsVideo(initialShortsVideo || null)
    setShortsNarration(initialShortsNarration || null)
  }, [initialBlogImages, initialInstagramImages, initialShortsVideo, initialShortsNarration])

  // 블로그 이미지 HTML -> PNG 변환
  const convertBlogImagesToPng = useCallback(async () => {
    const refs = blogImagesRef.current
    if (!refs.some(Boolean)) return []
    const urls = new Array(refs.length).fill(null)
    for (let index = 0; index < refs.length; index++) {
      const el = refs[index]
      if (!el) continue
      try {
        const url = await captureElementPng(el, `Blog image preload ${index + 1}`)
        urls[index] = url
      } catch {
        urls[index] = null
      }
    }
    setBlogPngUrls(urls)
    const nextBlogImages = attachRenderedImageUrls(blogImages, urls)
    setBlogImages(nextBlogImages)
    if (extractionId) {
      updateExtractionMedia(extractionId, { blogImages: nextBlogImages })
        .catch(err => console.warn('[블로그 렌더링 이미지 저장 실패]', err))
    }
    return urls
  }, [blogImages, extractionId])

  // 인스타 카드 HTML -> PNG 변환 (모든 카드는 숨겨진 컨테이너에 마운트되어 있어 슬라이드 변경 없이 캡처)
  const convertInstaCardsToPng = useCallback(async () => {
    const cards = buildInstagramDisplayCards(instagramContent)
    if (cards.length === 0) return []
    const urls = []
    for (let i = 0; i < cards.length; i++) {
      const el = instaCardsRef.current[i]
      if (!el) { urls.push(null); continue }
      try {
        const url = await captureElementPng(el, `Instagram image preload ${i + 1}`)
        urls.push(url)
      } catch { urls.push(null) }
    }
    setInstaPngUrls(urls)
    const nextInstagramImages = attachRenderedImageUrls(instagramImages, urls)
    setInstagramImages(nextInstagramImages)
    if (extractionId) {
      updateExtractionMedia(extractionId, { instagramImages: nextInstagramImages })
        .catch(err => console.warn('[인스타그램 렌더링 이미지 저장 실패]', err))
    }
    return urls
  }, [extractionId, instagramContent, instagramImages])
  // 블로그 이미지 PNG 변환 트리거
  useEffect(() => {
    if (activeMenu === 'blog' && blogContent && blogPngUrls.length === 0) {
      // HTML 렌더만 완료되면 변환
      const timer = setTimeout(() => convertBlogImagesToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [activeMenu, blogContent, blogPngUrls.length, convertBlogImagesToPng])

  useEffect(() => {
    if (!extractionId || !blogPngUrls.some(Boolean)) return
    const nextBlogImages = attachRenderedImageUrls(blogImages, blogPngUrls)
    updateExtractionMedia(extractionId, { blogImages: nextBlogImages })
      .catch(err => console.warn('[블로그 렌더링 이미지 저장 실패]', err))
  }, [blogImages, blogPngUrls, extractionId])

  // 네이버 블로그 업로드 서버 상태 확인
  const checkBlogServer = useCallback(() => {
    setBlogServerStatus('checking')
    // 블로그 탭일 때만 상태 체크
    if (activeMenu !== 'blog' || USE_REMOTE_BLOG_PUBLISH) { setBlogServerStatus('offline'); return }
    fetch(`${BLOG_UPLOAD_SERVER}/`, { method: 'GET', signal: AbortSignal.timeout(2000), targetAddressSpace: 'loopback' })
      .then(r => setBlogServerStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setBlogServerStatus('offline'))
  }, [activeMenu])
  useEffect(() => {
    if (activeMenu === 'blog') checkBlogServer()
    else setBlogServerStatus('offline')
  }, [activeMenu, checkBlogServer])

  // compileBlogBody: sections를 [IMG:N] 마커 포함 본문으로 생성
  // 섹션 제목은 `## **...**` 로 감싸 데스크톱 RPA 가 SmartEditor 소제목 스타일(큰 글씨)을 토글하면서
  // 동시에 볼드를 적용하도록 한다. 소제목 토글 실패 시에도 ** 마커는 그대로 살아 있어 볼드 처리는 보장된다.
  const compileBlogBody = useCallback((sections = []) => {
    return ensureArray(sections).map((s, i) => {
      const headingText = String(s.heading || '').trim()
      const heading = headingText ? `## **${headingText}**\n` : ''
      const content = sanitizeBlogBodyForDisplay(s.content || '')
      const imageMarker = `[IMG:${i + 1}]\n`
      return `${heading}${imageMarker}${content}`
    }).join('\n\n')
  }, [])

  const sanitizeBlogUploadContent = useCallback((content = '') => (
    sanitizeBlogBodyForUpload(content || '')
  ), [])

  // blogTitle / blogBody 초기화 (blogContent 로드 시)
  useEffect(() => {
    if (blogContent) {
      if (!blogTitle) setBlogTitle(blogContent.title || '')
      if (!blogBody) setBlogBody(compileBlogBody(ensureArray(blogContent.sections)))
    }
  }, [blogBody, blogContent, blogTitle, compileBlogBody])

  // 마크다운 볼드를 HTML <strong>으로 직접 변환 (파서 의존 제거)
  const normalizeMd = (text) => {
    if (!text) return ''
    return sanitizeBlogBodyForDisplay(text)
      .replace(/\*{3,}([^*]+?)\*{3,}/g, '<strong>$1</strong>')  // ***text*** -> <strong>
      .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '<strong>$1</strong>') // **text** -> <strong> (공백 포함)
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<strong>$1</strong>')  // *text* -> <strong>
      .replace(/\*{2,}/g, '')  // 남은 고아 ** 제거
      .replace(/(?<!\n)\n(?!\n)/g, '<br />\n')
  }

  // 결과 저장: ExtractionPage에서 navigateToResults 시 1회만 실행
  // savedFromExtraction 플래그가 있을 때만 저장 (ref로 StrictMode 중복 실행 방지)
  const saveOnceRef = useRef(false)
  useEffect(() => {
    if (saveOnceRef.current) return
    const stateData = location.state
    if (!stateData || !stateData.savedFromExtraction) return
    const hasContent = stateData.blogContent || stateData.newsletterContent || stateData.instagramContent || stateData.shortsScript
    if (!hasContent) return

    saveOnceRef.current = true
    saveExtraction(stateData).then(setExtractionId).catch(err => console.error('[Supabase 저장 실패]', err))
  }, [location.state])

  // 기존 추출 결과에서 오면 id와 uploadStatus를 location.state에서 가져옴
  const [scheduleInfo, setScheduleInfo] = useState({}) // { [channel]: { scheduledAt } }
  useEffect(() => {
    if (state?.extractionId) setExtractionId(state.extractionId)
    if (state?.uploadStatus) {
      const storedStatus = state.uploadStatus
      const statusMap = {}
      const schedMap = {}
      Object.keys(storedStatus).forEach(ch => {
        const s = storedStatus[ch]
        if (!s) return
        if (typeof s === 'string') {
          statusMap[ch] = s
        } else if (typeof s === 'object') {
          if (s.status) statusMap[ch] = s.status
          if (s.scheduledAt) schedMap[ch] = { scheduledAt: s.scheduledAt }
        }
      })
      if (Object.keys(statusMap).length) setUploadStatus(prev => ({ ...prev, ...statusMap }))
      if (Object.keys(schedMap).length) setScheduleInfo(prev => ({ ...prev, ...schedMap }))
    }
  }, [state])

  // extractionId가 있으면 서버에서 예약 정보를 다시 불러오기 (새로고침 후 복원)
  useEffect(() => {
    if (!extractionId) return
    ;(async () => {
      try {
        const all = await getAllScheduledUploads()
        const mine = all.filter(item => item.extractionId === extractionId && item.platform !== 'blog')
        if (!mine.length) return
        setScheduleInfo(prev => {
          const next = { ...prev }
          mine.forEach(item => {
            next[item.platform] = { scheduledAt: item.scheduledAt, scheduledId: item.id }
          })
          return next
        })
        setUploadStatus(prev => {
          const next = { ...prev }
          mine.forEach(item => {
            if (item.status === 'scheduled') next[item.platform] = 'scheduled'
          })
          return next
        })
      } catch (err) {
        console.warn('[예약 정보 복원 실패]', err)
      }
    })()
  }, [extractionId])

  useEffect(() => {
    if (activeMenu === 'instagram' && instagramContent && instaPngUrls.length === 0) {
      const timer = setTimeout(() => convertInstaCardsToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [activeMenu, instagramContent, instaPngUrls.length, convertInstaCardsToPng])

  useEffect(() => {
    if (!extractionId || !instaPngUrls.some(Boolean)) return
    const nextInstagramImages = attachRenderedImageUrls(instagramImages, instaPngUrls)
    updateExtractionMedia(extractionId, { instagramImages: nextInstagramImages })
      .catch(err => console.warn('[인스타그램 렌더링 이미지 저장 실패]', err))
  }, [instagramImages, instaPngUrls, extractionId])

  useEffect(() => {
    const nextDataMap = { blog: state.blogContent, newsletter: state.newsletterContent, instagram: state.instagramContent, shorts: state.shortsScript }
    const nextMenu = state.activeChannel && nextDataMap[state.activeChannel]
      ? state.activeChannel
      : menuItems.find(m => nextDataMap[m.id])?.id || 'blog'
    setActiveMenu(prev => (nextDataMap[prev] ? prev : nextMenu))
  }, [state])

  useEffect(() => {
    setUploadError(null)

    if (activeMenu !== 'blog' && blogUploadResult) {
      setBlogUploadResult(null)
    }
  }, [activeMenu, blogUploadResult])

  if (isPageLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={40} className="mx-auto text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-text mb-2">콘텐츠 불러오는 중</h2>
          <p className="text-text-muted">상세보기용 콘텐츠 데이터를 먼저 복원하고 있습니다.</p>
        </div>
      </div>
    )
  }

  if (!state || Object.keys(state).length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <FileText size={48} className="mx-auto text-text-muted mb-4" />
          <h2 className="text-xl font-semibold text-text mb-2">결과를 찾을 수 없습니다</h2>
          <p className="text-text-muted mb-6">먼저 PDF를 업로드하고 콘텐츠를 추출해주세요.</p>
          <button
            onClick={() => navigate('/extraction')}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            PDF 업로드하러 가기
          </button>
        </div>
      </div>
    )
  }

  const copy = async (text) => {
    await navigator.clipboard.writeText(text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const footerLinks = Object.entries(platformConnections || {}).map(([key, item]) => {
    const meta = footerLinkMeta[key] || {}
    return {
      key,
      label: item?.displayName || meta.fallbackLabel || key,
      url: item?.url,
      badge: meta.badge,
      badgeBg: meta.badgeBg,
      badgeColor: meta.badgeColor,
      bg: meta.bg || '#64748b',
      isSvg: false,
    }
  })

  const copyNewsletterHtml = async () => {
    const keyPoints = ensureArray(newsletterContent?.keyPoints)
    const dataHighlights = ensureArray(newsletterContent?.dataHighlights)
    const activeFooterLinks = footerLinks.filter(link => link.url && link.url !== '#')

    const keyPointsHtml = keyPoints.length > 0
      ? `
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8ff;border:1px solid #dbe7ff;border-radius:16px;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:0.08em;color:#3b82f6;text-transform:uppercase;margin-bottom:12px;">KEY POINTS</div>
                  ${keyPoints.map((point) => `
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;">
                      <tr>
                        <td valign="top" style="width:20px;padding-top:3px;">
                          <span style="display:inline-block;width:14px;height:14px;border-radius:999px;background:#3b82f6;color:#ffffff;font-size:10px;line-height:14px;text-align:center;font-weight:700;">✓</span>
                        </td>
                        <td style="font-size:14px;line-height:24px;color:#111827;">${nlToBr(point)}</td>
                      </tr>
                    </table>
                  `).join('')}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : ''

    const dataHighlightsHtml = dataHighlights.length > 0
      ? `
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                ${dataHighlights.map((item) => `
                  <td valign="top" width="${Math.floor(100 / dataHighlights.length)}%" style="padding:${dataHighlights.length > 1 ? '0 6px' : '0'};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;">
                      <tr>
                        <td style="padding:18px 12px;text-align:center;">
                          <div style="font-size:24px;line-height:30px;font-weight:800;color:#2563eb;">${escapeHtml(item.value || '')}</div>
                          <div style="margin-top:6px;font-size:12px;line-height:18px;color:#6b7280;">${escapeHtml(item.label || '')}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                `).join('')}
              </tr>
            </table>
          </td>
        </tr>`
      : ''

    const footerLinksHtml = activeFooterLinks.length > 0
      ? `
        <tr>
          <td style="padding:8px 32px 32px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            <div style="font-size:12px;line-height:18px;color:#6b7280;margin:18px 0 16px 0;">더 많은 콘텐츠는 여기에서 만나보세요.</div>
            ${activeFooterLinks.map((link) => `
              <a
                href="${escapeHtml(link.url)}"
                target="_blank"
                rel="noopener noreferrer"
                style="display:inline-block;margin:4px 6px;padding:10px 16px;border-radius:10px;background:${link.bg};color:#ffffff;font-size:12px;line-height:18px;font-weight:700;text-decoration:none;"
              >
                ${escapeHtml(link.label)}
              </a>
            `).join('')}
          </td>
        </tr>`
      : ''

    const fullHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f8fb;padding:24px 0;margin:0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9f0;">
              <tr>
                <td style="padding:32px 32px 28px 32px;background:linear-gradient(90deg,#eff6ff 0%,#f8fbff 100%);text-align:center;">
                  <div style="font-size:28px;line-height:36px;font-weight:800;color:#111827;">${escapeHtml(newsletterContent?.headline || newsletterContent?.subject || '')}</div>
                  ${newsletterContent?.preheader ? `<div style="margin-top:10px;font-size:14px;line-height:22px;color:#6b7280;">${escapeHtml(newsletterContent.preheader)}</div>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px 20px 32px;font-size:14px;line-height:24px;color:#111827;">
                  ${nlToBr(FIXED_NEWSLETTER_GREETING)}
                </td>
              </tr>
              ${keyPointsHtml}
              <tr>
                <td style="padding:0 32px 24px 32px;font-size:14px;line-height:26px;color:#4b5563;">
                  ${nlToBr(newsletterContent?.body || '')}
                </td>
              </tr>
              ${dataHighlightsHtml}
              ${footerLinksHtml}
            </table>
          </td>
        </tr>
      </table>
    `
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([fullHtml], { type: 'text/html' }),
          'text/plain': new Blob([fullHtml], { type: 'text/plain' }),
        }),
      ])
      flashCopied('newsletter-body')
    } catch {
      await navigator.clipboard.writeText(fullHtml)
      flashCopied('newsletter-body')
    }
  }

  const renderBlog = () => {
    const blogTags = normalizeBlogTags(blogContent)

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div />
          <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => (
              blogServerStatus === 'offline'
                ? navigate('/settings?section=desktop-helper')
                : checkBlogServer()
            )}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              blogServerStatus === 'online'
                ? 'border-border text-text-muted hover:text-text hover:border-primary/40'
                : blogServerStatus === 'checking'
                  ? 'border-warning/30 text-warning hover:border-warning/50'
                  : 'border-danger/30 text-danger hover:bg-danger/5'
            }`}
            title={blogServerStatus === 'offline' ? '설정으로 이동' : '서버 상태 새로고침'}
          >
            <span className={`w-2 h-2 rounded-full ${
              blogServerStatus === 'online'
                ? 'bg-success'
                : blogServerStatus === 'checking'
                  ? 'bg-warning animate-pulse'
                  : 'bg-danger'
            }`} />
            <span>
              {blogServerStatus === 'online'
                ? '블로그 서버 연결됨'
                : blogServerStatus === 'checking'
                  ? '블로그 서버 확인 중...'
                  : '블로그 서버 연결 필요'}
            </span>
            {blogServerStatus !== 'offline' && <RefreshCw size={12} />}
          </button>
          <button
            onClick={() => copy(`${blogTitle || blogContent?.title || ''}\n\n${blogBody || compileBlogBody(ensureArray(blogContent?.sections))}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
          >
            {copied ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
            복사
          </button>
          <button
            onClick={() => downloadAllImages('blog')}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            이미지 저장
          </button>
          </div>
        </div>

        <article className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-border">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 leading-tight">
              {blogContent?.title}
            </h1>
            {blogTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {blogTags.map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8 space-y-10">
            {(() => {
              const blogImageList = ensureArray(blogImages)
              const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
              const accentPalette = {
                'bg-[#FFF3E0]': '#e57a00',
                'bg-[#E8F5E9]': '#2e7d32',
                'bg-[#E3F2FD]': '#1565c0',
                'bg-[#F3E5F5]': '#7b1fa2',
              }

              return ensureArray(blogContent?.sections).map((section, index) => {
                const image =
                  blogImageList.find(img => img?.heading === section.heading && img?.imageUrl) ||
                  blogImageList[index] ||
                  null
                const imageUrl = image?.imageUrl || null
                const renderedImageUrl = image?.renderedImageUrl || image?.pngUrl || blogPngUrls[index] || null
                const keyPhrase = cleanCardText(image?.keyPhrase || section?.keyPhrase || '')
                const headingText = cleanCardText(section?.heading || '')
                const headline = deriveBlogHeadline(keyPhrase, headingText)
                const description = deriveBlogImageDescription(keyPhrase, headingText, section?.content || '')
                const accentColor = accentPalette[bgColors[index % bgColors.length]] || '#6366f1'

                if (!imageUrl && !renderedImageUrl) {
                  blogImagesRef.current[index] = null
                }

              return (
                <section key={index} className="space-y-5">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{section.heading}</h3>

                  {(imageUrl || renderedImageUrl) && (
                    <div className="mb-4">
                      {renderedImageUrl ? (
                        <img
                          src={renderedImageUrl}
                          alt={section.heading || `블로그 이미지 ${index + 1}`}
                          className="w-full max-w-xl rounded-xl shadow-sm"
                        />
                      ) : (
                        <BlogImageArtwork
                          innerRef={el => { blogImagesRef.current[index] = el }}
                          src={imageUrl}
                          alt={section.heading || `블로그 이미지 ${index + 1}`}
                          headline={headline}
                          description={description}
                          accentColor={accentColor}
                          showTextOverlay={showBlogImageTextOverlay}
                          variant="circle"
                          mode="modal"
                          containerClassName="w-full max-w-xl rounded-xl shadow-sm border border-border"
                        />
                      )}
                    </div>
                  )}

                  <div className="prose prose-gray max-w-none text-gray-700 leading-8">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {normalizeMd(stripResultCtaText(sanitizeBlogBodyForDisplay(section.content || '')))}
                    </ReactMarkdown>
                  </div>
                </section>
              )
            })
          })()}
        </div>
      </article>
      </div>
    )
  }

  const renderInstagram = () => {
    const cards = buildInstagramDisplayCards(instagramContent)
    const current = cards[instaSlide]
    const currentCardNumber = getInstagramCardNumber(current, instaSlide)
    const instagramCardStyle = instagramContent?.cardStyle || 'background-text'
    const currentInstagramImage = current?.isCaptionCta
      ? (ensureArray(instagramImages)[ensureArray(instagramImages).length - 1] || ensureArray(instagramImages)[0])
      : (
        ensureArray(instagramImages).find((image, index) => {
          const imageCardNumber = image?.cardNumber || image?.card_number || index + 1
          return imageCardNumber === currentCardNumber
        }) || ensureArray(instagramImages)[0]
      )
    const currentCardPngUrl = currentInstagramImage?.renderedImageUrl || currentInstagramImage?.pngUrl || instaPngUrls[instaSlide] || null
    const hashtags = ensureArray(instagramContent?.hashtags)
    const sanitizedCaption = stripResultCtaText(buildInstagramCaption(instagramContent))
    const renderInstaCardArt = (card, cardIndex, attachRef = false) => {
      const cardNumber = getInstagramCardNumber(card, cardIndex)
      const cardImage = card?.isCaptionCta
        ? (ensureArray(instagramImages)[ensureArray(instagramImages).length - 1] || ensureArray(instagramImages)[0])
        : (
          ensureArray(instagramImages).find((image, i) => {
            const imageCardNumber = image?.cardNumber || image?.card_number || i + 1
            return imageCardNumber === cardNumber
          }) || ensureArray(instagramImages)[0]
        )
      const renderedImageUrl = cardImage?.renderedImageUrl || cardImage?.pngUrl || instaPngUrls[cardIndex] || null
      if (renderedImageUrl && !attachRef) {
        return (
          <img
            src={renderedImageUrl}
            alt={cardImage?.heading || card?.title || card?.heading || `인스타 카드 ${cardNumber}`}
            className="block w-full h-auto"
            loading="lazy"
          />
        )
      }
      const imageUrl = cardImage?.imageUrl || cardImage?.url || null
      const cardTitle = getInstagramOverlayTitle(card, cardIndex)
      const descriptionLines = getInstagramOverlayLines(card)
      return (
        <InstagramImageArtwork
          innerRef={attachRef ? (el => { instaCardsRef.current[cardIndex] = el }) : undefined}
          imageUrl={imageUrl}
          alt={cardImage?.heading || card?.title || card?.heading || `인스타 카드 ${cardNumber}`}
          cardNumber={cardNumber}
          cardTitle={cardTitle}
          descriptionLines={descriptionLines}
          kicker={card?.kicker}
          cardStyle={instagramCardStyle}
          mode="modal"
          containerClassName="rounded-[28px]"
        />
      )
    }

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copy(`${sanitizedCaption}\n\n${hashtags.join(' ')}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
          >
            {copied ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
            캡션 복사
            </button>
            <button
              onClick={() => downloadAllImages('instagram')}
              disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            카드 저장
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="space-y-4 sm:w-[440px] sm:shrink-0">
            <div className="bg-white rounded-[28px] p-4 shadow-xl border border-gray-100">
              <div className="rounded-[28px] overflow-hidden bg-gray-100">
                {currentCardPngUrl ? (
                  <img
                    src={currentCardPngUrl}
                    alt={currentInstagramImage?.heading || current?.title || current?.heading || `인스타 카드 ${currentCardNumber}`}
                    className="block w-full h-auto"
                    loading="lazy"
                  />
                ) : (
                  renderInstaCardArt(current, instaSlide, false)
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setInstaSlide(prev => Math.max(prev - 1, 0))}
                disabled={instaSlide === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-text-muted disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                이전
              </button>
              <div className="text-sm text-text-muted">{instaSlide + 1} / {cards.length}</div>
              <button
                onClick={() => setInstaSlide(prev => Math.min(prev + 1, cards.length - 1))}
                disabled={instaSlide === cards.length - 1}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-text-muted disabled:opacity-40"
              >
                다음
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-5 min-w-0 flex-1">
            <div className="bg-surface rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text mb-3">캡션</h3>
              <div className="text-sm text-text leading-7 whitespace-pre-wrap">{sanitizedCaption}</div>
            </div>

            <div className="bg-surface rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text mb-3">해시태그</h3>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag, index) => (
                  <span key={index} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary-light text-sm font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* PNG 캡처용 숨겨진 카드 컨테이너. 화면에 보이는 슬라이드를 건드리지 않기 위해 모든 카드를 오프스크린에 마운트한다. */}
        {cards.length > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-100000px',
              top: 0,
              width: '440px',
              pointerEvents: 'none',
            }}
          >
            {cards.map((card, idx) => (
              <div key={`insta-capture-${idx}`} className="bg-white rounded-[28px] p-4">
                <div className="rounded-[28px] overflow-hidden bg-gray-100">
                  {renderInstaCardArt(card, idx, true)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderNewsletter = () => (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div />
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(newsletterContent?.subject || '')
              flashCopied('newsletter-subject')
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            title="뉴스레터 제목을 복사합니다"
          >
            {copiedKey === 'newsletter-subject' ? <><CheckCircle size={16} /> 복사됨</> : <><Copy size={16} /> 제목 복사</>}
          </button>
          <button
            type="button"
            onClick={copyNewsletterHtml}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors"
            title="이메일 편집기에 붙여넣을 HTML 본문을 복사합니다"
          >
            {copiedKey === 'newsletter-body' ? <><CheckCircle size={16} /> 복사됨</> : <><Copy size={16} /> 본문 복사</>}
          </button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border bg-surface-light">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <p className="text-xs ml-3 flex-1 truncate">
            <span className="font-bold text-text">제목 :</span>
            {' '}
            <span className="text-text-muted">{newsletterContent?.subject}</span>
          </p>
        </div>

        <div id="newsletter-export">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-8 text-center">
            <h2 className="text-xl font-bold text-text">{newsletterContent?.headline || newsletterContent?.subject}</h2>
            {newsletterContent?.preheader && (
              <p className="text-sm text-text-muted mt-2">{newsletterContent.preheader}</p>
            )}
          </div>

          <div className="px-8 py-6 space-y-5">
            <p className="text-sm text-text">{FIXED_NEWSLETTER_GREETING}</p>

            {ensureArray(newsletterContent?.keyPoints).length > 0 && (
              <div className="bg-primary/5 rounded-lg p-5 border border-primary/10">
                <p className="text-xs font-bold text-primary-light mb-3 uppercase tracking-wide">KEY POINTS</p>
                <ul className="space-y-2.5">
                  {ensureArray(newsletterContent?.keyPoints).map((point, i) => (
                    <li key={i} className="text-sm text-text flex items-start gap-2.5">
                      <CheckCircle size={15} className="text-primary shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-sm text-text-muted leading-7 whitespace-pre-wrap">{newsletterContent?.body}</div>

            {ensureArray(newsletterContent?.dataHighlights).length > 0 && (
              <div className="grid grid-cols-2 gap-3 py-2">
                {ensureArray(newsletterContent?.dataHighlights).map((d, i) => (
                  <div key={i} className="bg-surface-light rounded-xl p-4 border border-border text-center">
                    <p className="text-2xl font-bold text-primary-light">{d.value}</p>
                    <p className="text-xs text-text-muted mt-1">{d.label}</p>
                  </div>
                ))}
              </div>
            )}

            {footerLinks.some(l => l.url && l.url !== '#') && (
              <div className="pt-6 border-t border-border text-center">
                <p className="text-xs text-text-muted mb-4">더 많은 콘텐츠는 여기에서 만나보세요.</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {footerLinks.filter(l => l.url && l.url !== '#').map(l => (
                    <a
                      key={l.key}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                      style={{ background: l.bg }}
                    >
                      {l.isSvg ? (
                        <span className="inline-flex items-center" dangerouslySetInnerHTML={{ __html: l.badge }} />
                      ) : l.badgeBg ? (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm font-black text-[11px]" style={{ background: l.badgeBg, color: l.badgeColor }}>{l.badge}</span>
                      ) : (
                        <span className="text-xs">{l.badge}</span>
                      )}
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const sceneTimings = shortsVideo?.sceneTimings || []

  const getSceneAtTime = (t) => {
    for (let i = 0; i < sceneTimings.length; i++) {
      const s = sceneTimings[i]
      if (t >= s.startTime && t < s.startTime + s.duration) return i
    }
    return -1
  }

  const handleShortsTimeUpdate = () => {
    const video = shortsVideoRef.current
    if (!video || !sceneTimings.length) return
    const t = video.currentTime
    const sceneIdx = getSceneAtTime(t)
    if (sceneIdx !== currentScene) setCurrentScene(sceneIdx)
    if (sceneIdx !== playingSceneRef.current) {
      shortsAudioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
      if (sceneIdx >= 0 && !video.paused) {
        const audio = shortsAudioRefs.current[sceneIdx]
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
      }
      playingSceneRef.current = sceneIdx
    }
  }

  const handleShortsPlay = () => { playingSceneRef.current = -1 }

  const handleShortsPause = () => {
    shortsAudioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
    playingSceneRef.current = -1
  }

  const renderVideoPanel = (videoData, versionLabel) => {
    const videoUrl = videoData?.combinedVideoUrl || videoData?.url || videoData?.videoUrl
    const timings = videoData?.sceneTimings || []
    const isLoading = videoData && !videoUrl
    return (
      <div className="w-64 shrink-0">
        <div className="aspect-[9/16] bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl overflow-hidden relative shadow-xl">
          {videoUrl ? (
            <video
              ref={shortsVideoRef}
              controls
              className="w-full h-full object-cover absolute inset-0"
              src={videoUrl}
              onPlay={handleShortsPlay}
              onPause={handleShortsPause}
              onEnded={handleShortsPause}
              onTimeUpdate={handleShortsTimeUpdate}
            />
          ) : isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 size={32} className="text-white/40 animate-spin mb-4" />
              <p className="text-white/60 text-xs">영상 준비 중...</p>
            </div>
          ) : (
            <>
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <Film size={32} className="text-white/20 mb-4" />
                <h3 className="text-white font-bold text-sm mb-2">{shortsScript?.title}</h3>
                <p className="text-white/60 text-xs">{versionLabel}</p>
                <p className="text-white/40 text-xs mt-1">영상 미생성</p>
              </div>
              {shortsScript?.hook && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-4">
                  <p className="text-white text-xs font-medium">{shortsScript.hook}</p>
                </div>
              )}
            </>
          )}
        </div>
        {videoUrl && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadShortsVideo(videoUrl, `숏츠_${versionLabel}.webm`)}
              disabled={downloading}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
            >
              <Download size={10} /> 다운로드
            </button>
            <button
              onClick={() => navigate('/shorts/view', { state: {
                combinedVideoUrl: videoUrl,
                sceneTimings: timings,
                scenes: shortsScript?.scenes || [],
                narrations: shortsNarration || [],
                title: `${shortsScript?.title || '숏츠 영상'} (${versionLabel})`,
              }})}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
            >
              <ExternalLink size={10} /> 크게 보기
            </button>
          </div>
        )}
        {ensureArray(shortsNarration).map((n, i) => (
          n.audioUrl && <audio key={i} ref={el => shortsAudioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
        ))}
      </div>
    )
  }

  const renderShorts = () => {
    const shortsVideoUrl = shortsVideo?.combinedVideoUrl || shortsVideo?.url || shortsVideo?.videoUrl
    const shortsTitle = shortsScript?.uploadTitle || shortsScript?.title || ''
    const shortsHashtags = ensureArray(shortsScript?.hashtags)
    const sanitizedShortsDescription = stripResultCtaText(
      shortsScript?.uploadDescription ||
      [shortsScript?.hook, shortsScript?.cta].filter(Boolean).join('\n\n')
    )
    const shortsDetailText = [
      shortsTitle ? `제목\n${shortsTitle}` : '',
      sanitizedShortsDescription ? `설명\n${sanitizedShortsDescription}` : '',
      shortsHashtags.length > 0 ? `태그\n${shortsHashtags.join(' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copy(shortsDetailText)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            >
              <Copy size={14} /> 상세정보 복사
            </button>
            {shortsVideoUrl ? (
              <button
                type="button"
                onClick={() => downloadShortsVideo(shortsVideoUrl)}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                영상 저장
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm opacity-60 cursor-not-allowed"
              >
                <Download size={14} /> 영상 저장
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {renderVideoPanel(shortsVideo, '숏츠 영상')}

          <div className="space-y-3 min-w-0 flex-1">
            <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
              <h4 className="text-sm font-semibold text-text mb-1">상세정보</h4>

              {shortsTitle && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-text-muted">영상 제목</p>
                  <p className="text-sm text-text leading-6">{shortsTitle}</p>
                </div>
              )}

              {sanitizedShortsDescription && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-text-muted">설명</p>
                  <p className="text-sm whitespace-pre-wrap text-text leading-7">{sanitizedShortsDescription}</p>
                </div>
              )}

              {shortsHashtags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-text-muted">태그</p>
                  <div className="flex flex-wrap gap-2">
                    {shortsHashtags.map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderContent = { blog: renderBlog, newsletter: renderNewsletter, instagram: renderInstagram, shorts: renderShorts }
  const activeUploadMeta = state?.uploadStatus?.[activeMenu] && typeof state.uploadStatus[activeMenu] === 'object'
    ? state.uploadStatus[activeMenu]
    : null
  const activeUploadedUrl = activeUploadMeta?.uploadedUrl || (activeMenu === 'blog' ? blogUploadResult?.url || null : null)
  const activeMenuLabel = menuItems.find(item => item.id === activeMenu)?.label || '결과물'

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-wrap items-center gap-2 bg-surface rounded-xl border border-border p-2">
        <button
          onClick={() => navigate(state?.fromContents ? '/contents' : '/extraction')}
          className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors shrink-0"
          title={state?.fromContents ? '콘텐츠 관리로 돌아가기' : '콘텐츠 추출로 돌아가기'}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-px h-6 bg-border shrink-0" />
        {menuItems.map((menuItem) => {
          const { id, label } = menuItem
          const MenuIcon = menuItem.icon
          const hasData = { blog: blogContent, newsletter: newsletterContent, instagram: instagramContent, shorts: shortsScript }[id]
          return (
            <button
              key={id}
              onClick={() => hasData && setActiveMenu(id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeMenu === id
                  ? 'bg-primary/15 text-primary-light'
                  : hasData
                    ? 'text-text-muted hover:text-text hover:bg-surface-light'
                    : 'text-text-muted/40 cursor-not-allowed'
                }`}
            >
              <MenuIcon size={16} />
              {label}
              {hasData && <CheckCircle size={12} className="text-success" />}
            </button>
          )
        })}
        {dataMap[activeMenu] && activeMenu !== 'newsletter' && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {(() => {
              const ch = activeMenu
              const status = uploadStatus[ch]
              const sched = scheduleInfo[ch]
              const isNativeSchedule = ['blog', 'shorts'].includes(ch) && status === 'done' && Boolean(sched?.scheduledAt)
              const isScheduled = status === 'scheduled' && !isNativeSchedule
              return (
                <>
                  {!isScheduled && !isNativeSchedule && (
                    <button
                      onClick={() => handleUpload(ch)}
                      disabled={status === 'loading'}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shrink-0
                        ${status === 'done'
                          ? 'bg-success/10 text-success border border-success/20 hover:bg-success/20'
                          : status === 'loading'
                            ? 'bg-primary/10 text-primary-light border border-primary/20 opacity-70'
                            : 'bg-primary text-white hover:bg-primary-dark disabled:opacity-60'
                        }`}
                    >
                      {status === 'loading' ? (
                        <><Loader2 size={14} className="animate-spin" /> 업로드 중...</>
                      ) : (
                        <><Upload size={14} /> 업로드</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      let resolvedInstaPngUrls = instaPngUrls.filter(Boolean)
                      if (ch === 'instagram' && !resolvedInstaPngUrls.length && (instagramContent?.cards?.length || instagramContent?.cardTopics?.length)) {
                        try {
                          await convertInstaCardsToPng()
                          await new Promise((resolve) => setTimeout(resolve, 200))
                          resolvedInstaPngUrls = instaPngUrls.filter(Boolean)
                          if (!resolvedInstaPngUrls.length) {
                            resolvedInstaPngUrls = (await Promise.all(
                              (instaCardsRef.current || []).filter(Boolean).map(async (el, idx) => {
                                try { return await captureElementPng(el, `Instagram schedule capture ${idx + 1}`) }
                                catch { return null }
                              })
                            )).filter(Boolean)
                          }
                        } catch (err) {
                          console.warn('[Schedule] 인스타 카드 PNG 캡처 실패:', err)
                        }
                      }
                      const contentMap = {
                        blog: blogContent,
                        newsletter: newsletterContent,
                        instagram: buildInstagramScheduledContent({ instagramContent, instagramImages, instaPngUrls: resolvedInstaPngUrls }),
                        shorts: shortsScript,
                      }
                      setScheduleDialog({ open: true, platform: ch, content: contentMap[ch] || {}, mode: (isScheduled || isNativeSchedule) ? 'edit' : 'create', initialDatetime: sched?.scheduledAt })
                    }}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shrink-0 bg-surface border border-border text-text-muted hover:text-primary hover:border-primary/40"
                  >
                    <Calendar size={14} />
                    예약 업로드
                  </button>
                </>
              )
            })()}
          </div>
        )}
      </div>

      {activeUploadedUrl && dataMap[activeMenu] && activeMenu !== 'newsletter' && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">{activeMenuLabel} 결과물을 확인할 수 있습니다.</p>
            <p className="mt-1 text-xs text-text-muted break-all">{activeUploadedUrl}</p>
          </div>
          <a
            href={activeUploadedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors shrink-0"
          >
            결과물 보기
            <ExternalLink size={14} />
          </a>
        </div>
      )}

      {activeMenu === 'blog' && blogUploadResult && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">
              {blogUploadResult.scheduled ? '네이버 예약 발행 등록 완료!' : '네이버 블로그 업로드 성공!'}
            </p>
            {blogUploadResult.scheduledAt && (
              <p className="mt-1 text-xs text-text-muted">
                예약 시간: {new Date(blogUploadResult.scheduledAt).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {blogUploadResult.url && (
              <a href={blogUploadResult.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 mt-1 text-xs text-emerald-500 hover:underline font-medium break-all">
                {blogUploadResult.url} <ExternalLink size={11} className="shrink-0" />
              </a>
            )}
          </div>
          <button onClick={() => setBlogUploadResult(null)} className="text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border">닫기</button>
        </div>
      )}

      {uploadError && dataMap[activeMenu] && activeMenu !== 'newsletter' && (
        <div className="flex items-center gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
          <AlertCircle size={14} className="text-danger shrink-0" />
          <p className="text-xs text-danger">{uploadError}</p>
        </div>
      )}

      <div>
        {renderContent[activeMenu]?.() || (
          <div className="flex items-center justify-center h-96 text-text-muted text-sm">
            이 채널의 콘텐츠가 아직 생성되지 않았습니다.
          </div>
        )}
      </div>

      <ScheduleDialog
        open={scheduleDialog.open}
        mode={scheduleDialog.mode || 'create'}
        initialDatetime={scheduleDialog.initialDatetime}
        onClose={() => setScheduleDialog(s => ({ ...s, open: false }))}
        defaultPlatform={scheduleDialog.platform}
        content={scheduleDialog.content}
        lockPlatform={true}
        onSave={async ({ platform, scheduledAt, content }) => {
          let id = extractionId
          if (!id) {
            try {
              id = await saveExtraction(state || {})
              setExtractionId(id)
            } catch (err) {
              alert(`콘텐츠 저장 실패: ${err.message}`)
              return
            }
          }
          if (!id) {
            alert('콘텐츠 저장에 실패했습니다. 다시 시도해주세요.')
            return
          }

          if (platform === 'blog') {
            const nextStatus = uploadStatus[platform] === 'done' ? 'uploaded' : (uploadStatus[platform] || 'not_uploaded')
            await updateUploadStatus(id, platform, {
              nativeSchedule: true,
              scheduledAt,
              status: nextStatus,
            })
            setScheduleInfo(p => ({ ...p, [platform]: { scheduledAt } }))
            setUploadStatus(p => ({ ...p, [platform]: 'loading' }))
            setUploadError(null)
            handleUpload(platform, { scheduledAtOverride: scheduledAt })
            return
          } else if (platform === 'shorts') {
            setScheduleInfo(p => ({ ...p, [platform]: { scheduledAt } }))
            setUploadStatus(p => ({ ...p, [platform]: 'loading' }))
            setUploadError(null)
            handleUpload(platform, { scheduledAtOverride: scheduledAt })
            return
          } else {
            try {
              const scheduledId = scheduleInfo[platform]?.scheduledId || null
              const scheduledContent = platform === 'instagram'
                ? await buildInstagramScheduledUploadContent({ instagramContent, instagramImages, instaPngUrls })
                : content
              const savedSchedule = await createScheduledUpload({ platform, content: scheduledContent, scheduledAt, extractionId: id, scheduledId })
              setScheduleInfo(p => ({
                ...p,
                [platform]: { scheduledAt: savedSchedule.scheduledAt, scheduledId: savedSchedule.id },
              }))
            } catch (err) {
              console.error('[예약 생성 실패]', err)
              alert(`예약 생성 실패: ${err.message}`)
              return
            }
            await updateUploadStatus(id, platform, { status: 'scheduled', scheduledAt })
            setUploadStatus(p => ({ ...p, [platform]: 'scheduled' }))
          }

          setScheduleInfo(p => ({
            ...p,
            [platform]: {
              scheduledAt,
              scheduledId: p[platform]?.scheduledId || null,
            },
          }))
        }}
        onDelete={scheduleDialog.mode === 'edit' ? async () => {
          const platform = scheduleDialog.platform
          const scheduledId = scheduleInfo[platform]?.scheduledId
          if (scheduledId && platform !== 'blog' && platform !== 'shorts') {
            try {
              await removeScheduledUpload(scheduledId)
            } catch (err) {
              alert(`예약 삭제 실패: ${err.message}`)
              return
            }
          }
          if (extractionId) {
            if (platform === 'blog') {
              const nextStatus = uploadStatus[platform] === 'done' ? 'uploaded' : 'not_uploaded'
              updateUploadStatus(extractionId, platform, { nativeSchedule: false, scheduledAt: null, status: nextStatus })
            } else {
              updateUploadStatus(extractionId, platform, { status: 'not_uploaded' })
            }
          }
          if (platform !== 'blog') {
            setUploadStatus(p => { const n = { ...p }; delete n[platform]; return n })
          }
          setScheduleInfo(p => { const n = { ...p }; delete n[platform]; return n })
        } : undefined}
      />
    </div>
  )
}
