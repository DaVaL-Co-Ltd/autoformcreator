import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import {
  FileText, Image, Mail, Film, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Clock, ChevronLeft, ChevronRight, ExternalLink,
  Upload, Loader2, AlertCircle, Calendar, RefreshCw, Eye, EyeOff, X, ZoomIn, Pencil
} from 'lucide-react'
import ScheduleDialog from '../components/ScheduleDialog'
import AccountUploadDialog from '../components/AccountUploadDialog'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { saveExtraction, getExtractionById, updateExtractionMedia, updateUploadStatus, updateExtractionContent } from '../services/storage'
import { create as createScheduledUpload, getAll as getAllScheduledUploads, remove as removeScheduledUpload } from '../utils/scheduledUploads'
import { formatInstagramReelsRequest, formatInstagramRequest, formatYouTubeRequest, stripMarkdownEmphasis } from '../utils/platformFormatter'
import { buildInstagramCaption, buildInstagramScheduledContent, buildInstagramScheduledUploadContent } from '../utils/scheduledPayloads'
import {
  SHORTS_PLATFORMS,
  buildShortsUploadStatus,
  deriveShortsPlatforms,
  shortsSchedulePlatform,
} from '../utils/shortsUploadStatus'
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
import {
  BLOG_HEADING_STYLE,
  buildBlogHeadingPrefix,
  isAutomaticBlogQuoteCategory,
  resolveBlogHeadingStyle,
} from '../utils/blogHeadingStyle'
import { BlogImageArtwork, InstagramImageArtwork } from '../components/contentImageOverlays'
import KnowledgeInsightCard, { KnowledgeInsightCardReady } from '../components/KnowledgeInsightCard'
import { renderKnowledgeCardDataUrl } from '../utils/knowledgeCardCapture.jsx'
import NavigationBlockerModal from '../components/NavigationBlockerModal'
import ContentEditModal from '../components/ContentEditModal'
import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
  isClosingBlogSection,
} from '../utils/contentImageOverlay'
import {
  composeBlogSectionBody,
  sanitizeBlogBodyForDisplay,
  sanitizeBlogBodyForUpload,
  splitSentencesForBlogProse,
  stripResultCtaText,
} from '../utils/blogBodySanitizer'
import { buildBlogUploadImageDataUrls } from '../utils/uploadImageComposite'
import {
  buildInstagramDisplayCards,
  getInstagramCardNumber,
  getInstagramOverlayTitle,
} from '../utils/instagramCarousel'
import { appendBlogFooterText, getBlogFooterConfig } from '../utils/blogFooterLinks'
import { hasUploadAccountFailures, normalizeUploadAccountResults } from '../utils/uploadAccountResults'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const RESULT_DRAFT_STORAGE_PREFIX = 'autoform:result-draft:'
const RESULT_DRAFT_WINDOW_KEY = '__AUTOFORM_RESULT_DRAFTS__'
const BLOG_UPLOAD_SERVER = getBlogUploadServerBase()
const USE_REMOTE_BLOG_PUBLISH = shouldUseRemoteBlogPublish()
const BLOG_DIVIDER_MARKER = '[DIVIDER]'

const ensureArray = (value) => Array.isArray(value) ? value : []

const formatStatusDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function AccountResultBadges({ meta, className = '' }) {
  const rows = normalizeUploadAccountResults(meta)
  if (!rows.length) return null

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {rows.map((row, index) => (
        <div
          key={`${row.accountId || 'unknown'}-${index}`}
          className={`inline-flex max-w-full items-start gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
            row.status === 'failed'
              ? 'border-danger/20 bg-danger/5 text-danger'
              : 'border-success/20 bg-success/5 text-success'
          }`}
        >
          {row.status === 'failed' ? <AlertCircle size={12} className="mt-0.5 shrink-0" /> : <CheckCircle size={12} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">
            <span className="font-semibold">{row.accountId || '계정'}</span>
            <span className="ml-1">{row.status === 'failed' ? '실패' : '성공'}</span>
            {row.error && <span className="ml-1 break-all opacity-80">{row.error}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

const buildInstagramKnowledgeBullets = (card = {}) => {
  if (Array.isArray(card?.bullets) && card.bullets.length > 0) {
    return card.bullets.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 4)
  }
  const collected = []
  const pushUnique = (value) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return
    if (collected.includes(trimmed)) return
    collected.push(trimmed)
  }
  pushUnique(card?.dataPoint)
  String(card?.content || '')
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .forEach((piece) => pushUnique(piece))
  pushUnique(card?.subtitle)
  pushUnique(card?.summary)
  return collected.slice(0, 4)
}
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const nlToBr = (value = '') => escapeHtml(value).replace(/\n/g, '<br />')
const FIXED_NEWSLETTER_GREETING = '안녕하세요 구독자 여러분.'
const buildBlogTagText = (tags = []) => ensureArray(tags)
  .map((tag) => String(tag || '').trim().replace(/^#+/, ''))
  .filter(Boolean)
  .map((tag) => `#${tag}`)
  .join(' ')

const appendBlogTagsToBody = (content = '', tags = []) => {
  const trimmedContent = String(content || '').trim()
  const tagText = buildBlogTagText(tags)

  if (!tagText) return trimmedContent
  if (!trimmedContent) return tagText
  if (trimmedContent.includes(tagText)) return trimmedContent

  // 본문→태그 사이 빈 줄 1개 (parseBlogBlocks 기준 보이는 빈 줄 = 줄바꿈 수 - 2)
  return `${trimmedContent}\n\n\n${tagText}`
}

const BLOG_UPLOAD_SOURCE = USE_REMOTE_BLOG_PUBLISH ? 'server-api' : 'desktop-helper'
const BLOG_UPLOAD_ENDPOINT = USE_REMOTE_BLOG_PUBLISH ? `${API_BASE}/api/naver/publish` : `${BLOG_UPLOAD_SERVER}/api/upload`
const BLOG_UPLOAD_HEADERS = { 'x-autoform-client': 'web-client' }
const BLOG_IMAGE_CAPTURE_TIMEOUT_MS = 15000
const BLOG_UPLOAD_REQUEST_TIMEOUT_MS = 120000
const BLOG_UPLOAD_START_TIMEOUT_MS = 30000
const BLOG_UPLOAD_MAX_WAIT_MS = 600000
const API_RESPONSE_TIMEOUT_MS = 10000

// 서버 업로드에 안전한 URL 인지 검증.
// - http(s) URL 통과
// - "/output/..." 같은 로컬 path 통과
// - data:image/...;base64,<충분히 큰 payload> 만 통과 (빈/잘린 dataURL 거부 → 서버 500 차단)
const VALID_DATA_IMAGE_RE = /^data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+$/
function isValidImageUrl(value) {
  if (typeof value !== 'string' || !value) return false
  if (/^https?:\/\//i.test(value)) return true
  if (value.startsWith('/')) return true
  if (!VALID_DATA_IMAGE_RE.test(value)) return false
  // dataURL 의 base64 payload 가 너무 짧으면(빈 캔버스/캡처 실패) 거부.
  // "data:image/png;base64,".length 는 22 — 의미 있는 PNG 면 보통 1KB 이상이지만
  // 보수적으로 128자(약 96바이트)를 최저선으로 둔다.
  const comma = value.indexOf(',')
  return comma > 0 && value.length - comma - 1 >= 128
}

const attachRenderedImageUrls = (images, urls, options = {}) => {
  const list = ensureArray(images).map((image) => ({ ...image }))
  const nextUrls = ensureArray(urls)

  const pickValid = (...candidates) => candidates.find((c) => isValidImageUrl(c)) || null

  if (!options.blogSections) {
    return list.map((image, index) => {
      const renderedImageUrl = pickValid(nextUrls[index], image?.renderedImageUrl, image?.pngUrl)
      return renderedImageUrl
        ? { ...image, renderedImageUrl, pngUrl: renderedImageUrl }
        : image
    })
  }

  const sections = ensureArray(options.blogSections)
  const consumed = new Set()
  const generatedIndexes = list.reduce((acc, image, index) => {
    if (image?.source !== 'uploaded') {
      acc.push(index)
    }
    return acc
  }, [])

  nextUrls.forEach((url, sectionIndex) => {
    if (!isValidImageUrl(url)) return
    const section = sections[sectionIndex] || {}
    let targetIndex = -1

    if (section?.heading) {
      targetIndex = generatedIndexes.find((index) => (
        !consumed.has(index) &&
        list[index]?.heading &&
        list[index].heading === section.heading
      ))
    }

    if (targetIndex < 0) {
      targetIndex = generatedIndexes.find((index) => !consumed.has(index))
    }

    if (targetIndex < 0) return

    consumed.add(targetIndex)
    list[targetIndex] = {
      ...list[targetIndex],
      renderedImageUrl: url,
      pngUrl: url,
    }
  })

  return list
}

function readResultDraft(draftKey) {
  if (typeof window === 'undefined' || !draftKey) return null
  const memoryDrafts = window[RESULT_DRAFT_WINDOW_KEY]
  if (memoryDrafts && typeof memoryDrafts === 'object' && memoryDrafts[draftKey]) {
    return memoryDrafts[draftKey]
  }
  try {
    const raw = sessionStorage.getItem(`${RESULT_DRAFT_STORAGE_PREFIX}${draftKey}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function mergeStateWithDraft(state) {
  if (!state?.draftKey) return state
  const draft = readResultDraft(state.draftKey)
  if (!draft) return state

  return {
    ...draft,
    ...state,
    blogImages: state.blogImages ?? draft.blogImages,
    instagramImages: state.instagramImages ?? draft.instagramImages,
    shortsVideo: state.shortsVideo ?? draft.shortsVideo,
    fileBase64: state.fileBase64 ?? draft.fileBase64,
  }
}

function getDistinctRawShortsUrl(videoData = {}) {
  const rawUrl = videoData?.rawUrl || null
  const finalUrl = videoData?.combinedVideoUrl || videoData?.url || videoData?.videoUrl || null
  if (!rawUrl || rawUrl === finalUrl) return null
  return rawUrl
}

// 캡처 대상 element 안의 <img> 들이 모두 디코딩 완료되도록 대기.
// 외부 이미지가 비동기 로딩 중이면 modern-screenshot 이 빈 자리로 그려 카드가 깨진다.
async function waitForInnerImagesReady(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return
  const imgs = Array.from(el.querySelectorAll('img'))
  if (imgs.length === 0) return
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve() }
      img.addEventListener('load', done)
      img.addEventListener('error', done)
    })
  }))
  // decode() 호출이 가능하면 한 번 더 보장
  await Promise.all(imgs.map((img) => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : null)))
}

async function captureElementPng(el, label) {
  if (!el) throw new Error(`[captureElementPng] element 없음: ${label}`)
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // 일부 환경에서 fonts.ready가 거부될 수 있으나 캡쳐 자체는 계속 진행
    }
  }
  // 화면에 마운트는 됐지만 layout 이 0 인 element 는 캡처하면 빈 dataURL 이 나와
  // 서버 업로드가 "Invalid data URL" 로 실패한다. 짧게 한 frame 양보 후 한번 더 본다.
  if (el.offsetWidth === 0 || el.offsetHeight === 0) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    if (el.offsetWidth === 0 || el.offsetHeight === 0) {
      throw new Error(`[captureElementPng] element 사이즈 0 (${label}, w=${el.offsetWidth} h=${el.offsetHeight})`)
    }
  }
  await waitForInnerImagesReady(el)

  const attempt = () => withTimeout(
    () => domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } }),
    BLOG_IMAGE_CAPTURE_TIMEOUT_MS,
    label,
  )

  // 첫 캡처가 빈 dataURL 이거나 매우 짧으면 한 번만 재시도(짧은 backoff 후).
  let dataUrl = await attempt()
  if (!isValidImageUrl(dataUrl)) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await waitForInnerImagesReady(el)
    dataUrl = await attempt()
  }
  if (!isValidImageUrl(dataUrl)) {
    throw new Error(`[captureElementPng] 결과가 유효한 dataURL 이 아님 (${label}, len=${dataUrl?.length || 0})`)
  }
  return dataUrl
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
  { id: 'shorts',     label: '유튜브 쇼츠/릴스', icon: Film,   color: 'text-red-500',     bg: 'bg-red-500/10' },
]

export default function ExtractionResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [resolvedState, setResolvedState] = useState(() => mergeStateWithDraft(location.state || null))
  const [isPageLoading, setIsPageLoading] = useState(
    Boolean(location.state?.fromContents && location.state?.extractionId)
  )
  const state = useMemo(
    () => resolvedState || mergeStateWithDraft(location.state || null) || {},
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
  const [editingChannel, setEditingChannel] = useState(null) // 'blog' | 'newsletter' | 'instagram' | 'shorts' | null
  const [scheduleDialog, setScheduleDialog] = useState({ open: false, platform: 'blog', content: {} })
  const [blogServerStatus, setBlogServerStatus] = useState('idle') // idle | checking | online | offline
  const [blogUploadResult, setBlogUploadResult] = useState(null) // { url } | null
  const [blogTitle, setBlogTitle] = useState('')
  const [blogBody, setBlogBody] = useState('')
  const [platformConnections, setPlatformConnections] = useState(() => getPlatformConnections())
  // 숏폼 업로드 대상 기본값 (플랫폼별 패널에서 명시적으로 targets 를 넘기지 않을 때의 폴백)
  const [shortsUploadTargets] = useState({ instagram: true, youtube: true })
  const [shortsBusy, setShortsBusy] = useState({ instagram: false, youtube: false })
  const [accountUploadTarget, setAccountUploadTarget] = useState(null)
  const [previewImage, setPreviewImage] = useState(null) // { url, alt } | null

  useEffect(() => {
    if (!previewImage) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') setPreviewImage(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [previewImage])

  const openImagePreview = useCallback((url, alt) => {
    if (!url) return
    setPreviewImage({ url, alt: alt || '미리보기' })
  }, [])
  const blogCategoryPath = String(platformConnections?.blog?.categoryPath || state.blogContent?.categoryPath || '').trim()
  // 스타일(소제목 인용구 등) 판정은 글의 카테고리로 정한다 — 자동 분류든 수동 선택이든
  // 그 결과가 담기는 categoryInfo.finalCategoryId 를 쓴다. 업로드할 네이버 폴더 경로
  // (blogCategoryPath)는 스타일과 무관하므로 판정에 섞지 않는다.
  const blogStylingCategoryId = String(
    state.blogContent?.categoryInfo?.finalCategoryId || ''
  ).trim()
  const blogSectionList = useMemo(() => ensureArray(state.blogContent?.sections), [state.blogContent?.sections])
  const blogHeadingStyle = useMemo(
    () => resolveBlogHeadingStyle(blogStylingCategoryId, blogSectionList),
    [blogStylingCategoryId, blogSectionList]
  )
  const usesAutomaticBlogQuote = isAutomaticBlogQuoteCategory(blogStylingCategoryId)
  // 강의/특강(lecture_event) 카테고리는 이미지를 소제목 위에 배치한다.
  const isLectureEventBlog = blogStylingCategoryId === 'lecture_event'
  const isCardNewsCategory = blogStylingCategoryId === 'knowledge_insight' || blogStylingCategoryId === 'interview_prep'

  const isBusy = Object.values(uploadStatus).some(s => s === 'loading') || downloading

  useEffect(() => {
    if (!isBusy) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isBusy])

  useEffect(() => {
    const stateData = mergeStateWithDraft(location.state || null)
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
        const capturedBlogImageUrls = await convertBlogImagesToPng()
        const blogImagesForUpload = capturedBlogImageUrls.some(Boolean)
          ? attachRenderedImageUrls(blogImages, capturedBlogImageUrls, { blogSections: ensureArray(blogContent?.sections) })
          : blogImages
        const uploadImageUrls = await buildBlogUploadImageDataUrls({
          blogImages: blogImagesForUpload,
          sections: ensureArray(blogContent?.sections),
        })

        const title = blogTitle || blogContent?.title || ''
        const tags = normalizeBlogTags(blogContent)
        const uploadBody = compileKnowledgeInsightUploadBody(ensureArray(blogContent?.sections))
        const content = appendBlogFooterText(
          appendBlogTagsToBody(
            uploadBody || sanitizeBlogUploadContent(blogBody || compileBlogBody(ensureArray(blogContent?.sections), blogContent?.introduction)),
            tags
          ),
          blogFooterConfig
        )
        const categoryPath = blogCategoryPath
        const quoteStyle = blogHeadingStyle === BLOG_HEADING_STYLE.HEADING ? '' : blogHeadingStyle
        const scheduledAt = Object.prototype.hasOwnProperty.call(options, 'scheduledAtOverride')
          ? options.scheduledAtOverride
          : null

        let data
        let responseStatus = 0
        if (USE_REMOTE_BLOG_PUBLISH) {
          const remoteContent = content.replace(/\[IMG:\d+\]\s*/g, '').trim()
          const response = await fetchWithTimeout(`${API_BASE}/api/naver/publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, content: remoteContent, scheduledAt, tags, categoryPath, quoteStyle }),
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
          if (categoryPath) {
            formData.append('categoryPath', categoryPath)
          }
          if (quoteStyle) {
            formData.append('quoteStyle', quoteStyle)
          }
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
        if (Array.isArray(options.accountIds)) {
          formatted.accountIds = options.accountIds
        }
        console.log('[ExtractionResultPage] 인스타그램 업로드 요청:', formatted)
        const response = await fetchWithTimeout(`${API_BASE}/api/instagram/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
            accountIds: Array.isArray(options.accountIds) ? options.accountIds : [],
            accountResults: data.accountResults || null,
            failures: data.failures || [],
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
      const requestedTargets = options.targets || shortsUploadTargets
      const selectedTargets = {
        youtube: Boolean(requestedTargets.youtube),
        instagram: Boolean(requestedTargets.instagram),
      }
      setShortsBusy(prev => ({
        ...prev,
        ...(selectedTargets.instagram ? { instagram: true } : {}),
        ...(selectedTargets.youtube ? { youtube: true } : {}),
      }))
      try {
        if (!selectedTargets.youtube && !selectedTargets.instagram) {
          throw new Error('업로드할 플랫폼을 하나 이상 선택해주세요.')
        }

        // 상대 경로면 현재 origin을 붙여 서버가 fetch 가능한 URL로 변환
        let absVideoUrl = shortsVideo?.combinedVideoUrl || shortsVideo?.url || shortsVideo?.videoUrl || ''
        if (absVideoUrl.startsWith('/output/') && API_BASE) {
          absVideoUrl = `${API_BASE}${absVideoUrl}`
        } else if (absVideoUrl.startsWith('/')) {
          absVideoUrl = `${window.location.origin}${absVideoUrl}`
        }
        if (!absVideoUrl) {
          throw new Error('업로드할 쇼츠/릴스 영상이 없습니다.')
        }

        const scheduledAt = options.scheduledAtOverride || null
        const results = {}
        const failures = []

        const uploadOrder = options.uploadOrder || ['instagram', 'youtube']
        const uploadYoutube = async () => {
          try {
            const formatted = formatYouTubeRequest(shortsScript, absVideoUrl, scheduledAt)
            if (Array.isArray(options.accountIds)) {
              formatted.accountIds = options.accountIds
            }
            console.log('[ExtractionResultPage] 유튜브 쇼츠/릴스 업로드 요청:', formatted)
            const response = await fetchWithTimeout(`${API_BASE}/api/youtube/upload`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(formatted),
            }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'YouTube upload request')
            const data = await withTimeout(
              () => readApiResponse(response),
              API_RESPONSE_TIMEOUT_MS,
              'YouTube upload response parsing'
            )
            if (!data.success) {
              throw new Error(getApiErrorMessage(data, `유튜브 쇼츠/릴스 업로드 실패 (${response.status})`))
            }
            results.youtube = {
              scheduled: Boolean(data.scheduled || scheduledAt),
              scheduledAt: data.scheduledAt || scheduledAt || null,
              url: data.url || (data.videoId ? `https://youtu.be/${data.videoId}` : null),
              videoId: data.videoId || null,
              accountIds: Array.isArray(options.accountIds) ? options.accountIds : [],
              accountResults: data.accountResults || null,
              failures: data.failures || [],
            }
          } catch (err) {
            failures.push(`유튜브: ${err.message}`)
          }
        }

        const uploadInstagramReels = async () => {
          try {
            const formatted = formatInstagramReelsRequest(shortsScript, absVideoUrl)
            if (Array.isArray(options.accountIds)) {
              formatted.accountIds = options.accountIds
            }
            console.log('[ExtractionResultPage] 인스타그램 릴스 업로드 요청:', formatted)
            const response = await fetchWithTimeout(`${API_BASE}/api/instagram/reel`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(formatted),
            }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'Instagram Reels upload request')
            const data = await withTimeout(
              () => readApiResponse(response),
              API_RESPONSE_TIMEOUT_MS,
              'Instagram Reels upload response parsing'
            )
            if (!data.success) {
              throw new Error(getApiErrorMessage(data, `인스타그램 릴스 업로드 실패 (${response.status})`))
            }
            results.instagram = {
              mediaId: data.mediaId || data.id || null,
              url: data.permalink || data.url || null,
              accountIds: Array.isArray(options.accountIds) ? options.accountIds : [],
              accountResults: data.accountResults || null,
              failures: data.failures || [],
            }
          } catch (err) {
            failures.push(`인스타그램: ${err.message}`)
          }
        }

        for (const target of uploadOrder) {
          if (target === 'instagram' && selectedTargets.instagram) {
            await uploadInstagramReels()
          }
          if (target === 'youtube' && selectedTargets.youtube) {
            await uploadYoutube()
          }
        }

        const uploadedUrls = {
          youtube: results.youtube?.url || null,
          instagram: results.instagram?.url || null,
        }
        const primaryUrl = uploadedUrls.instagram || uploadedUrls.youtube || null
        const hasSuccess = Boolean(uploadedUrls.youtube || uploadedUrls.instagram)

        // 성공한 플랫폼만 업로드 완료로 기록하고 나머지 플랫폼 상태는 유지한다.
        const now = new Date().toISOString()
        const platformPatches = {}
        if (uploadedUrls.instagram) {
          platformPatches.instagram = {
            status: 'uploaded',
            uploadedAt: now,
            uploadedUrl: uploadedUrls.instagram,
            accountIds: results.instagram?.accountIds || [],
            accountResults: results.instagram?.accountResults || null,
            failures: results.instagram?.failures || [],
          }
        }
        if (uploadedUrls.youtube) {
          // YouTube 자체 예약(publishAt)이면 'scheduled', 즉시 업로드면 'uploaded'.
          platformPatches.youtube = scheduledAt
            ? {
              status: 'scheduled',
              scheduledAt,
              nativeSchedule: true,
              uploadedUrl: uploadedUrls.youtube,
              accountIds: results.youtube?.accountIds || [],
              accountResults: results.youtube?.accountResults || null,
              failures: results.youtube?.failures || [],
            }
            : {
              status: 'uploaded',
              uploadedAt: now,
              uploadedUrl: uploadedUrls.youtube,
              accountIds: results.youtube?.accountIds || [],
              accountResults: results.youtube?.accountResults || null,
              failures: results.youtube?.failures || [],
            }
        }

        if (Object.keys(platformPatches).length) {
          // 다른 플랫폼 업로드와 동시에 진행될 수 있으므로 최신 상태를 다시 읽어 병합한다.
          let currentShorts = state.uploadStatus?.shorts
          if (extractionId) {
            const fresh = await getExtractionById(extractionId).catch(() => null)
            if (fresh) currentShorts = fresh.uploadStatus?.shorts
          }
          const merged = buildShortsUploadStatus(currentShorts, platformPatches)
          mergeStoredUploadMeta('shorts', merged)
          if (extractionId) {
            updateUploadStatus(extractionId, 'shorts', merged)
              .catch(err => console.warn('[uploadStatus 저장 실패]', err))
          }
        }

        if (failures.length) {
          setUploadStatus(p => ({ ...p, shorts: hasSuccess ? 'done' : 'error' }))
          setUploadError(`쇼츠/릴스 업로드 일부 실패: ${failures.join(' / ')}`)
        } else {
          setUploadStatus(p => ({ ...p, shorts: 'done' }))
          setUploadError(null)
        }

        const completedLinks = Object.entries(uploadedUrls)
          .filter(([, url]) => Boolean(url))
          .map(([platform, url]) => `${platform === 'youtube' ? 'YouTube' : 'Instagram'}: ${url}`)
        if (completedLinks.length) {
          try {
            await navigator.clipboard.writeText(completedLinks.join('\n'))
          } catch {
            // 클립보드 권한이 없으면 업로드 완료만 유지한다.
          }
          alert(`${scheduledAt ? '예약 등록 완료!' : '업로드 완료!'}\n\n${completedLinks.join('\n')}\n\n링크가 클립보드에 복사되었습니다.`)
          if (primaryUrl && !scheduledAt) window.open(primaryUrl, '_blank')
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, shorts: 'error' }))
        setUploadError(`쇼츠/릴스 업로드 실패: ${err.message}`)
      } finally {
        setShortsBusy(prev => {
          const next = { ...prev }
          if (selectedTargets.instagram) next.instagram = false
          if (selectedTargets.youtube) next.youtube = false
          return next
        })
      }
    }
  }

  const requestAccountUpload = (channel, options = {}) => {
    const targetPlatform = channel === 'instagram'
      ? 'instagram'
      : (channel === 'shorts' && options.uploadOrder?.[0] === 'instagram')
        ? 'instagram'
        : (channel === 'shorts' && options.uploadOrder?.[0] === 'youtube')
          ? 'youtube'
          : null

    if (!targetPlatform) {
      void handleUpload(channel, options)
      return
    }

    setAccountUploadTarget({ channel, options, platform: targetPlatform })
  }

  const confirmAccountUpload = async (accountIds) => {
    if (!accountUploadTarget) return
    const { channel, options } = accountUploadTarget
    setAccountUploadTarget(null)
    await handleUpload(channel, {
      ...options,
      accountIds,
    })
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

  const downloadShortsVideo = async (videoUrl, filename = '쇼츠_영상.webm') => {
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
    shortsCreationMode: initialShortsCreationMode,
  } = state

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)
  const [instagramImages, setInstagramImages] = useState(initialInstagramImages || null)
  const [shortsVideo, setShortsVideo] = useState(initialShortsVideo || null)
  const [shortsNarration, setShortsNarration] = useState(initialShortsNarration || null)
  const shortsPromptMode = initialShortsCreationMode
    ? initialShortsCreationMode === 'prompt'
    : (!!shortsScript?.heygenPrompt && !initialShortsVideo)
  // 카드뉴스 시각화는 카테고리 + 실제 이미지 생성 결과가 모두 있을 때만 적용한다.
  // 사용자가 이미지 생성 옵션을 끄고 본문만 만든 경우 일반 섹션 렌더로 폴백된다.
  const hasGeneratedBlogImages = Array.isArray(blogImages)
    && blogImages.some((img) => img?.imageUrl || img?.renderedImageUrl || img?.pngUrl)
  const usesKnowledgeInsightCards = isCardNewsCategory && hasGeneratedBlogImages
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
    const nextBlogImages = attachRenderedImageUrls(blogImages, urls, { blogSections: ensureArray(blogContent?.sections) })
    setBlogImages(nextBlogImages)
    if (extractionId) {
      updateExtractionMedia(extractionId, { blogImages: nextBlogImages })
        .catch(err => console.warn('[블로그 렌더링 이미지 저장 실패]', err))
    }
    return urls
  }, [blogContent, blogImages, extractionId])

  // 지식공유(카드뉴스) 블로그 카드를 합성 PNG 로 변환해 DB(blog_images)에 저장한다.
  // 코너 일러스트 + 글자 + 배경을 매번 실시간 조합하던 것을 완성 카드 한 장으로 굳힌다.
  const convertKnowledgeCardsToPng = useCallback(async () => {
    if (!usesKnowledgeInsightCards) return
    const sections = ensureArray(blogContent?.sections)
    const images = ensureArray(blogImages)
    if (!sections.length || !images.length) return
    const sectionImageList = images.filter((img) => !img?.isThumbnail)
    const needs = sectionImageList.some((img) => img?.imageUrl && !img?.renderedImageUrl && !img?.pngUrl)
    if (!needs) return

    const nextImages = await Promise.all(images.map(async (image) => {
      if (!image || image.isThumbnail) return image
      if (!image.imageUrl || image.renderedImageUrl || image.pngUrl) return image
      const sectionIndex = sections.findIndex((s) => s?.heading && image?.heading && s.heading === image.heading)
      const idx = sectionIndex >= 0 ? sectionIndex : Math.max(0, sectionImageList.indexOf(image))
      const section = sections[idx] || {}
      const cardSummary = section?.cardSummary || {}
      const headline = String(cardSummary.headline || section?.heading || image?.heading || '').trim()
      const bullets = Array.isArray(cardSummary.bullets)
        ? cardSummary.bullets.map((line) => String(line || '').trim()).filter(Boolean)
        : []
      if (!headline && bullets.length === 0) return image
      try {
        const cardUrl = await renderKnowledgeCardDataUrl({ headline, bullets, imageUrl: image.imageUrl, index: idx })
        if (!cardUrl) return image
        return { ...image, renderedImageUrl: cardUrl, pngUrl: cardUrl }
      } catch (err) {
        console.warn('[지식공유 카드 합성 실패]', err)
        return image
      }
    }))

    const changed = nextImages.some((img, i) => img !== images[i])
    if (!changed) return
    setBlogImages(nextImages)
    if (extractionId) {
      updateExtractionMedia(extractionId, { blogImages: nextImages })
        .catch((err) => console.warn('[지식공유 카드 저장 실패]', err))
    }
  }, [usesKnowledgeInsightCards, blogContent, blogImages, extractionId])

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

  // 지식공유 카드뉴스 합성 PNG 변환 트리거
  useEffect(() => {
    if (activeMenu === 'blog' && usesKnowledgeInsightCards) {
      const timer = setTimeout(() => convertKnowledgeCardsToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [activeMenu, usesKnowledgeInsightCards, convertKnowledgeCardsToPng])

  useEffect(() => {
    if (!extractionId || !blogPngUrls.some(Boolean)) return
    const nextBlogImages = attachRenderedImageUrls(blogImages, blogPngUrls, { blogSections: ensureArray(blogContent?.sections) })
    updateExtractionMedia(extractionId, { blogImages: nextBlogImages })
      .catch(err => console.warn('[블로그 렌더링 이미지 저장 실패]', err))
  }, [blogContent, blogImages, blogPngUrls, extractionId])

  // 네이버 블로그 업로드 서버 상태 확인
  const checkBlogServer = useCallback(async () => {
    setBlogServerStatus('checking')
    if (activeMenu !== 'blog' || USE_REMOTE_BLOG_PUBLISH) {
      setBlogServerStatus('offline')
      return
    }

    const status = await getDesktopHelperStatus()
    setBlogServerStatus(status ? 'online' : 'offline')
  }, [activeMenu])
  useEffect(() => {
    if (activeMenu !== 'blog') {
      setBlogServerStatus('idle')
    }
  }, [activeMenu])

  // compileBlogBody: sections를 [IMG:N] 마커 포함 본문으로 생성
  // `입시 및 학습 전략 (글 위주)` 카테고리는 소제목 대신 인용구 마커(`>`)를 사용하고,
  // 그 외 카테고리는 기존 `## **...**` 소제목 포맷을 유지한다.
  // 줄글 카테고리는 [글 소개] → [IMG] → [인용구] → [본문] 순서(Pattern A)로 배치하고
  // 본문은 문장 단위로 빈 줄을 넣어 줄글 가독성을 높인다.
  const compileBlogBody = useCallback((sections = [], introduction = '') => {
    const isProseCategory = usesAutomaticBlogQuote
    // 썸네일 이미지는 업로드 이미지 배열(photoPaths)의 0번에 들어간다. 썸네일이 있으면
    // 본문 맨 앞에 [IMG:1] 마커를 붙이고 섹션 이미지 마커는 [IMG:2]부터 시작해,
    // 마커 번호와 photoPaths 인덱스를 일치시킨다. (어긋나면 섹션의 첫 이미지 마커가
    // 썸네일을 끌어와 본문 중간에 끼어든다.)
    const hasThumbnailImage = ensureArray(blogImages).some(
      (img) => img?.isThumbnail && (img?.imageUrl || img?.renderedImageUrl || img?.pngUrl)
    )
    let imageCounter = hasThumbnailImage ? 1 : 0
    const sectionsText = ensureArray(sections).map((s) => {
      const headingText = String(s.heading || '').trim()
      const baseContent = sanitizeBlogBodyForDisplay(s.content || '')
      const content = isProseCategory ? splitSentencesForBlogProse(baseContent) : baseContent
      if (isClosingBlogSection(headingText)) {
        return content
      }
      imageCounter += 1
      const heading = buildBlogHeadingPrefix(headingText, blogHeadingStyle)
      const imageMarker = `[IMG:${imageCounter}]\n`
      // prose(자동 인용구) 카테고리만 이미지를 소제목 위에 배치한다.
      // 강의·특강은 소제목 → 이미지 → 본문 순서로, 결과 화면과 동일하게 맞춘다.
      return isProseCategory
        ? `${imageMarker}${heading}${content}`
        : `${heading}${imageMarker}${content}`
    }).join('\n\n')

    // 썸네일이 있으면 본문 맨 앞(도입부보다도 위)에 [IMG:1] 썸네일 마커를 붙인다.
    const withThumbnail = (body) => (hasThumbnailImage ? `[IMG:1]\n\n${body}` : body)

    // prose·강의/특강 카테고리는 도입부를 썸네일 다음, 본문 앞에 붙인다.
    if (!isProseCategory && !isLectureEventBlog) return withThumbnail(sectionsText)

    const baseIntro = sanitizeBlogBodyForDisplay(introduction || '')
    const introText = isProseCategory ? splitSentencesForBlogProse(baseIntro) : baseIntro
    return withThumbnail(introText ? `${introText}\n\n${sectionsText}` : sectionsText)
  }, [blogHeadingStyle, usesAutomaticBlogQuote, isLectureEventBlog, blogImages])

  const sanitizeBlogUploadContent = useCallback((content = '') => (
    sanitizeBlogBodyForUpload(content || '')
  ), [])

  const compileKnowledgeInsightUploadBody = useCallback((sections = []) => {
    if (!usesKnowledgeInsightCards || USE_REMOTE_BLOG_PUBLISH) return ''

    return ensureArray(sections)
      .map((section, index) => {
        const heading = buildBlogHeadingPrefix(section?.heading, blogHeadingStyle)
        // keyPhrase 는 카드 이미지 안에 합성되는 짧은 제목이라 본문 텍스트로 다시 넣지 않는다.
        // (결과 화면도 keyPhrase 를 본문에 노출하지 않음 — 사진 아래 중복 문구가 생기던 원인)
        const imageMarker = `[IMG:${index + 1}]\n`
        const body = sanitizeBlogUploadContent(section?.content || section?.body || '')
        return `${heading}${imageMarker}${body}`.trim()
      })
      .filter(Boolean)
      .join(`\n\n${BLOG_DIVIDER_MARKER}\n\n`)
  }, [blogHeadingStyle, sanitizeBlogUploadContent, usesKnowledgeInsightCards])

  // blogTitle / blogBody 초기화 (blogContent 로드 시)
  useEffect(() => {
    if (blogContent) {
      if (!blogTitle) setBlogTitle(blogContent.title || '')
      setBlogBody(compileBlogBody(ensureArray(blogContent.sections), blogContent.introduction))
    }
  }, [blogContent, blogTitle, compileBlogBody])

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
    const stateData = state
    if (!stateData || !stateData.savedFromExtraction) return
    const hasContent = stateData.blogContent || stateData.newsletterContent || stateData.instagramContent || stateData.shortsScript
    if (!hasContent) return

    saveOnceRef.current = true
    saveExtraction(stateData).then(setExtractionId).catch(err => console.error('[Supabase 저장 실패]', err))
  }, [state])

  useEffect(() => {
    if (typeof window === 'undefined' || !extractionId || !state?.draftKey) return
    try {
      sessionStorage.removeItem(`${RESULT_DRAFT_STORAGE_PREFIX}${state.draftKey}`)
    } catch {
      // sessionStorage 접근이 막힌 환경에서는 메모리 정리만 진행한다.
    }
    const memoryDrafts = window[RESULT_DRAFT_WINDOW_KEY]
    if (memoryDrafts && typeof memoryDrafts === 'object') {
      delete memoryDrafts[state.draftKey]
    }
  }, [extractionId, state?.draftKey])

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
          statusMap[ch] = s === 'uploaded' ? 'done' : s
        } else if (typeof s === 'object') {
          if (s.status) statusMap[ch] = (s.status === 'uploaded' || s.status === 'partial_failed') ? 'done' : s.status
          if (s.scheduledAt) {
            schedMap[ch] = {
              scheduledAt: s.scheduledAt,
              uploadTargets: s.uploadTargets,
              accountIds: s.accountIds,
              accountIdsByPlatform: s.accountIdsByPlatform,
            }
          }
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
            next[item.platform] = {
              scheduledAt: item.scheduledAt,
              scheduledId: item.id,
              uploadTargets: item.content?.uploadTargets,
              accountIds: item.accountIds,
              accountIdsByPlatform: item.accountIdsByPlatform,
            }
          })
          return next
        })
        setUploadStatus(prev => {
          const next = { ...prev }
          mine.forEach(item => {
            if (item.status === 'pending') next[item.platform] = 'scheduled'
          })
          return next
        })
      } catch (err) {
        console.warn('[예약 정보 복원 실패]', err)
      }
    })()
  }, [extractionId])

  useEffect(() => {
    if (activeMenu !== 'instagram' || !instagramContent || instaPngUrls.length !== 0) return
    // DB 에 이미 모든 카드의 유효 URL 이 있으면 재캡처 skip — modern-screenshot 캡처는
    // 외부 이미지/폰트 로딩 타이밍에 따라 가끔 빈 결과를 만들 수 있는데, 굳이 매번
    // 다시 도박할 필요가 없다. 한 번 정상 저장된 카드는 그대로 신뢰한다.
    const cardCount = buildInstagramDisplayCards(instagramContent).length
    const savedImages = ensureArray(instagramImages)
    const allHaveValid = cardCount > 0 &&
      savedImages.length >= cardCount &&
      savedImages.slice(0, cardCount).every((img) =>
        isValidImageUrl(img?.renderedImageUrl) || isValidImageUrl(img?.pngUrl),
      )
    if (allHaveValid) return
    const timer = setTimeout(() => convertInstaCardsToPng(), 500)
    return () => clearTimeout(timer)
  }, [activeMenu, instagramContent, instagramImages, instaPngUrls.length, convertInstaCardsToPng])

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

  const blogFooterEnabled = state.blogFooterEnabled !== false
  const blogFooterConfig = blogFooterEnabled
    ? getBlogFooterConfig(platformConnections)
    : { heading: '', links: [], hasCustomLinks: false }

  const copyNewsletterHtml = async () => {
    const keyPoints = ensureArray(newsletterContent?.keyPoints).map((p) => stripMarkdownEmphasis(p))
    const subjectText = stripMarkdownEmphasis(newsletterContent?.subject || '')
    const headlineText = stripMarkdownEmphasis(newsletterContent?.headline || '') || subjectText
    const preheaderText = stripMarkdownEmphasis(newsletterContent?.preheader || '')
    const bodyText = stripMarkdownEmphasis(newsletterContent?.body || '')

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

    const fullHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f8fb;padding:24px 0;margin:0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9f0;">
              <tr>
                <td style="padding:32px 32px 28px 32px;background:linear-gradient(90deg,#eff6ff 0%,#f8fbff 100%);text-align:center;">
                  <div style="font-size:28px;line-height:36px;font-weight:800;color:#111827;">${escapeHtml(headlineText)}</div>
                  ${preheaderText ? `<div style="margin-top:10px;font-size:14px;line-height:22px;color:#6b7280;">${escapeHtml(preheaderText)}</div>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px 20px 32px;font-size:14px;line-height:24px;color:#111827;">
                  ${nlToBr(FIXED_NEWSLETTER_GREETING)}
                </td>
              </tr>
              ${keyPointsHtml}
              <tr>
                <td style="padding:0 32px 32px 32px;font-size:14px;line-height:26px;color:#4b5563;">
                  ${nlToBr(bodyText)}
                </td>
              </tr>
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
    const blogTagText = buildBlogTagText(blogTags)

    const blogThumbnailImage = ensureArray(blogImages)
      .find((image) => image?.isThumbnail && (image?.imageUrl || image?.renderedImageUrl || image?.pngUrl)) || null
    const blogThumbnailHeading = cleanCardText(blogThumbnailImage?.overlayHeadline || blogContent?.title || '')
    const blogThumbnailDescription = blogThumbnailImage?.overlayMode === 'headline-only'
      ? ''
      : deriveBlogImageDescription(
        blogThumbnailImage?.keyPhrase || '',
        cleanCardText(blogContent?.title || ''),
        blogContent?.introduction || ensureArray(blogContent?.sections)[0]?.content || '',
      )
    const renderBlogThumbnail = () => (
      <div className="mb-8 space-y-4">
        {blogThumbnailImage?.renderedImageUrl || blogThumbnailImage?.pngUrl ? (
          <img
            src={blogThumbnailImage.renderedImageUrl || blogThumbnailImage.pngUrl}
            alt={blogThumbnailImage?.title || blogContent?.title || '블로그 썸네일'}
            className="w-full max-w-xl rounded-xl shadow-sm cursor-zoom-in"
            onClick={() => openImagePreview(
              blogThumbnailImage.renderedImageUrl || blogThumbnailImage.pngUrl,
              blogThumbnailImage?.title || blogContent?.title || '블로그 썸네일',
            )}
          />
        ) : blogThumbnailImage?.imageUrl ? (
          blogThumbnailImage?.overlayMode === 'none' ? (
            <img
              src={blogThumbnailImage.imageUrl}
              alt={blogThumbnailImage?.title || blogContent?.title || '블로그 썸네일'}
              className="block w-full max-w-xl rounded-xl shadow-sm cursor-zoom-in"
              onClick={() => openImagePreview(
                blogThumbnailImage.imageUrl,
                blogThumbnailImage?.title || blogContent?.title || '블로그 썸네일',
              )}
            />
          ) : (
            <BlogImageArtwork
              src={blogThumbnailImage.imageUrl}
              alt={blogThumbnailImage?.title || blogContent?.title || '블로그 썸네일'}
              headline={blogThumbnailHeading}
              description={blogThumbnailDescription}
              accentColor="#6366f1"
              showTextOverlay={showBlogImageTextOverlay}
              variant={blogThumbnailImage?.variant || 'circle'}
              fontPreset={blogThumbnailImage?.overlayFont || 'pretendard'}
              mode="modal"
              containerClassName="w-full max-w-xl rounded-xl shadow-sm border border-border"
            />
          )
        ) : null}
      </div>
    )

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div />
          <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => checkBlogServer()}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              blogServerStatus === 'online'
                ? 'border-border text-text-muted hover:text-text hover:border-primary/40'
                : blogServerStatus === 'checking'
                  ? 'border-warning/30 text-warning hover:border-warning/50'
                  : blogServerStatus === 'offline'
                    ? 'border-danger/30 text-danger hover:bg-danger/5'
                    : 'border-border text-text-muted hover:text-text hover:border-primary/40'
            }`}
            title="블로그 서버 상태 확인"
          >
            <span className={`w-2 h-2 rounded-full ${
              blogServerStatus === 'online'
                ? 'bg-success'
                : blogServerStatus === 'checking'
                  ? 'bg-warning animate-pulse'
                  : blogServerStatus === 'offline'
                    ? 'bg-danger'
                    : 'bg-text-muted/50'
            }`} />
            <span>
              {blogServerStatus === 'online'
                ? '블로그 서버 연결됨'
                : blogServerStatus === 'checking'
                  ? '블로그 서버 확인 중...'
                  : blogServerStatus === 'offline'
                    ? '블로그 서버 연결 필요'
                    : '블로그 서버 상태 확인'}
            </span>
            <RefreshCw size={12} />
          </button>
          {blogServerStatus === 'offline' && (
            <button
              type="button"
              onClick={() => navigate('/settings?section=desktop-helper')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-danger/30 text-sm text-danger hover:bg-danger/5 transition-colors"
            >
              설정으로 이동
            </button>
          )}
          <button
            onClick={() => copy(`${blogTitle || blogContent?.title || ''}\n\n${appendBlogFooterText(
              appendBlogTagsToBody(
                blogBody || compileBlogBody(ensureArray(blogContent?.sections), blogContent?.introduction),
                blogTags
              ),
              blogFooterConfig
            )}`)}
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
            {/* 강의·특강: 제목·태그 다음, 도입부 앞에 썸네일을 노출한다. */}
            {isLectureEventBlog && blogThumbnailImage && renderBlogThumbnail()}
            {(usesAutomaticBlogQuote || isLectureEventBlog) && blogContent?.introduction && (
              <div className="prose prose-gray max-w-none text-gray-700 leading-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {normalizeMd(composeBlogSectionBody(blogContent.introduction, { prose: usesAutomaticBlogQuote }))}
                </ReactMarkdown>
              </div>
            )}
            {(() => {
              const blogImageList = ensureArray(blogImages)
              const sectionImageList = blogImageList.filter((image) => !image?.isThumbnail)
              const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
              const accentPalette = {
                'bg-[#FFF3E0]': '#e57a00',
                'bg-[#E8F5E9]': '#2e7d32',
                'bg-[#E3F2FD]': '#1565c0',
                'bg-[#F3E5F5]': '#7b1fa2',
              }

              return (
                <>
                  {/* 강의/특강은 도입부 앞에서 이미 노출했으므로 여기서는 생략한다. */}
                  {!isLectureEventBlog && blogThumbnailImage && renderBlogThumbnail()}
                  {ensureArray(blogContent?.sections).map((section, index) => {
                if (usesKnowledgeInsightCards) {
                  const cardSummary = section?.cardSummary || {}
                  const cardHeadline = String(cardSummary.headline || section?.heading || '').trim()
                  const cardBullets = Array.isArray(cardSummary.bullets)
                    ? cardSummary.bullets.map((line) => String(line || '').trim()).filter(Boolean)
                    : []
                  const matchedKnowledgeImage = sectionImageList.find((img) =>
                    img?.heading && section?.heading && img.heading === section.heading
                  ) || sectionImageList[index] || null
                  // renderedImageUrl / pngUrl 은 "글자까지 합성된 완성 카드" PNG.
                  // imageUrl 은 우하단 코너 일러스트 원본.
                  const composedCardUrl =
                    matchedKnowledgeImage?.renderedImageUrl
                    || matchedKnowledgeImage?.pngUrl
                    || null
                  const cornerImageUrl = matchedKnowledgeImage?.imageUrl || null
                  const sectionHeadingText = String(section?.heading || '').trim()
                  const sectionContent = composeBlogSectionBody(section?.content, { prose: false })
                  const isLastKnowledgeSection = index === ensureArray(blogContent?.sections).length - 1
                  return (
                    <section key={`knowledge-section-${index}`} className="space-y-5">
                      {sectionHeadingText && (
                        <h3 className="text-2xl font-bold text-gray-900">{sectionHeadingText}</h3>
                      )}
                      <div className="flex justify-center">
                        {composedCardUrl ? (
                          <img
                            src={composedCardUrl}
                            alt={cardHeadline || `지식공유 카드 ${index + 1}`}
                            className="w-full max-w-xl rounded-3xl cursor-zoom-in"
                            onClick={() => openImagePreview(composedCardUrl, cardHeadline || `지식공유 카드 ${index + 1}`)}
                          />
                        ) : (
                          <KnowledgeInsightCardReady
                            index={index}
                            headline={cardHeadline}
                            bullets={cardBullets}
                            imageUrl={cornerImageUrl}
                            placeholder={(
                              <div className="w-full max-w-xl aspect-square rounded-3xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-400">
                                <Loader2 size={22} className="animate-spin" />
                                <span className="text-sm">카드 준비 중...</span>
                              </div>
                            )}
                          />
                        )}
                      </div>
                      {sectionContent && (
                        <div className="prose prose-gray max-w-none text-gray-700 leading-8">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {normalizeMd(sectionContent)}
                          </ReactMarkdown>
                        </div>
                      )}
                      {!isLastKnowledgeSection && (
                        <hr className="border-t border-gray-300 mt-6" />
                      )}
                    </section>
                  )
                }
                const isClosing = isClosingBlogSection(section?.heading)
                const matchedImages = isClosing ? [] : sectionImageList.filter(img =>
                  img?.heading && section.heading && img.heading === section.heading &&
                  (img?.imageUrl || img?.renderedImageUrl || img?.pngUrl)
                )
                const fallbackImage = isClosing ? null : (sectionImageList[index] || null)
                const sectionImages = matchedImages.length
                  ? matchedImages
                  : fallbackImage
                    ? [fallbackImage]
                    : []
                const headingText = cleanCardText(section?.heading || '')
                const accentColor = accentPalette[bgColors[index % bgColors.length]] || '#6366f1'
                const generatedArtworkIndex = sectionImages.findIndex(image =>
                  image?.imageUrl && !image?.renderedImageUrl && !image?.pngUrl
                )

                if (sectionImages.length === 0) {
                  blogImagesRef.current[index] = null
                }

                const headingNode = isClosing
                  ? null
                  : blogHeadingStyle === BLOG_HEADING_STYLE.LINE_QUOTE
                    ? (
                      <div className="my-6">
                        <div className="border-t border-gray-300" />
                        <div className="px-6 py-5 text-center">
                          <div className="font-serif text-5xl leading-none text-gray-300">“</div>
                          <div className="mt-1 text-base italic text-gray-700 leading-relaxed">
                            {section.heading}
                          </div>
                        </div>
                        <div className="border-b border-gray-300" />
                      </div>
                    )
                    : blogHeadingStyle === BLOG_HEADING_STYLE.POSTIT
                      ? (
                        <div className="mb-4 inline-block -rotate-1 bg-yellow-100 px-5 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.10)] rounded-sm">
                          <div className="text-base font-medium text-yellow-900 leading-relaxed">{section.heading}</div>
                        </div>
                      )
                      : (
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">{section.heading}</h3>
                      )

              return (
                <section key={index} className="space-y-5">
                  {!usesAutomaticBlogQuote && headingNode}

                  {sectionImages.length > 0 && (
                    <div className="mb-4 space-y-4">
                      {sectionImages.map((image, imageIndex) => {
                        const imageUrl = image?.imageUrl || null
                        const imageKey = `${section.heading || index}-${image?.title || image?.source || 'image'}-${imageIndex}`
                        const hideTextOverlay = image?.overlayMode === 'none'
                        const renderedImageUrl = hideTextOverlay
                          ? null
                          : (image?.renderedImageUrl || image?.pngUrl || (imageIndex === 0 ? blogPngUrls[index] : null))
                        const imageHeadline = image?.overlayMode === 'headline-only'
                          ? cleanCardText(image?.overlayHeadline || section?.heading || image?.keyPhrase || '')
                          : deriveBlogHeadline(cleanCardText(image?.keyPhrase || section?.keyPhrase || ''), headingText)
                        const imageDescription = image?.overlayMode === 'headline-only'
                          ? ''
                          : deriveBlogImageDescription(image?.keyPhrase || '', headingText, section?.content || '')

                        return renderedImageUrl ? (
                          <img
                            key={imageKey}
                            src={renderedImageUrl}
                            alt={image?.title || section.heading || `블로그 이미지 ${index + 1}-${imageIndex + 1}`}
                            className="w-full max-w-xl rounded-xl shadow-sm cursor-zoom-in"
                            onClick={() => openImagePreview(renderedImageUrl, image?.title || section.heading || `블로그 이미지 ${index + 1}`)}
                          />
                        ) : imageUrl ? (
                          hideTextOverlay ? (
                            <img
                              key={imageKey}
                              ref={el => {
                                if (imageIndex === (generatedArtworkIndex >= 0 ? generatedArtworkIndex : 0)) {
                                  blogImagesRef.current[index] = el
                                }
                              }}
                              src={imageUrl}
                              alt={image?.title || section.heading || `블로그 이미지 ${index + 1}-${imageIndex + 1}`}
                              className="block w-full max-w-xl rounded-xl shadow-sm cursor-zoom-in"
                              onClick={() => openImagePreview(imageUrl, image?.title || section.heading || `블로그 이미지 ${index + 1}`)}
                            />
                          ) : (
                            <BlogImageArtwork
                              key={imageKey}
                              innerRef={el => {
                                if (imageIndex === (generatedArtworkIndex >= 0 ? generatedArtworkIndex : 0)) {
                                  blogImagesRef.current[index] = el
                                }
                              }}
                              src={imageUrl}
                              alt={section.heading || `블로그 이미지 ${index + 1}`}
                              headline={imageHeadline}
                              description={imageDescription}
                              accentColor={accentColor}
                              showTextOverlay={showBlogImageTextOverlay}
                              variant={image?.variant || 'circle'}
                              fontPreset={image?.overlayFont || 'pretendard'}
                              mode="modal"
                              containerClassName="w-full max-w-xl rounded-xl shadow-sm border border-border"
                            />
                          )
                        ) : null
                      })}
                    </div>
                  )}

                  {usesAutomaticBlogQuote && headingNode}

                  <div className="prose prose-gray max-w-none text-gray-700 leading-8">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {normalizeMd(composeBlogSectionBody(section.content, { prose: usesAutomaticBlogQuote }))}
                    </ReactMarkdown>
                  </div>
                </section>
              )
                  })}
                </>
              )
            })()}
            {blogTagText && (
              <p className="text-sm leading-relaxed text-text-muted">
                {blogTagText}
              </p>
            )}
            {blogFooterConfig.links.length > 0 && (
              <div className="pt-6 border-t border-border">
                <p className="text-sm font-medium text-text mb-3">{blogFooterConfig.heading}</p>
                <div className="flex flex-col gap-2">
                  {blogFooterConfig.links.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-primary hover:bg-surface-light"
                    >
                      <ExternalLink size={14} />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    )
  }

  const renderInstagram = () => {
    const cards = buildInstagramDisplayCards(instagramContent)
    const current = cards[instaSlide]
    const currentCardNumber = getInstagramCardNumber(current, instaSlide)
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
      const cardTitle = getInstagramOverlayTitle(card, cardIndex)
      const bullets = buildInstagramKnowledgeBullets(card)
      const cornerUrl = cardImage?.imageUrl || null

      // 캡쳐용(attachRef) 은 html2canvas 가 잡을 실제 카드를 그대로 렌더해야 한다.
      if (attachRef) {
        return (
          <div ref={el => { instaCardsRef.current[cardIndex] = el }}>
            <KnowledgeInsightCard
              index={cardIndex}
              headline={cardTitle}
              bullets={bullets}
              imageUrl={cornerUrl}
            />
          </div>
        )
      }

      // 화면 표시용은 우하단 그림을 미리 로드한 뒤 카드 전체를 한 번에 노출한다.
      return (
        <KnowledgeInsightCardReady
          index={cardIndex}
          headline={cardTitle}
          bullets={bullets}
          imageUrl={cornerUrl}
          imageOptional={Boolean(card?.isCaptionCta)}
          placeholder={(
            <div className="w-full aspect-square rounded-[28px] bg-gray-100 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-sm">카드 준비 중...</span>
            </div>
          )}
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
              <button
                type="button"
                onClick={() => openImagePreview(
                  currentCardPngUrl,
                  currentInstagramImage?.heading || current?.title || current?.heading || `인스타 카드 ${currentCardNumber}`,
                )}
                disabled={!currentCardPngUrl}
                className="block w-full rounded-[28px] overflow-hidden bg-gray-100 disabled:cursor-default group relative"
                title={currentCardPngUrl ? '클릭하여 확대' : ''}
              >
                {currentCardPngUrl ? (
                  <>
                    <img
                      src={currentCardPngUrl}
                      alt={currentInstagramImage?.heading || current?.title || current?.heading || `인스타 카드 ${currentCardNumber}`}
                      className="block w-full h-auto"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none">
                      <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </>
                ) : (
                  renderInstaCardArt(current, instaSlide, false)
                )}
              </button>
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

  const renderNewsletter = () => {
    const nlSubject = stripMarkdownEmphasis(newsletterContent?.subject || '')
    const nlHeadline = stripMarkdownEmphasis(newsletterContent?.headline || newsletterContent?.subject || '')
    const nlPreheader = stripMarkdownEmphasis(newsletterContent?.preheader || '')
    const nlBody = stripMarkdownEmphasis(newsletterContent?.body || '')
    const nlKeyPoints = ensureArray(newsletterContent?.keyPoints).map((p) => stripMarkdownEmphasis(p))

    return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div />
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(nlSubject)
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
            <span className="text-text-muted">{nlSubject}</span>
          </p>
        </div>

        <div id="newsletter-export">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-8 text-center">
            <h2 className="text-xl font-bold text-text">{nlHeadline}</h2>
            {nlPreheader && (
              <p className="text-sm text-text-muted mt-2">{nlPreheader}</p>
            )}
          </div>

          <div className="px-8 py-6 space-y-5">
            <p className="text-sm text-text">{FIXED_NEWSLETTER_GREETING}</p>

            {nlKeyPoints.length > 0 && (
              <div className="bg-primary/5 rounded-lg p-5 border border-primary/10">
                <p className="text-xs font-bold text-primary-light mb-3 uppercase tracking-wide">KEY POINTS</p>
                <ul className="space-y-2.5">
                  {nlKeyPoints.map((point, i) => (
                    <li key={i} className="text-sm text-text flex items-start gap-2.5">
                      <CheckCircle size={15} className="text-primary shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-sm text-text-muted leading-7 whitespace-pre-wrap">{nlBody}</div>
          </div>
        </div>
      </div>
    </div>
    )
  }

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

  const renderVideoPanel = (videoData, versionLabel, options = {}) => {
    const videoUrl = videoData?.combinedVideoUrl || videoData?.url || videoData?.videoUrl
    const shouldSyncNarration = options.syncNarration !== false
    const isLoading = videoData && !videoUrl
    return (
      <div className="w-64 shrink-0">
        <div className="aspect-[9/16] bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl overflow-hidden relative shadow-xl">
          {videoUrl ? (
            <video
              ref={shouldSyncNarration ? shortsVideoRef : undefined}
              controls
              className="w-full h-full object-cover absolute inset-0"
              src={videoUrl}
              onPlay={shouldSyncNarration ? handleShortsPlay : undefined}
              onPause={shouldSyncNarration ? handleShortsPause : undefined}
              onEnded={shouldSyncNarration ? handleShortsPause : undefined}
              onTimeUpdate={shouldSyncNarration ? handleShortsTimeUpdate : undefined}
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
              onClick={() => downloadShortsVideo(videoUrl, `쇼츠_${versionLabel}.webm`)}
              disabled={downloading}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
            >
              <Download size={10} /> 다운로드
            </button>
          </div>
        )}
        {shouldSyncNarration && ensureArray(shortsNarration).map((n, i) => (
          n.audioUrl && <audio key={i} ref={el => shortsAudioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
        ))}
      </div>
    )
  }

  const renderShorts = () => {
    const shortsVideoUrl = shortsVideo?.combinedVideoUrl || shortsVideo?.url || shortsVideo?.videoUrl
    const rawShortsVideoUrl = getDistinctRawShortsUrl(shortsVideo)
    const heygenPrompt = shortsScript?.heygenPrompt || ''
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

    const shortsPlatforms = deriveShortsPlatforms(state.uploadStatus?.shorts)
    const openShortsSchedule = (platformKey, mode) => {
      const schedulePlatform = shortsSchedulePlatform(platformKey)
      setScheduleDialog({
        open: true,
        platform: schedulePlatform,
        content: {
          title: shortsScript?.uploadTitle || shortsScript?.title || '유튜브 쇼츠/릴스',
          accountIdsByPlatform: scheduleInfo[schedulePlatform]?.accountIdsByPlatform || {},
          accountIds: scheduleInfo[schedulePlatform]?.accountIds || [],
        },
        mode,
        initialDatetime: scheduleInfo[schedulePlatform]?.scheduledAt || shortsPlatforms[platformKey]?.scheduledAt || null,
      })
    }

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {shortsPromptMode ? (
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-text">HeyGen 수동 제작</h4>
              <p className="text-xs text-text-muted mt-0.5">
                아래 대본과 영상 프롬포트를 HeyGen 홈페이지에 붙여넣어 영상을 직접 제작하세요.
              </p>
            </div>
            {heygenPrompt && (
              <div className="rounded-xl border border-border bg-surface-light overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <p className="text-xs font-semibold text-text-muted">영상 프롬포트</p>
                  <button
                    type="button"
                    onClick={() => copy(heygenPrompt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-medium text-text-muted hover:text-text hover:border-primary/40 transition-colors"
                  >
                    <Copy size={12} /> 프롬포트 복사
                  </button>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-text">
                  {heygenPrompt}
                </pre>
              </div>
            )}
          </div>
        ) : (
        <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-text">플랫폼별 업로드</h4>
            <p className="text-xs text-text-muted mt-0.5">
              유튜브 쇼츠와 인스타그램 릴스를 각각 따로 업로드·예약할 수 있습니다.
            </p>
          </div>
          {SHORTS_PLATFORMS.map((p) => {
            const pmeta = shortsPlatforms[p.key]
            const busy = shortsBusy[p.key]
            const scheduledAtIso = pmeta.scheduledAt || scheduleInfo[p.schedulePlatform]?.scheduledAt
            const hasAccountFailures = hasUploadAccountFailures(pmeta)
            return (
              <div
                key={p.key}
                className="rounded-xl border border-border bg-surface-light/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text">{p.label}</span>
                  <div className="flex items-center gap-2">
                    {pmeta.status === 'uploaded' ? (
                      <>
                        {pmeta.uploadedUrl ? (
                          <a
                            href={pmeta.uploadedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              hasAccountFailures
                                ? 'text-warning bg-warning/5 border-warning/20 hover:bg-warning/10'
                                : 'text-success bg-success/5 border-success/20 hover:bg-success/10'
                            }`}
                          >
                            {hasAccountFailures ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                            {hasAccountFailures ? '일부 계정 실패' : '업로드 완료'} <ExternalLink size={12} />
                          </a>
                        ) : (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${
                            hasAccountFailures
                              ? 'text-warning bg-warning/5 border-warning/20'
                              : 'text-success bg-success/5 border-success/20'
                          }`}>
                            {hasAccountFailures ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                            {hasAccountFailures ? '일부 계정 실패' : '업로드 완료'}
                          </div>
                        )}
                        <button
                          onClick={() => requestAccountUpload('shorts', { targets: { [p.key]: true }, uploadOrder: [p.key] })}
                          disabled={busy}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            busy
                              ? 'bg-primary/10 text-primary-light border border-primary/20 opacity-70'
                              : 'bg-surface border border-border text-text-muted hover:text-primary hover:border-primary/40'
                          }`}
                        >
                          {busy ? (
                            <><Loader2 size={14} className="animate-spin" /> 업로드 중...</>
                          ) : (
                            <><Upload size={14} /> 재업로드</>
                          )}
                        </button>
                      </>
                    ) : pmeta.status === 'scheduled' ? (
                      <button
                        onClick={() => openShortsSchedule(p.key, 'edit')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-info bg-info/5 border border-info/20 hover:bg-info/10 transition-colors"
                      >
                        <Calendar size={14} /> 예약 완료
                        {scheduledAtIso && (
                          <span className="text-[11px] opacity-70 ml-1">{formatStatusDate(scheduledAtIso)}</span>
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => openShortsSchedule(p.key, 'create')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
                        >
                          <Calendar size={14} /> 예약 업로드
                        </button>
                        <button
                          onClick={() => requestAccountUpload('shorts', { targets: { [p.key]: true }, uploadOrder: [p.key] })}
                          disabled={busy}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            busy
                              ? 'bg-primary/10 text-primary-light border border-primary/20 opacity-70'
                              : 'bg-primary text-white hover:bg-primary-dark'
                          }`}
                        >
                          {busy ? (
                            <><Loader2 size={14} className="animate-spin" /> 업로드 중...</>
                          ) : (
                            <><Upload size={14} /> 업로드</>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <AccountResultBadges meta={pmeta} className="mt-2" />
              </div>
            )
          })}
        </div>
        )}

        <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => copy(shortsDetailText)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            >
              <Copy size={14} /> 상세정보 복사
            </button>
            {!shortsPromptMode && shortsVideoUrl ? (
              <button
                type="button"
                onClick={() => downloadShortsVideo(shortsVideoUrl)}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                영상 저장
              </button>
            ) : !shortsPromptMode ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm opacity-60 cursor-not-allowed"
              >
                <Download size={14} /> 영상 저장
              </button>
            ) : null}
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:flex-wrap lg:items-start">
          {/* 자막 포함 영상만 노출. 자막 번인이 성공하면 combinedVideoUrl 이 자막본,
              실패하면 raw 로 fallback 돼 있으므로 단일 패널로 항상 올바른 영상이 뜬다. */}
          {!shortsPromptMode && renderVideoPanel(shortsVideo, rawShortsVideoUrl ? '자막 포함 최종본' : '영상')}

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
  const activeUploadedUrls = activeUploadMeta?.uploadedUrls && typeof activeUploadMeta.uploadedUrls === 'object'
    ? Object.entries(activeUploadMeta.uploadedUrls).filter(([, url]) => Boolean(url))
    : []
  const activeAccountRows = normalizeUploadAccountResults(activeUploadMeta)
  const activeHasPartialFailure = activeUploadMeta?.status === 'partial_failed' || hasUploadAccountFailures(activeUploadMeta)
  const activeMenuLabel = menuItems.find(item => item.id === activeMenu)?.label || '결과물'

  const CHANNEL_CONTENT_KEY = { blog: 'blogContent', newsletter: 'newsletterContent', instagram: 'instagramContent', shorts: 'shortsScript' }

  // 본문 수정 저장: 로컬 state 즉시 반영 + 저장된 추출이면 서버에도 반영.
  const handleSaveEditedContent = async (updatedContent) => {
    const key = CHANNEL_CONTENT_KEY[editingChannel]
    if (!key) return
    setResolvedState((prev) => ({ ...(prev || state), [key]: updatedContent }))
    if (extractionId) {
      await updateExtractionContent(extractionId, { [key]: updatedContent })
    }
    setEditingChannel(null)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <NavigationBlockerModal when={isBusy} />
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
        {dataMap[activeMenu] && (
          <button
            type="button"
            onClick={() => setEditingChannel(activeMenu)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            title="본문 텍스트를 수정합니다"
          >
            <Pencil size={14} /> 수정
          </button>
        )}
        {dataMap[activeMenu] && activeMenu !== 'newsletter' && activeMenu !== 'shorts' && (
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const ch = activeMenu
              const status = uploadStatus[ch]
              const sched = scheduleInfo[ch]
              const isNativeSchedule = ch === 'blog' && status === 'done' && Boolean(sched?.scheduledAt)
              const isScheduled = status === 'scheduled' && !isNativeSchedule
              const isUploaded = status === 'done' && !isNativeSchedule
              const uploadedAt = activeUploadMeta?.uploadedAt
              const scheduledAtIso = sched?.scheduledAt || activeUploadMeta?.scheduledAt

              const openScheduleDialog = async () => {
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
                  shorts: {
                    ...(shortsScript || {}),
                    uploadTargets: sched?.uploadTargets || activeUploadMeta?.uploadTargets || shortsUploadTargets,
                  },
                }
                setScheduleDialog({ open: true, platform: ch, content: contentMap[ch] || {}, mode: (isScheduled || isNativeSchedule) ? 'edit' : 'create', initialDatetime: sched?.scheduledAt })
              }

              if (isUploaded) {
                return (
                  <div className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border shrink-0 ${
                    activeHasPartialFailure
                      ? 'text-warning bg-warning/5 border-warning/20'
                      : 'text-success bg-success/5 border-success/20'
                  }`}>
                    {activeHasPartialFailure ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                    {activeHasPartialFailure ? '일부 계정 실패' : '업로드 완료'}
                    {uploadedAt && (
                      <span className="text-[11px] opacity-70 ml-1">{formatStatusDate(uploadedAt)}</span>
                    )}
                  </div>
                )
              }

              if (isNativeSchedule) {
                return (
                  <button
                    onClick={openScheduleDialog}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-success bg-success/5 border border-success/20 hover:bg-success/10 transition-colors shrink-0"
                  >
                    <CheckCircle size={14} />
                    예약 등록 완료
                    {scheduledAtIso && (
                      <span className="text-[11px] opacity-70 ml-1">{formatStatusDate(scheduledAtIso)}</span>
                    )}
                  </button>
                )
              }

              if (isScheduled) {
                return (
                  <button
                    onClick={openScheduleDialog}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-info bg-info/5 border border-info/20 hover:bg-info/10 transition-colors shrink-0"
                  >
                    <Calendar size={14} />
                    예약 완료
                    {scheduledAtIso && (
                      <span className="text-[11px] opacity-70 ml-1">{formatStatusDate(scheduledAtIso)}</span>
                    )}
                  </button>
                )
              }

              return (
                <>
                  <button
                    onClick={() => requestAccountUpload(ch)}
                    disabled={status === 'loading'}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shrink-0
                      ${status === 'loading'
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
                  <button
                    onClick={openScheduleDialog}
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
        <div className={`flex flex-wrap items-start justify-between gap-3 p-4 border rounded-xl ${
          activeHasPartialFailure
            ? 'bg-warning/5 border-warning/20'
            : 'bg-emerald-500/5 border-emerald-500/20'
        }`}>
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {activeHasPartialFailure ? (
              <AlertCircle size={16} className="text-warning shrink-0 mt-0.5" />
            ) : (
              <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">
                {activeMenuLabel} {activeHasPartialFailure ? '일부 계정 업로드 실패' : '업로드 완료'}
              </p>
              <a
                href={activeUploadedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-1 text-xs text-emerald-600 hover:underline font-medium break-all"
              >
                {activeUploadedUrl}
                <ExternalLink size={11} className="shrink-0" />
              </a>
              {activeUploadedUrls.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeUploadedUrls.map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-500/60"
                    >
                      {platform === 'youtube' ? 'YouTube' : 'Instagram'}
                      <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              )}
              {activeAccountRows.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {activeAccountRows.map((row, index) => (
                    <div
                      key={`${row.accountId || 'unknown'}-${index}`}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        row.status === 'failed'
                          ? 'border-danger/20 bg-danger/5 text-danger'
                          : 'border-success/20 bg-success/5 text-success'
                      }`}
                    >
                      {row.status === 'failed' ? <AlertCircle size={12} className="mt-0.5 shrink-0" /> : <CheckCircle size={12} className="mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <span className="font-semibold">{row.accountId || '계정'}</span>
                        <span className="ml-1">{row.status === 'failed' ? '실패' : '성공'}</span>
                        {row.error && <div className="mt-0.5 break-all">{row.error}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <a
            href={activeUploadedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0"
          >
            결과물 보기
            <ExternalLink size={14} />
          </a>
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

      {editingChannel && dataMap[editingChannel] && (
        <ContentEditModal
          channel={editingChannel}
          channelLabel={menuItems.find(item => item.id === editingChannel)?.label || '콘텐츠'}
          content={dataMap[editingChannel]}
          onClose={() => setEditingChannel(null)}
          onSave={handleSaveEditedContent}
        />
      )}

      <AccountUploadDialog
        open={!!accountUploadTarget}
        platform={accountUploadTarget?.platform}
        title={
          accountUploadTarget?.channel === 'shorts'
            ? (shortsScript?.uploadTitle || shortsScript?.title || '유튜브 쇼츠/릴스')
            : (instagramContent?.title || instagramContent?.caption || '인스타그램 콘텐츠')
        }
        onClose={() => setAccountUploadTarget(null)}
        onConfirm={confirmAccountUpload}
      />

      <ScheduleDialog
        open={scheduleDialog.open}
        mode={scheduleDialog.mode || 'create'}
        initialDatetime={scheduleDialog.initialDatetime}
        onClose={() => setScheduleDialog(s => ({ ...s, open: false }))}
        defaultPlatform={scheduleDialog.platform}
        content={scheduleDialog.content}
        lockPlatform={true}
        onSave={async ({ platform, scheduledAt, content, uploadTargets, accountIds, accountIdsByPlatform }) => {
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
          } else if (platform === 'shorts_youtube') {
            // YouTube 자체 예약: 영상을 지금 비공개로 업로드하고 publishAt 으로 예약 발행한다.
            // YouTube 가 알아서 그 시각에 공개하므로 러너(scheduled_uploads)가 필요 없다.
            setScheduleInfo(p => ({ ...p, shorts_youtube: { scheduledAt } }))
            await handleUpload('shorts', {
              targets: { youtube: true },
              uploadOrder: ['youtube'],
              scheduledAtOverride: scheduledAt,
              accountIds,
            })
            return
          } else if (platform === 'shorts_instagram') {
            // 인스타그램 릴스는 native 예약을 지원하지 않아 러너 방식으로 예약한다.
            try {
              const scheduledId = scheduleInfo[platform]?.scheduledId || null
              const savedSchedule = await createScheduledUpload({
                platform,
                content: {
                  title: shortsScript?.uploadTitle || shortsScript?.title || '유튜브 쇼츠/릴스',
                  accountIdsByPlatform,
                },
                scheduledAt,
                extractionId: id,
                scheduledId,
                accountIds,
                accountIdsByPlatform,
              })
              setScheduleInfo(p => ({
                ...p,
                [platform]: {
                  scheduledAt: savedSchedule.scheduledAt,
                  scheduledId: savedSchedule.id,
                  accountIds,
                  accountIdsByPlatform,
                },
              }))
            } catch (err) {
              console.error('[릴스 예약 생성 실패]', err)
              alert(`예약 생성 실패: ${err.message}`)
              return
            }
            const merged = buildShortsUploadStatus(state.uploadStatus?.shorts, {
              instagram: { status: 'scheduled', scheduledAt, accountIds: accountIds || [], accountIdsByPlatform },
            })
            await updateUploadStatus(id, 'shorts', merged)
            mergeStoredUploadMeta('shorts', merged)
            return
          } else if (platform === 'shorts') {
            const selectedTargets = uploadTargets || shortsUploadTargets
            try {
              const scheduledId = scheduleInfo[platform]?.scheduledId || null
              const savedSchedule = await createScheduledUpload({
                platform,
                content: {
                  title: shortsScript?.uploadTitle || shortsScript?.title || '유튜브 쇼츠/릴스',
                  uploadTargets: selectedTargets,
                  accountIdsByPlatform,
                },
                scheduledAt,
                extractionId: id,
                scheduledId,
                accountIds,
                accountIdsByPlatform,
              })
              setScheduleInfo(p => ({
                ...p,
                [platform]: {
                  scheduledAt: savedSchedule.scheduledAt,
                  scheduledId: savedSchedule.id,
                  uploadTargets: selectedTargets,
                  accountIds,
                  accountIdsByPlatform,
                },
              }))
            } catch (err) {
              console.error('[쇼츠/릴스 예약 생성 실패]', err)
              alert(`예약 생성 실패: ${err.message}`)
              return
            }
            await updateUploadStatus(id, platform, {
              status: 'scheduled',
              scheduledAt,
              nativeSchedule: false,
              uploadTargets: selectedTargets,
              accountIdsByPlatform,
            })
            setUploadStatus(p => ({ ...p, [platform]: 'scheduled' }))
            return
          } else {
            try {
              const scheduledId = scheduleInfo[platform]?.scheduledId || null
              const scheduledContent = platform === 'instagram'
                ? await buildInstagramScheduledUploadContent({ instagramContent, instagramImages, instaPngUrls })
                : content
              const savedSchedule = await createScheduledUpload({
                platform,
                content: {
                  ...(scheduledContent || {}),
                  accountIdsByPlatform,
                },
                scheduledAt,
                extractionId: id,
                scheduledId,
                accountIds,
                accountIdsByPlatform,
              })
              setScheduleInfo(p => ({
                ...p,
                [platform]: {
                  scheduledAt: savedSchedule.scheduledAt,
                  scheduledId: savedSchedule.id,
                  accountIds,
                  accountIdsByPlatform,
                },
              }))
            } catch (err) {
              console.error('[예약 생성 실패]', err)
              alert(`예약 생성 실패: ${err.message}`)
              return
            }
            await updateUploadStatus(id, platform, { status: 'scheduled', scheduledAt, accountIds, accountIdsByPlatform })
            setUploadStatus(p => ({ ...p, [platform]: 'scheduled' }))
          }

          setScheduleInfo(p => ({
            ...p,
            [platform]: {
              scheduledAt,
              scheduledId: p[platform]?.scheduledId || null,
              accountIds,
              accountIdsByPlatform,
            },
          }))
        }}
        onDelete={scheduleDialog.mode === 'edit' ? async () => {
          const platform = scheduleDialog.platform
          const scheduledId = scheduleInfo[platform]?.scheduledId

          if (platform === 'shorts_instagram' || platform === 'shorts_youtube') {
            const platformKey = platform === 'shorts_youtube' ? 'youtube' : 'instagram'
            if (scheduledId) {
              try {
                await removeScheduledUpload(scheduledId)
              } catch (err) {
                alert(`예약 삭제 실패: ${err.message}`)
                return
              }
            }
            if (extractionId) {
              const merged = buildShortsUploadStatus(state.uploadStatus?.shorts, {
                [platformKey]: { status: 'not_uploaded', scheduledAt: null, scheduledId: null },
              })
              updateUploadStatus(extractionId, 'shorts', merged)
                .catch(err => console.warn('[uploadStatus 저장 실패]', err))
              mergeStoredUploadMeta('shorts', merged)
            }
            setScheduleInfo(p => { const n = { ...p }; delete n[platform]; return n })
            return
          }

          if (scheduledId && platform !== 'blog') {
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
              updateUploadStatus(extractionId, platform, { status: 'not_uploaded', nativeSchedule: false, scheduledAt: null })
            }
          }
          if (platform !== 'blog') {
            setUploadStatus(p => { const n = { ...p }; delete n[platform]; return n })
          }
          setScheduleInfo(p => { const n = { ...p }; delete n[platform]; return n })
        } : undefined}
      />
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewImage(null)
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
          <div className="relative max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3">
            <img
              src={previewImage.url}
              alt={previewImage.alt}
              className="max-w-[92vw] max-h-[84vh] object-contain rounded-xl shadow-2xl"
            />
            {previewImage.alt && (
              <p className="text-sm text-white/80 text-center max-w-[92vw] truncate">
                {previewImage.alt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
