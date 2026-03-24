import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, Eye, ArrowRight, Film, Video, Mic,
  XCircle, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generateAllContent, retryFailedChannels,
  generateBlogContent, generateNewsletterContent, generateInstagramContent,
  generateShortsScript, generateLongformScript
} from '../services/gemini-content'
import { generateBlogImages, generateInstagramImages } from '../services/flux'
import { generateNarrationForScenes, generateFullNarration } from '../services/elevenlabs'
import { renderVideoAndWait } from '../services/creatomate'
import { generateShortsVideos } from '../services/luma'

const steps = [
  { id: 1, label: '문서 업로드', icon: Upload, desc: '분석할 문서 파일을 업로드하세요' },
  { id: 2, label: '문서 분석', icon: Brain, desc: 'PDF 텍스트 추출 및 데이터 검증' },
  { id: 3, label: '핵심 요약', icon: FileText, desc: '핵심 데이터 요약 및 인사이트 도출' },
  { id: 4, label: '콘텐츠 생성', icon: PenTool, desc: '콘텐츠 텍스트 생성' },
  { id: 5, label: '미디어 생성', icon: ImageIcon, desc: '이미지/나레이션/영상 생성' },
]

// AI 서비스별 색상 매핑
const aiServiceInfo = {
  llamaparse: { name: 'LlamaParse', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  gemini: { name: 'Gemini', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  flux: { name: 'Flux', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
  elevenlabs: { name: 'ElevenLabs', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  creatomate: { name: 'Creatomate', color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20' },
  luma: { name: 'Luma', color: 'text-rose-400', bg: 'bg-rose-400/10 border-rose-400/20' },
}

// 데모 모드용 목업 데이터
const MOCK_DELAY = 800

const mockParsedText = `[데모 모드] 2024년 글로벌 AI 시장 분석 보고서

1. 시장 규모
- 2024년 글로벌 AI 시장 규모: $184.0B (전년 대비 +32.4%)
- 2030년 예상 시장 규모: $826.7B (CAGR 28.5%)

2. 주요 분야별 성장률
- 생성형 AI: +67.2%
- 자연어처리(NLP): +41.8%
- 컴퓨터 비전: +29.3%
- 로보틱스: +22.1%

3. 지역별 시장 점유율
- 북미: 38.2%
- 아시아태평양: 31.5%
- 유럽: 22.8%
- 기타: 7.5%

4. 주요 트렌드
- 멀티모달 AI 모델의 급부상
- 엔터프라이즈 AI 도입 가속화
- AI 규제 프레임워크 구체화
- 오픈소스 AI 생태계 확대`

const mockVerification = {
  isValid: true,
  confidence: 0.95,
  issues: [],
  correctedText: null,
}

const mockSummary = {
  title: '2024년 글로벌 AI 시장 분석 보고서 요약',
  summary: '글로벌 AI 시장은 2024년 $184.0B 규모로 전년 대비 32.4% 성장했으며, 2030년까지 $826.7B에 도달할 전망입니다.',
  keyData: [
    { label: '2024 시장 규모', value: '$184.0B', context: '전년 대비 +32.4%' },
    { label: '2030 예상 규모', value: '$826.7B', context: 'CAGR 28.5%' },
    { label: '최고 성장 분야', value: '생성형 AI', context: '+67.2% 성장' },
    { label: '최대 시장', value: '북미 38.2%', context: '아태 31.5% 추격' },
  ],
  insights: [
    '생성형 AI가 전체 AI 시장 성장을 견인하고 있으며, 67.2%의 최고 성장률을 기록',
    '아시아태평양 지역이 빠르게 북미를 추격하며 시장 점유율 31.5% 달성',
    '엔터프라이즈 AI 도입이 가속화되면서 B2B AI 솔루션 수요 급증',
  ],
  keywords: ['AI 시장', '생성형 AI', 'NLP', '컴퓨터 비전', '엔터프라이즈 AI'],
}

const mockBlogContent = {
  title: '[데모] 2024 AI 시장 트렌드: $184B 시장의 핵심 인사이트',
  metaDescription: '2024년 글로벌 AI 시장 분석 - 생성형 AI 67.2% 성장, $826.7B 전망',
  sections: [
    { heading: '시장 개요', content: '2024년 글로벌 AI 시장이 $184.0B를 달성했습니다.', imagePrompt: 'futuristic AI market growth chart' },
    { heading: '분야별 성장', content: '생성형 AI가 67.2%로 가장 높은 성장률을 기록했습니다.', imagePrompt: 'generative AI technology illustration' },
  ],
  tags: ['AI', '생성형AI', '시장분석'],
  summary: '글로벌 AI 시장 $184.0B 달성, 2030년 $826.7B 전망',
}

const mockNewsletterContent = {
  subject: '[데모] AI 시장 $184B 돌파 - 주간 AI 브리핑',
  preheader: '생성형 AI 67.2% 성장, 글로벌 시장 분석',
  greeting: '안녕하세요, AI 트렌드 구독자 여러분!',
  headline: '2024 AI 시장, 사상 최대 규모 달성',
  keyPoints: ['시장 규모 $184.0B 달성', '생성형 AI 67.2% 성장', '2030년 $826.7B 전망'],
  body: '올해 글로벌 AI 시장이 전례 없는 성장을 기록했습니다.',
  dataHighlights: [{ label: '시장 규모', value: '$184.0B' }, { label: '성장률', value: '+32.4%' }],
  cta: { text: '전체 보고서 보기', description: '상세 분석 확인하기' },
  closingNote: '다음 주에도 최신 AI 트렌드로 찾아뵙겠습니다.',
}

const mockInstagramContent = {
  cards: [
    { cardNumber: 1, headline: 'AI 시장 $184B', body: '2024년 역대 최대 규모', dataPoint: '$184.0B', imagePrompt: 'AI market infographic', backgroundColor: '#6366f1' },
    { cardNumber: 2, headline: '생성형 AI 폭발', body: '전년 대비 67.2% 성장', dataPoint: '+67.2%', imagePrompt: 'generative AI growth', backgroundColor: '#8b5cf6' },
    { cardNumber: 3, headline: '2030년 전망', body: 'AI 시장 $826.7B 예상', dataPoint: '$826.7B', imagePrompt: 'future AI prediction', backgroundColor: '#a855f7' },
  ],
  caption: '2024 글로벌 AI 시장 핵심 분석',
  hashtags: ['#AI', '#인공지능', '#생성형AI', '#시장분석'],
}

const mockShortsScript = {
  title: '[데모] AI 시장 184조, 진짜 어디까지 커지는 거야?',
  duration: '30',
  hook: '여러분, AI 시장이 올해 얼마나 커졌는지 아세요?',
  scenes: [
    { sceneNumber: 1, duration: '5', narration: 'AI 시장이 올해 184조를 돌파했습니다.', visualDescription: 'dramatic number reveal', textOverlay: '$184.0B' },
    { sceneNumber: 2, duration: '8', narration: '특히 생성형 AI는 무려 67% 성장했죠.', visualDescription: 'growth chart animation', textOverlay: '+67.2%' },
  ],
  cta: '더 자세한 분석은 프로필 링크에서!',
  thumbnailPrompt: 'AI market growth dramatic thumbnail',
}

const mockLongformScript = {
  title: '[데모] 2024 AI 시장 완전 분석',
  estimatedDuration: '8:30',
  intro: { hook: 'AI 시장이 역대 최대를 기록했습니다', narration: '안녕하세요, 오늘은 2024년 AI 시장을 분석합니다.', visualDescription: 'intro animation' },
  sections: [
    { sectionNumber: 1, title: '시장 규모', duration: '120', narration: '2024년 글로벌 AI 시장은 $184.0B를 달성했습니다.', dataPoints: ['$184.0B', '+32.4%'], visualElements: [{ type: 'chart', description: 'bar chart', data: '$184.0B' }], transition: '다음으로' },
  ],
  outro: { summary: 'AI 시장 핵심 요약', narration: '지금까지 2024 AI 시장 분석이었습니다.', cta: '구독과 좋아요 부탁드립니다.' },
  fullNarrationText: '안녕하세요, 오늘은 2024년 AI 시장을 분석합니다. 2024년 글로벌 AI 시장은 $184.0B를 달성했습니다.',
}

const mockBlogImages = [
  { imageUrl: 'https://placehold.co/800x400/6366f1/white?text=Blog+Image+1', prompt: 'AI market' },
  { imageUrl: 'https://placehold.co/800x400/8b5cf6/white?text=Blog+Image+2', prompt: 'generative AI' },
]

const mockInstagramImages = [
  { imageUrl: 'https://placehold.co/1080x1080/6366f1/white?text=Card+1', prompt: 'AI market' },
  { imageUrl: 'https://placehold.co/1080x1080/8b5cf6/white?text=Card+2', prompt: 'growth' },
  { imageUrl: 'https://placehold.co/1080x1080/a855f7/white?text=Card+3', prompt: 'future' },
]

const delay = (ms) => new Promise(r => setTimeout(r, ms))

// 에러 경고 팝업
function ErrorAlert({ message, onClose }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl border border-danger/30 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center gap-3 p-4 bg-danger/10 border-b border-danger/20">
          <AlertCircle size={20} className="text-danger shrink-0" />
          <h3 className="font-semibold text-danger text-sm">작업 오류 발생</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-text leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-all"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

// 결과 확인 경고 팝업
function ConfirmDialog({ message, onConfirm, onCancel }) {
  if (!message) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl border border-warning/30 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center gap-3 p-4 bg-warning/10 border-b border-warning/20">
          <AlertTriangle size={20} className="text-warning shrink-0" />
          <h3 className="font-semibold text-warning text-sm">일부 작업 실패</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-text leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-border transition-all"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-warning/10 text-warning text-sm font-medium rounded-lg hover:bg-warning/20 transition-all"
          >
            그래도 결과 확인
          </button>
        </div>
      </div>
    </div>
  )
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
  const [demoMode, setDemoMode] = useState(false)
  const [emphasisText, setEmphasisText] = useState('')
  const [emphasisConfirmed, setEmphasisConfirmed] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [fixingIssues, setFixingIssues] = useState(false)
  const abortRef = useRef(null)

  // Popup states
  const [errorAlert, setErrorAlert] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

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
  const [shortsVideo, setShortsVideo] = useState(null)
  const [longformNarration, setLongformNarration] = useState(null)
  const [longformVideo, setLongformVideo] = useState(null)

  // step 5까지 실행 완료 여부
  const [mediaGenerationDone, setMediaGenerationDone] = useState(false)

  // 미디어 항목별 로딩 상태
  const [mediaItemLoading, setMediaItemLoading] = useState({})

  const [retrying, setRetrying] = useState(null)
  const [shortsProgress, setShortsProgress] = useState(null)
  const abortedRef = useRef(false)

  const stopGeneration = () => {
    abortedRef.current = true
    setMediaGenerationDone(true)
    setLoading(p => ({ ...p, media: false }))
    setMediaItemLoading({})
  }

  const setStepLoading = (step, val) => setLoading(p => ({ ...p, [step]: val }))
  const addStepErrors = (step, errs) => setStepErrors(p => ({ ...p, [step]: errs }))
  const clearStepErrors = (step) => setStepErrors(p => ({ ...p, [step]: null }))
  const removeStepError = (step, service, channel) => {
    setStepErrors(p => ({
      ...p,
      [step]: (p[step] || []).filter(e => !(e.service === service && e.channel === channel))
    }))
  }

  // 에러 발생 시 팝업 표시
  const showErrorAlert = (serviceName, detail) => {
    setErrorAlert(`${serviceName} 서비스에서 오류가 발생했습니다.\n\n${detail}\n\n해당 작업의 재시도 버튼을 눌러 다시 시도할 수 있습니다.`)
  }

  const handleFile = (f) => {
    const supportedExts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && supportedExts.includes(ext)) {
      setFile(f)
      setCurrentStep(2)
      clearStepErrors('upload')
    } else {
      addStepErrors('upload', [{ service: 'upload', message: '지원되는 파일 형식: PDF, HWP, DOCX, PPTX' }])
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

  // Step 2: 문서 분석
  const runAnalysis = async () => {
    setStepLoading('analysis', true)
    clearStepErrors('analysis')
    const errors = []

    if (demoMode) {
      await delay(MOCK_DELAY)
      setParsedText(mockParsedText)
      await delay(MOCK_DELAY)
      setVerification(mockVerification)
      setCurrentStep(3)
      setStepLoading('analysis', false)
      return
    }

    let text = ''
    try {
      text = await parsePDF(file)
      setParsedText(text)
    } catch (err) {
      errors.push({ service: 'gemini', message: `PDF 분석 실패 - ${err.message}` })
      addStepErrors('analysis', errors)
      setStepLoading('analysis', false)
      showErrorAlert('PDF 분석', err.message)
      return
    }

    try {
      const verified = await verifyParsedContent(text)
      setVerification(verified)
      setParsedText(verified.correctedText || text)
    } catch (err) {
      errors.push({ service: 'gemini', message: `데이터 검증 실패 - ${err.message}` })
      setVerification({ isValid: false, issues: ['검증을 건너뛰었습니다.'], confidence: 0 })
      showErrorAlert('데이터 검증', err.message)
    }

    if (errors.length > 0) addStepErrors('analysis', errors)
    setCurrentStep(3)
    setStepLoading('analysis', false)
  }

  // Step 3: 핵심 요약
  const runSummary = async () => {
    setStepLoading('summary', true)
    clearStepErrors('summary')

    if (demoMode) {
      await delay(MOCK_DELAY)
      setSummary(mockSummary)
      setCurrentStep(4)
      setStepLoading('summary', false)
      return
    }

    try {
      const result = await summarizeContent(parsedText)
      setSummary(result)
      setCurrentStep(4)
    } catch (err) {
      addStepErrors('summary', [{ service: 'gemini', message: `요약 생성 실패 - ${err.message}` }])
      showErrorAlert('핵심 요약', err.message)
    } finally {
      setStepLoading('summary', false)
    }
  }

  // Step 4: 콘텐츠 생성
  const runContentGeneration = async () => {
    setStepLoading('content', true)
    clearStepErrors('content')

    if (demoMode) {
      const demoErrors = []
      await delay(MOCK_DELAY)
      setBlogContent(mockBlogContent)
      await delay(300)
      setNewsletterContent(mockNewsletterContent)
      await delay(300)
      // 인스타그램 실패 시뮬레이션
      demoErrors.push({ service: 'gemini', channel: '인스타그램', message: '[데모] Gemini API 응답 시간 초과 - Rate limit exceeded' })
      await delay(300)
      setShortsScript(mockShortsScript)
      await delay(300)
      setLongformScript(mockLongformScript)
      if (demoErrors.length > 0) {
        addStepErrors('content', demoErrors)
        const failedChannels = demoErrors.map(e => e.channel).join(', ')
        showErrorAlert('콘텐츠 생성', `다음 채널 생성에 실패했습니다: ${failedChannels}\n\n각 항목의 재시도 버튼으로 개별 재시도할 수 있습니다.`)
      }
      setCurrentStep(5)
      setStepLoading('content', false)
      return
    }

    const errors = []
    const channelMap = [
      { key: 'blog', label: '블로그', setter: setBlogContent },
      { key: 'newsletter', label: '뉴스레터', setter: setNewsletterContent },
      { key: 'instagram', label: '인스타그램', setter: setInstagramContent },
      { key: 'shorts', label: '숏폼 대본', setter: setShortsScript },
      { key: 'longform', label: '롱폼 대본', setter: setLongformScript },
    ]

    try {
      // 1회 API 호출로 5개 채널 통합 생성
      const allContent = await generateAllContent(summary, parsedText, emphasisText)

      let anySuccess = false
      for (const ch of channelMap) {
        if (allContent[ch.key]) {
          ch.setter(allContent[ch.key])
          anySuccess = true
        } else {
          errors.push({ service: 'gemini', channel: ch.label, message: '해당 채널 콘텐츠가 생성되지 않았습니다.' })
        }
      }

      if (errors.length > 0) {
        addStepErrors('content', errors)
        const failedChannels = errors.map(e => e.channel).join(', ')
        showErrorAlert('콘텐츠 생성', `다음 채널이 누락되었습니다: ${failedChannels}\n\n각 항목의 재시도 버튼으로 개별 재시도할 수 있습니다.`)
      }
      if (anySuccess) setCurrentStep(5)
    } catch (err) {
      // 통합 생성 자체가 실패한 경우 모든 채널에 에러 표시
      for (const ch of channelMap) {
        errors.push({ service: 'gemini', channel: ch.label, message: err.message || '생성 실패' })
      }
      addStepErrors('content', errors)
      showErrorAlert('콘텐츠 생성', `API 호출에 실패했습니다: ${err.message}`)
    }
    setStepLoading('content', false)
  }

  // 라벨 → API 키 매핑
  const labelToKey = { '블로그': 'blog', '뉴스레터': 'newsletter', '인스타그램': 'instagram', '숏폼 대본': 'shorts', '롱폼 대본': 'longform' }
  const keyToSetter = { blog: setBlogContent, newsletter: setNewsletterContent, instagram: setInstagramContent, shorts: setShortsScript, longform: setLongformScript }

  // Step 4 재시도 — 실패한 채널을 모아서 1회 API 호출
  const retryAllFailedContent = async () => {
    const failedErrors = stepErrors.content || []
    if (failedErrors.length === 0) return

    if (demoMode) {
      const mockMap = {
        '블로그': { data: mockBlogContent, setter: setBlogContent },
        '뉴스레터': { data: mockNewsletterContent, setter: setNewsletterContent },
        '인스타그램': { data: mockInstagramContent, setter: setInstagramContent },
        '숏폼 대본': { data: mockShortsScript, setter: setShortsScript },
        '롱폼 대본': { data: mockLongformScript, setter: setLongformScript },
      }
      setRetrying('content-all')
      for (const err of failedErrors) {
        const mock = mockMap[err.channel]
        if (mock) {
          await delay(300)
          mock.setter(mock.data)
        }
      }
      clearStepErrors('content')
      if (currentStep < 5) setCurrentStep(5)
      setRetrying(null)
      return
    }

    // 실패 채널 키 수집
    const failedKeys = failedErrors.map(e => labelToKey[e.channel]).filter(Boolean)
    if (failedKeys.length === 0) return

    setRetrying('content-all')
    try {
      const results = await retryFailedChannels(failedKeys, summary, parsedText, emphasisText)

      const newErrors = []
      for (const key of failedKeys) {
        if (results[key]) {
          keyToSetter[key](results[key])
        } else {
          const label = failedErrors.find(e => labelToKey[e.channel] === key)?.channel || key
          newErrors.push({ service: 'gemini', channel: label, message: '재생성에서도 해당 채널이 누락되었습니다.' })
        }
      }

      if (newErrors.length > 0) {
        addStepErrors('content', newErrors)
      } else {
        clearStepErrors('content')
      }
      if (currentStep < 5) setCurrentStep(5)
    } catch (retryErr) {
      // 전체 실패 — 에러 메시지 업데이트
      setStepErrors(p => ({
        ...p,
        content: (p.content || []).map(e => ({ ...e, message: retryErr.message || '재시도 실패' }))
      }))
    } finally {
      setRetrying(null)
    }
  }

  // Step 4 개별 채널 재시도 (카드 내 재시도 버튼)
  const retryContentChannel = async (err) => {
    if (demoMode) {
      const mockMap = {
        '블로그': { data: mockBlogContent, setter: setBlogContent },
        '뉴스레터': { data: mockNewsletterContent, setter: setNewsletterContent },
        '인스타그램': { data: mockInstagramContent, setter: setInstagramContent },
        '숏폼 대본': { data: mockShortsScript, setter: setShortsScript },
        '롱폼 대본': { data: mockLongformScript, setter: setLongformScript },
      }
      const mock = mockMap[err.channel]
      if (mock) {
        setRetrying(`${err.service}-${err.channel}`)
        await delay(MOCK_DELAY)
        mock.setter(mock.data)
        removeStepError('content', err.service, err.channel)
        if (currentStep < 5) setCurrentStep(5)
        setRetrying(null)
      }
      return
    }

    // 1개만 실패한 경우 개별 호출, 여러 개면 통합 호출
    const failedCount = (stepErrors.content || []).length
    if (failedCount > 1) {
      return retryAllFailedContent()
    }

    const key = labelToKey[err.channel]
    if (!key) return

    setRetrying(`${err.service}-${err.channel}`)
    try {
      const results = await retryFailedChannels([key], summary, parsedText, emphasisText)
      if (results[key]) {
        keyToSetter[key](results[key])
        removeStepError('content', err.service, err.channel)
        if (currentStep < 5) setCurrentStep(5)
      }
    } catch (retryErr) {
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

  // Step 5: 미디어 생성
  const runMediaGeneration = async () => {
    setStepLoading('media', true)
    clearStepErrors('media')

    if (demoMode) {
      const demoErrors = []
      // 블로그 이미지 생성
      setMediaItemLoading(p => ({ ...p, '블로그 이미지': true }))
      await delay(MOCK_DELAY)
      setBlogImages(mockBlogImages)
      setMediaItemLoading(p => ({ ...p, '블로그 이미지': false }))
      // 인스타 이미지 생성
      setMediaItemLoading(p => ({ ...p, '인스타 이미지': true }))
      await delay(MOCK_DELAY)
      setInstagramImages(mockInstagramImages)
      setMediaItemLoading(p => ({ ...p, '인스타 이미지': false }))
      // 숏폼 영상 (Luma) 성공 시뮬레이션
      setMediaItemLoading(p => ({ ...p, '숏폼 영상': true }))
      await delay(MOCK_DELAY)
      setShortsVideo([
        { sceneNumber: 1, videoUrl: 'demo://shorts-scene-1.mp4', thumbnailUrl: null },
        { sceneNumber: 2, videoUrl: 'demo://shorts-scene-2.mp4', thumbnailUrl: null },
      ])
      setMediaItemLoading(p => ({ ...p, '숏폼 영상': false }))
      // 숏폼 나레이션 실패 시뮬레이션
      setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': true }))
      await delay(600)
      demoErrors.push({ service: 'elevenlabs', channel: '숏폼 나레이션', message: '[데모] ElevenLabs API 인증 실패 - Invalid API key' })
      setMediaItemLoading(p => ({ ...p, '숏폼 나레이션': false }))
      // 롱폼 나레이션
      setMediaItemLoading(p => ({ ...p, '롱폼 나레이션': true }))
      await delay(600)
      demoErrors.push({ service: 'elevenlabs', channel: '롱폼 나레이션', message: '[데모] ElevenLabs 무료 플랜 음성 생성 한도 초과' })
      setMediaItemLoading(p => ({ ...p, '롱폼 나레이션': false }))
      // 롱폼 영상
      setMediaItemLoading(p => ({ ...p, '롱폼 영상': true }))
      await delay(600)
      demoErrors.push({ service: 'creatomate', channel: '롱폼 영상', message: '[데모] Creatomate 렌더링 대기 중' })
      setMediaItemLoading(p => ({ ...p, '롱폼 영상': false }))

      if (demoErrors.length > 0) {
        addStepErrors('media', demoErrors)
        const retryable = demoErrors.filter(e => !e.noRetry)
        if (retryable.length > 0) {
          showErrorAlert('미디어 생성', `다음 항목 생성에 실패했습니다: ${retryable.map(e => e.channel).join(', ')}\n\n각 항목의 재시도 버튼으로 개별 재시도할 수 있습니다.`)
        }
      }
      setMediaGenerationDone(true)
      setStepLoading('media', false)
      return
    }

    const errors = []
    const tasks = []

    const fluxKey = import.meta.env.VITE_FAL_API_KEY
    const lumaKey = import.meta.env.VITE_FAL_API_KEY

    // 이미 성공한 항목은 건너뜀
    const alreadyDone = {
      blogImg: blogImages?.some(i => i.imageUrl),
      shortsVid: Array.isArray(shortsVideo) && shortsVideo.some(v => v.videoUrl),
      shortsNar: Array.isArray(shortsNarration) ? shortsNarration.some(n => n.audioUrl) : !!shortsNarration?.audioUrl,
      longformNar: !!longformNarration?.audioUrl,
      longformVid: !!longformVideo && longformVideo.endsWith('.mp4'),
    }

    // TODO: 블로그 이미지 임시 비활성화
    // if (fluxKey) {
    //   if (!alreadyDone.blogImg) {
    //     tasks.push(
    //       { key: 'blogImg', service: 'flux', channel: '블로그 이미지', fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections) : Promise.resolve([]), setter: setBlogImages },
    //     )
    //   }
    // }

    // TODO: 숏폼 영상 임시 비활성화
    // const lumaDirectKey = import.meta.env.VITE_LUMA_API_KEY
    // if (lumaDirectKey && !alreadyDone.shortsVid) {
    //   tasks.push(
    //     { key: 'shortsVid', service: 'luma', channel: '숏폼 영상', fn: () => shortsScript?.scenes ? generateShortsVideos(shortsScript.scenes, setShortsProgress) : Promise.resolve([]), setter: setShortsVideo },
    //   )
    // }

    // TODO: ElevenLabs 나레이션 임시 비활성화
    // const elevenlabsKey = import.meta.env.VITE_ELEVENLABS_API_KEY
    // if (elevenlabsKey) {
    //   if (!alreadyDone.shortsNar) {
    //     tasks.push(
    //       { key: 'shortsNar', service: 'elevenlabs', channel: '숏폼 나레이션', fn: () => shortsScript?.scenes ? generateNarrationForScenes(shortsScript.scenes) : Promise.resolve(null), setter: setShortsNarration },
    //     )
    //   }
    //   if (!alreadyDone.longformNar) {
    //     tasks.push(
    //       { key: 'longformNar', service: 'elevenlabs', channel: '롱폼 나레이션', fn: () => {
    //         if (longformScript?.fullNarrationText) return generateFullNarration(longformScript.fullNarrationText)
    //         if (longformScript?.sections) return generateFullNarration(longformScript.sections.map(s => s.narration).join('\n\n'))
    //         return Promise.resolve(null)
    //       }, setter: setLongformNarration },
    //     )
    //   }
    // } else {
    //   if (!alreadyDone.shortsNar) errors.push({ service: 'elevenlabs', channel: '숏폼 나레이션', message: 'ElevenLabs API 키가 설정되지 않았습니다.', noRetry: true })
    //   if (!alreadyDone.longformNar) errors.push({ service: 'elevenlabs', channel: '롱폼 나레이션', message: 'ElevenLabs API 키가 설정되지 않았습니다.', noRetry: true })
    // }

    // 롱폼 영상 (Creatomate)
    const creatomateKey = import.meta.env.VITE_CREATOMATE_API_KEY
    if (creatomateKey) {
      if (!alreadyDone.longformVid) {
        tasks.push(
          { key: 'longformVid', service: 'creatomate', channel: '롱폼 영상', fn: () => longformScript ? renderVideoAndWait(longformScript, longformNarration?.audioUrl) : Promise.resolve(null), setter: setLongformVideo },
        )
      }
    } else {
      if (!alreadyDone.longformVid) errors.push({ service: 'creatomate', channel: '롱폼 영상', message: 'Creatomate API 키가 설정되지 않았습니다.', noRetry: true })
    }

    // 순차 실행으로 항목별 로딩 표시
    abortedRef.current = false
    for (const task of tasks) {
      if (abortedRef.current) break
      setMediaItemLoading(p => ({ ...p, [task.channel]: true }))
      try {
        const result = await task.fn()
        task.setter(result)
      } catch (err) {
        if (abortedRef.current) break
        errors.push({ service: task.service, channel: task.channel, message: err.reason?.message || err.message || '생성 실패' })
      }
      setMediaItemLoading(p => ({ ...p, [task.channel]: false }))
    }

    const retryableErrors = errors.filter(e => !e.noRetry)
    if (retryableErrors.length > 0) {
      const failedItems = retryableErrors.map(e => e.channel).join(', ')
      showErrorAlert('미디어 생성', `다음 항목 생성에 실패했습니다: ${failedItems}\n\n각 항목의 재시도 버튼으로 개별 재시도할 수 있습니다.`)
    }

    if (errors.length > 0) addStepErrors('media', errors)
    setMediaGenerationDone(true)
    setStepLoading('media', false)
  }

  // Step 5 재시도
  const retryMediaItem = async (err) => {
    if (demoMode) {
      const mockMap = {
        '블로그 이미지': { data: mockBlogImages, setter: setBlogImages },
        '인스타 이미지': { data: mockInstagramImages, setter: setInstagramImages },
        '숏폼 영상': { data: [{ sceneNumber: 1, videoUrl: 'demo://shorts-1.mp4' }, { sceneNumber: 2, videoUrl: 'demo://shorts-2.mp4' }], setter: setShortsVideo },
        '숏폼 나레이션': { data: [{ audioUrl: 'demo://shorts-narration.mp3', duration: 30 }], setter: setShortsNarration },
        '롱폼 나레이션': { data: { audioUrl: 'demo://longform-narration.mp3', duration: 510 }, setter: setLongformNarration },
        '롱폼 영상': { data: { videoUrl: 'demo://longform-video.mp4', duration: 510 }, setter: setLongformVideo },
      }
      const mock = mockMap[err.channel]
      if (mock) {
        setRetrying(`${err.service}-${err.channel}`)
        await delay(MOCK_DELAY)
        mock.setter(mock.data)
        removeStepError('media', err.service, err.channel)
        setRetrying(null)
      }
      return
    }

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
      '숏폼 영상': {
        fn: () => shortsScript?.scenes ? generateShortsVideos(shortsScript.scenes) : Promise.resolve([]),
        setter: setShortsVideo,
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
        fn: () => longformScript ? renderVideoAndWait(longformScript, longformNarration?.audioUrl) : Promise.resolve(null),
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

  // AI 이슈 자동 수정
  const fixIssuesWithAI = async () => {
    if (!verification?.issues?.length || !parsedText) return
    setFixingIssues(true)
    try {
      const { callGeminiWithFallback } = await import('../services/gemini-core')
      const fixed = await callGeminiWithFallback(`아래 텍스트에서 발견된 이슈를 수정해주세요.

## 발견된 이슈
${verification.issues.map(i => `- ${i}`).join('\n')}

## 원본 텍스트
${parsedText}

## 규칙
- 이슈로 지적된 부분만 수정하세요.
- 나머지 내용은 절대 변경하지 마세요.
- 숫자, 통계 데이터는 원본 그대로 유지하세요.
- 마크다운 형식을 유지하세요.
- 수정된 전체 텍스트만 출력하세요.`, { temperature: 0.1, maxOutputTokens: 65536 })
      setParsedText(fixed)
      setVerification(prev => ({ ...prev, issues: [], isValid: true }))
      clearStepErrors('analysis')
    } catch (err) {
      showErrorAlert('AI 수정', err.message)
    } finally {
      setFixingIssues(false)
    }
  }

  // 사용자 직접 수정 저장
  const saveEditedText = () => {
    setParsedText(editedText)
    setEditingText(false)
    setVerification(prev => prev ? { ...prev, issues: [], isValid: true } : prev)
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

  // 결과 확인에 사용할 실패 목록 수집
  const getFailedItems = () => {
    const failed = []
    const contentErrors = stepErrors.content || []
    const mediaErrors = (stepErrors.media || []).filter(e => !e.noRetry)
    contentErrors.forEach(e => failed.push(e.channel))
    mediaErrors.forEach(e => failed.push(e.channel))
    return failed
  }

  const viewResults = async () => {
    const failed = getFailedItems()

    if (failed.length > 0) {
      setConfirmDialog(
        `다음 작업이 실패하여 해당 결과를 확인할 수 없습니다:\n\n${failed.map(f => `  - ${f}`).join('\n')}\n\n그래도 결과를 확인하시겠습니까?`
      )
      return
    }

    await navigateToResults()
  }

  const navigateToResults = async () => {
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
        shortsVideo, shortsNarration, longformNarration,
        longformVideo,
        fileName: file?.name || (demoMode ? 'demo_report.pdf' : undefined),
        fileBase64,
        savedFromExtraction: true,
      }
    })
  }

  const hasAnyContent = blogContent || newsletterContent || instagramContent || shortsScript || longformScript

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Error Alert Popup */}
      <ErrorAlert message={errorAlert} onClose={() => setErrorAlert(null)} />

      {/* Confirm Dialog */}
      <ConfirmDialog
        message={confirmDialog}
        onConfirm={() => { setConfirmDialog(null); navigateToResults() }}
        onCancel={() => setConfirmDialog(null)}
      />

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
                  <span className={`text-xs mt-2 font-medium text-center ${isActive ? 'text-primary-light' : isDone ? (hasError ? 'text-warning' : 'text-success') : 'text-text-muted'}`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-text-muted mt-0.5 text-center hidden sm:block">{step.desc}</span>
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
              <h3 className="font-semibold text-text text-sm">Step 1. 문서 업로드</h3>
              <p className="text-xs text-text-muted">분석할 문서 파일을 업로드하세요</p>
            </div>
          </div>
          {file && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 업로드 완료</span>}
        </div>
        <div className="p-5">
          {!file ? (
            <>
              {demoMode ? (
                <div className="flex flex-col items-center gap-3 p-10">
                  <p className="text-sm text-text-muted">데모 모드에서는 파일 업로드 없이 진행합니다.</p>
                  <button
                    onClick={() => {
                      setFile({ name: 'demo_report.pdf', size: 2048000, type: 'application/pdf' })
                      setCurrentStep(2)
                    }}
                    className="px-4 py-2 bg-warning/10 text-warning text-sm font-medium rounded-lg hover:bg-warning/20 transition-all"
                  >
                    데모 파일로 시작
                  </button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
                    ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt" onChange={handleFileInput} />
                  <Upload size={28} className="mx-auto mb-3 text-text-muted" />
                  <p className="text-sm text-text">파일을 드래그하거나 <span className="text-primary font-medium">클릭</span>하여 업로드</p>

                  <p className="text-xs text-text-muted mt-1">PDF, HWP, DOCX, PPTX 지원</p>
                </div>
              )}
            </>
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

          {/* 강조 내용 입력 */}
          {file && (
            <div className="mt-4">
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                강조하고 싶은 내용 <span className="text-text-muted/50">(선택사항)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={emphasisText}
                  onChange={(e) => { setEmphasisText(e.target.value); setEmphasisConfirmed(false) }}
                  placeholder="예: 입시 일정을 강조해줘, 핵심 통계 위주로 만들어줘"
                  disabled={emphasisConfirmed}
                  className="flex-1 px-3 py-2.5 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-60"
                />
                {!emphasisConfirmed ? (
                  <button
                    onClick={() => setEmphasisConfirmed(true)}
                    className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all shrink-0"
                  >
                    확인
                  </button>
                ) : (
                  <button
                    onClick={() => setEmphasisConfirmed(false)}
                    className="px-4 py-2.5 bg-success/10 text-success text-sm font-medium rounded-lg hover:bg-success/20 transition-all shrink-0 flex items-center gap-1.5"
                  >
                    <CheckCircle size={14} />
                    {emphasisText.trim() ? '설정됨' : '자동'}
                  </button>
                )}
              </div>
              <p className="text-xs text-text-muted mt-1">
                {emphasisConfirmed
                  ? emphasisText.trim() ? `"${emphasisText.trim()}" 내용이 강조됩니다.` : 'AI가 자동으로 핵심 내용을 판단하여 생성합니다.'
                  : '비워두면 AI가 자동으로 핵심 내용을 판단하여 생성합니다.'}
              </p>
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
              <p className="text-xs text-text-muted">PDF 텍스트 추출 및 데이터 검증</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {verification && (
              <span className={`text-xs font-medium flex items-center gap-1 ${verification.confidence > 0 ? 'text-success' : 'text-warning'}`}>
                {verification.confidence > 0 ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                검증 {verification.confidence > 0 ? '완료' : '부분 완료'} (신뢰도: {Math.round((verification.confidence || 0) * 100)}%)
              </span>
            )}
            {currentStep === 2 && !verification && (
              <button
                onClick={runAnalysis}
                disabled={loading.analysis}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.analysis ? <><Loader2 size={14} className="animate-spin" /> 분석중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
            {verification && (stepErrors.analysis?.length > 0 || verification.confidence < 0.8) && (
              <button
                onClick={runAnalysis}
                disabled={loading.analysis}
                className="px-3 py-1.5 bg-warning/10 text-warning text-xs font-medium rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {loading.analysis ? <><Loader2 size={12} className="animate-spin" /> 재분석중...</> : <><RefreshCw size={12} /> 재분석</>}
              </button>
            )}
          </div>
        </div>
        {(parsedText || verification) && (
          <div className="p-5 space-y-3">
            {verification && (
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${verification.isValid ? 'text-success bg-success/10' : 'text-warning bg-warning/10'}`}>
                  검증 {verification.isValid ? '통과' : '일부 수정'}
                </span>
              </div>
            )}

            {verification?.issues?.length > 0 && (
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                <p className="text-xs font-medium text-warning mb-1">발견된 이슈:</p>
                <ul className="text-xs text-text-muted space-y-1">
                  {verification.issues.map((issue, i) => <li key={i}>- {issue}</li>)}
                </ul>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={fixIssuesWithAI}
                    disabled={fixingIssues}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary-light text-xs font-medium rounded-lg hover:bg-primary/20 disabled:opacity-50 transition-all"
                  >
                    {fixingIssues ? <><Loader2 size={11} className="animate-spin" /> AI 수정중...</> : <><Sparkles size={11} /> AI 자동 수정</>}
                  </button>
                  <button
                    onClick={() => { setEditedText(parsedText); setEditingText(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light text-text-muted text-xs font-medium rounded-lg hover:bg-border transition-all border border-border"
                  >
                    <PenTool size={11} /> 직접 수정
                  </button>
                </div>
              </div>
            )}

            {editingText ? (
              <div className="space-y-2">
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full bg-surface-light rounded-lg p-3 max-h-96 min-h-48 text-xs text-text whitespace-pre-wrap border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingText(false)}
                    className="px-3 py-1.5 text-xs text-text-muted hover:bg-surface-light rounded-lg transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveEditedText}
                    className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-all"
                  >
                    저장
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-surface-light rounded-lg p-3 max-h-96 overflow-y-auto">
                <p className="text-xs text-text-muted whitespace-pre-wrap">{parsedText}</p>
              </div>
            )}
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
              <p className="text-xs text-text-muted">핵심 데이터 요약 및 인사이트 도출</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {summary && !stepErrors.summary?.length && summary.title !== '요약 생성 실패' && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 요약 완료</span>}
            {summary?.title === '요약 생성 실패' && (
              <button
                onClick={runSummary}
                disabled={loading.summary}
                className="px-3 py-1.5 bg-danger/10 text-danger text-xs font-medium rounded-lg hover:bg-danger/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {loading.summary ? <><Loader2 size={12} className="animate-spin" /> 재생성중...</> : <><RefreshCw size={12} /> 재시도</>}
              </button>
            )}
            {summary && stepErrors.summary?.length > 0 && (
              <button
                onClick={runSummary}
                disabled={loading.summary}
                className="px-3 py-1.5 bg-warning/10 text-warning text-xs font-medium rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {loading.summary ? <><Loader2 size={12} className="animate-spin" /> 재생성중...</> : <><RefreshCw size={12} /> 재생성</>}
              </button>
            )}
            {currentStep >= 3 && !summary && !loading.summary && stepErrors.summary?.length > 0 && (
              <button
                onClick={runSummary}
                className="px-3 py-1.5 bg-danger/10 text-danger text-xs font-medium rounded-lg hover:bg-danger/20 transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={12} /> 재시도
              </button>
            )}
            {currentStep === 3 && !summary && !stepErrors.summary?.length && (
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
              <p className="text-xs text-text-muted">컨텐츠에 적합한 문구 생성</p>
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
                { label: '블로그', icon: FileText, color: 'text-primary-light bg-primary/10', data: blogContent, detail: blogContent ? `${blogContent.sections?.length || 0}개 섹션` : null },
                { label: '뉴스레터', icon: FileText, color: 'text-success bg-success/10', data: newsletterContent, detail: newsletterContent ? `${newsletterContent.keyPoints?.length || 0}개 포인트` : null },
                { label: '인스타그램', icon: ImageIcon, color: 'text-pink-400 bg-pink-400/10', data: instagramContent, detail: instagramContent ? `${instagramContent.cards?.length || 0}장 카드` : null },
                { label: '숏폼 대본', icon: Film, color: 'text-warning bg-warning/10', data: shortsScript, detail: shortsScript ? `${shortsScript.scenes?.length || 0}씬 · ${shortsScript.duration || 0}초` : null },
                { label: '롱폼 대본', icon: Video, color: 'text-info bg-info/10', data: longformScript, detail: longformScript ? `${longformScript.sections?.length || 0}개 섹션 · ${longformScript.estimatedDuration || ''}` : null },
              ].map((ch, i) => {
                const Icon = ch.icon
                const errObj = stepErrors.content?.find(e => e.channel === ch.label)
                const failed = !ch.data && !!errObj
                return (
                  <div key={i} className={`rounded-lg p-3 border ${failed ? 'bg-danger/5 border-danger/20' : ch.data ? 'bg-success/5 border-success/20' : 'bg-surface-light border-border'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`p-1 rounded ${ch.color}`}><Icon size={14} /></span>
                      <span className="text-xs font-medium text-text">{ch.label}</span>
                    </div>
                    {ch.data ? (
                      <>
                        <p className="text-xs text-text-muted line-clamp-2">{ch.detail}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <CheckCircle size={12} className="text-success" />
                          <span className="text-xs text-success">완료</span>
                        </div>
                      </>
                    ) : failed ? (
                      <div className="space-y-1.5 mt-1">
                        <div className="flex items-center gap-1">
                          <XCircle size={12} className="text-danger shrink-0" />
                          <span className="text-xs text-danger">실패</span>
                        </div>
                        <p className="text-[10px] text-danger/70 line-clamp-2">{errObj.message}</p>
                        <button
                          onClick={() => retryContentChannel(errObj)}
                          disabled={retrying === `${errObj.service}-${errObj.channel}`}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary-light text-[10px] font-medium transition-all"
                        >
                          {retrying === `${errObj.service}-${errObj.channel}`
                            ? <><Loader2 size={10} className="animate-spin" /> 재시도중</>
                            : <><RefreshCw size={10} /> 재시도</>
                          }
                        </button>
                      </div>
                    ) : loading.content ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Loader2 size={12} className="text-text-muted animate-spin" />
                        <span className="text-xs text-text-muted">대기중...</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {stepErrors.content?.length > 1 && (
          <div className="mx-5 mb-4">
            <button
              onClick={retryAllFailedContent}
              disabled={retrying === 'content-all'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all border border-primary/20 disabled:opacity-50"
            >
              {retrying === 'content-all'
                ? <><Loader2 size={14} className="animate-spin" /> 실패 항목 재생성 중...</>
                : <><RefreshCw size={14} /> 실패한 {stepErrors.content.length}개 채널 한번에 재시도</>
              }
            </button>
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
              <p className="text-xs text-text-muted">이미지/나레이션/영상 생성</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mediaGenerationDone && (
              <span className={`text-xs font-medium flex items-center gap-1 ${stepErrors.media?.length ? 'text-warning' : 'text-success'}`}>
                {stepErrors.media?.length ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                {stepErrors.media?.length ? '부분 완료' : '생성 완료'}
              </span>
            )}
            {currentStep === 5 && !mediaGenerationDone && !loading.media && (
              <button
                onClick={runMediaGeneration}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all flex items-center gap-2"
              >
                <Sparkles size={14} /> 실행
              </button>
            )}
            {loading.media && (
              <button
                onClick={stopGeneration}
                className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-all flex items-center gap-2 border border-danger/20"
              >
                <XCircle size={14} /> 중단
              </button>
            )}
          </div>
        </div>
        {mediaGenerationDone && !loading.media && (stepErrors.media?.length > 0 || [blogImages, instagramImages, shortsVideo, shortsNarration, longformNarration, longformVideo].some(v => !v)) && (
          <div className="mx-5 mt-4">
            <button
              onClick={runMediaGeneration}
              disabled={loading.media}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all border border-primary/20 disabled:opacity-50"
            >
              <RefreshCw size={12} /> 실패/건너뜀 항목 모두 재시도
            </button>
          </div>
        )}
        {(loading.media || blogImages || instagramImages || shortsVideo || shortsNarration || longformNarration || longformVideo || mediaGenerationDone) && (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                {
                  label: '블로그 이미지', service: 'flux', icon: ImageIcon, iconColor: 'text-purple-400',
                  status: blogImages ? `${blogImages.filter(i => i.imageUrl).length}/${blogImages.length}개` : null,
                  ok: blogImages?.some(i => i.imageUrl),
                },
                {
                  label: '인스타 이미지', service: 'flux', icon: ImageIcon, iconColor: 'text-purple-400',
                  status: instagramImages ? `${instagramImages.filter(i => i.imageUrl).length}/${instagramImages.length}개` : null,
                  ok: instagramImages?.some(i => i.imageUrl),
                },
                {
                  label: '숏폼 영상', service: 'luma', icon: Film, iconColor: 'text-rose-400',
                  status: shortsVideo
                    ? `${Array.isArray(shortsVideo) ? shortsVideo.filter(v => v.videoUrl).length : 0}개 생성`
                    : shortsProgress ? `${shortsProgress.completed}/${shortsProgress.total}개 완료${shortsProgress.current ? ` (씬${shortsProgress.current} 생성중)` : ''}` : null,
                  ok: Array.isArray(shortsVideo) && shortsVideo.some(v => v.videoUrl),
                },
                {
                  label: '숏폼 나레이션', service: 'elevenlabs', icon: Mic, iconColor: 'text-warning',
                  status: shortsNarration ? `${Array.isArray(shortsNarration) ? shortsNarration.filter(n => n.audioUrl).length + '/' + shortsNarration.length + '개' : '완료'}` : null,
                  ok: Array.isArray(shortsNarration) ? shortsNarration.some(n => n.audioUrl) : !!shortsNarration?.audioUrl,
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
                const isLoading = mediaItemLoading[item.label]
                const isWaiting = !mediaGenerationDone && !isLoading && !item.ok && !failed
                const isSkipped = mediaGenerationDone && !item.ok && !failed
                return (
                  <div key={i} className={`rounded-lg p-3 border ${
                    isLoading ? 'bg-primary/5 border-primary/20' :
                    failed ? 'bg-danger/5 border-danger/20' :
                    item.ok ? 'bg-success/5 border-success/20' :
                    isSkipped ? 'bg-surface-light border-border opacity-50' :
                    'bg-surface-light border-border'
                  }`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Icon size={12} className={item.iconColor} />
                      <p className="text-xs font-medium text-text">{item.label}</p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1">
                        <Loader2 size={10} className="text-primary animate-spin" />
                        <span className="text-xs text-primary">생성중...</span>
                      </div>
                    ) : item.ok ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle size={10} className="text-success" />
                        <p className="text-xs text-success">{item.status}</p>
                      </div>
                    ) : failed ? (
                      <div className="flex items-center gap-1">
                        <XCircle size={10} className="text-danger" />
                        <span className="text-xs text-danger">실패</span>
                      </div>
                    ) : loading.media ? (
                      <div className="flex items-center gap-1">
                        <Loader2 size={10} className="text-text-muted animate-spin" />
                        <span className="text-xs text-text-muted">대기중...</span>
                      </div>
                    ) : isSkipped ? (
                      <button
                        onClick={() => retryMediaItem({ service: item.service, channel: item.label })}
                        className="flex items-center gap-1 text-xs text-warning hover:text-primary transition-colors"
                      >
                        <RefreshCw size={10} />
                        건너뜀 · 재시도
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <ErrorPanel errors={stepErrors.media} onRetry={retryMediaItem} retrying={retrying} />
      </div>

      {/* View Results Button - Step 5 완료 후에만 활성화 */}
      <div className="flex justify-end">
        <button
          onClick={viewResults}
          disabled={!mediaGenerationDone}
          className={`px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 ${
            mediaGenerationDone
              ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20'
              : 'bg-surface-light text-text-muted border border-border cursor-not-allowed'
          }`}
        >
          <Eye size={18} />
          결과 확인
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
