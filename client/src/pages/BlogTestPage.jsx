import { useState, useRef, useEffect } from 'react'
import {
  FileText, Copy, Download, CheckCircle, Hash, RefreshCw,
  Upload, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Sparkles, ClipboardCheck, PenTool, Eye, ArrowRight, X
} from 'lucide-react'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { marked } from 'marked'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import { generateBlogContent } from '../services/gemini-content'
import { generateBlogImages } from '../services/flux'

// ── 네이버 블로그 구분선 컴포넌트 (7종) ──
const BlogDivider = ({ type = 'thin' }) => {
  switch (type) {
    case 'thin':
      return <hr className="my-8 border-t border-gray-200" />
    case 'thick':
      return <hr className="my-8 border-t-[3px] border-gray-400 w-24 mx-auto" />
    case 'wave':
      return (
        <div className="my-8 flex justify-center">
          <svg width="200" height="20" viewBox="0 0 200 20" fill="none">
            <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10" stroke="#d1d5db" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )
    case 'diamond':
      return (
        <div className="my-8 flex items-center gap-3 justify-center">
          <div className="flex-1 max-w-24 h-px bg-gray-300" />
          <div className="w-3 h-3 border border-gray-400 rotate-45" />
          <div className="flex-1 max-w-24 h-px bg-gray-300" />
        </div>
      )
    case 'dotted':
      return (
        <div className="my-8 flex justify-center gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          ))}
        </div>
      )
    case 'diagonal':
      return (
        <div className="my-8 flex justify-center">
          <div className="w-12 h-px bg-gray-300 rotate-[30deg]" />
        </div>
      )
    case 'vertical':
      return (
        <div className="my-8 flex justify-center">
          <div className="w-px h-10 bg-gray-300" />
        </div>
      )
    default:
      return <hr className="my-8 border-t border-gray-200" />
  }
}

// ── 네이버 블로그 인용구 컴포넌트 (6종) ──
const BlogQuote = ({ type = 'quotemark', children }) => {
  switch (type) {
    case 'quotemark':
      return (
        <div className="my-6 py-6 text-center">
          <span className="block text-4xl text-gray-300 leading-none mb-2 select-none">"</span>
          <p className="text-base font-bold text-gray-700 leading-relaxed px-8">{children}</p>
          <span className="block text-4xl text-gray-300 leading-none mt-2 select-none">"</span>
        </div>
      )
    case 'vertical':
      return (
        <div className="my-6 flex">
          <div className="w-1 bg-gray-700 rounded-full shrink-0 mr-4" />
          <p className="text-base font-bold text-gray-700 leading-relaxed py-1">{children}</p>
        </div>
      )
    case 'speech':
      return (
        <div className="my-6 relative">
          <div className="border-2 border-gray-300 rounded-lg px-6 py-5">
            <p className="text-base font-medium text-gray-700 leading-relaxed text-center">{children}</p>
          </div>
          <div className="absolute -bottom-3 left-8 w-5 h-5 bg-white border-b-2 border-r-2 border-gray-300 rotate-45" />
        </div>
      )
    case 'linequote':
      return (
        <div className="my-6 text-center">
          <span className="text-3xl text-gray-300 font-serif leading-none select-none">"</span>
          <p className="text-base font-bold text-gray-700 leading-relaxed px-8 -mt-1">{children}</p>
          <div className="w-16 h-0.5 bg-gray-300 mx-auto mt-3" />
        </div>
      )
    case 'postit':
      return (
        <div className="my-6">
          <div className="bg-gray-100 border border-gray-200 rounded-sm px-6 py-5 shadow-sm">
            <p className="text-base font-medium text-gray-700 leading-relaxed text-center">{children}</p>
          </div>
        </div>
      )
    case 'frame':
      return (
        <div className="my-6 relative px-2 py-2">
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-gray-400" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-gray-400" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-gray-400" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-gray-400" />
          <div className="px-6 py-5">
            <p className="text-base font-medium text-gray-700 leading-relaxed text-center">{children}</p>
          </div>
        </div>
      )
    default:
      return (
        <div className="my-6 border-l-4 border-gray-400 pl-4 py-2 bg-gray-50 rounded-r-lg">
          <p className="text-sm font-bold text-gray-700">{children}</p>
        </div>
      )
  }
}

// 스타일 옵션
const DIVIDER_TYPES = [
  { value: 'thin', label: '가는 실선' },
  { value: 'thick', label: '굵은 실선' },
  { value: 'wave', label: '물결선' },
  { value: 'diamond', label: '다이아몬드' },
  { value: 'dotted', label: '점선' },
  { value: 'diagonal', label: '사선' },
  { value: 'vertical', label: '세로선' },
]

const QUOTE_TYPES = [
  { value: 'quotemark', label: '따옴표' },
  { value: 'vertical', label: '버티컬 라인' },
  { value: 'speech', label: '말풍선' },
  { value: 'linequote', label: '라인&따옴표' },
  { value: 'postit', label: '포스트잇' },
  { value: 'frame', label: '프레임' },
]

// 스텝 정의
const STEPS = [
  { id: 1, label: '자료 업로드', icon: Upload },
  { id: 2, label: '분석 & 요약', icon: ClipboardCheck },
  { id: 3, label: '블로그 생성', icon: PenTool },
  { id: 4, label: '미리보기', icon: Eye },
]

export default function BlogTestPage() {
  // 스텝 관리
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)

  // Step 1: 파일 업로드
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [inputMode, setInputMode] = useState('file') // 'file' | 'text'
  const fileInputRef = useRef(null)

  // Step 2: 분석 & 요약
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)
  const [showParsedText, setShowParsedText] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  // Step 3: 블로그 생성
  const [blogContent, setBlogContent] = useState(null)
  const [emphasis, setEmphasis] = useState('')
  const [dividerStyle, setDividerStyle] = useState('diamond')
  const [quoteStyle, setQuoteStyle] = useState('quotemark')

  // Step 4: 미리보기
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const blogImagesRef = useRef([])
  const [blogPngUrls, setBlogPngUrls] = useState([])
  const [blogImages, setBlogImages] = useState(null) // Flux 생성 배경 이미지
  const [imageLoading, setImageLoading] = useState(false)

  // 카드 이미지용 텍스트에서 ** 제거
  const stripBold = (text) => (text || '').replace(/\*{1,3}/g, '')

  // 카드 제목을 2줄로 분리 (15자 이상이면 반드시 2줄)
  const splitHeading = (text) => {
    if (!text) return [text]

    // 특수문자(&, :, ,) 기준 분할 시도
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

    // 특수문자로 나눌 수 있으면 중간 지점에서 분리
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

    // 15자 이상이면 공백 기준으로 단어 단위 2줄 분리
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

  // 카드 제목 렌더링 (2줄 분리 + 단어 단위 줄바꿈)
  const renderCardHeading = (text, fontSize) => {
    const lines = splitHeading(text)
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

  // 마크다운 정리
  const normalizeMd = (text) => {
    if (!text) return ''
    return text
      .replace(/\*{3,}([^*]+?)\*{3,}/g, '<strong>$1</strong>')
      .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<strong>$1</strong>')
      .replace(/\*{2,}/g, '')
  }

  // 이미지 PNG 변환
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

  useEffect(() => {
    if (blogContent && currentStep === 4 && blogPngUrls.length === 0) {
      const timer = setTimeout(() => convertBlogImagesToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [blogContent, currentStep, blogImages])

  // ── Step 1: 파일 처리 ──
  const handleFile = (f) => {
    const supportedExts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && supportedExts.includes(ext)) {
      setFile(f)
      setError(null)
    } else {
      setError('지원되는 파일 형식: PDF, HWP, DOCX, PPTX')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── Step 2: 분석 & 요약 (한번에) ──
  const runAnalysis = async () => {
    setLoading(p => ({ ...p, analysis: true }))
    setError(null)
    setParsedText('')
    setVerification(null)
    setSummary(null)
    setBlogContent(null)
    setBlogPngUrls([])
    blogImagesRef.current = []

    try {
      // 텍스트 직접 입력 모드
      let text = ''
      if (inputMode === 'text') {
        if (!textInput.trim()) throw new Error('텍스트를 입력해주세요.')
        text = textInput.trim()
      } else {
        if (!file) throw new Error('파일을 먼저 업로드해주세요.')
        text = await parsePDF(file)
      }
      setParsedText(text)

      // 검증
      const verified = await verifyParsedContent(text)
      setVerification(verified)
      let cleaned = (verified.correctedText || text)
        .replace(/^#{1,3}\s*(발견된\s*이슈|수정된\s*텍스트|수정\s*내역|교정\s*결과|검증\s*결과).*\n*/gm, '')
        .replace(/^\*\*(발견된\s*이슈|수정된\s*텍스트|수정\s*내역|교정\s*결과).*\n*/gm, '')
        .replace(/^---+\s*\n*/gm, '')
        .replace(/^\n{3,}/gm, '\n\n')
        .trim()
      setParsedText(cleaned)

      // 요약
      const summaryResult = await summarizeContent(cleaned)
      if (summaryResult.title === '요약 생성 실패') {
        throw new Error('요약 결과를 파싱하지 못했습니다. 다시 시도해주세요.')
      }
      setSummary(summaryResult)
      setCurrentStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(p => ({ ...p, analysis: false }))
    }
  }

  // ── Step 3: 블로그 글 생성 ──
  const runBlogGeneration = async () => {
    setLoading(p => ({ ...p, blog: true }))
    setError(null)
    setBlogContent(null)
    setBlogImages(null)
    setBlogPngUrls([])
    blogImagesRef.current = []

    try {
      const result = await generateBlogContent(summary, parsedText, emphasis)
      if (!result || result.title === '블로그 생성 실패') {
        throw new Error('블로그 콘텐츠 생성에 실패했습니다. 다시 시도해주세요.')
      }

      const enriched = {
        ...result,
        sections: result.sections?.map((s) => ({
          ...s,
          quote: { type: quoteStyle, text: s.keyPhrase || s.heading },
          divider: dividerStyle,
        }))
      }
      setBlogContent(enriched)
      setCurrentStep(4)

      // 블로그 이미지 배경 생성 (백그라운드)
      if (result.sections?.length) {
        setImageLoading(true)
        generateBlogImages(result.sections).then(imgs => {
          setBlogImages(imgs)
          setBlogPngUrls([]) // 배경 변경 시 PNG 캐시 초기화
          blogImagesRef.current = []
        }).catch(err => {
          console.error('블로그 이미지 생성 실패:', err)
        }).finally(() => setImageLoading(false))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(p => ({ ...p, blog: false }))
    }
  }

  // ── 유틸리티 ──
  const copy = (text, { richText = false } = {}) => {
    if (richText) {
      const normalized = normalizeMd(text)
      const html = normalized.includes('<strong>') ? normalized.replace(/\n/g, '<br>') : marked.parse(normalized)
      const blob = new Blob([html], { type: 'text/html' })
      const plainBlob = new Blob([text], { type: 'text/plain' })
      navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })])
    } else {
      navigator.clipboard.writeText(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadAllImages = async () => {
    setDownloading(true)
    try {
      for (let idx = 0; idx < (blogPngUrls.length || blogImagesRef.current.length); idx++) {
        const url = blogPngUrls[idx]
        if (url) {
          const link = document.createElement('a')
          link.download = `블로그_${idx + 1}.png`
          link.href = url
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        } else {
          const el = blogImagesRef.current[idx]
          if (!el) continue
          const dataUrl = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
          const link = document.createElement('a')
          link.download = `블로그_${idx + 1}.png`
          link.href = dataUrl
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
        await new Promise(r => setTimeout(r, 300))
      }
    } catch (err) {
      console.error('다운로드 실패:', err)
    }
    setDownloading(false)
  }

  // 섹션 스타일 변경
  const updateSectionStyle = (sectionIdx, field, value) => {
    setBlogContent(prev => {
      if (!prev) return prev
      const newSections = [...prev.sections]
      if (field === 'divider') {
        newSections[sectionIdx] = { ...newSections[sectionIdx], divider: value }
      } else if (field === 'quoteType') {
        newSections[sectionIdx] = {
          ...newSections[sectionIdx],
          quote: { ...newSections[sectionIdx].quote, type: value }
        }
      } else if (field === 'quoteText') {
        newSections[sectionIdx] = {
          ...newSections[sectionIdx],
          quote: { ...newSections[sectionIdx].quote, text: value }
        }
      }
      return { ...prev, sections: newSections }
    })
  }

  const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
  const labels = ['INSIGHT', 'STUDY TIP', 'CORE', 'CHECK LIST', 'KEY POINT']
  const accentColor = '#e57a00'

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <FileText size={22} className="text-primary-light" />
          블로그 글 작성
        </h1>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isDone = step.id < currentStep
          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => { if (isDone) setCurrentStep(step.id) }}
                disabled={!isDone && !isActive}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full justify-center
                  ${isActive ? 'bg-primary/15 text-primary-light' : isDone ? 'text-success hover:bg-success/5 cursor-pointer' : 'text-text-muted opacity-50'}`}
              >
                {isDone ? <CheckCircle size={14} /> : <Icon size={14} />}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {i < STEPS.length - 1 && <ArrowRight size={12} className="text-text-muted mx-1 shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
        </div>
      )}

      {/* ═══════ Step 1: 자료 업로드 ═══════ */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 1 ? 'border-primary/40' : 'border-border'} ${currentStep > 1 ? '' : ''}`}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">1</div>
            <h2 className="text-sm font-semibold text-text">자료 입력</h2>
            {currentStep > 1 && file && <span className="text-xs text-success ml-auto">{file.name}</span>}
            {currentStep > 1 && inputMode === 'text' && <span className="text-xs text-success ml-auto">텍스트 입력 완료</span>}
          </div>

          {currentStep === 1 && (
            <>
              {/* 입력 모드 토글 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setInputMode('file')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${inputMode === 'file' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-light text-text-muted border-border'}`}
                >
                  파일 업로드
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${inputMode === 'text' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-light text-text-muted border-border'}`}
                >
                  텍스트 직접 입력
                </button>
              </div>

              {inputMode === 'file' ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                    ${isDragging ? 'border-primary bg-primary/5' : file ? 'border-success/40 bg-success/5' : 'border-border hover:border-primary/40'}`}
                >
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle size={18} className="text-success" />
                      <span className="text-sm font-medium text-text">{file.name}</span>
                      <span className="text-xs text-text-muted">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={28} className="mx-auto text-text-muted mb-2" />
                      <p className="text-sm text-text-muted">파일을 드래그하거나 클릭하여 업로드</p>
                      <p className="text-xs text-text-muted mt-1">PDF, HWP, DOCX, PPTX 지원</p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  placeholder="블로그로 작성할 원본 자료를 붙여넣으세요..."
                  className="w-full h-48 bg-background text-text text-sm p-4 rounded-xl border border-border focus:border-primary/50 focus:outline-none resize-y"
                />
              )}

              <button
                onClick={runAnalysis}
                disabled={loading.analysis || (inputMode === 'file' ? !file : !textInput.trim())}
                className="w-full mt-4 px-4 py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading.analysis ? <><Loader2 size={16} className="animate-spin" /> 분석 중...</> : <><Sparkles size={16} /> 자료 분석 시작</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══════ Step 2: 분석 & 요약 결과 ═══════ */}
      {currentStep >= 2 && (
        <div className={`bg-surface rounded-xl border transition-all ${currentStep === 2 ? 'border-primary/40' : 'border-border'}`}>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">2</div>
              <h2 className="text-sm font-semibold text-text">분석 & 요약</h2>
              {loading.analysis && <Loader2 size={14} className="text-primary animate-spin ml-auto" />}
              {summary && !loading.analysis && <CheckCircle size={14} className="text-success ml-auto" />}
            </div>

            {loading.analysis && (
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg">
                <Loader2 size={18} className="text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium text-text">자료를 분석하고 있습니다...</p>
                  <p className="text-xs text-text-muted mt-0.5">PDF 파싱 → 데이터 검증 → 핵심 요약</p>
                </div>
              </div>
            )}

            {/* 분석 텍스트 토글 */}
            {parsedText && !loading.analysis && (
              <div className="space-y-3">
                <button onClick={() => setShowParsedText(!showParsedText)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors">
                  {showParsedText ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  추출된 텍스트 {showParsedText ? '접기' : '보기'} ({parsedText.length.toLocaleString()}자)
                  {verification && <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${verification.isValid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    신뢰도 {Math.round((verification.confidence || 0) * 100)}%
                  </span>}
                </button>
                {showParsedText && (
                  <div className="bg-background rounded-lg border border-border p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-text-muted whitespace-pre-wrap">{parsedText.slice(0, 3000)}{parsedText.length > 3000 ? '\n\n... (이하 생략)' : ''}</pre>
                  </div>
                )}
              </div>
            )}

            {/* 요약 결과 */}
            {summary && !loading.analysis && (
              <div className="space-y-3 mt-3">
                <button onClick={() => setShowSummary(!showSummary)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors">
                  {showSummary ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  요약 결과 {showSummary ? '접기' : '보기'}
                </button>
                {showSummary && (
                  <div className="bg-background rounded-lg border border-border p-4 space-y-3">
                    <h3 className="text-sm font-bold text-text">{summary.title}</h3>
                    <p className="text-xs text-text-muted leading-relaxed">{summary.summary}</p>
                    {summary.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.keywords.map((kw, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 bg-primary/10 text-primary-light rounded-full">{kw}</span>
                        ))}
                      </div>
                    )}
                    {summary.insights?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-text">주요 인사이트</p>
                        {summary.insights.map((ins, i) => (
                          <p key={i} className="text-xs text-text-muted flex gap-1.5">
                            <span className="text-primary shrink-0">•</span>{ins}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Step 3: 블로그 생성 설정 ═══════ */}
      {currentStep >= 3 && (
        <div className={`bg-surface rounded-xl border transition-all ${currentStep === 3 ? 'border-primary/40' : 'border-border'}`}>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold">3</div>
              <h2 className="text-sm font-semibold text-text">블로그 글 생성</h2>
              {blogContent && <CheckCircle size={14} className="text-success ml-auto" />}
            </div>

            {currentStep === 3 && (
              <div className="space-y-4">
                {/* 강조 사항 */}
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1.5 block">강조하고 싶은 내용 (선택)</label>
                  <input
                    value={emphasis}
                    onChange={e => setEmphasis(e.target.value)}
                    placeholder="예: 생성형 AI의 성장률에 초점을 맞춰주세요"
                    className="w-full text-sm bg-background text-text px-4 py-2.5 rounded-lg border border-border focus:border-primary/50 focus:outline-none"
                  />
                </div>

                {/* 기본 스타일 설정 (비활성화)
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-text-muted mb-1.5 block">구분선 스타일</label>
                    <select value={dividerStyle} onChange={e => setDividerStyle(e.target.value)} className="w-full text-sm bg-background text-text px-3 py-2 rounded-lg border border-border">
                      {DIVIDER_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-text-muted mb-1.5 block">인용구 스타일</label>
                    <select value={quoteStyle} onChange={e => setQuoteStyle(e.target.value)} className="w-full text-sm bg-background text-text px-3 py-2 rounded-lg border border-border">
                      {QUOTE_TYPES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex gap-6">
                    <div className="flex-1">
                      <span className="text-[10px] text-gray-400 mb-1 block">구분선 미리보기</span>
                      <BlogDivider type={dividerStyle} />
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] text-gray-400 mb-1 block">인용구 미리보기</span>
                      <BlogQuote type={quoteStyle}>미리보기 텍스트입니다.</BlogQuote>
                    </div>
                  </div>
                </div>
                */}

                <button
                  onClick={runBlogGeneration}
                  disabled={loading.blog}
                  className="w-full px-4 py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading.blog ? <><Loader2 size={16} className="animate-spin" /> 블로그 글 생성 중...</> : <><PenTool size={16} /> 블로그 글 생성</>}
                </button>
              </div>
            )}

            {currentStep > 3 && blogContent && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-success">"{blogContent.title}" 생성 완료</span>
                <button onClick={() => { setCurrentStep(3); setBlogContent(null); setBlogPngUrls([]); blogImagesRef.current = [] }}
                  className="text-xs text-text-muted hover:text-primary ml-auto flex items-center gap-1">
                  <RefreshCw size={10} /> 재생성
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Step 4: 블로그 미리보기 ═══════ */}
      {currentStep >= 4 && blogContent && (
        <>
          {/* 섹션별 스타일 편집 (비활성화)
          <div className="bg-surface rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-text mb-3">섹션별 스타일 편집</h3>
            <div className="space-y-2">
              {blogContent.sections?.map((section, i) => (
                <div key={i} className="flex items-center gap-3 bg-background rounded-lg px-3 py-2">
                  <span className="text-xs text-text-muted w-32 truncate shrink-0">{section.heading}</span>
                  <select value={section.divider || 'diamond'} onChange={e => updateSectionStyle(i, 'divider', e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-surface flex-1">
                    <option value="">구분선 없음</option>
                    {DIVIDER_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <select value={section.quote?.type || 'quotemark'} onChange={e => updateSectionStyle(i, 'quoteType', e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-surface flex-1">
                    {QUOTE_TYPES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          */}

          {/* 블로그 미리보기 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-10">
            <article className="max-w-3xl mx-auto">
              {/* 블로그 헤더 */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{blogContent.title}</h1>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button onClick={downloadAllImages} disabled={downloading}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors">
                    <Download size={12} /> {downloading ? '저장중...' : '이미지 저장'}
                  </button>
                  <button onClick={() => copy(blogContent.sections?.map(s => `## ${s.heading}\n${s.content}`).join('\n\n'), { richText: true })}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors">
                    {copied ? <CheckCircle size={12} /> : <Copy size={12} />} {copied ? '복사됨' : '복사'}
                  </button>
                </div>
              </div>

              {/* 이미지 생성 로딩 */}
              {imageLoading && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg mb-4">
                  <Loader2 size={14} className="text-primary animate-spin" />
                  <p className="text-xs text-primary">배경 이미지 생성 중... (완료되면 자동 적용됩니다)</p>
                </div>
              )}

              {/* 블로그 본문 */}
              <div className="space-y-2">
                {(() => {
                  const firstImage = blogImages?.find(img => img.imageUrl)
                  return blogContent.sections?.map((section, i) => {
                    const image = blogImages?.find(img => img.heading === section.heading)
                    const bgImageUrl = firstImage?.imageUrl || image?.imageUrl
                    const hasOverlayImg = !!bgImageUrl
                    const keyword = stripBold(image?.keyPhrase || section.keyPhrase || section.heading)
                    const headingClean = stripBold(section.heading)
                    const isFirst = i === 0

                    return (
                      <section key={i}>
                        <h2 className="text-lg font-bold text-gray-900 mb-4">{headingClean}</h2>

                        {/* 섹션 이미지 카드 */}
                        <div className="mb-5">
                          {blogPngUrls[i] ? (
                            <img src={blogPngUrls[i]} alt={headingClean} className="w-full rounded-xl shadow-sm" />
                          ) : (
                            <div ref={el => blogImagesRef.current[i] = el} className="w-full aspect-square rounded-xl relative overflow-hidden shadow-sm" style={{ fontFamily: "'Pretendard', sans-serif" }}>
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
                                      {(blogContent.tags || []).slice(0, 3).map((tag, ti) => (
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
                          )}
                        </div>

                      {/* 인용구 (비활성화)
                      {section.quote?.text && (
                        <BlogQuote type={section.quote.type}>{section.quote.text}</BlogQuote>
                      )} */}

                      {/* 본문 */}
                      <div className="text-[15px] text-gray-700 leading-8 max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
                            h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-5 mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-[15px] font-bold text-gray-800 mt-4 mb-2">{children}</h3>,
                            ul: ({ children }) => <ul className="list-disc pl-5 my-3 space-y-1.5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1.5">{children}</ol>,
                            li: ({ children }) => <li className="text-gray-700">{children}</li>,
                            p: ({ children }) => <p className="mb-3">{children}</p>,
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 py-1 my-3 text-gray-600">{children}</blockquote>,
                            table: ({ children }) => (
                              <div className="my-4 overflow-x-auto">
                                <table className="w-full text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                            th: ({ children }) => <th className="px-4 py-2.5 text-left font-semibold text-gray-700 border border-gray-200">{children}</th>,
                            td: ({ children }) => <td className="px-4 py-2.5 text-gray-600 border border-gray-200">{children}</td>,
                          }}
                        >{normalizeMd(section.content)}</ReactMarkdown>
                      </div>

                      {/* 구분선 (비활성화)
                      {i < blogContent.sections.length - 1 && section.divider && (
                        <BlogDivider type={section.divider} />
                      )} */}
                    </section>
                    )
                  })
                })()}
              </div>

              {/* 태그 */}
              {blogContent.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-100">
                  {blogContent.tags.map((tag, i) => {
                    const cleanTag = tag.replace(/^#/, '')
                    return (
                      <span
                        key={i}
                        onClick={() => { navigator.clipboard.writeText(cleanTag); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                        className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-full flex items-center gap-1 hover:bg-green-100 transition-colors cursor-pointer active:scale-95"
                        title="클릭하면 태그가 복사됩니다"
                      >
                        <Hash size={10} />{cleanTag}
                      </span>
                    )
                  })}
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </div>
  )
}
