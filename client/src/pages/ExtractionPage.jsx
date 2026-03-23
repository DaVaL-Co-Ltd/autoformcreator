import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, Eye, ArrowRight, Film, Video, Mic,
  XCircle, AlertTriangle, RefreshCw
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generateBlogContent, generateNewsletterContent, generateInstagramContent,
  generateShortsScript, generateLongformScript
} from '../services/claude'
import { generateBlogImages, generateInstagramImages } from '../services/flux'
// storage import removed - 저장은 ExtractionResultPage에서 자동 수행
import { generateNarrationForScenes, generateFullNarration } from '../services/elevenlabs'
import { generateLongformVideo } from '../services/creatomate'

const steps = [
  { id: 1, label: 'PDF 업로드', icon: Upload, desc: '분석할 PDF 파일을 업로드하세요' },
  { id: 2, label: '문서 분석', icon: Brain, desc: 'Gemini 멀티모달 PDF 분석 + 검증' },
  { id: 3, label: '핵심 요약', icon: FileText, desc: 'Gemini 2.5 Flash 요약' },
  { id: 4, label: '콘텐츠 생성', icon: PenTool, desc: 'Gemini 2.5 Flash 텍스트 + 대본' },
  { id: 5, label: '미디어 생성', icon: ImageIcon, desc: 'Flux 이미지 + ElevenLabs 나레이션 + Creatomate 영상' },
]

// AI 서비스별 아이콘/색상 매핑
const aiServiceInfo = {
  llamaparse: { name: 'LlamaParse', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  gemini: { name: 'Gemini 2.5 Flash', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  claude: { name: 'Claude 3.5 Sonnet', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
  flux: { name: 'Flux', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
  elevenlabs: { name: 'ElevenLabs', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  creatomate: { name: 'Creatomate', color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20' },
}

function ErrorPanel({ errors, onRetry, retrying }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="mx-5 mb-4 space-y-2">
      {errors.map((err, i) => {
        const service = aiServiceInfo[err.service] || { name: err.service, color: 'text-danger', bg: 'bg-danger/10 border-danger/20' }
        const isRetrying = retrying === `${err.service}-${err.channel}`
        const canRetry = onRetry && !err.noRetry
        return (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isRetrying ? 'bg-primary/5 border-primary/20' : service.bg}`}>
            {isRetrying
              ? <Loader2 size={16} className="text-primary shrink-0 mt-0.5 animate-spin" />
              : <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${service.color}`}>{service.name}</span>
                <span className="text-xs text-text-muted">{err.channel ? `(${err.channel})` : ''}</span>
              </div>
              <p className="text-xs text-text-muted break-words">{isRetrying ? '재시도 중...' : err.message}</p>
            </div>
            {canRetry && !isRetrying && (
              <button
                onClick={() => onRetry(err)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all shrink-0"
                title="재시도"
              >
                <RefreshCw size={11} />
                재시도
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ExtractionPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState({})
  const [stepErrors, setStepErrors] = useState({})

  // Data states
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)
  const [blogContent, setBlogContent] = useState(null)
  const [newsletterContent, setNewsletterContent] = useState(null)
  const [instagramContent, setInstagramContent] = useState(null)
  const [shortsScript, setShortsScript] = useState(null)
  const [longformScript, setLongformScript] = useState(null)
  const [blogImages, setBlogImages] = useState(null)
  const [instagramImages, setInstagramImages] = useState(null)
  const [shortsNarration, setShortsNarration] = useState(null)
  const [longformNarration, setLongformNarration] = useState(null)
  const [longformVideo, setLongformVideo] = useState(null)

  const [retrying, setRetrying] = useState(null) // 'service-channel' 형태

  const setStepLoading = (step, val) => setLoading(p => ({ ...p, [step]: val }))
  const addStepErrors = (step, errs) => setStepErrors(p => ({ ...p, [step]: errs }))
  const clearStepErrors = (step) => setStepErrors(p => ({ ...p, [step]: null }))
  const removeStepError = (step, service, channel) => {
    setStepErrors(p => ({
      ...p,
      [step]: (p[step] || []).filter(e => !(e.service === service && e.channel === channel))
    }))
  }

  const handleFile = (f) => {
    if (f && f.type === 'application/pdf') {
      setFile(f)
      setCurrentStep(2)
      clearStepErrors('upload')
    } else {
      addStepErrors('upload', [{ service: 'upload', message: 'PDF 파일만 업로드 가능합니다.' }])
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleFileInput = (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0])
  }

  // Step 2: LlamaParse + Gemini 병렬 분석 → 통합 → Gemini 검증
  const runAnalysis = async () => {
    setStepLoading('analysis', true)
    clearStepErrors('analysis')
    const errors = []

    // Phase 1: LlamaParse + Gemini 병렬 분석 → 자동 통합
    let text = ''
    try {
      text = await parsePDF(file)
      setParsedText(text)
    } catch (err) {
      errors.push({ service: 'gemini', message: `PDF 분석 실패 - ${err.message}` })
      addStepErrors('analysis', errors)
      setStepLoading('analysis', false)
      return
    }

    // Phase 2: Gemini 검증
    try {
      const verified = await verifyParsedContent(text)
      setVerification(verified)
      setParsedText(verified.correctedText || text)
    } catch (err) {
      errors.push({ service: 'gemini', message: `데이터 검증 실패 - ${err.message}` })
      setVerification({ isValid: false, issues: ['Gemini 검증을 건너뛰었습니다.'], confidence: 0 })
    }

    if (errors.length > 0) addStepErrors('analysis', errors)
    setCurrentStep(3)
    setStepLoading('analysis', false)
  }

  // Step 3: Summarize (Gemini)
  const runSummary = async () => {
    setStepLoading('summary', true)
    clearStepErrors('summary')
    try {
      const result = await summarizeContent(parsedText)
      setSummary(result)
      setCurrentStep(4)
    } catch (err) {
      addStepErrors('summary', [{ service: 'gemini', message: `요약 생성 실패 - ${err.message}` }])
    } finally {
      setStepLoading('summary', false)
    }
  }

  // Step 4: Generate all text content (Claude - 5채널 개별 추적)
  const runContentGeneration = async () => {
    setStepLoading('content', true)
    clearStepErrors('content')

    const tasks = [
      { key: 'blog', label: '블로그', fn: () => generateBlogContent(summary, parsedText), setter: setBlogContent },
      { key: 'newsletter', label: '뉴스레터', fn: () => generateNewsletterContent(summary, parsedText), setter: setNewsletterContent },
      { key: 'instagram', label: '인스타그램', fn: () => generateInstagramContent(summary, parsedText), setter: setInstagramContent },
      { key: 'shorts', label: '숏폼 대본', fn: () => generateShortsScript(summary, parsedText), setter: setShortsScript },
      { key: 'longform', label: '롱폼 대본', fn: () => generateLongformScript(summary, parsedText), setter: setLongformScript },
    ]

    // 순차 실행 (Gemini 무료 티어 분당 2회 제한 대응)
    const errors = []
    let anySuccess = false
    const generated = {}

    for (const task of tasks) {
      try {
        const result = await task.fn()
        task.setter(result)
        generated[task.key] = result
        anySuccess = true
      } catch (err) {
        errors.push({ service: 'gemini', channel: task.label, message: err.message || '생성 실패' })
      }
    }

    if (errors.length > 0) addStepErrors('content', errors)
    if (anySuccess) {
      setCurrentStep(5)
    }

    setStepLoading('content', false)
  }

  // Step 4 재시도: 실패한 채널만 다시 생성
  const retryContentChannel = async (err) => {
    const retryKey = `${err.service}-${err.channel}`
    setRetrying(retryKey)

    const channelMap = {
      '블로그': { key: 'blog', fn: () => generateBlogContent(summary, parsedText), setter: setBlogContent },
      '뉴스레터': { key: 'newsletter', fn: () => generateNewsletterContent(summary, parsedText), setter: setNewsletterContent },
      '인스타그램': { key: 'instagram', fn: () => generateInstagramContent(summary, parsedText), setter: setInstagramContent },
      '숏폼 대본': { key: 'shorts', fn: () => generateShortsScript(summary, parsedText), setter: setShortsScript },
      '롱폼 대본': { key: 'longform', fn: () => generateLongformScript(summary, parsedText), setter: setLongformScript },
    }

    const task = channelMap[err.channel]
    if (!task) { setRetrying(null); return }

    try {
      const result = await task.fn()
      task.setter(result)
      removeStepError('content', err.service, err.channel)
      // 성공하면 다음 단계로
      if (currentStep < 5) setCurrentStep(5)
    } catch (retryErr) {
      // 에러 메시지 업데이트
      setStepErrors(p => ({
        ...p,
        content: (p.content || []).map(e =>
          e.service === err.service && e.channel === err.channel
            ? { ...e, message: retryErr.message || '재시도 실패' }
            : e
        )
      }))
    } finally {
      setRetrying(null)
    }
  }

  // Step 5: Generate media (Flux + ElevenLabs + Creatomate 개별 추적)
  const runMediaGeneration = async () => {
    setStepLoading('media', true)
    clearStepErrors('media')
    const errors = []

    // 이미지 생성 (Flux만 실행 - ElevenLabs/Creatomate는 유료 플랜 필요)
    const tasks = [
      {
        key: 'blogImg', service: 'gemini', channel: '블로그 이미지',
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections) : Promise.resolve([]),
      },
      {
        key: 'instaImg', service: 'gemini', channel: '인스타 이미지',
        fn: () => instagramContent?.cards ? generateInstagramImages(instagramContent.cards) : Promise.resolve([]),
      },
    ]

    // ElevenLabs/Creatomate 안내 메시지 (재시도 불가)
    errors.push({ service: 'elevenlabs', channel: '나레이션', message: '무료 플랜에서는 API 음성 사용 불가 - 유료 플랜 업그레이드 필요', noRetry: true })
    errors.push({ service: 'creatomate', channel: '롱폼 영상', message: '템플릿 설정 필요 - Creatomate 대시보드에서 템플릿 생성 후 사용 가능', noRetry: true })

    const results = await Promise.allSettled(tasks.map(t => t.fn()))

    results.forEach((r, i) => {
      const task = tasks[i]
      if (r.status === 'fulfilled') {
        const setters = {
          blogImg: setBlogImages,
          instaImg: setInstagramImages,
          shortsNarr: setShortsNarration,
          longformNarr: setLongformNarration,
          longformVid: setLongformVideo,
        }
        setters[task.key](r.value)
      } else {
        errors.push({ service: task.service, channel: task.channel, message: r.reason?.message || '생성 실패' })
      }
    })

    if (errors.length > 0) addStepErrors('media', errors)
    setStepLoading('media', false)
  }

  // Step 5 재시도: 실패한 미디어만 다시 생성
  const retryMediaItem = async (err) => {
    const retryKey = `${err.service}-${err.channel}`
    setRetrying(retryKey)

    const mediaMap = {
      '블로그 이미지': {
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections) : Promise.resolve([]),
        setter: setBlogImages,
      },
      '인스타 이미지': {
        fn: () => instagramContent?.cards ? generateInstagramImages(instagramContent.cards) : Promise.resolve([]),
        setter: setInstagramImages,
      },
      '숏폼 나레이션': {
        fn: () => shortsScript?.scenes ? generateNarrationForScenes(shortsScript.scenes) : Promise.resolve(null),
        setter: setShortsNarration,
      },
      '롱폼 나레이션': {
        fn: () => {
          if (longformScript?.fullNarrationText) return generateFullNarration(longformScript.fullNarrationText)
          if (longformScript?.sections) return generateFullNarration(longformScript.sections.map(s => s.narration).join('\n\n'))
          return Promise.resolve(null)
        },
        setter: setLongformNarration,
      },
      '롱폼 영상': {
        fn: () => longformScript ? generateLongformVideo(longformScript) : Promise.resolve(null),
        setter: setLongformVideo,
      },
    }

    const task = mediaMap[err.channel]
    if (!task) { setRetrying(null); return }

    try {
      const result = await task.fn()
      task.setter(result)
      removeStepError('media', err.service, err.channel)
    } catch (retryErr) {
      setStepErrors(p => ({
        ...p,
        media: (p.media || []).map(e =>
          e.service === err.service && e.channel === err.channel
            ? { ...e, message: retryErr.message || '재시도 실패' }
            : e
        )
      }))
    } finally {
      setRetrying(null)
    }
  }

  // Step 2 재시도
  const retryAnalysis = async () => {
    clearStepErrors('analysis')
    await runAnalysis()
  }

  // Step 3 재시도
  const retrySummary = async () => {
    clearStepErrors('summary')
    await runSummary()
  }

  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(f)
  })

  const viewResults = async () => {
    let fileBase64 = null
    if (file) {
      try { fileBase64 = await fileToBase64(file) } catch {}
    }
    navigate('/extraction/result', {
      state: {
        parsedText, verification, summary,
        blogContent, newsletterContent, instagramContent,
        shortsScript, longformScript,
        blogImages, instagramImages,
        shortsNarration, longformNarration,
        longformVideo,
        fileName: file?.name,
        fileBase64,
      }
    })
  }

  const hasAnyContent = blogContent || newsletterContent || instagramContent || shortsScript || longformScript
  const hasAnyResult = parsedText || summary || hasAnyContent

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Step Progress */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-text">콘텐츠 추출 파이프라인</h3>
          <span className="text-xs text-text-muted">Step {currentStep} / 5</span>
        </div>
        <div className="flex items-center gap-1 mt-4">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = step.id === currentStep
            const isDone = step.id < currentStep
            const hasError = stepErrors[['upload', 'upload', 'analysis', 'summary', 'content', 'media'][step.id]]?.length > 0
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                    ${isDone && !hasError ? 'bg-success/20 text-success' :
                      isDone && hasError ? 'bg-warning/20 text-warning' :
                      isActive ? 'bg-primary/20 text-primary ring-2 ring-primary/30' :
                      'bg-surface-light text-text-muted'}`}>
                    {isDone && !hasError ? <CheckCircle size={18} /> :
                     isDone && hasError ? <AlertTriangle size={18} /> :
                     <Icon size={18} />}
                  </div>
                  <span className={`text-xs mt-2 font-medium ${isActive ? 'text-primary-light' : isDone ? (hasError ? 'text-warning' : 'text-success') : 'text-text-muted'}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight size={14} className={`mx-1 shrink-0 ${isDone ? 'text-success' : 'text-border'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step 1: PDF Upload */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 1 ? 'border-primary/40' : 'border-border'}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${file ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <Upload size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 1. PDF 업로드</h3>
              <p className="text-xs text-text-muted">분석할 PDF 파일을 업로드하세요</p>
            </div>
          </div>
          {file && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 업로드 완료</span>}
        </div>
        <div className="p-5">
          {!file ? (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf" onChange={handleFileInput} />
              <Upload size={28} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text">파일을 드래그하거나 <span className="text-primary font-medium">클릭</span>하여 업로드</p>
              <p className="text-xs text-text-muted mt-1">PDF 파일만 지원</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-success/5 rounded-lg border border-success/20">
              <FileText size={24} className="text-success" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text">{file.name}</p>
                <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={() => { setFile(null); setCurrentStep(1) }} className="text-xs text-text-muted hover:text-danger transition-colors">
                변경
              </button>
            </div>
          )}
        </div>
        <ErrorPanel errors={stepErrors.upload} />
      </div>

      {/* Step 2: Analysis */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 2 ? 'border-primary/40' : 'border-border'} ${currentStep < 2 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${verification ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <Brain size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 2. 문서 분석</h3>
              <p className="text-xs text-text-muted">Gemini 2.5 Flash 멀티모달로 PDF 직접 분석 → 데이터 검증</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {verification && (
              <span className={`text-xs font-medium flex items-center gap-1 ${verification.confidence > 0 ? 'text-success' : 'text-warning'}`}>
                {verification.confidence > 0 ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                검증 {verification.confidence > 0 ? '완료' : '부분 완료'} (신뢰도: {Math.round((verification.confidence || 0) * 100)}%)
              </span>
            )}
            {currentStep === 2 && (
              <button
                onClick={runAnalysis}
                disabled={loading.analysis}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.analysis ? <><Loader2 size={14} className="animate-spin" /> 분석중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {(parsedText || verification) && (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full font-medium text-orange-400 bg-orange-400/10">LlamaParse</span>
              <span className="text-xs text-text-muted">+</span>
              <span className="text-xs px-2 py-1 rounded-full font-medium text-blue-400 bg-blue-400/10">Gemini OCR</span>
              <span className="text-xs text-text-muted">→</span>
              <span className="text-xs px-2 py-1 rounded-full font-medium text-primary-light bg-primary/10">통합 결과</span>
              {verification && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${verification.isValid ? 'text-success bg-success/10' : 'text-warning bg-warning/10'}`}>
                  검증 {verification.isValid ? '통과' : '일부 수정'}
                </span>
              )}
            </div>

            {verification?.issues?.length > 0 && (
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                <p className="text-xs font-medium text-warning mb-1">발견된 이슈:</p>
                <ul className="text-xs text-text-muted space-y-1">
                  {verification.issues.map((issue, i) => <li key={i}>- {issue}</li>)}
                </ul>
              </div>
            )}

            <div className="bg-surface-light rounded-lg p-3 max-h-96 overflow-y-auto">
              <p className="text-xs text-text-muted whitespace-pre-wrap">{parsedText}</p>
            </div>
          </div>
        )}
        <ErrorPanel errors={stepErrors.analysis} onRetry={retryAnalysis} retrying={retrying} />
      </div>

      {/* Step 3: Summary */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 3 ? 'border-primary/40' : 'border-border'} ${currentStep < 3 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${summary ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <FileText size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 3. 핵심 요약</h3>
              <p className="text-xs text-text-muted">Gemini 2.5 Flash가 핵심 데이터를 정확하게 요약</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {summary && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 요약 완료</span>}
            {currentStep === 3 && (
              <button
                onClick={runSummary}
                disabled={loading.summary}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.summary ? <><Loader2 size={14} className="animate-spin" /> 요약중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {summary && (
          <div className="p-5 space-y-4">
            <h4 className="text-sm font-semibold text-text">{summary.title}</h4>
            <p className="text-xs text-text-muted">{summary.summary}</p>

            {summary.keyData?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text mb-2">핵심 데이터:</p>
                <div className="grid grid-cols-2 gap-2">
                  {summary.keyData.map((d, i) => (
                    <div key={i} className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                      <p className="text-xs text-text-muted">{d.label}</p>
                      <p className="text-sm font-semibold text-primary-light">{d.value}</p>
                      {d.context && <p className="text-xs text-text-muted mt-0.5">{d.context}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.insights?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text mb-2">주요 인사이트:</p>
                <ul className="space-y-1">
                  {summary.insights.map((ins, i) => (
                    <li key={i} className="text-xs text-text-muted flex items-start gap-2">
                      <span className="text-primary mt-0.5">-</span> {ins}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.keywords.map((kw, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-surface-light rounded-full text-text-muted">{kw}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.summary} onRetry={retrySummary} retrying={retrying} />
      </div>

      {/* Step 4: Content Generation */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 4 ? 'border-primary/40' : 'border-border'} ${currentStep < 4 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasAnyContent ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <PenTool size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 4. 콘텐츠 생성</h3>
              <p className="text-xs text-text-muted">Gemini 2.5 Flash - 블로그/뉴스레터/인스타 텍스트 + 숏폼/롱폼 대본</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyContent && (
              <span className={`text-xs font-medium flex items-center gap-1 ${stepErrors.content?.length ? 'text-warning' : 'text-success'}`}>
                {stepErrors.content?.length ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                {5 - (stepErrors.content?.length || 0)}/5 채널 생성 완료
              </span>
            )}
            {currentStep === 4 && (
              <button
                onClick={runContentGeneration}
                disabled={loading.content}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.content ? <><Loader2 size={14} className="animate-spin" /> 생성중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {hasAnyContent && (
          <div className="p-5">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: '블로그', icon: FileText, color: 'text-primary-light bg-primary/10', data: blogContent, detail: blogContent?.title },
                { label: '뉴스레터', icon: FileText, color: 'text-success bg-success/10', data: newsletterContent, detail: newsletterContent?.subject },
                { label: '인스타그램', icon: ImageIcon, color: 'text-pink-400 bg-pink-400/10', data: instagramContent, detail: instagramContent ? `${instagramContent.cards?.length || 0}장 카드` : null },
                { label: '숏폼 대본', icon: Film, color: 'text-warning bg-warning/10', data: shortsScript, detail: shortsScript ? `${shortsScript.duration || 0}초` : null },
                { label: '롱폼 대본', icon: Video, color: 'text-info bg-info/10', data: longformScript, detail: longformScript?.estimatedDuration },
              ].map((ch, i) => {
                const Icon = ch.icon
                const failed = !ch.data && stepErrors.content?.some(e => e.channel === ch.label)
                return (
                  <div key={i} className={`rounded-lg p-3 border ${failed ? 'bg-danger/5 border-danger/20' : 'bg-surface-light border-border'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`p-1 rounded ${ch.color}`}><Icon size={14} /></span>
                      <span className="text-xs font-medium text-text">{ch.label}</span>
                    </div>
                    {ch.data ? (
                      <>
                        <p className="text-xs text-text-muted line-clamp-2">{ch.detail}</p>
                        <CheckCircle size={12} className="text-success mt-2" />
                      </>
                    ) : failed ? (
                      <div className="flex items-center gap-1 mt-1">
                        <XCircle size={12} className="text-danger" />
                        <span className="text-xs text-danger">실패</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">대기중</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <ErrorPanel errors={stepErrors.content} onRetry={retryContentChannel} retrying={retrying} />
      </div>

      {/* Step 5: Media Generation */}
      <div className={`bg-surface rounded-xl border transition-all ${currentStep === 5 ? 'border-primary/40' : 'border-border'} ${currentStep < 5 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${blogImages ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <ImageIcon size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 5. 미디어 생성</h3>
              <p className="text-xs text-text-muted">Flux 이미지 + ElevenLabs 나레이션 + Creatomate 영상</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {blogImages && (
              <span className={`text-xs font-medium flex items-center gap-1 ${stepErrors.media?.length ? 'text-warning' : 'text-success'}`}>
                {stepErrors.media?.length ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                {stepErrors.media?.length ? '부분 완료' : '생성 완료'}
              </span>
            )}
            {currentStep === 5 && !blogImages && (
              <button
                onClick={runMediaGeneration}
                disabled={loading.media}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.media ? <><Loader2 size={14} className="animate-spin" /> 생성중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
          </div>
        </div>
        {(blogImages || instagramImages || shortsNarration || longformNarration || longformVideo) && (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-5 gap-3">
              {[
                {
                  label: '블로그 이미지', service: 'gemini', icon: ImageIcon, iconColor: 'text-purple-400',
                  status: blogImages ? `${blogImages.filter(i => i.imageUrl).length}개 생성` : null,
                  ok: blogImages?.some(i => i.imageUrl),
                },
                {
                  label: '인스타 이미지', service: 'gemini', icon: ImageIcon, iconColor: 'text-purple-400',
                  status: instagramImages ? `${instagramImages.filter(i => i.imageUrl).length}개 생성` : null,
                  ok: instagramImages?.some(i => i.imageUrl),
                },
                {
                  label: '숏폼 나레이션', service: 'elevenlabs', icon: Mic, iconColor: 'text-warning',
                  status: shortsNarration ? `${shortsNarration.filter(n => n.audioUrl).length}개 생성` : null,
                  ok: shortsNarration?.some(n => n.audioUrl),
                },
                {
                  label: '롱폼 나레이션', service: 'elevenlabs', icon: Mic, iconColor: 'text-info',
                  status: longformNarration?.audioUrl ? '생성 완료' : null,
                  ok: !!longformNarration?.audioUrl,
                },
                {
                  label: '롱폼 영상', service: 'creatomate', icon: Video, iconColor: 'text-cyan-400',
                  status: longformVideo ? '생성 완료' : null,
                  ok: !!longformVideo,
                },
              ].map((item, i) => {
                const Icon = item.icon
                const failed = stepErrors.media?.some(e => e.channel === item.label)
                return (
                  <div key={i} className={`rounded-lg p-3 border ${failed ? 'bg-danger/5 border-danger/20' : 'bg-surface-light border-border'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Icon size={12} className={item.iconColor} />
                      <p className="text-xs font-medium text-text">{item.label}</p>
                    </div>
                    {item.ok ? (
                      <p className="text-xs text-success">{item.status}</p>
                    ) : failed ? (
                      <div className="flex items-center gap-1">
                        <XCircle size={10} className="text-danger" />
                        <span className="text-xs text-danger">실패</span>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">대기중</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <ErrorPanel errors={stepErrors.media} onRetry={retryMediaItem} retrying={retrying} />
      </div>

      {/* View Results Button */}
      {hasAnyResult && (
        <div className="flex justify-end">
          <button
            onClick={viewResults}
            className="px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary-dark transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Eye size={18} />
            {hasAnyContent ? '결과 상세 보기' : summary ? '요약 결과 보기' : '분석 결과 보기'}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
