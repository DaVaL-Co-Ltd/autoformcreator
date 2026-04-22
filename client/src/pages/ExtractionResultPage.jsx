import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileText, Image, Mail, Film, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Hash, Clock, ChevronLeft, ChevronRight, ExternalLink,
  Upload, Loader2, AlertCircle, Calendar, XCircle, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import ScheduleDialog from '../components/ScheduleDialog'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { marked } from 'marked'
import { saveExtraction, getExtractionById, updateUploadStatus } from '../services/storage'
import { create as createScheduledUpload, getAll as getAllScheduledUploads } from '../utils/scheduledUploads'
import { formatInstagramRequest, formatYouTubeRequest } from '../utils/platformFormatter'
import { getAll as getPlatformConnections } from '../utils/platformConnections'
import { getBlogUploadServerBase, shouldUseRemoteBlogPublish } from '../utils/blogUploadServer.js'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { extractDesktopHelperStatus, formatDesktopHelperStatus, getDesktopHelperStatus } from '../utils/desktopHelperStatus.js'
import { fetchWithTimeout, withTimeout } from '../utils/requestTimeout.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const BLOG_UPLOAD_SERVER = getBlogUploadServerBase()
const USE_REMOTE_BLOG_PUBLISH = shouldUseRemoteBlogPublish()

const ensureArray = (value) => Array.isArray(value) ? value : []
const ensureTagArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  return []
}
const BLOG_UPLOAD_SOURCE = USE_REMOTE_BLOG_PUBLISH ? 'server-api' : 'desktop-helper'
const BLOG_UPLOAD_ENDPOINT = USE_REMOTE_BLOG_PUBLISH ? `${API_BASE}/api/naver/publish` : `${BLOG_UPLOAD_SERVER}/api/upload`
const BLOG_UPLOAD_HEADERS = { 'x-autoform-client': 'web-client' }
const BLOG_IMAGE_CAPTURE_TIMEOUT_MS = 15000
const BLOG_UPLOAD_REQUEST_TIMEOUT_MS = 120000
const API_RESPONSE_TIMEOUT_MS = 10000

async function captureElementPng(el, label) {
  return withTimeout(
    () => domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } }),
    BLOG_IMAGE_CAPTURE_TIMEOUT_MS,
    label
  )
}

function formatBlogUploadError(data, fallbackMessage) {
  const message = getApiErrorMessage(data, fallbackMessage)
  const source = data?.source || BLOG_UPLOAD_SOURCE
  const endpoint = data?.endpoint || BLOG_UPLOAD_ENDPOINT
  const helperStatus = formatDesktopHelperStatus(extractDesktopHelperStatus(data?.uploadRuntime))
  return `${message}${helperStatus ? ` ${helperStatus}` : ''} [source=${source} endpoint=${endpoint}]`
}

async function buildDesktopHelperFailureMessage(prefix, error) {
  const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
  return `${prefix}: ${error.message}${helperStatus ? ` ${helperStatus}` : ''} [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`
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
  const state = resolvedState || location.state || {}
  const dataMap = { blog: state.blogContent, newsletter: state.newsletterContent, instagram: state.instagramContent, shorts: state.shortsScript }
  const firstAvailable = state.activeChannel && dataMap[state.activeChannel] ? state.activeChannel : menuItems.find(m => dataMap[m.id])?.id || 'blog'
  const [activeMenu, setActiveMenu] = useState(firstAvailable)
  const [copied, setCopied] = useState(false)
  const [copiedKey, setCopiedKey] = useState(null) // 뉴스레터의 제목/본문 복사 버튼을 구분
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

  const platformConfig = {
    blog: { name: '네이버 블로그', icon: '📝', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    newsletter: { name: '뉴스레터', icon: '📧', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    instagram: { name: '인스타그램', icon: '📷', color: 'text-pink-400', bg: 'bg-pink-400/10' },
    shorts: { name: '유튜브 숏츠', icon: '▶️', color: 'text-red-500', bg: 'bg-red-500/10' },
  }

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

  const handleUpload = async (channel) => {
    setUploadStatus(p => ({ ...p, [channel]: 'loading' }))
    setUploadError(null)

    if (channel === 'blog') {
      try {
        // blogPngUrls가 없으면 먼저 캡처
        let pngUrls = blogPngUrls
        if (!pngUrls.length) {
          await convertBlogImagesToPng()
          // convertBlogImagesToPng는 state를 set하므로 직접 캡처
          const refs = blogImagesRef.current.filter(Boolean)
          pngUrls = []
          for (const el of refs) {
            try {
              const url = await captureElementPng(el, `Blog image capture ${pngUrls.length + 1}`)
              pngUrls.push(url)
            } catch { pngUrls.push(null) }
          }
        }

        const title = blogTitle || blogContent?.title || ''
        const content = blogBody || compileBlogBody(ensureArray(blogContent?.sections))
        const tags = ensureTagArray(blogContent?.tags).map(t => t.replace(/^#/, ''))

        let response
        if (USE_REMOTE_BLOG_PUBLISH) {
          const remoteContent = content.replace(/\[IMG:\d+\]\s*/g, '').trim()
          response = await fetchWithTimeout(`${API_BASE}/api/naver/publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-app-secret': import.meta.env.VITE_API_SECRET || '',
            },
            body: JSON.stringify({ title, content: remoteContent, tags }),
          }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'Naver blog upload request')
        } else {
          const formData = new FormData()
          formData.append('title', title)
          formData.append('content', content)
          formData.append('tags', JSON.stringify(tags))
          formData.append('showBrowser', 'true')

          for (let i = 0; i < pngUrls.length; i++) {
            const url = pngUrls[i]
            if (!url) continue
            const res = await fetchWithTimeout(url, {}, BLOG_IMAGE_CAPTURE_TIMEOUT_MS, `Blog image fetch ${i + 1}`)
            const blob = await res.blob()
            formData.append('photos', new File([blob], `section_${i + 1}.png`, { type: 'image/png' }))
          }

          try {
            response = await fetchWithTimeout(`${BLOG_UPLOAD_SERVER}/api/upload`, {
              headers: BLOG_UPLOAD_HEADERS,
              method: 'POST',
              body: formData,
            }, BLOG_UPLOAD_REQUEST_TIMEOUT_MS, 'Desktop helper upload request')
          } catch (error) {
            const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
            throw new Error(`${error.message}${helperStatus ? ` ${helperStatus}` : ''}`)
          }
        }

        let data
        try {
          data = await withTimeout(
            () => readApiResponse(response),
            API_RESPONSE_TIMEOUT_MS,
            'Upload response parsing'
          )
        } catch (error) {
          const helperStatus = formatDesktopHelperStatus(await getDesktopHelperStatus())
          throw new Error(`${error.message}${helperStatus ? ` ${helperStatus}` : ''}`)
        }
        if (data.success) {
          setUploadStatus(p => ({ ...p, blog: 'done' }))
          setBlogUploadResult({
            endpoint: data.endpoint || BLOG_UPLOAD_ENDPOINT,
            source: data.source || BLOG_UPLOAD_SOURCE,
            url: data.url,
          })
        } else {
          setUploadStatus(p => ({ ...p, blog: 'error' }))
          setUploadError(`네이버 블로그 업로드 실패: ${formatBlogUploadError(data, `네이버 블로그 업로드 실패 (${response.status})`)}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, blog: 'error' }))
        setUploadError(`네이버 블로그 업로드 서버 연결 실패: ${err.message} [source=${BLOG_UPLOAD_SOURCE} endpoint=${BLOG_UPLOAD_ENDPOINT}]`)
      }
      return
    }

    if (channel === 'instagram') {
      try {
        // PNG가 아직 변환 안 됐으면 먼저 변환
        let urls = instaPngUrls.filter(Boolean)
        if (!urls.length && instagramContent?.cards?.length) {
          await convertInstaCardsToPng()
          // state 업데이트는 비동기이므로 한 번 더 기다림
          await new Promise(r => setTimeout(r, 200))
          urls = (instaCardsRef.current || []).filter(Boolean).length
            ? instaPngUrls.filter(Boolean)
            : []
        }
        if (!urls.length) {
          // PNG 변환 결과를 state에서 가져올 수 없으면 다시 한번 직접 변환
          urls = (await Promise.all((instaCardsRef.current || []).filter(Boolean).map(async (el, index) => {
            try { return await captureElementPng(el, `Instagram image capture ${index + 1}`) } catch { return null }
          }))).filter(Boolean)
        }
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
          setUploadStatus(p => ({ ...p, instagram: 'done' }))
          if (extractionId) {
            updateUploadStatus(extractionId, 'instagram', {
              status: 'uploaded',
              uploadedAt: new Date().toISOString(),
              uploadedUrl: data.permalink || null,
            }).catch(err => console.warn('[uploadStatus 저장 실패]', err))
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
        // 상대 경로면 현재 origin을 붙여 절대 URL로 변환 (서버 fetch 가능하도록)
        let absVideoUrl = shortsVideo?.url || ''
        if (absVideoUrl.startsWith('/output/') && API_BASE) {
          absVideoUrl = `${API_BASE}${absVideoUrl}`
        } else if (absVideoUrl.startsWith('/')) {
          absVideoUrl = `${window.location.origin}${absVideoUrl}`
        }
        const formatted = formatYouTubeRequest(shortsScript, absVideoUrl)
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
          if (extractionId) {
            updateUploadStatus(extractionId, 'shorts', {
              status: 'uploaded',
              uploadedAt: new Date().toISOString(),
              uploadedUrl: ytUrl,
            }).catch(err => console.warn('[uploadStatus 저장 실패]', err))
          }
          if (ytUrl) {
            console.log('[YouTube 업로드 완료]', ytUrl)
            alert(`✅ 유튜브 업로드 완료!\n\n${ytUrl}\n\n링크가 클립보드에 복사되었습니다.`)
            try { await navigator.clipboard.writeText(ytUrl) } catch {}
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
        // 인스타: 각 카드를 순서대로 캡처
        const cards = instagramContent?.cards || instagramContent?.cardTopics || []
        const prevSlide = instaSlide
        for (let idx = 0; idx < cards.length; idx++) {
          setInstaSlide(idx)
          await new Promise(r => setTimeout(r, 400))
          const el = instaCardsRef.current[idx]
          if (!el) continue
          await captureElement(el, `인스타그램_${idx + 1}.png`)
          await new Promise(r => setTimeout(r, 500))
        }
        setInstaSlide(prevSlide)
      }
    } catch (err) {
      console.error('다운로드 실패:', err)
    }
    setDownloading(false)
  }

  const {
    parsedText, verification, summary,
    blogContent, newsletterContent, instagramContent,
    shortsScript, blogImages: initialBlogImages, instagramImages,
    shortsVideo: initialShortsVideo,
    shortsNarration: initialShortsNarration,
    fileName, fileBase64,
  } = state

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)
  const [shortsVideo, setShortsVideo] = useState(initialShortsVideo || null)
  const [shortsNarration, setShortsNarration] = useState(initialShortsNarration || null)
  const shortsVideoRef = useRef(null)
  const shortsAudioRefs = useRef([])
  const [currentScene, setCurrentScene] = useState(-1)
  const playingSceneRef = useRef(-1)

  // blogImages / shorts 미디어가 없으면 Supabase에서 불러오기
  useEffect(() => {
    setBlogImages(initialBlogImages || null)
    setShortsVideo(initialShortsVideo || null)
    setShortsNarration(initialShortsNarration || null)
  }, [initialBlogImages, initialShortsVideo, initialShortsNarration])

  // 블로그 이미지 HTML → PNG 변환
  const convertBlogImagesToPng = async () => {
    const refs = blogImagesRef.current.filter(Boolean)
    if (refs.length === 0) return
    const urls = []
    for (const el of refs) {
      try {
        const url = await captureElementPng(el, `Blog image preload ${urls.length + 1}`)
        urls.push(url)
      } catch { urls.push(null) }
    }
    setBlogPngUrls(urls)
  }

  // 인스타 카드 HTML → PNG 변환
  const convertInstaCardsToPng = async () => {
    const cards = instagramContent?.cards || instagramContent?.cardTopics || []
    if (cards.length === 0) return
    const prevSlide = instaSlide
    const urls = []
    for (let i = 0; i < cards.length; i++) {
      setInstaSlide(i)
      await new Promise(r => setTimeout(r, 300))
      const el = instaCardsRef.current[i]
      if (!el) { urls.push(null); continue }
      try {
        const url = await captureElementPng(el, `Instagram image preload ${i + 1}`)
        urls.push(url)
      } catch { urls.push(null) }
    }
    setInstaPngUrls(urls)
    setInstaSlide(prevSlide)
  }

  const handleDownload = () => {
    if (!fileBase64) return
    const link = document.createElement('a')
    link.href = fileBase64
    link.download = fileName || 'document.pdf'
    link.click()
  }

  // 블로그 이미지 PNG 변환 트리거
  useEffect(() => {
    if (activeMenu === 'blog' && blogContent && blogPngUrls.length === 0) {
      // HTML 렌더링 완료 후 변환
      const timer = setTimeout(() => convertBlogImagesToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [activeMenu, blogContent])

  // ── 블로그 업로드 서버 상태 확인 (네이버 블로그 업로드 전용) ──
  const checkBlogServer = () => {
    setBlogServerStatus('checking')
    // 블로그 탭일 때만 상태 체크
    if (activeMenu !== 'blog' || USE_REMOTE_BLOG_PUBLISH) { setBlogServerStatus('offline'); return }
    fetch(`${BLOG_UPLOAD_SERVER}/`, { method: 'GET', signal: AbortSignal.timeout(2000) })
      .then(r => setBlogServerStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setBlogServerStatus('offline'))
  }
  useEffect(() => {
    if (activeMenu === 'blog') checkBlogServer()
    else setBlogServerStatus('offline')
  }, [activeMenu])

  // ── compileBlogBody: sections → [IMG:N] 마커 포함 본문 생성 ──
  const compileBlogBody = (sections = []) => {
    return ensureArray(sections).map((s, i) => {
      const heading = s.heading ? `${s.heading}\n` : ''
      const content = s.content || ''
      return `${heading}[IMG:${i + 1}]\n${content}`
    }).join('\n\n---\n\n')
  }

  // blogTitle / blogBody 초기화 (blogContent 로드 시)
  useEffect(() => {
    if (blogContent) {
      if (!blogTitle) setBlogTitle(blogContent.title || '')
      if (!blogBody) setBlogBody(compileBlogBody(ensureArray(blogContent.sections)))
    }
  }, [blogContent])

  // 카드 이미지용 텍스트에서 ** 제거
  const stripBold = (text) => (text || '').replace(/\*{1,3}/g, '')

  // 카드 제목을 2줄로 분리 (15자 이상이면 반드시 2줄)
  const splitHeading = (text) => {
    if (!text) return [text]
    const parts = text.split(/([&:,])\s*/)
    const tokens = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (/^[&:,]$/.test(p)) {
        if (tokens.length > 0) tokens[tokens.length - 1] += p
      } else if (p.trim()) {
        tokens.push(p.trim())
      }
    }
    if (tokens.length > 1) {
      const totalLen = tokens.reduce((sum, t) => sum + t.length, 0)
      let line1 = '', line2 = '', acc = 0
      for (let i = 0; i < tokens.length; i++) {
        acc += tokens[i].length
        if (acc >= totalLen / 2 && !line2) {
          line1 = tokens.slice(0, i + 1).join(' ')
          line2 = tokens.slice(i + 1).join(' ')
        }
      }
      if (line2) return [line1, line2]
    }
    if (text.length >= 15) {
      const words = text.split(/\s+/)
      if (words.length >= 2) {
        const mid = Math.ceil(text.length / 2)
        let line1 = words[0], best = 0
        for (let i = 1; i < words.length; i++) {
          const candidate = words.slice(0, i + 1).join(' ')
          if (Math.abs(candidate.length - mid) <= Math.abs(line1.length - mid)) {
            line1 = candidate
            best = i
          }
        }
        const line2 = words.slice(best + 1).join(' ')
        if (line2) return [line1, line2]
      }
    }
    return [text]
  }

  const renderCardHeading = (text, fontSize) => {
    const clean = stripBold(text)
    const lines = splitHeading(clean)
    return (
      <p className="font-black text-gray-800 leading-snug drop-shadow-sm" style={{ fontSize, letterSpacing: '-0.5px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {line}
          </span>
        ))}
      </p>
    )
  }

  // 마크다운 볼드를 HTML <strong>으로 직접 변환 (파서 의존 제거)
  const normalizeMd = (text) => {
    if (!text) return ''
    return text
      .replace(/\*{3,}([^*]+?)\*{3,}/g, '<strong>$1</strong>')  // ***text*** → <strong>
      .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '<strong>$1</strong>') // **text** → <strong> (공백 포함)
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<strong>$1</strong>')  // *text* → <strong>
      .replace(/\*{2,}/g, '')  // 남은 고아 ** 제거
  }

  // 결과 저장은 ExtractionPage에서 navigateToResults 시 1회만 수행
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
  }, [])

  // 기존 추출 결과에서 왔으면 id와 uploadStatus를 location.state에서 가져옴
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

  // extractionId가 있으면 서버에서 예약 정보 다시 불러오기 (새로고침 후 복원)
  useEffect(() => {
    if (!extractionId) return
    ;(async () => {
      try {
        const all = await getAllScheduledUploads()
        const mine = all.filter(item => item.extractionId === extractionId)
        if (!mine.length) return
        setScheduleInfo(prev => {
          const next = { ...prev }
          mine.forEach(item => {
            next[item.platform] = { scheduledAt: item.scheduledAt }
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
  }, [activeMenu, instagramContent])

  useEffect(() => {
    const nextDataMap = { blog: state.blogContent, newsletter: state.newsletterContent, instagram: state.instagramContent, shorts: state.shortsScript }
    const nextMenu = state.activeChannel && nextDataMap[state.activeChannel]
      ? state.activeChannel
      : menuItems.find(m => nextDataMap[m.id])?.id || 'blog'
    setActiveMenu(prev => (nextDataMap[prev] ? prev : nextMenu))
  }, [state])

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

  const footerLinks = Object.entries(getPlatformConnections() || {}).map(([key, item]) => {
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
    const html = document.getElementById('newsletter-export')?.innerHTML
    if (!html) return
    const fullHtml = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f8fb;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9f0;">
              <tr><td style="padding:0;">${html}</td></tr>
            </table>
          </td>
        </tr>
      </table>
    `
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([fullHtml], { type: 'text/html' }),
          'text/plain': new Blob([newsletterContent?.body || ''], { type: 'text/plain' }),
        }),
      ])
      flashCopied('newsletter-body')
    } catch {
      await navigator.clipboard.writeText(newsletterContent?.body || '')
      flashCopied('newsletter-body')
    }
  }

  const renderBlog = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text">{blogContent?.title}</h2>
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
            <Hash size={12} />
            {ensureTagArray(blogContent?.tags).join(' ')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => copy(`${blogContent?.title || ''}\n\n${ensureArray(blogContent?.sections).map(s => `${s.heading}\n${s.content}`).join('\n\n')}`)}
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

      {activeMenu === 'blog' && (
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${blogServerStatus === 'online' ? 'bg-success' : blogServerStatus === 'checking' ? 'bg-warning animate-pulse' : 'bg-danger'}`} />
          <span className="text-text-muted">
            블로그 업로드 서버:
            {blogServerStatus === 'online' ? ' 연결됨' : blogServerStatus === 'checking' ? ' 확인 중...' : ' 오프라인'}
          </span>
          <button onClick={checkBlogServer} className="text-text-muted hover:text-primary">
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {activeMenu === 'blog' && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">블로그 제목</label>
            <input
              value={blogTitle}
              onChange={(e) => setBlogTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-text"
              placeholder="블로그 제목"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">블로그 본문</label>
            <textarea
              value={blogBody}
              onChange={(e) => setBlogBody(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-text resize-y"
            />
            <p className="mt-2 text-xs text-text-muted">이미지 위치에는 `[IMG:N]` 마커가 유지됩니다. 업로드 시 해당 위치에 이미지가 삽입됩니다.</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {ensureArray(blogContent?.sections).map((section, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-100">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{section.heading}</h3>
              <div className="prose prose-gray max-w-none text-gray-700 leading-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {normalizeMd(section.content)}
                </ReactMarkdown>
              </div>
            </div>
            <div className="p-6 bg-gray-50">
              <div
                ref={el => blogImagesRef.current[index] = el}
                className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center"
              >
                {blogImages?.[index]?.imageUrl ? (
                  <img
                    src={blogImages[index].imageUrl}
                    alt={section.heading || `블로그 이미지 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : blogImages?.[index]?.html ? (
                  <div
                    className="w-full h-full"
                    dangerouslySetInnerHTML={{ __html: blogImages[index].html }}
                  />
                ) : (
                  <div className="text-gray-400">이미지 없음</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderInstagram = () => {
    const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
    const current = cards[instaSlide]
    const hashtags = ensureArray(instagramContent?.hashtags)

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">{instagramContent?.headline || '인스타그램 카드'}</h2>
            <p className="text-sm text-text-muted mt-1">{cards.length}장 카드</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(`${instagramContent?.caption || ''}\n\n${hashtags.join(' ')}`)}
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

        <div className="grid lg:grid-cols-[420px,1fr] gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-[32px] p-4 shadow-xl border border-gray-100">
              <div className="rounded-[28px] overflow-hidden bg-gray-100">
                <div
                  ref={el => instaCardsRef.current[instaSlide] = el}
                  className="aspect-square relative bg-gradient-to-br from-pink-50 via-white to-orange-50"
                >
                  <div className="absolute inset-0 p-10 flex flex-col justify-between">
                    <div className="space-y-4">
                      {current?.kicker && (
                        <span className="inline-flex px-3 py-1 rounded-full bg-pink-500/10 text-pink-500 text-xs font-bold">
                          {current.kicker}
                        </span>
                      )}
                      {renderCardHeading(current?.title || current?.heading, 34)}
                      {current?.subtitle && (
                        <p className="text-base text-gray-600 leading-7">{stripBold(current.subtitle)}</p>
                      )}
                    </div>
                    {ensureArray(current?.points).length > 0 && (
                      <ul className="space-y-3">
                        {ensureArray(current?.points).map((point, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-gray-700">
                            <span className="mt-1 w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                            <span className="leading-7">{stripBold(point)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
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

          <div className="space-y-5">
            <div className="bg-surface rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text mb-3">캡션</h3>
              <div className="text-sm text-text leading-7 whitespace-pre-wrap">{instagramContent?.caption}</div>
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

            <div className="bg-surface rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text mb-3">카드 목록</h3>
              <div className="space-y-2">
                {cards.map((card, index) => (
                  <button
                    key={index}
                    onClick={() => setInstaSlide(index)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      instaSlide === index
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:border-primary/20 hover:bg-surface-light'
                    }`}
                  >
                    <p className="text-sm font-medium text-text">{card.title || card.heading || `카드 ${index + 1}`}</p>
                    {card.subtitle && <p className="text-xs text-text-muted mt-1 line-clamp-2">{stripBold(card.subtitle)}</p>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderNewsletter = () => (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border bg-surface-light">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <p className="text-xs text-text-muted ml-3 flex-1 truncate">{newsletterContent?.subject}</p>
          <button onClick={copyNewsletterHtml} className="text-xs text-text-muted hover:text-primary flex items-center gap-1" title="이메일 편집기(Gmail 등)에 붙여넣으면 서식이 유지됩니다">
            {copiedKey === 'newsletter-body' ? <><CheckCircle size={11} /> 복사됨</> : <><Copy size={11} /> 복사</>}
          </button>
        </div>

        {newsletterContent?.subject && (
          <div className="border-b border-border px-6 py-3 bg-surface">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-text-muted w-12 shrink-0">제목</span>
              <p className="text-sm text-text flex-1 truncate">{newsletterContent.subject}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(newsletterContent.subject); flashCopied('newsletter-subject') }}
                className="text-xs text-text-muted hover:text-primary flex items-center gap-1 shrink-0"
                title="이메일 제목을 복사합니다"
              >
                {copiedKey === 'newsletter-subject' ? <><CheckCircle size={11} /> 복사됨</> : <><Copy size={11} /> 제목 복사</>}
              </button>
            </div>
            {newsletterContent.preheader && (
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] font-bold text-text-muted w-12 shrink-0">프리헤더</span>
                <p className="text-xs text-text-muted flex-1 truncate">{newsletterContent.preheader}</p>
              </div>
            )}
          </div>
        )}

        <div id="newsletter-export">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-8 text-center">
            <h2 className="text-xl font-bold text-text">{newsletterContent?.headline || newsletterContent?.subject}</h2>
            {newsletterContent?.preheader && (
              <p className="text-sm text-text-muted mt-2">{newsletterContent.preheader}</p>
            )}
          </div>

          <div className="px-8 py-6 space-y-5">
            {newsletterContent?.greeting && (
              <p className="text-sm text-text">{newsletterContent.greeting}</p>
            )}

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
                <p className="text-xs text-text-muted mb-4">더 많은 콘텐츠는 여기서 만나보세요</p>
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

  const combinedVideoUrl = shortsVideo?.combinedVideoUrl
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
            <a href={videoUrl} download={`숏폼_${versionLabel}.webm`}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors">
              <Download size={10} /> 다운로드
            </a>
            <button
              onClick={() => navigate('/shorts/view', { state: {
                combinedVideoUrl: videoUrl,
                sceneTimings: timings,
                scenes: shortsScript?.scenes || [],
                narrations: shortsNarration || [],
                title: `${shortsScript?.title || '숏폼 영상'} (${versionLabel})`,
              }})}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
            >
              <ExternalLink size={10} /> 웹에서 보기
            </button>
          </div>
        )}
        {ensureArray(shortsNarration).map((n, i) => (
          n.audioUrl && <audio key={i} ref={el => shortsAudioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
        ))}
      </div>
    )
  }

  const renderShorts = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-6">
        {renderVideoPanel(shortsVideo, '숏폼 영상')}

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-text">{shortsScript?.title}</h3>
            <button onClick={() => copy(shortsScript?.scenes?.map(s => s.narration).join('\n\n'))}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Copy size={11} /> 대본 복사
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1"><Clock size={12} /> {shortsScript?.duration}초</span>
            <span>{shortsScript?.scenes?.length}개 씬</span>
          </div>

          {shortsScript?.scenes?.map((scene, i) => {
            const sceneAudio = shortsNarration?.find(n => n.sceneNumber === scene.sceneNumber)
            const isActive = combinedVideoUrl && i === currentScene
            return (
              <div key={i} className={`p-4 rounded-lg border transition-all ${isActive ? 'bg-red-500/5 border-red-500/30' : 'bg-surface border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-red-500/30 text-red-500' : 'bg-red-500/20 text-red-500'}`}>{scene.sceneNumber}</span>
                  <span className="text-xs text-text-muted">{scene.duration}초</span>
                  {isActive && <span className="text-xs text-red-500 font-medium animate-pulse">재생중</span>}
                </div>
                <p className="text-sm text-text mb-1">{scene.narration}</p>
                {scene.textOverlay && <p className="text-xs text-red-500 font-medium mb-2">[자막] {scene.textOverlay}</p>}
                {sceneAudio?.audioUrl && !combinedVideoUrl && (
                  <audio controls className="w-full h-8 mt-2" src={sceneAudio.audioUrl} />
                )}
              </div>
            )
          })}

          {shortsScript?.cta && (
            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
              <p className="text-xs text-primary-light font-medium">CTA: {shortsScript.cta}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderContent = { blog: renderBlog, newsletter: renderNewsletter, instagram: renderInstagram, shorts: renderShorts }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-border p-2">
        <button
          onClick={() => navigate(state?.fromContents ? '/contents' : '/extraction')}
          className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors shrink-0"
          title={state?.fromContents ? '콘텐츠 관리로 돌아가기' : '콘텐츠 추출로 돌아가기'}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-px h-6 bg-border shrink-0" />
        {menuItems.map(({ id, label, icon: Icon, color, bg }) => {
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
              <Icon size={16} />
              {label}
              {hasData && <CheckCircle size={12} className="text-success" />}
            </button>
          )
        })}
      </div>

      {blogUploadResult && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">네이버 블로그 업로드 성공!</p>
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

      {dataMap[activeMenu] && activeMenu !== 'newsletter' && (
        <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-text">플랫폼 업로드</h3>
              <p className="text-xs text-text-muted mt-0.5">생성된 콘텐츠를 연동된 플랫폼에 바로 업로드</p>
            </div>
          </div>

          {uploadError && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
              <AlertCircle size={14} className="text-danger shrink-0" />
              <p className="text-xs text-danger">{uploadError}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            {(() => {
              const ch = activeMenu
              const cfg = platformConfig[ch]
              const status = uploadStatus[ch]
              const sched = scheduleInfo[ch]
              if (!cfg) return null
              const fmtDate = (iso) => {
                if (!iso) return ''
                const d = new Date(iso)
                return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
              }
              const isScheduled = status === 'scheduled'
              return (
                <div className="flex items-center gap-3 flex-1">
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border flex-1 ${status === 'done' ? 'bg-success/5 border-success/20' : isScheduled ? 'bg-info/5 border-info/20' : 'bg-surface-light border-border'}`}>
                    <span className="text-lg">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text">{cfg.name}</p>
                      <p className="text-xs text-text-muted">
                        {status === 'done' ? '업로드 완료' :
                         status === 'error' ? '업로드 실패' :
                         isScheduled ? `예약 완료 · ${fmtDate(sched?.scheduledAt)}` :
                         '업로드 대기'}
                      </p>
                    </div>
                    {status === 'error' && <AlertCircle size={16} className="text-danger shrink-0" />}
                    {isScheduled && <Calendar size={16} className="text-info shrink-0" />}
                  </div>
                  {!isScheduled && (
                    <button
                      onClick={() => handleUpload(ch)}
                      disabled={status === 'loading'}
                      className={`px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0
                        ${status === 'done'
                          ? 'bg-success/10 text-success border border-success/20 hover:bg-success/20'
                          : status === 'loading'
                            ? 'bg-primary/10 text-primary-light border border-primary/20 opacity-70'
                            : 'bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25'
                        }`}
                    >
                      {status === 'loading' ? (
                        <><Loader2 size={14} className="animate-spin" /> 업로드 중...</>
                      ) : status === 'done' ? (
                        <><CheckCircle size={14} /> 완료</>
                      ) : (
                        <><Upload size={14} /> {cfg.name}에 업로드</>
                      )}
                    </button>
                  )}
                  {status !== 'done' && (
                    <button
                      onClick={() => {
                        const contentMap = { blog: blogContent, newsletter: newsletterContent, instagram: instagramContent, shorts: shortsScript }
                        setScheduleDialog({ open: true, platform: ch, content: contentMap[ch] || {}, mode: isScheduled ? 'edit' : 'create', initialDatetime: sched?.scheduledAt })
                      }}
                      className="px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0 bg-surface border border-border text-text-muted hover:text-primary hover:border-primary/40"
                    >
                      <Calendar size={14} />
                      {isScheduled ? '예약 상세' : '예약 업로드'}
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
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
          await updateUploadStatus(id, platform, { status: 'scheduled', scheduledAt })
          await createScheduledUpload({ platform, content, scheduledAt, extractionId: id }).catch(err => {
            console.error('[예약 생성 실패]', err)
            alert(`예약 생성 실패: ${err.message}`)
          })
          setUploadStatus(p => ({ ...p, [platform]: 'scheduled' }))
          setScheduleInfo(p => ({ ...p, [platform]: { scheduledAt } }))
        }}
        onDelete={scheduleDialog.mode === 'edit' ? () => {
          const platform = scheduleDialog.platform
          if (extractionId) {
            updateUploadStatus(extractionId, platform, { status: 'not_uploaded' })
          }
          setUploadStatus(p => { const n = { ...p }; delete n[platform]; return n })
          setScheduleInfo(p => { const n = { ...p }; delete n[platform]; return n })
        } : undefined}
      />
    </div>
  )
}
