import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileText, Image, Users, MessageCircle, Film, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Hash, Clock, ChevronLeft, ChevronRight, ExternalLink,
  Upload, Loader2, AlertCircle, Calendar, XCircle, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import ScheduleDialog from '../components/ScheduleDialog'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { marked } from 'marked'
import { saveExtraction, getExtractions, loadImages, updateUploadStatus } from '../services/storage'
import { create as createScheduledUpload } from '../utils/scheduledUploads'
import { formatInstagramRequest, formatYouTubeRequest } from '../utils/platformFormatter'

const menuItems = [
  { id: 'blog',      label: '네이버 블로그', icon: FileText,      color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'band',      label: '네이버 밴드',   icon: Users,         color: 'text-green-500',   bg: 'bg-green-500/10' },
  { id: 'kakao',     label: '카카오톡',      icon: MessageCircle, color: 'text-yellow-400',  bg: 'bg-yellow-400/10' },
  { id: 'instagram', label: '인스타그램',    icon: Image,         color: 'text-pink-400',    bg: 'bg-pink-400/10' },
  { id: 'shorts',    label: '유튜브 숏츠',   icon: Film,          color: 'text-red-500',     bg: 'bg-red-500/10' },
]

export default function ExtractionResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state || {}
  const dataMap = { blog: state.blogContent, instagram: state.instagramContent, band: state.bandContent, kakao: state.kakaoContent, shorts: state.shortsScript }
  const firstAvailable = state.activeChannel && dataMap[state.activeChannel] ? state.activeChannel : menuItems.find(m => dataMap[m.id])?.id || 'blog'
  const [activeMenu, setActiveMenu] = useState(firstAvailable)
  const [copied, setCopied] = useState(false)
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
    instagram: { name: '인스타그램', icon: '📷', color: 'text-pink-400', bg: 'bg-pink-400/10' },
    band: { name: '네이버 밴드', icon: '👥', color: 'text-green-500', bg: 'bg-green-500/10' },
    kakao: { name: '카카오톡', icon: '💬', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    shorts: { name: '유튜브 숏츠', icon: '▶️', color: 'text-red-500', bg: 'bg-red-500/10' },
  }

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
              const url = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
              pngUrls.push(url)
            } catch { pngUrls.push(null) }
          }
        }

        const formData = new FormData()
        formData.append('title', blogTitle || blogContent?.title || '')
        formData.append('content', blogBody || compileBlogBody(blogContent?.sections || []))
        formData.append('tags', JSON.stringify((blogContent?.tags || []).map(t => t.replace(/^#/, ''))))
        formData.append('showBrowser', 'true')

        for (let i = 0; i < pngUrls.length; i++) {
          const url = pngUrls[i]
          if (!url) continue
          const res = await fetch(url)
          const blob = await res.blob()
          formData.append('photos', new File([blob], `section_${i + 1}.png`, { type: 'image/png' }))
        }

        const response = await fetch(`${BLOG_UPLOAD_SERVER}/api/upload`, {
          method: 'POST',
          body: formData,
        })
        const data = await response.json()
        if (data.success) {
          setUploadStatus(p => ({ ...p, blog: 'done' }))
          setBlogUploadResult({ url: data.url })
        } else {
          setUploadStatus(p => ({ ...p, blog: 'error' }))
          setUploadError(`네이버 블로그 업로드 실패: ${data.error || '알 수 없는 오류'}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, blog: 'error' }))
        setUploadError(`네이버 블로그 업로드 서버 연결 실패: ${err.message}`)
      }
      return
    }

    if (channel === 'instagram') {
      try {
        const instaImageUrls = instaPngUrls.filter(Boolean)
        const formatted = formatInstagramRequest(instagramContent, instaImageUrls)
        console.log('[ExtractionResultPage] 인스타그램 업로드 요청:', formatted)
        const response = await fetch('http://localhost:3001/api/instagram/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatted),
        })
        const data = await response.json()
        if (data.success) {
          setUploadStatus(p => ({ ...p, instagram: 'done' }))
        } else {
          setUploadStatus(p => ({ ...p, instagram: 'error' }))
          setUploadError(`인스타그램 업로드 실패: ${data.error || '알 수 없는 오류'}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, instagram: 'error' }))
        setUploadError(`인스타그램 업로드 실패: ${err.message}`)
      }
      return
    }

    if (channel === 'shorts') {
      try {
        const formatted = formatYouTubeRequest(shortsScript, shortsVideo?.url || '')
        console.log('[ExtractionResultPage] 유튜브 숏츠 업로드 요청:', formatted)
        const response = await fetch('http://localhost:3001/api/youtube/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formatted),
        })
        const data = await response.json()
        if (data.success) {
          setUploadStatus(p => ({ ...p, shorts: 'done' }))
        } else {
          setUploadStatus(p => ({ ...p, shorts: 'error' }))
          setUploadError(`유튜브 숏츠 업로드 실패: ${data.error || '알 수 없는 오류'}`)
        }
      } catch (err) {
        setUploadStatus(p => ({ ...p, shorts: 'error' }))
        setUploadError(`유튜브 숏츠 업로드 실패: ${err.message}`)
      }
      return
    }

    try {
      // band/kakao: 시뮬레이션 (공식 API 없음)
      await new Promise(r => setTimeout(r, 2000))
      setUploadStatus(p => ({ ...p, [channel]: 'done' }))
    } catch (err) {
      setUploadStatus(p => ({ ...p, [channel]: 'error' }))
      setUploadError(`${platformConfig[channel]?.name} 업로드 실패: ${err.message}`)
    }
  }

  const downloadAllImages = async (type) => {
    setDownloading(true)
    try {
      const captureElement = async (el, filename) => {
        const dataUrl = await domToPng(el, {
          scale: 2,
          quality: 1,
          fetchOptions: { mode: 'cors' },
        })
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
        const cards = instagramContent?.cards || []
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
    blogContent, bandContent, kakaoContent, instagramContent,
    shortsScript, blogImages: initialBlogImages, instagramImages,
    shortsVideo: initialShortsVideo,
    shortsNarration: initialShortsNarration,
    fileName, fileBase64,
  } = location.state || {}

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)
  const [shortsVideo, setShortsVideo] = useState(initialShortsVideo || null)
  const [shortsNarration, setShortsNarration] = useState(initialShortsNarration || null)

  // blogImages / shorts 미디어가 없으면 IndexedDB에서 불러오기
  useEffect(() => {
    const stateData = location.state
    if (!stateData) return
    const extractions = getExtractions()
    const match = extractions.find(e => e.fileName === stateData.fileName)
    if (!match?.id) return

    if (!blogImages?.length) {
      loadImages(match.id).then(imgs => {
        if (imgs?.length) setBlogImages(imgs)
      })
    }

  }, [])

  // 블로그 이미지 HTML → PNG 변환
  const convertBlogImagesToPng = async () => {
    const refs = blogImagesRef.current.filter(Boolean)
    if (refs.length === 0) return
    const urls = []
    for (const el of refs) {
      try {
        const url = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
        urls.push(url)
      } catch { urls.push(null) }
    }
    setBlogPngUrls(urls)
  }

  // 인스타 카드 HTML → PNG 변환
  const convertInstaCardsToPng = async () => {
    const cards = instagramContent?.cards || []
    if (cards.length === 0) return
    const prevSlide = instaSlide
    const urls = []
    for (let i = 0; i < cards.length; i++) {
      setInstaSlide(i)
      await new Promise(r => setTimeout(r, 300))
      const el = instaCardsRef.current[i]
      if (!el) { urls.push(null); continue }
      try {
        const url = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
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

  // ── 블로그 업로드 서버 상태 확인 ──
  const BLOG_UPLOAD_SERVER = 'http://localhost:3000'
  const checkBlogServer = () => {
    setBlogServerStatus('checking')
    fetch(`${BLOG_UPLOAD_SERVER}/`, { method: 'GET' })
      .then(r => setBlogServerStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setBlogServerStatus('offline'))
  }
  useEffect(() => { checkBlogServer() }, [])

  // ── compileBlogBody: sections → [IMG:N] 마커 포함 본문 생성 ──
  const compileBlogBody = (sections = []) => {
    return sections.map((s, i) => {
      const heading = s.heading ? `${s.heading}\n` : ''
      const content = s.content || ''
      return `${heading}[IMG:${i + 1}]\n${content}`
    }).join('\n\n---\n\n')
  }

  // blogTitle / blogBody 초기화 (blogContent 로드 시)
  useEffect(() => {
    if (blogContent) {
      if (!blogTitle) setBlogTitle(blogContent.title || '')
      if (!blogBody) setBlogBody(compileBlogBody(blogContent.sections || []))
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
  // savedFromExtraction 플래그가 있을 때만 저장
  useEffect(() => {
    const stateData = location.state
    if (!stateData || !stateData.savedFromExtraction) return
    const hasContent = stateData.blogContent || stateData.bandContent || stateData.kakaoContent || stateData.instagramContent || stateData.shortsScript
    if (!hasContent) return

    const id = saveExtraction(stateData)
    setExtractionId(id)
  }, [])

  // 기존 추출 결과에서 왔으면 id와 uploadStatus를 location.state에서 가져옴
  const [scheduleInfo, setScheduleInfo] = useState({}) // { [channel]: { scheduledAt } }
  useEffect(() => {
    if (location.state?.extractionId) setExtractionId(location.state.extractionId)
    if (location.state?.uploadStatus) {
      const storedStatus = location.state.uploadStatus
      const statusMap = {}
      const schedMap = {}
      Object.keys(storedStatus).forEach(ch => {
        const info = storedStatus[ch]
        if (info?.status === 'scheduled') {
          statusMap[ch] = 'scheduled'
          schedMap[ch] = { scheduledAt: info.scheduledAt }
        } else if (info?.status === 'uploaded') {
          statusMap[ch] = 'done'
        }
      })
      setUploadStatus(statusMap)
      setScheduleInfo(schedMap)
    }
  }, [location.state])

  if (!blogContent && !bandContent && !kakaoContent && !instagramContent && !shortsScript) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-text-muted mb-4">결과 데이터가 없습니다.</p>
          <button onClick={() => navigate('/extraction')} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
            콘텐츠 추출로 이동
          </button>
        </div>
      </div>
    )
  }

  const copy = (text, { richText = false } = {}) => {
    if (richText) {
      const normalized = normalizeMd(text)
      const html = normalized.includes('<strong>') ? normalized.replace(/\n/g, '<br>') : marked.parse(normalized)
      const blob = new Blob([html], { type: 'text/html' })
      const plainBlob = new Blob([text], { type: 'text/plain' })
      navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })
      ])
    } else {
      navigator.clipboard.writeText(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── 블로그 (네이버 블로그 업로드 포맷) ──
  const renderBlog = () => {
    const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
    const labels = ['INSIGHT', 'STUDY TIP', 'CORE', 'CHECK LIST', 'KEY POINT']
    const accentColor = '#e57a00'
    const sections = blogContent?.sections || []
    const markerCount = (blogBody.match(/\[IMG:\d+\]/g) || []).length

    return (
      <div className="space-y-4">
        {/* 실제 블로그 적용 결과 미리보기 */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="p-6 sm:p-10">
            <article className="max-w-3xl mx-auto" style={{ fontFamily: "'Pretendard', sans-serif" }}>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-6 pb-3 border-b border-gray-100">
                {blogTitle || '제목 없음'}
              </h1>
              <div className="space-y-4 text-[15px] text-gray-700 leading-8">
                {(() => {
                  const imgMarkerRe = /\[IMG:(\d+)\]/g
                  const tokens = []
                  let lastIndex = 0
                  let match
                  while ((match = imgMarkerRe.exec(blogBody)) !== null) {
                    if (match.index > lastIndex) {
                      tokens.push({ type: 'text', value: blogBody.slice(lastIndex, match.index) })
                    }
                    tokens.push({ type: 'image', index: parseInt(match[1], 10) - 1 })
                    lastIndex = match.index + match[0].length
                  }
                  if (lastIndex < blogBody.length) {
                    tokens.push({ type: 'text', value: blogBody.slice(lastIndex) })
                  }
                  return tokens.map((tok, i) => {
                    if (tok.type === 'image') {
                      const src = blogPngUrls[tok.index]
                      return (
                        <div key={i} className="my-6">
                          {src ? (
                            <img src={src} alt={`이미지 ${tok.index + 1}`} className="w-full rounded-xl shadow-sm" />
                          ) : (
                            <div className="w-full aspect-square rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                              이미지 {tok.index + 1} 준비 중...
                            </div>
                          )}
                        </div>
                      )
                    }
                    return (
                      <div key={i} className="whitespace-pre-wrap">
                        {tok.value.split('\n').map((line, li) => {
                          const trimmed = line.trim()
                          if (!trimmed) return <div key={li} className="h-2" />
                          if (/^---+$/.test(trimmed)) {
                            return <hr key={li} className="my-6 border-t border-gray-200" />
                          }
                          if (trimmed.startsWith('## ')) {
                            return <h2 key={li} className="text-lg font-bold text-gray-900 mt-6 mb-3">{trimmed.slice(3)}</h2>
                          }
                          if (trimmed.startsWith('# ')) {
                            return <h1 key={li} className="text-xl font-bold text-gray-900 mt-6 mb-3">{trimmed.slice(2)}</h1>
                          }
                          const parts = trimmed.split(/(\*\*[^*]+\*\*)/g)
                          return (
                            <p key={li} className="mb-2">
                              {parts.map((p, pi) => {
                                if (p.startsWith('**') && p.endsWith('**')) {
                                  return <strong key={pi} className="font-bold text-gray-900">{p.slice(2, -2)}</strong>
                                }
                                return <span key={pi}>{p}</span>
                              })}
                            </p>
                          )
                        })}
                      </div>
                    )
                  })
                })()}
              </div>
              {blogContent?.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-100">
                  {blogContent.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-full flex items-center gap-1">
                      <Hash size={10} />{tag.replace(/^#/, '')}
                    </span>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>

        {/* 서버 상태 표시 */}
        <div className={`rounded-xl border p-3 flex items-center gap-3 ${
          blogServerStatus === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' :
          blogServerStatus === 'offline' ? 'bg-red-500/5 border-red-500/20' :
          'bg-surface border-border'
        }`}>
          {blogServerStatus === 'checking' && <Loader2 size={14} className="text-text-muted animate-spin shrink-0" />}
          {blogServerStatus === 'online' && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
          {blogServerStatus === 'offline' && <XCircle size={14} className="text-red-400 shrink-0" />}
          <p className="text-xs text-text flex-1">
            업로드 서버 ({BLOG_UPLOAD_SERVER}):&nbsp;
            <span className={blogServerStatus === 'online' ? 'text-emerald-500 font-medium' : blogServerStatus === 'offline' ? 'text-red-400 font-medium' : 'text-text-muted'}>
              {blogServerStatus === 'checking' ? '확인 중...' : blogServerStatus === 'online' ? '정상' : '오프라인'}
            </span>
            {blogServerStatus === 'offline' && (
              <span className="text-text-muted ml-2">— C:\daval\upload_blog 에서 <code className="bg-surface-light px-1 py-0.5 rounded font-mono text-[11px]">npm start</code> 실행 필요</span>
            )}
          </p>
          <button onClick={checkBlogServer} className="p-1 rounded hover:bg-surface-light text-text-muted hover:text-text transition-colors" title="다시 확인">
            <RefreshCw size={13} />
          </button>
        </div>

        {/* 편집 패널 (제목/본문/이미지/태그) - UI 숨김, 데이터는 업로드 시 사용 */}
        <div className="hidden">
          <input value={blogTitle} onChange={e => setBlogTitle(e.target.value)} />
          <textarea value={blogBody} onChange={e => setBlogBody(e.target.value)} />
        </div>

        {/* 숨겨진 렌더링 영역 (domToPng 캡처용) */}
        <div style={{ position: 'absolute', left: '-10000px', top: 0, width: '600px', pointerEvents: 'none' }}>
          {sections.map((section, i) => {
            const firstImage = blogImages?.find(img => img.imageUrl)
            const image = blogImages?.find(img => img.heading === section.heading)
            const bgImageUrl = firstImage?.imageUrl || image?.imageUrl
            const hasOverlayImg = !!bgImageUrl
            const keyword = stripBold(image?.keyPhrase || section.keyPhrase || section.heading)
            const headingClean = stripBold(section.heading)
            const isFirst = i === 0
            return (
              <div
                key={i}
                ref={el => blogImagesRef.current[i] = el}
                className="w-full aspect-square rounded-xl relative overflow-hidden"
                style={{ fontFamily: "'Pretendard', sans-serif" }}
              >
                {hasOverlayImg ? (
                  <img src={bgImageUrl} alt="" className="w-full h-full object-cover absolute inset-0" />
                ) : (
                  <div className={`w-full h-full absolute inset-0 ${bgColors[i % 4]}`} />
                )}
                {isFirst ? (
                  <>
                    <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px]" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center" style={{ wordBreak: 'keep-all' }}>
                      <span className="inline-block px-3 py-1 rounded-lg text-sm font-bold mb-3 bg-white shadow-sm" style={{ letterSpacing: '1.5px', color: accentColor }}>{labels[i % labels.length]}</span>
                      {renderCardHeading(headingClean, 'clamp(28px, 8vw, 36px)')}
                      <div className="w-12 h-1 rounded-full mt-3 mb-3" style={{ background: accentColor }} />
                      <p className="text-lg text-gray-500 font-semibold">{keyword}</p>
                      <div className="absolute bottom-5 flex gap-1.5">
                        {(blogContent?.tags || []).slice(0, 3).map((tag, ti) => (
                          <span key={ti} className="px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full text-xs text-gray-600 font-medium">#{stripBold(tag)}</span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[75%] h-[75%] rounded-full bg-white/[0.93] shadow-lg flex flex-col items-center justify-center text-center p-6 relative" style={{ wordBreak: 'keep-all' }}>
                      {renderCardHeading(headingClean, 'clamp(22px, 6vw, 30px)')}
                      <div className="w-10 h-1 rounded-full mt-2 mb-2" style={{ background: accentColor }} />
                      <p className="text-base text-gray-500 font-semibold">{keyword}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }


  // ── 인스타그램 (카드 캐러셀 + 캡션) ──
  const renderInstagram = () => {
    const cards = instagramContent?.cards || []
    const currentCard = cards[instaSlide]
    const currentImage = instagramImages?.find(img => img.cardNumber === currentCard?.cardNumber)

    return (
      <div className="max-w-lg mx-auto">
        {/* 인스타그램 프로필 헤더 */}
        <div className="flex items-center gap-3 mb-4 p-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">AC</div>
          <div>
            <p className="text-sm font-semibold text-text">autocreator_official</p>
            <p className="text-xs text-text-muted">AutoCreator</p>
          </div>
        </div>

        {/* 카드 이미지 캐러셀 */}
        {cards.length > 0 && (
          <div className="relative">
            <div
              ref={el => instaCardsRef.current[instaSlide] = el}
              className="aspect-square rounded-none overflow-hidden relative"
              style={{ backgroundColor: currentCard?.backgroundColor || '#f0f4ff', fontFamily: "'Pretendard', sans-serif", wordBreak: 'keep-all' }}
            >
              {/* 인포그래픽 PPT 스타일 오버레이 */}
              <div className="absolute inset-0 flex flex-col justify-between p-7">
                {/* 상단: 카드 번호 뱃지 */}
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center text-xs font-black shadow-sm">{currentCard?.cardNumber}</span>
                  <div className="h-0.5 flex-1 bg-white/40 rounded-full" />
                </div>

                {/* 중앙: 메인 콘텐츠 */}
                <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
                  {currentCard?.dataPoint && (
                    <div className="mb-4 px-5 py-3 bg-white/90 rounded-2xl shadow-lg">
                      <p className="text-3xl font-black text-gray-800 leading-none">{currentCard.dataPoint}</p>
                    </div>
                  )}
                  <h3 className="text-gray-800 font-extrabold text-xl mb-2 leading-tight" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{currentCard?.headline?.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</h3>
                  <p className="text-gray-600 font-semibold text-sm leading-relaxed" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{currentCard?.body?.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</p>
                </div>

                {/* 하단 여백 */}
                <div />
              </div>
            </div>

            {/* 좌우 화살표 */}
            {instaSlide > 0 && (
              <button onClick={() => setInstaSlide(p => p - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors">
                <ChevronLeft size={16} className="text-gray-800" />
              </button>
            )}
            {instaSlide < cards.length - 1 && (
              <button onClick={() => setInstaSlide(p => p + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors">
                <ChevronRight size={16} className="text-gray-800" />
              </button>
            )}

            {/* 하단 인디케이터 */}
            <div className="flex justify-center gap-1.5 mt-3">
              {cards.map((_, i) => (
                <button key={i} onClick={() => setInstaSlide(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === instaSlide ? 'bg-primary w-4' : 'bg-border'}`} />
              ))}
            </div>
          </div>
        )}

        {/* 모든 카드 미리보기 (썸네일) */}
        <div className="grid grid-cols-5 gap-1.5 mt-4 px-3">
          {cards.map((card, i) => {
            const img = instagramImages?.find(im => im.cardNumber === card.cardNumber)
            return (
              <button key={i} onClick={() => setInstaSlide(i)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${i === instaSlide ? 'border-primary' : 'border-transparent'}`}
                style={{ backgroundColor: card.backgroundColor || '#1a1a2e' }}>
                {img?.imageUrl ? (
                  <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-white/60 text-xs font-bold">{card.cardNumber}</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 캡션 */}
        <div className="mt-4 px-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-text">캡션</p>
            <div className="flex items-center gap-2">
            <button onClick={() => downloadAllImages('insta')} disabled={downloading}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Download size={11} /> {downloading ? '저장중...' : '이미지 저장하기'}
            </button>
            <button onClick={() => {
              const icons = ['📌', '💡', '📊', '🔑', '✅', '🎯', '📈', '⭐', '🔥', '💬']
              const caption = instagramContent?.caption || ''
              const cardText = (instagramContent?.cards || []).map((card, i) => `${icons[i % icons.length]} ${card.headline || ''}${card.dataPoint ? ' ' + card.dataPoint : ''}${card.body ? ' — ' + card.body : ''}`).join('\n')
              const hashtags = (instagramContent?.hashtags || []).join(' ')
              const fullText = [caption, cardText, hashtags].filter(Boolean).join('\n\n')
              copy(fullText)
            }} className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Copy size={11} /> 글 복사
            </button>
            </div>
          </div>
          <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{instagramContent?.caption}</p>

          {cards.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {cards.map((card, i) => {
                const icons = ['📌', '💡', '📊', '🔑', '✅', '🎯', '📈', '⭐', '🔥', '💬']
                return (
                  <p key={i} className="text-sm text-text-muted leading-relaxed">
                    {icons[i % icons.length]} {card.headline}{card.dataPoint ? ` ${card.dataPoint}` : ''}{card.body ? ` — ${card.body}` : ''}
                  </p>
                )
              })}
            </div>
          )}

          {instagramContent?.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {instagramContent.hashtags.map((tag, i) => (
                <span key={i} className="text-xs text-primary-light hover:underline cursor-pointer">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 네이버 밴드 (커뮤니티 게시글) ──
  const renderBand = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        {/* 밴드 상단 바 (녹색 포인트) */}
        <div className="bg-[#00BD5E] px-6 py-3 flex items-center gap-2">
          <Users size={16} className="text-white" />
          <p className="text-sm font-semibold text-white flex-1 truncate">네이버 밴드</p>
          <button onClick={() => copy(JSON.stringify(bandContent, null, 2))} className="text-xs text-white/90 hover:text-white flex items-center gap-1">
            <Copy size={11} /> 복사
          </button>
        </div>

        {/* 제목 */}
        <div className="px-8 py-6 border-b border-border">
          <h2 className="text-xl font-bold text-text">{bandContent?.title}</h2>
        </div>

        {/* 본문 */}
        <div className="px-8 py-6 space-y-5">
          {bandContent?.greeting && (
            <p className="text-sm text-text">{bandContent.greeting}</p>
          )}

          <div className="text-sm text-text-muted leading-7 whitespace-pre-wrap">{bandContent?.body}</div>

          {bandContent?.keyPoints?.length > 0 && (
            <div className="bg-green-500/5 rounded-lg p-5 border border-green-500/20">
              <p className="text-xs font-bold text-green-500 mb-3 uppercase tracking-wide">핵심 포인트</p>
              <ul className="space-y-2.5">
                {bandContent.keyPoints.map((point, i) => (
                  <li key={i} className="text-sm text-text flex items-start gap-2.5">
                    <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bandContent?.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {bandContent.hashtags.map((tag, i) => (
                <span key={i} className="text-xs text-green-500 hover:underline cursor-pointer">{tag}</span>
              ))}
            </div>
          )}

          {bandContent?.cta && (
            <div className="pt-5 border-t border-border">
              <div className="bg-green-500/10 rounded-lg px-4 py-3 border border-green-500/20">
                <p className="text-sm text-text">{bandContent.cta}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ── 카카오톡 채널 (모바일 메시지 형태) ──
  const renderKakao = () => (
    <div className="max-w-md mx-auto space-y-4">
      {/* 푸시 알림 미리보기 (상단 채팅 버블) */}
      <div className="bg-[#FEE500] rounded-2xl px-5 py-4 shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">💬</div>
          <p className="text-xs font-semibold text-black/70 flex-1">카카오톡</p>
          <button onClick={() => copy(JSON.stringify(kakaoContent, null, 2))} className="text-xs text-black/60 hover:text-black flex items-center gap-1">
            <Copy size={11} /> 복사
          </button>
        </div>
        <p className="text-sm font-bold text-black leading-snug">{kakaoContent?.title}</p>
        <p className="text-xs text-black/70 mt-1 line-clamp-2">{kakaoContent?.message}</p>
      </div>

      {/* 메시지 카드 */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-text leading-7 whitespace-pre-wrap">{kakaoContent?.body}</div>

          {kakaoContent?.highlight && (
            <div className="bg-yellow-400/20 rounded-lg px-4 py-3 border-l-4 border-yellow-400">
              <p className="text-sm font-semibold text-text">{kakaoContent.highlight}</p>
            </div>
          )}
        </div>

        {/* CTA 버튼 */}
        {kakaoContent?.cta?.text && (
          <div className="px-6 pb-6">
            <button className="w-full bg-[#FEE500] hover:bg-yellow-300 text-black text-sm font-bold py-3 rounded-xl transition-colors">
              {kakaoContent.cta.text}
            </button>
            {kakaoContent.cta.description && (
              <p className="text-xs text-text-muted text-center mt-2">{kakaoContent.cta.description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ── 숏폼 (세로 영상 스크립트) ──
  const shortsVideoRef = useRef(null)
  const shortsAudioRefs = useRef([])
  const [currentScene, setCurrentScene] = useState(-1)
  const playingSceneRef = useRef(-1)

  const combinedVideoUrl = shortsVideo?.combinedVideoUrl
  const sceneTimings = shortsVideo?.sceneTimings || []

  // 현재 시간에 해당하는 씬 인덱스 계산
  const getSceneAtTime = (t) => {
    for (let i = 0; i < sceneTimings.length; i++) {
      const s = sceneTimings[i]
      if (t >= s.startTime && t < s.startTime + s.duration) return i
    }
    return -1
  }

  // timeupdate 기반 나레이션 싱크
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
    const videoUrl = videoData?.combinedVideoUrl
    const timings = videoData?.sceneTimings || []
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
        {/* 나레이션 오디오 (숨김, 싱크용) */}
        {shortsNarration?.map((n, i) => (
          n.audioUrl && <audio key={i} ref={el => shortsAudioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
        ))}
      </div>
    )
  }

  const renderShorts = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-6">
        {/* 9:16 통합 영상 프레임 */}
        {renderVideoPanel(shortsVideo, '숏폼 영상')}

        {/* 스크립트 (공유) */}
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

  const renderContent = { blog: renderBlog, instagram: renderInstagram, band: renderBand, kakao: renderKakao, shorts: renderShorts }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/extraction')} className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-xs text-text-muted">소스 파일</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text">{fileName}</p>
              {fileBase64 && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  title="원본 파일 다운로드"
                >
                  <Download size={13} />
                  다운로드
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 채널 탭 */}
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-border p-2">
        {menuItems.map(({ id, label, icon: Icon, color, bg }) => {
          const hasData = { blog: blogContent, instagram: instagramContent, band: bandContent, kakao: kakaoContent, shorts: shortsScript }[id]
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

      {/* 블로그 업로드 성공 배너 */}
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

      {/* 업로드 패널 */}
      {dataMap[activeMenu] && (
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
                        const contentMap = { blog: blogContent, instagram: instagramContent, band: bandContent, kakao: kakaoContent, shorts: shortsScript }
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

      {/* 콘텐츠 영역 */}
      <div>
        {renderContent[activeMenu]?.() || (
          <div className="flex items-center justify-center h-96 text-text-muted text-sm">
            이 채널의 콘텐츠가 아직 생성되지 않았습니다.
          </div>
        )}
      </div>

      {/* 예약 업로드 다이얼로그 */}
      <ScheduleDialog
        open={scheduleDialog.open}
        mode={scheduleDialog.mode || 'create'}
        initialDatetime={scheduleDialog.initialDatetime}
        onClose={() => setScheduleDialog(s => ({ ...s, open: false }))}
        defaultPlatform={scheduleDialog.platform}
        content={scheduleDialog.content}
        lockPlatform={true}
        onSave={({ platform, scheduledAt, content }) => {
          if (extractionId) {
            updateUploadStatus(extractionId, platform, { status: 'scheduled', scheduledAt })
          }
          createScheduledUpload({ platform, content, scheduledAt, extractionId })
          // 로컬 state 즉시 반영
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
