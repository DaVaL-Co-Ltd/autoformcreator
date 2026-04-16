import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, ChevronDown, ChevronUp, Eye, ArrowRight,
  XCircle, AlertTriangle, RefreshCw, Film, Settings2, Play, Pause, ToggleLeft, ToggleRight, Download,
  Mail
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generateAllContent, retryFailedChannels,
  generateBlogContent, generateNewsletterContent,
  generateInstagramContent, generateShortsScript
} from '../services/gemini-content'
import { generateBlogImages, generateInstagramImages } from '../services/flux'

const steps = [
  { id: 0, label: '채널 선택', icon: CheckCircle, desc: '작업할 채널을 선택하세요' },
  { id: 1, label: '문서 업로드', icon: Upload, desc: '분석할 문서 파일을 업로드하세요' },
  { id: 2, label: '문서 분석', icon: Brain, desc: 'PDF 텍스트 추출 및 데이터 검증' },
  { id: 3, label: '콘텐츠 생성', icon: PenTool, desc: '콘텐츠 텍스트 생성' },
  { id: 4, label: '이미지 생성', icon: ImageIcon, desc: '블로그/인스타그램 이미지 생성' },
  { id: 5, label: '숏폼 생성', icon: Film, desc: '숏폼 영상 생성' },
]

const CHANNEL_OPTIONS = [
  { key: 'blog',       label: '네이버 블로그', icon: FileText,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'newsletter', label: '뉴스레터',      icon: Mail,      color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  { key: 'instagram',  label: '인스타그램',    icon: ImageIcon, color: 'text-pink-500',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30' },
  { key: 'shorts',     label: '유튜브 숏츠',   icon: Film,      color: 'text-red-500',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
]

// AI 서비스별 색상 매핑
const aiServiceInfo = {
  llamaparse: { name: 'LlamaParse', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  gemini: { name: 'Gemini', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  flux: { name: 'Flux', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
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

const mockInstagramContent = {
  title: '[데모] 2024 AI 시장 핵심 분석',
  body: '2024년 글로벌 AI 시장이 **$184.0B**를 달성하며 역대 최대 규모를 기록했습니다.\n\n생성형 AI가 **67.2%**의 성장률로 시장을 견인하고 있으며, 2030년까지 **$826.7B**에 도달할 전망입니다.\n\n북미가 38.2%로 최대 시장이지만, 아시아태평양이 31.5%로 빠르게 추격 중입니다.',
  caption: '📊 2024 글로벌 AI 시장 핵심 분석\n📌 시장 규모 $184B 달성\n🚀 생성형 AI 67.2% 폭발 성장\n🔮 2030년 $826.7B 전망\n\n자세한 내용은 프로필 링크에서 확인하세요!',
  hashtags: ['#AI', '#인공지능', '#생성형AI', '#시장분석', '#테크트렌드'],
  cardTopics: [
    { cardNumber: 1, headline: 'AI 시장 $184B', content: '2024년 역대 최대 규모 달성', dataPoint: '$184.0B' },
    { cardNumber: 2, headline: '생성형 AI 폭발', content: '전년 대비 최고 성장률', dataPoint: '+67.2%' },
    { cardNumber: 3, headline: '2030년 전망', content: 'AI 시장 초대형 성장 예상', dataPoint: '$826.7B' },
    { cardNumber: 4, headline: '북미 시장 선도', content: '글로벌 최대 AI 시장', dataPoint: '38.2%' },
    { cardNumber: 5, headline: '아태 추격', content: '빠른 성장세로 2위 달성', dataPoint: '31.5%' },
    { cardNumber: 6, headline: '엔터프라이즈 AI', content: 'B2B AI 솔루션 수요 급증', dataPoint: '도입 가속화' },
  ],
}

const mockNewsletterContent = {
  subject: '[데모] 주간 AI 브리핑 - 2024 AI 시장 $184B 돌파',
  preheader: '생성형 AI 67.2% 성장, 글로벌 시장 분석',
  greeting: '안녕하세요, AI 트렌드 구독자 여러분!',
  headline: '2024 AI 시장, 사상 최대 규모 달성',
  keyPoints: ['시장 규모 $184.0B 달성', '생성형 AI 67.2% 성장', '2030년 $826.7B 전망'],
  body: '올해 글로벌 AI 시장이 전례 없는 성장을 기록했습니다.\n\n특히 생성형 AI가 67.2%의 폭발적 성장률을 보이며 시장 전체를 견인하고 있으며, 북미와 아시아태평양이 글로벌 시장의 70% 이상을 차지하고 있습니다.\n\n엔터프라이즈 AI 도입이 가속화되면서 향후 6년간 연평균 28.5%의 고성장이 예상됩니다.',
  dataHighlights: [
    { label: '2024 시장 규모', value: '$184.0B' },
    { label: '2030 예상 규모', value: '$826.7B' },
    { label: '생성형 AI 성장률', value: '+67.2%' },
    { label: '북미 점유율', value: '38.2%' },
  ],
  cta: { text: '전체 리포트 보기', description: '상세 데이터는 링크에서 확인하세요' },
  closingNote: '다음 주에도 유용한 AI 인사이트로 찾아뵙겠습니다. 감사합니다!',
}

const mockShortsScript = {
  title: '[데모] 2024 AI 시장 핵심 분석',
  duration: '30',
  hook: '여러분, AI 시장이 올해 얼마나 커졌는지 아세요?',
  scenes: [
    { sceneNumber: 1, duration: '8', narration: '안녕하세요. 오늘은 2024년 글로벌 AI 시장의 핵심 트렌드를 분석해보겠습니다.', visualDescription: 'intro scene', textOverlay: '2024 AI 시장 분석' },
    { sceneNumber: 2, duration: '8', narration: '올해 글로벌 AI 시장은 184조 원을 돌파하며 역대 최대 규모를 기록했습니다.', visualDescription: 'market size reveal', textOverlay: '$184.0B 달성' },
    { sceneNumber: 3, duration: '8', narration: '특히 생성형 AI가 전년 대비 67퍼센트 성장하면서 전체 시장을 이끌고 있습니다.', visualDescription: 'growth chart', textOverlay: '생성형 AI +67%' },
    { sceneNumber: 4, duration: '6', narration: '전문가들은 2030년까지 AI 시장이 826조 원에 달할 것으로 전망하고 있습니다. 더 자세한 분석은 프로필 링크에서 확인하세요.', visualDescription: 'future prediction', textOverlay: '2030년 $826.7B' },
  ],
  cta: '프로필 링크에서 전체 리포트를 확인하세요!',
  thumbnailPrompt: 'AI market growth analysis thumbnail',
  uploadTitle: '[2024 AI 리포트] 시장 184조 돌파, 생성형 AI가 전부 가져갔다',
  uploadDescription: `올해 글로벌 AI 시장이 184조 원을 돌파하며 역대 최대 규모를 달성했습니다.

특히 주목할 점은 생성형 AI의 폭발적 성장. 전년 대비 67% 성장하며 전체 시장을 견인하고 있습니다.

📊 핵심 수치
• 2024년 시장 규모: $184.0B (+32.4%)
• 생성형 AI 성장률: +67.2%
• 2030년 전망: $826.7B (CAGR 28.5%)

전문가들은 2030년까지 826조 원 규모로 확대될 것으로 예측합니다.

더 자세한 분석과 인사이트는 프로필 링크에서 전체 리포트를 확인하세요!`,
  hashtags: ['#Shorts', '#AI시장', '#생성형AI', '#AI', '#테크', '#테크트렌드', '#2024AI', '#시장분석', '#스타트업', '#AI투자'],
}

const mockBlogImages = [
  { imageUrl: 'https://placehold.co/800x400/6366f1/white?text=Blog+Image+1', prompt: 'AI market' },
  { imageUrl: 'https://placehold.co/800x400/8b5cf6/white?text=Blog+Image+2', prompt: 'generative AI' },
]

const mockInstagramImages = [
  { cardNumber: 1, imageUrl: 'https://placehold.co/1080x1080/6366f1/white?text=Card+1', prompt: 'AI market' },
  { cardNumber: 2, imageUrl: 'https://placehold.co/1080x1080/8b5cf6/white?text=Card+2', prompt: 'growth' },
  { cardNumber: 3, imageUrl: 'https://placehold.co/1080x1080/a855f7/white?text=Card+3', prompt: 'future' },
  { cardNumber: 4, imageUrl: 'https://placehold.co/1080x1080/ec4899/white?text=Card+4', prompt: 'north america' },
  { cardNumber: 5, imageUrl: 'https://placehold.co/1080x1080/f59e0b/white?text=Card+5', prompt: 'asia pacific' },
  { cardNumber: 6, imageUrl: 'https://placehold.co/1080x1080/10b981/white?text=Card+6', prompt: 'enterprise' },
]

const mockShortsVideo = {
  url: '/output/demo_shorts.mp4',
  videoUrl: '/output/demo_shorts.mp4',
  duration: '30',
  status: 'completed',
  isDemo: true,
}

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
                <span className={`text-sm font-bold ${service.color}`}>{service.name}</span>
                <span className="text-sm text-text-muted">{err.channel ? `(${err.channel})` : ''}</span>
              </div>
              <p className="text-sm text-text-muted break-words">{isRetrying ? '재시도 중...' : err.message}</p>
            </div>
            {canRetry && !isRetrying && (
              <button
                onClick={() => onRetry(err)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-all shrink-0"
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
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedChannels, setSelectedChannels] = useState({ blog: true, newsletter: true, instagram: true, shorts: true })
  const [channelsConfirmed, setChannelsConfirmed] = useState(false)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState({})
  const [stepErrors, setStepErrors] = useState({})
  const [demoMode, setDemoMode] = useState(true)
  const [emphasisText, setEmphasisText] = useState('')
  const [emphasisConfirmed, setEmphasisConfirmed] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [showParsedText, setShowParsedText] = useState(false)
  const [showSummaryDetail, setShowSummaryDetail] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [fixingIssues, setFixingIssues] = useState(false)
  const abortRef = useRef(null)

  // Popup states
  const [errorAlert, setErrorAlert] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [creditConfirm, setCreditConfirm] = useState(false) // 크레딧 소모 확인 팝업
  const [previewImage, setPreviewImage] = useState(null)
  const [contentPreview, setContentPreview] = useState(null) // 'blog' | 'instagram' | 'shorts' | null
  const [shortsTab, setShortsTab] = useState('script') // 'script' | 'upload'

  // 프롬프트 설정 (각 Step별)
  const [promptOpen, setPromptOpen] = useState({})
  const [promptSettings, setPromptSettings] = useState({
    analysis: { focus: '', extra: '' },
    summary: { keywords: '', style: 'auto', extra: '' },
    content: { tone: 'auto', commonExtra: '', blogExtra: '', newsletterExtra: '', instaExtra: '', shortsExtra: '' },
    media: { imageStyle: 'pastel', mainColor: 'auto', extra: '' },
    shorts: { videoStyle: 'avatar', narrationTone: 'auto', extra: '' },
  })
  const togglePrompt = (step) => setPromptOpen(p => ({ ...p, [step]: !p[step] }))
  const updatePrompt = (step, field, value) => setPromptSettings(p => ({ ...p, [step]: { ...p[step], [field]: value } }))

  // Data states
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)
  const [blogContent, setBlogContent] = useState(null)
  const [newsletterContent, setNewsletterContent] = useState(null)
  const [instagramContent, setInstagramContent] = useState(null)
  const [shortsScript, setShortsScript] = useState(null)
  const [blogImages, setBlogImages] = useState(null)
  const [instagramImages, setInstagramImages] = useState(null)
  const [shortsVideo, setShortsVideo] = useState(null)

  // Step 5: 숏폼 서브 상태
  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarImage, setAvatarImage] = useState(null) // data:image URL
  const [avatarConfirmed, setAvatarConfirmed] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [heygenAvatarId, setHeygenAvatarId] = useState(null) // talking_photo_id
  const [heygenReady, setHeygenReady] = useState(false)
  const [heygenUploading, setHeygenUploading] = useState(false)
  const [subtitleStyle, setSubtitleStyle] = useState('style1')
  const [subtitleFont, setSubtitleFont] = useState('default')

  // step 4까지 실행 완료 여부
  const [mediaGenerationDone, setMediaGenerationDone] = useState(false)

  // 미디어 항목별 로딩 상태
  const [mediaItemLoading, setMediaItemLoading] = useState({})

  const [retrying, setRetrying] = useState(null)
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

  // 특정 단계 이후의 모든 결과를 초기화
  const resetFromStep = (step) => {
    setCurrentStep(step)
    // Step 1 이하(파일 변경 포함) → 모든 후속 단계 초기화
    if (step <= 2) { setParsedText(''); setVerification(null); setSummary(null); setEditingText(false) }
    if (step <= 3) { setBlogContent(null); setNewsletterContent(null); setInstagramContent(null); setShortsScript(null) }
    if (step <= 4) { setBlogImages(null); setInstagramImages(null); setMediaGenerationDone(false); setMediaItemLoading({}) }
    if (step <= 5) { setShortsVideo(null); setAvatarImage(null); setAvatarPrompt(''); setAvatarConfirmed(false) }
    // 에러 초기화
    if (step <= 1) clearStepErrors('upload')
    if (step <= 2) { clearStepErrors('analysis'); clearStepErrors('summary') }
    if (step <= 3) clearStepErrors('content')
    if (step <= 4) clearStepErrors('media')
    if (step <= 5) clearStepErrors('shorts')
  }

  const handleFile = (f) => {
    const supportedExts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt', '.jpg', '.jpeg', '.png', '.webp']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && supportedExts.includes(ext)) {
      setFile(f)
      resetFromStep(2)
      clearStepErrors('upload')
    } else {
      addStepErrors('upload', [{ service: 'upload', message: '지원되는 파일 형식: PDF, HWP, DOCX, PPTX, JPG, PNG, WEBP' }])
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
    resetFromStep(2)
    const errors = []

    if (demoMode) {
      await delay(MOCK_DELAY)
      setParsedText(mockParsedText)
      await delay(MOCK_DELAY)
      setVerification(mockVerification)
      setStepLoading('analysis', false)
      // 데모: 분석 후 자동 요약 진행
      await runSummaryWith(mockParsedText)
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
      const verified = await verifyParsedContent(text, { focus: promptSettings.analysis.focus, extra: promptSettings.analysis.extra })
      setVerification(verified)
      // AI 코멘트 제거: "## 발견된 이슈", "## 수정된 텍스트" 등 메타 헤더와 그 직후 빈 줄 제거
      let cleaned = (verified.correctedText || text)
        .replace(/^#{1,3}\s*(발견된\s*이슈|수정된\s*텍스트|수정\s*내역|교정\s*결과|검증\s*결과|이슈\s*수정|오타\s*수정).*\n*/gm, '')
        .replace(/^\*\*(발견된\s*이슈|수정된\s*텍스트|수정\s*내역|교정\s*결과).*\n*/gm, '')
        .replace(/^---+\s*\n*/gm, '')
        .replace(/^\n{3,}/gm, '\n\n')
        .trim()
      setParsedText(cleaned)
    } catch (err) {
      errors.push({ service: 'gemini', message: `데이터 검증 실패 - ${err.message}` })
      setVerification({ isValid: false, issues: ['검증을 건너뛰었습니다.'], confidence: 0 })
      showErrorAlert('데이터 검증', err.message)
    }

    if (errors.length > 0) addStepErrors('analysis', errors)
    setStepLoading('analysis', false)

    // 분석 성공 시 자동으로 요약까지 진행
    if (text) {
      await runSummaryWith(text)
    } else {
      setCurrentStep(2)
    }
  }

  // Step 3: 핵심 요약 (내부용 - 텍스트를 직접 받아서 실행)
  const runSummaryWith = async (textToSummarize) => {
    const targetText = textToSummarize || parsedText
    if (!targetText) return
    setStepLoading('summary', true)
    clearStepErrors('summary')
    setSummary(null)

    if (demoMode) {
      await delay(MOCK_DELAY)
      setSummary(mockSummary)
      setShowSummaryDetail(true)
      setCurrentStep(3)
      setStepLoading('summary', false)
      return
    }

    try {
      const result = await summarizeContent(targetText, { keywords: promptSettings.summary.keywords, style: promptSettings.summary.style, extra: promptSettings.summary.extra })
      if (result.title === '요약 생성 실패') {
        addStepErrors('summary', [{ service: 'gemini', message: 'Gemini 응답을 JSON으로 파싱하지 못했습니다. 재시도해주세요.' }])
        setCurrentStep(2)
      } else {
        setSummary(result)
        setShowSummaryDetail(true)
        setCurrentStep(3)
      }
    } catch (err) {
      addStepErrors('summary', [{ service: 'gemini', message: `요약 생성 실패 - ${err.message}` }])
      showErrorAlert('핵심 요약', err.message)
      setCurrentStep(2)
    } finally {
      setStepLoading('summary', false)
    }
  }

  // Step 2 내 핵심 요약 재시도 (버튼에서 호출)
  const runSummary = async () => {
    resetFromStep(2)
    await runSummaryWith(parsedText)
  }

  // Step 3: 콘텐츠 생성
  const runContentGeneration = async () => {
    setStepLoading('content', true)
    clearStepErrors('content')
    resetFromStep(3)

    if (demoMode) {
      await delay(MOCK_DELAY)
      if (selectedChannels.blog) { setBlogContent(mockBlogContent); await delay(300) }
      if (selectedChannels.newsletter) { setNewsletterContent(mockNewsletterContent); await delay(300) }
      if (selectedChannels.instagram) { setInstagramContent(mockInstagramContent); await delay(300) }
      if (selectedChannels.shorts) { setShortsScript(mockShortsScript); await delay(300) }
      setCurrentStep(4)
      setStepLoading('content', false)
      return
    }

    const errors = []
    const channelMap = [
      { key: 'blog', label: '네이버 블로그', setter: setBlogContent },
      { key: 'newsletter', label: '뉴스레터', setter: setNewsletterContent },
      { key: 'instagram', label: '인스타그램', setter: setInstagramContent },
      { key: 'shorts', label: '숏폼 대본', setter: setShortsScript },
    ].filter(c => selectedChannels[c.key])

    try {
      // 1회 API 호출로 4개 채널 통합 생성
      const allContent = await generateAllContent(summary, parsedText, emphasisText, { tone: promptSettings.content.tone, commonExtra: promptSettings.content.commonExtra, blogExtra: promptSettings.content.blogExtra, newsletterExtra: promptSettings.content.newsletterExtra, instaExtra: promptSettings.content.instaExtra, shortsExtra: promptSettings.content.shortsExtra })

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
      if (anySuccess) setCurrentStep(4)
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
  const labelToKey = { '네이버 블로그': 'blog', '뉴스레터': 'newsletter', '인스타그램': 'instagram', '숏폼 대본': 'shorts' }
  const keyToSetter = { blog: setBlogContent, newsletter: setNewsletterContent, instagram: setInstagramContent, shorts: setShortsScript }

  // Step 3 재시도 — 실패한 채널을 모아서 1회 API 호출
  const retryAllFailedContent = async () => {
    const failedErrors = stepErrors.content || []
    if (failedErrors.length === 0) return

    if (demoMode) {
      const mockMap = {
        '네이버 블로그': { data: mockBlogContent, setter: setBlogContent },
        '뉴스레터': { data: mockNewsletterContent, setter: setNewsletterContent },
        '인스타그램': { data: mockInstagramContent, setter: setInstagramContent },
        '숏폼 대본': { data: mockShortsScript, setter: setShortsScript },
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
      if (currentStep < 4) setCurrentStep(4)
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
      if (currentStep < 4) setCurrentStep(4)
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

  // Step 3 개별 채널 재시도 (카드 내 재시도 버튼)
  const retryContentChannel = async (err) => {
    if (demoMode) {
      const mockMap = {
        '네이버 블로그': { data: mockBlogContent, setter: setBlogContent },
        '뉴스레터': { data: mockNewsletterContent, setter: setNewsletterContent },
        '인스타그램': { data: mockInstagramContent, setter: setInstagramContent },
        '숏폼 대본': { data: mockShortsScript, setter: setShortsScript },
      }
      const mock = mockMap[err.channel]
      if (mock) {
        setRetrying(`${err.service}-${err.channel}`)
        await delay(MOCK_DELAY)
        mock.setter(mock.data)
        removeStepError('content', err.service, err.channel)
        if (currentStep < 4) setCurrentStep(4)
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
        if (currentStep < 4) setCurrentStep(4)
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

  // Step 3 개별 채널 재생성 (성공한 채널도 다시 생성)
  const regenerateChannel = async (channelKey) => {
    const mockMap = { blog: mockBlogContent, newsletter: mockNewsletterContent, instagram: mockInstagramContent, shorts: mockShortsScript }
    const fnMap = {
      blog: () => generateBlogContent(summary, parsedText, emphasisText),
      newsletter: () => generateNewsletterContent(summary, parsedText, emphasisText),
      instagram: () => generateInstagramContent(summary, parsedText, emphasisText),
      shorts: () => generateShortsScript(summary, parsedText, emphasisText),
    }
    const setter = keyToSetter[channelKey]
    if (!setter) return

    setRetrying(`regen-${channelKey}`)
    try {
      if (demoMode) {
        await delay(MOCK_DELAY)
        setter(mockMap[channelKey])
      } else {
        const result = await fnMap[channelKey]()
        setter(result)
      }
    } catch (err) {
      showErrorAlert('채널 재생성', err.message || '재생성 실패')
    } finally {
      setRetrying(null)
    }
  }

  // Step 4: 이미지 생성 (블로그 + 인스타그램)
  const runMediaGeneration = async () => {
    setStepLoading('media', true)
    clearStepErrors('media')
    resetFromStep(4)

    const errors = []
    const tasks = []

    const alreadyDone = {
      blogImg: blogImages?.length > 0 && blogImages.every(i => i.imageUrl),
      instaImg: instagramImages?.length > 0,
    }

    if (selectedChannels.blog && !alreadyDone.blogImg) {
      tasks.push(
        { key: 'blogImg', service: 'gemini', channel: '블로그 이미지', fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]), setter: setBlogImages },
      )
    }

    if (selectedChannels.instagram && !alreadyDone.instaImg && instagramContent?.cardTopics?.length) {
      tasks.push(
        { key: 'instaImg', service: 'gemini', channel: '인스타 카드', fn: () => generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }), setter: setInstagramImages },
      )
    }

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

    if (errors.length > 0) {
      addStepErrors('media', errors)
      showErrorAlert('이미지 생성', `실패: ${errors.map(e => e.channel).join(', ')}`)
    }

    setMediaGenerationDone(true)
    setCurrentStep(5)
    setStepLoading('media', false)
  }

  // Step 5-1: 아바타 이미지 생성 (Gemini)
  const generateAvatar = async () => {
    if (!avatarPrompt.trim()) return
    setMediaItemLoading(p => ({ ...p, '아바타': true }))
    clearStepErrors('shorts')
    // 아바타 재생성 시 관련 상태 초기화
    setAvatarConfirmed(false)
    setAvatarImage(null)
    setHeygenAvatarId(null)
    setHeygenReady(false)
    setHeygenUploading(false)
    setSelectedVoice(null)
    setRecommendedVoices([])
    setShortsVideo(null)
    try {
      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate a realistic high-quality photograph. Subject: ${avatarPrompt.trim()}.

IMPORTANT REQUIREMENTS:
- Realistic photo style (like taken with a DSLR camera)
- Character facing directly toward the camera, front-facing
- Mouth CLEARLY VISIBLE and slightly open (showing a friendly expression)
- Bright, warm, natural lighting (golden hour or soft window light)
- Shallow depth of field with blurred background
- Character sitting or standing naturally in an environment (desk, room, park, etc.)
- Full upper body visible (not extreme close-up)
- The scene should look like a real photograph, NOT a painting or illustration

COMPOSITION:
- 9:16 VERTICAL portrait orientation
- Character occupies about 40-50% of the frame
- Face is well-lit and clearly visible
- Background has context but is not distracting

DO NOT:
- Use cartoon, anime, 3D render, or illustration style
- Generate extreme close-ups (face only)
- Place objects near or covering the mouth
- Use dark or dramatic lighting
- Include any text or watermarks` }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.message || `Gemini 오류: ${res.status}`)
      }
      const data = await res.json()
      // 모든 candidates의 모든 parts에서 이미지 탐색
      let imagePart = null
      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) { imagePart = part; break }
        }
        if (imagePart) break
      }
      if (!imagePart) {
        throw new Error('아바타 이미지를 생성하지 못했습니다. 다시 시도해주세요.')
      }
      const b64 = imagePart.inlineData.data
      const mime = imagePart.inlineData.mimeType || 'image/png'
      setAvatarImage(`data:${mime};base64,${b64}`)
    } catch (err) {
      addStepErrors('shorts', [{ service: 'gemini', channel: '아바타', message: err.message }])
      showErrorAlert('아바타 생성', err.message)
    }
    setMediaItemLoading(p => ({ ...p, '아바타': false }))
  }

  // Step 5-2: 아바타 확정 시 HeyGen 업로드 + 폴링 대기 (백그라운드)
  const confirmAndUploadAvatar = async () => {
    setAvatarConfirmed(true)
    setHeygenAvatarId(null)
    setHeygenReady(false)
    setHeygenUploading(true)
    const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY
    if (!avatarImage || !HEYGEN_API_KEY) { setHeygenUploading(false); return }
    try {
      // 테스트용: 서버에서 성공한 이미지를 업로드하고 기존 아바타가 있으면 재사용
      const listRes = await fetch('/api/heygen/avatar-list', { headers: { 'x-api-key': HEYGEN_API_KEY } })
      if (listRes.ok) {
        const listData = await listRes.json()
        const existingCustom = listData.custom || []
        if (existingCustom.length > 0) {
          setHeygenAvatarId(existingCustom[0].talking_photo_id)
          setHeygenReady(true)
          setHeygenUploading(false)
          return
        }
      }
      // 기존 아바타 없으면 성공한 이미지로 새로 생성
      const uploadRes = await fetch('/api/heygen/upload-test-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_API_KEY },
      })
      if (!uploadRes.ok) throw new Error('업로드 실패')
      const uploadData = await uploadRes.json()
      const imageKey = uploadData.data?.image_key
      if (!imageKey) throw new Error('image_key 없음')
      const groupRes = await fetch('/api/heygen/avatar-group/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_API_KEY },
        body: JSON.stringify({ name: `avatar_${Date.now()}`, image_key: imageKey }),
      })
      if (!groupRes.ok) throw new Error('Group 생성 실패')
      const groupData = await groupRes.json()
      const groupId = groupData.data?.group_id
      if (!groupId) throw new Error('group_id 없음')
      setHeygenAvatarId(groupId)
      // 폴링으로 준비 확인 (10초 간격, 최대 3분)
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 10000))
        try {
          const statusRes = await fetch(`/api/heygen/avatar-status/${groupId}`, {
            headers: { 'x-api-key': HEYGEN_API_KEY },
          })
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            if (statusData.ready) { setHeygenReady(true); setHeygenUploading(false); return }
          }
        } catch { /* 계속 폴링 */ }
      }
      setHeygenReady(true)
    } catch (err) {
      console.error('[HeyGen 업로드 실패]', err.message)
      addStepErrors('shorts', [{ service: 'heygen', channel: '아바타 업로드', message: err.message || 'HeyGen 업로드 실패' }])
    }
    setHeygenUploading(false)
  }

  // Step 5-3: 숏폼 영상 생성 (HeyGen)
  const runShortsGeneration = async () => {
    const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY
    if (!shortsScript) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏폼', message: '숏폼 대본이 없습니다.' }])
      return
    }

    // 데모 모드: HeyGen 호출 없이 샘플 영상 사용 (크레딧 절약)
    if (demoMode) {
      setStepLoading('shorts', true)
      clearStepErrors('shorts')
      setMediaItemLoading(p => ({ ...p, '숏폼 영상': true }))
      await delay(MOCK_DELAY)
      setShortsVideo(mockShortsVideo)
      setMediaItemLoading(p => ({ ...p, '숏폼 영상': false }))
      setStepLoading('shorts', false)
      return
    }

    if (!avatarImage) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏폼', message: '아바타를 먼저 생성해주세요.' }])
      return
    }
    if (!HEYGEN_API_KEY) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏폼', message: 'HeyGen API 키가 설정되지 않았습니다.' }])
      return
    }
    setStepLoading('shorts', true)
    clearStepErrors('shorts')
    setMediaItemLoading(p => ({ ...p, '숏폼 영상': true }))
    try {
      let talkingPhotoId = heygenAvatarId

      // 백그라운드 업로드가 안 되었으면 여기서 실행
      if (!talkingPhotoId) {
        const avatarBase64 = avatarImage.split(',')[1]
        const binaryStr = atob(avatarBase64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'image/png' })

        const uploadRes = await fetch('/api/heygen/upload-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'image/png', 'x-api-key': HEYGEN_API_KEY },
          body: blob,
        })
        if (!uploadRes.ok) throw new Error('HeyGen 이미지 업로드 실패')
        const uploadData = await uploadRes.json()
        const imageKey = uploadData.data?.image_key
        if (!imageKey) throw new Error('image_key를 받지 못했습니다.')

        const groupRes = await fetch('/api/heygen/avatar-group/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_API_KEY },
          body: JSON.stringify({ name: `avatar_${Date.now()}`, image_key: imageKey }),
        })
        if (!groupRes.ok) {
          const groupErr = await groupRes.json().catch(() => ({}))
          throw new Error(groupErr.error?.message || groupErr.message || `Avatar Group 생성 실패: ${groupRes.status}`)
        }
        const groupData = await groupRes.json()
        talkingPhotoId = groupData.data?.group_id
        if (!talkingPhotoId) throw new Error('talking_photo_id를 받지 못했습니다.')
        setHeygenAvatarId(talkingPhotoId)
      }

      // fallback 업로드 시 폴링 대기
      if (!heygenReady) {
        setMediaItemLoading(p => ({ ...p, '숏폼 영상': '아바타 준비 확인 중...' }))
        for (let i = 0; i < 36; i++) {
          await new Promise(r => setTimeout(r, 5000))
          try {
            const statusRes = await fetch(`/api/heygen/avatar-status/${talkingPhotoId}`, {
              headers: { 'x-api-key': HEYGEN_API_KEY },
            })
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.ready) break
            }
          } catch { /* 계속 폴링 */ }
        }
      }

      // 3) 나레이션 텍스트 (대본의 나레이션 합치기)
      const narrationText = shortsScript.scenes?.map(s => s.narration).join(' ') || ''

      // 4) HeyGen v2 Video Generate 요청 (Avatar III) - 실패 시 30초 대기 후 재시도 (최대 3회)
      let videoId = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const generateRes = await fetch('/api/heygen/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': HEYGEN_API_KEY },
          body: JSON.stringify({
            video_inputs: [{
              character: {
                type: 'talking_photo',
                talking_photo_id: talkingPhotoId,
              },
              voice: {
                type: 'text',
                input_text: narrationText,
                voice_id: selectedVoice || undefined,
              },
            }],
            dimension: { width: 1080, height: 1920 },
            caption: true,
          }),
        })
        const genData = await generateRes.json().catch(() => ({}))
        if (generateRes.ok && genData.data?.video_id) {
          videoId = genData.data.video_id
          break
        }
        const errMsg = genData.error?.message || genData.message || ''
        if (errMsg.includes('unlimited mode') && attempt < 2) {
          setMediaItemLoading(p => ({ ...p, '숏폼 영상': `아바타 준비 대기 중... (${attempt + 1}/3)` }))
          for (let j = 0; j < 6; j++) {
            await new Promise(r => setTimeout(r, 5000))
            try {
              const sr = await fetch(`/api/heygen/avatar-status/${talkingPhotoId}`, { headers: { 'x-api-key': HEYGEN_API_KEY } })
              if (sr.ok && (await sr.json()).ready) break
            } catch { /* 계속 */ }
          }
          continue
        }
        throw new Error(errMsg || `HeyGen 오류: ${generateRes.status}`)
      }
      if (!videoId) throw new Error('HeyGen video_id를 받지 못했습니다.')

      // 4) 폴링 (최대 10분)
      setMediaItemLoading(p => ({ ...p, '숏폼 영상': 'polling' }))
      let videoCompleted = false
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const pollRes = await fetch(`/api/heygen/video/status/${videoId}`, {
          headers: { 'x-api-key': HEYGEN_API_KEY },
        })
        if (!pollRes.ok) continue
        const pollData = await pollRes.json()
        const status = pollData.data?.status
        if (status === 'completed') {
          const videoUrl = pollData.data?.video_url
          setShortsVideo({ url: videoUrl, duration: shortsScript.duration, videoId })
          videoCompleted = true
          break
        }
        if (status === 'failed') {
          const errDetail = pollData.data?.error
          const errMsg = typeof errDetail === 'object' ? (errDetail.message || errDetail.detail || JSON.stringify(errDetail)) : (errDetail || '알 수 없는 오류')
          throw new Error(`HeyGen 렌더 실패: ${errMsg}`)
        }
      }
      if (!videoCompleted) {
        throw new Error('HeyGen 영상 생성 시간 초과 (10분)')
      }
    } catch (err) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏폼 영상', message: err.message || '숏폼 생성 실패' }])
      showErrorAlert('숏폼 생성', err.message)
    }
    setMediaItemLoading(p => ({ ...p, '숏폼 영상': false }))
    setStepLoading('shorts', false)
  }

  const [allKoVoices, setAllKoVoices] = useState([]) // 전체 한국어 지원 voice
  const [recommendedVoices, setRecommendedVoices] = useState([]) // AI 추천 voice
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voicesError, setVoicesError] = useState(null)
  const [voiceFilter, setVoiceFilter] = useState('')
  const [playingVoice, setPlayingVoice] = useState(null)
  const previewAudioRef = useRef(null)
  const voicesFetched = useRef(false)

  const HEYGEN_KEY = import.meta.env.VITE_HEYGEN_API_KEY

  // voice 목록 로드 (1회)
  useEffect(() => {
    if (voicesFetched.current || !HEYGEN_KEY) return
    voicesFetched.current = true
    setVoicesLoading(true)
    fetch('/api/heygen/voices', { headers: { 'x-api-key': HEYGEN_KEY } })
      .then(r => r.json())
      .then(data => {
        const voices = data?.data?.voices || data?.data?.list || []
        const koVoices = voices
          .filter(v => (v.language || '').includes('Korean') || v.support_locale)
          .map(v => ({ ...v, display_name: v.display_name || v.name || `Voice ${(v.voice_id || '').slice(0, 8)}` }))
        setAllKoVoices(koVoices)
      })
      .catch(err => setVoicesError(err.message))
      .finally(() => setVoicesLoading(false))
  }, [HEYGEN_KEY])

  // 아바타 확정 시 → Gemini로 어울리는 voice 추천
  useEffect(() => {
    if (!avatarConfirmed || !avatarPrompt || allKoVoices.length === 0) return
    const recommend = async () => {
      setVoicesLoading(true)
      try {
        // 한국어 네이티브를 먼저 넣고, 나머지를 셔플해서 다양한 결과 유도
        const koNative = allKoVoices.filter(v => (v.language || '').includes('Korean'))
        const others = allKoVoices.filter(v => !(v.language || '').includes('Korean'))
        const shuffled = [...others].sort(() => Math.random() - 0.5)
        const voicePool = [...koNative, ...shuffled].slice(0, 300)
        const voiceSummary = voicePool.map(v =>
          `${v.voice_id}|${v.display_name || v.name}|${v.language || ''}|${v.gender || ''}`
        ).join('\n')
        const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `아래는 HeyGen TTS voice 목록입니다. 캐릭터 "${avatarPrompt}"에 가장 어울리는 목소리 30개의 voice_id를 추천해주세요.

voice 이름에서 톤/성격 힌트를 읽어주세요:
- "Chill", "Calm", "Soft" → 차분한 톤
- "Bright", "Cheerful", "Sweet" → 밝고 친근한 톤
- "Natural" → 자연스러운 톤
- "Professional", "Confident" → 전문적 톤

추천 기준 (우선순위 순서대로):
1. voice 이름의 톤/성격이 캐릭터 "${avatarPrompt}"의 분위기와 일치
2. 한국어 네이티브(Korean) voice 최우선 (상위 5개 내 배치)
3. 캐릭터 성별/나이대에 맞는 gender 선택
4. 귀여운/동물 캐릭터 → female, Bright/Sweet/Cheerful 톤 우선
5. 전문적/뉴스 캐릭터 → male/female, Natural/Confident 톤 우선
6. 다양한 톤을 섞어서 사용자가 선택할 수 있게 구성

가장 어울리는 순서대로 정렬하여 JSON 배열로 voice_id만 반환하세요. 예: ["id1","id2",...]

목록:
${voiceSummary}` }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' },
            }),
          }
        )
        if (res.ok) {
          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
          const ids = JSON.parse(text)
          const recommended = ids
            .map(id => allKoVoices.find(v => v.voice_id === id))
            .filter(Boolean)
          setRecommendedVoices(recommended)
          if (recommended.length > 0 && !selectedVoice) setSelectedVoice(recommended[0].voice_id)
        }
      } catch { /* 추천 실패 시 전체 목록 사용 */ }
      setVoicesLoading(false)
    }
    recommend()
  }, [avatarConfirmed, avatarPrompt, allKoVoices.length])

  // 미리듣기
  const playPreview = (voiceId, previewUrl) => {
    if (playingVoice === voiceId) {
      previewAudioRef.current?.pause()
      setPlayingVoice(null)
      return
    }
    if (previewAudioRef.current) previewAudioRef.current.pause()
    if (!previewUrl) return
    const audio = new Audio(previewUrl)
    audio.onended = () => setPlayingVoice(null)
    audio.play()
    previewAudioRef.current = audio
    setPlayingVoice(voiceId)
  }

  const displayVoices = recommendedVoices.length > 0 ? recommendedVoices : allKoVoices.slice(0, 30)
  const filteredVoices = displayVoices.filter(v => {
    if (!voiceFilter) return true
    const q = voiceFilter.toLowerCase()
    return (v.display_name || '').toLowerCase().includes(q)
      || (v.language || '').toLowerCase().includes(q)
      || (v.gender || '').toLowerCase().includes(q)
  })

  // Step 4: 개별 미디어 생성
  const runSingleMedia = async (key) => {
    const taskMap = {
      blogImg: {
        channel: '블로그 이미지',
        service: 'gemini',
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]),
        setter: setBlogImages,
        demoData: mockBlogImages,
      },
      instaImg: {
        channel: '인스타 카드',
        service: 'gemini',
        fn: () => instagramContent?.cardTopics?.length
          ? generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra })
          : Promise.resolve([]),
        setter: setInstagramImages,
        demoData: mockInstagramImages,
      },
      shortsVid: {
        channel: '숏폼 영상',
        service: 'gemini',
        fn: () => shortsScript
          ? Promise.resolve({ status: 'placeholder', duration: shortsScript.duration })
          : Promise.resolve(null),
        setter: setShortsVideo,
        demoData: mockShortsVideo,
      },
    }

    const task = taskMap[key]
    if (!task) return

    setMediaItemLoading(p => ({ ...p, [task.channel]: true }))
    // 해당 채널 기존 에러 제거
    setStepErrors(p => ({
      ...p,
      media: (p.media || []).filter(e => e.channel !== task.channel)
    }))

    if (demoMode) {
      await delay(MOCK_DELAY)
      task.setter(task.demoData)
      setMediaItemLoading(p => ({ ...p, [task.channel]: false }))
      return
    }

    try {
      const result = await task.fn()
      task.setter(result)
    } catch (err) {
      addStepErrors('media', [{ service: task.service, channel: task.channel, message: err.message || '생성 실패' }])
      showErrorAlert('미디어 생성', `${task.channel} 생성에 실패했습니다: ${err.message}`)
    }
    setMediaItemLoading(p => ({ ...p, [task.channel]: false }))
  }

  // Step 4 재시도
  const retryMediaItem = async (err) => {
    if (demoMode) {
      const mockMap = {
        '블로그 이미지': { data: mockBlogImages, setter: setBlogImages },
        '인스타 카드': { data: mockInstagramImages, setter: setInstagramImages },
        '숏폼 영상': { data: mockShortsVideo, setter: setShortsVideo },
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
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]),
        setter: setBlogImages,
      },
      '인스타 카드': {
        fn: () => instagramContent?.cardTopics ? generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.imageStyle, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]),
        setter: setInstagramImages,
      },
      '숏폼 영상': {
        fn: () => shortsScript ? Promise.resolve({ status: 'placeholder', duration: shortsScript.duration }) : Promise.resolve(null),
        setter: setShortsVideo,
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

  // 요약 재시도 (Step 2 내)
  const retrySummary = async () => {
    clearStepErrors('summary')
    await runSummary()
  }

  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(f)
  })

  // 결과 확인에 사용할 미완료/실패 목록 수집
  const getIncompleteItems = () => {
    const incomplete = []
    if (!parsedText && !verification) incomplete.push('문서 분석')
    if (!summary) incomplete.push('핵심 요약')
    if (!blogContent && !newsletterContent && !instagramContent && !shortsScript) incomplete.push('콘텐츠 생성')
    else {
      if (selectedChannels.blog && !blogContent) incomplete.push('네이버 블로그 콘텐츠')
      if (selectedChannels.newsletter && !newsletterContent) incomplete.push('뉴스레터 콘텐츠')
      if (selectedChannels.instagram && !instagramContent) incomplete.push('인스타그램 콘텐츠')
      if (selectedChannels.shorts && !shortsScript) incomplete.push('숏폼 대본')
    }
    if (!blogImages?.some(i => i.imageUrl)) incomplete.push('블로그 이미지')
    if (!instagramImages?.length) incomplete.push('인스타 카드 이미지')
    // Step 5
    if (!avatarImage) incomplete.push('숏폼 아바타')
    if (!shortsVideo) incomplete.push('숏폼 영상')
    // 실패 항목
    const contentErrors = stepErrors.content || []
    const mediaErrors = (stepErrors.media || []).filter(e => !e.noRetry)
    const shortsErrors = (stepErrors.shorts || []).filter(e => !e.noRetry)
    contentErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    mediaErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    shortsErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    return incomplete
  }

  const viewResults = async () => {
    const incomplete = getIncompleteItems()

    if (incomplete.length > 0) {
      setConfirmDialog(
        `다음 과정이 완료되지 않았습니다:\n\n${incomplete.map(f => `  • ${f}`).join('\n')}\n\n완료되지 않은 항목은 결과에 포함되지 않습니다.\n그래도 결과를 확인하시겠습니까?`
      )
      return
    }

    await navigateToResults()
  }

  // Blob URL → base64 data URL 변환 (페이지 이동 시 유실 방지)
  const blobToDataUrl = async (blobUrl) => {
    if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl
    try {
      const res = await fetch(blobUrl)
      const blob = await res.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
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
        shortsScript,
        blogImages, instagramImages, shortsVideo,
        fileName: file?.name || (demoMode ? `demo_${new Date().toISOString().slice(0, 10)}.pdf` : undefined),
        fileBase64,
        savedFromExtraction: true,
        isDemo: demoMode,
      }
    })
  }

  // 프롬프트 필드 렌더
  const PF = (label, { optional, type = 'input', value, onChange, placeholder, hint, options } = {}) => (
    <div className="mb-4 last:mb-0">
      <label className="block text-sm font-semibold text-text-muted mb-1.5">
        {label} {optional && <span className="font-normal text-text-muted/50">(선택)</span>}
      </label>
      {type === 'textarea' ? (
        <textarea defaultValue={value} onBlur={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y min-h-[60px]" />
      ) : type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary/30 appearance-none">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type="text" defaultValue={value} onBlur={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/30" />
      )}
      {hint && <p className="text-xs text-text-muted/50 mt-1">{hint}</p>}
    </div>
  )


  const hasAnyContent = blogContent || newsletterContent || instagramContent || shortsScript

  // 선택된 채널에 따라 스텝 번호 동적 계산 (Step 0은 채널 선택)
  const visibleStepIds = [0, 1, 2, 3]
  if (selectedChannels.blog || selectedChannels.instagram) visibleStepIds.push(4)
  if (selectedChannels.shorts) visibleStepIds.push(5)
  const displayStepNum = (id) => visibleStepIds.indexOf(id)

  return (
    <div className="w-full">
      {/* 팝업들 (고정 위치, 레이아웃 밖) */}
      <ErrorAlert message={errorAlert} onClose={() => setErrorAlert(null)} />
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={previewImage.src} alt={previewImage.title} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
            <div className="absolute -top-10 left-0 right-0 flex items-center justify-between">
              <span className="text-sm text-white font-medium">{previewImage.title}</span>
              <button onClick={() => setPreviewImage(null)} className="text-white/70 hover:text-white transition-colors"><XCircle size={20} /></button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog message={confirmDialog} onConfirm={() => { setConfirmDialog(null); navigateToResults() }} onCancel={() => setConfirmDialog(null)} />
      {/* 크레딧 소모 확인 팝업 */}
      {creditConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-warning/10">
                <AlertTriangle size={20} className="text-warning" />
              </div>
              <h3 className="text-base font-semibold text-text">크레딧 소모 안내</h3>
            </div>
            <p className="text-sm text-text-muted mb-6">
              영상 생성 시 HeyGen 크레딧이 소모됩니다.<br />계속 진행하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreditConfirm(false)}
                className="px-5 py-2.5 bg-surface-light text-text-muted rounded-xl text-sm font-medium border border-border hover:bg-surface transition-all">
                아니오
              </button>
              <button onClick={() => { setCreditConfirm(false); runShortsGeneration() }}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-all">
                예
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 레이아웃 */}
      <div className="w-full max-w-[1400px] mx-auto px-[3%] lg:px-[5%] flex flex-col gap-5">

        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-2 bg-surface rounded-xl border border-border p-2">
          <div className="flex items-center gap-1 flex-1">
            {steps.filter(s => {
              if (s.id === 4) return selectedChannels.blog || selectedChannels.instagram
              if (s.id === 5) return selectedChannels.shorts
              return true
            }).map((step, i, arr) => {
              const Icon = step.icon
              const isActive = step.id === currentStep
              const isDone = step.id < currentStep
              const hasError = stepErrors[['select', 'upload', 'analysis', 'content', 'media', 'shorts'][step.id]]?.length > 0
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <button
                    onClick={() => document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full justify-center
                      ${isActive ? 'bg-primary/15 text-primary-light' :
                        isDone && !hasError ? 'text-success hover:bg-success/5 cursor-pointer' :
                        isDone && hasError ? 'text-warning hover:bg-warning/5 cursor-pointer' :
                        'text-text-muted opacity-50'}`}
                  >
                    {isDone && !hasError ? <CheckCircle size={14} /> :
                     isDone && hasError ? <AlertTriangle size={14} /> :
                     <Icon size={14} />}
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {i < arr.length - 1 && <ArrowRight size={12} className="text-text-muted mx-1 shrink-0" />}
                </div>
              )
            })}
          </div>
          <button
            onClick={() => setDemoMode(prev => !prev)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 ${demoMode ? 'bg-warning/15 text-warning border border-warning/30' : 'bg-surface-light text-text-muted border border-border hover:border-primary/30'}`}
          >
            {demoMode ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
            데모
          </button>
        </div>

        {/* 스텝 카드들 */}
        <div className="space-y-6">

      {/* Step 0: 채널 선택 */}
      <div id="step-0" className={`bg-surface rounded-xl border transition-all ${currentStep === 0 ? 'border-primary/40' : 'border-border'}`}>
        <div className="flex items-center justify-between gap-4 p-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${channelsConfirmed ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <CheckCircle size={14} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-sm">Step 0. 채널 선택</h3>
              <p className="text-[11px] text-text-muted">작업할 채널을 선택하세요</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {CHANNEL_OPTIONS.map(ch => {
              const Icon = ch.icon
              const isSelected = selectedChannels[ch.key]
              return (
                <button
                  key={ch.key}
                  onClick={() => { setSelectedChannels(p => ({ ...p, [ch.key]: !p[ch.key] })); setChannelsConfirmed(false) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    isSelected
                      ? `${ch.bg} ${ch.border} ${ch.color}`
                      : 'bg-surface-light border-border text-text-muted hover:border-primary/20'
                  }`}
                >
                  <Icon size={12} />
                  {ch.label}
                  {isSelected && <CheckCircle size={10} />}
                </button>
              )
            })}
            {!channelsConfirmed ? (
              <button
                onClick={() => {
                  if (Object.values(selectedChannels).filter(Boolean).length === 0) return
                  setChannelsConfirmed(true)
                  // 이미 완료된 가장 최근 단계 다음으로 이동
                  if (!file) setCurrentStep(1)
                  else if (!summary) setCurrentStep(2)
                  else setCurrentStep(3)
                }}
                disabled={Object.values(selectedChannels).filter(Boolean).length === 0}
                className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <CheckCircle size={11} /> 확정
              </button>
            ) : (
              <button
                onClick={() => {
                  setChannelsConfirmed(false)
                  // 파일과 문서 분석 결과는 유지하고 후속 단계(요약/콘텐츠/미디어)만 초기화
                  resetFromStep(3)
                  setCurrentStep(0)
                }}
                className="px-3 py-1.5 bg-surface-light text-text-muted text-xs font-medium rounded-lg hover:bg-surface hover:text-text transition-all border border-border flex items-center gap-1"
              >
                <RefreshCw size={11} /> 변경
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step 1: PDF Upload (프롬프트 없음) */}
      <div id="step-1" className={`bg-surface rounded-xl border transition-all ${currentStep === 1 ? 'border-primary/40' : 'border-border'} ${currentStep < 1 ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${file ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <Upload size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-base">Step {displayStepNum(1)}. 문서 업로드</h3>
              <p className="text-xs text-text-muted">분석할 문서 파일을 업로드하세요</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {file && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 업로드 완료</span>}
          </div>
        </div>
        <div className="p-5">
          {!file ? (
            <>
              {demoMode ? (
                <div className="flex flex-col items-center gap-3 p-10">
                  <p className="text-xs text-text-muted">데모 모드에서는 파일 업로드 없이 진행합니다.</p>
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
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleFileInput} />
                  <Upload size={28} className="mx-auto mb-3 text-text-muted" />
                  <p className="text-sm text-text">파일을 드래그하거나 <span className="text-primary font-medium">클릭</span>하여 업로드</p>

                  <p className="text-xs text-text-muted mt-1">PDF, HWP, DOCX, PPTX, 이미지(JPG/PNG/WEBP) 지원</p>
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
              <button
                onClick={() => {
                  setFile(null)
                  setChannelsConfirmed(false)
                  resetFromStep(1)
                  setCurrentStep(0)
                }}
                className="text-sm text-text-muted hover:text-danger transition-colors"
              >
                변경
              </button>
            </div>
          )}

        </div>
        <ErrorPanel errors={stepErrors.upload} />
      </div>

      {/* Step 2: Analysis */}
      <div id="step-2" className="flex gap-4 items-stretch">
      {/* Step 3 프롬프트 (Step 2 옆에 배치, 요약에 적용) */}
      <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${currentStep < 2 ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> 요약 설정</p>
        {PF('강조 키워드', { optional: true, placeholder: '쉼표 구분', value: promptSettings.summary.keywords, onChange: v => updatePrompt('summary', 'keywords', v) })}
        {PF('요약 스타일', { type: 'select', value: promptSettings.summary.style, onChange: v => updatePrompt('summary', 'style', v), options: [{ value: 'auto', label: '자동' }, { value: 'data', label: '데이터 중심' }, { value: 'story', label: '스토리텔링' }, { value: 'compare', label: '비교 분석' }] })}
        {PF('추가 지시사항', { optional: true, type: 'textarea', placeholder: '예: 학부모 관점 강조', value: promptSettings.summary.extra, onChange: v => updatePrompt('summary', 'extra', v) })}
      </div>
      <div className={`flex-1 min-w-0 bg-surface rounded-xl border transition-all ${currentStep === 2 ? 'border-primary/40' : 'border-border'} ${currentStep < 2 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${verification ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <Brain size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-base">Step {displayStepNum(2)}. 문서 분석 & 요약</h3>
              <p className="text-xs text-text-muted">PDF 텍스트 추출, 데이터 검증 및 핵심 요약</p>
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
            {verification && (
              <button
                onClick={runAnalysis}
                disabled={loading.analysis}
                className="px-3 py-1.5 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-surface hover:text-text disabled:opacity-50 transition-all flex items-center gap-1.5 border border-border"
              >
                {loading.analysis ? <><Loader2 size={12} className="animate-spin" /> 재분석중...</> : <><RefreshCw size={12} /> 재분석</>}
              </button>
            )}
          </div>
        </div>
        {(parsedText || verification || summary) && (
          <div className="p-5 space-y-3">
            {/* 로딩 상태 */}
            {(loading.analysis || loading.summary) && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Loader2 size={16} className="text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium text-text">{loading.analysis ? '자료를 분석하고 있습니다...' : '핵심 요약을 생성하고 있습니다...'}</p>
                  <p className="text-xs text-text-muted mt-0.5">{loading.analysis ? 'PDF 파싱 → 데이터 검증' : '핵심 데이터 요약 및 인사이트 도출'}</p>
                </div>
              </div>
            )}

            {/* 추출 텍스트 토글 */}
            {parsedText && !loading.analysis && (
              <div>
                <button onClick={() => setShowParsedText(!showParsedText)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors">
                  {showParsedText ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  추출된 텍스트 {showParsedText ? '접기' : '보기'} ({parsedText.length.toLocaleString()}자)
                  {verification && <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${verification.isValid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    신뢰도 {Math.round((verification.confidence || 0) * 100)}%
                  </span>}
                </button>
                {showParsedText && (
                  <div className="mt-2 space-y-2">
                    {/* 수정 내역 */}
                    {verification?.issues?.length > 0 && (
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-400 mb-1.5">수정 내역</p>
                        <ul className="text-xs text-text-muted space-y-1">
                          {verification.issues.map((issue, i) => <li key={i}>- {issue}</li>)}
                        </ul>
                      </div>
                    )}
                    {/* 심각한 이슈 시 액션 버튼 */}
                    {verification?.issues?.length > 0 && !verification.isValid && (
                      <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                        <p className="text-sm font-medium text-warning mb-2">구조적 문제가 발견되었습니다:</p>
                        <div className="flex gap-2">
                          <button onClick={fixIssuesWithAI} disabled={fixingIssues}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary-light text-sm font-medium rounded-lg hover:bg-primary/20 disabled:opacity-50 transition-all">
                            {fixingIssues ? <><Loader2 size={11} className="animate-spin" /> AI 수정중...</> : <><Sparkles size={11} /> AI 자동 수정</>}
                          </button>
                          <button onClick={() => { setEditedText(parsedText); setEditingText(true) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-border transition-all border border-border">
                            <PenTool size={11} /> 직접 수정
                          </button>
                          <button onClick={retryAnalysis} disabled={loading.analysis}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 text-warning text-sm font-medium rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-all border border-warning/20">
                            {loading.analysis ? <><Loader2 size={11} className="animate-spin" /> 분석중...</> : <><RefreshCw size={11} /> 재시도</>}
                          </button>
                        </div>
                      </div>
                    )}
                    {editingText ? (
                      <div className="space-y-2">
                        <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)}
                          className="w-full bg-surface-light rounded-lg p-3 max-h-96 min-h-48 text-sm text-text whitespace-pre-wrap border border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingText(false)} className="px-3 py-1.5 text-sm text-text-muted hover:bg-surface-light rounded-lg transition-all">취소</button>
                          <button onClick={saveEditedText} className="px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all">저장</button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-surface-light rounded-lg p-3 max-h-64 overflow-y-auto">
                        <pre className="text-xs text-text-muted whitespace-pre-wrap">{parsedText.slice(0, 3000)}{parsedText.length > 3000 ? '\n\n... (이하 생략)' : ''}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 요약 결과 토글 */}
            {summary && !loading.summary && (
              <div>
                <button onClick={() => setShowSummaryDetail(!showSummaryDetail)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors">
                  {showSummaryDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  요약 결과 {showSummaryDetail ? '접기' : '보기'}
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-success/10 text-success">완료</span>
                </button>
                {showSummaryDetail && (
                  <div className="mt-2 bg-surface-light rounded-lg border border-border p-4 space-y-3">
                    <h4 className="text-sm font-bold text-text">{summary.title}</h4>
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
                    {summary.keyData?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-text mb-1.5">핵심 데이터</p>
                        <div className="grid grid-cols-2 gap-2">
                          {summary.keyData.map((d, i) => (
                            <div key={i} className="bg-primary/5 border border-primary/10 rounded-lg p-2.5">
                              <p className="text-[10px] text-text-muted">{d.label}</p>
                              <p className="text-xs font-semibold text-primary-light">{d.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.analysis} onRetry={retryAnalysis} retrying={retrying} />
      </div>
      </div>

      {/* Step 3: Content Generation */}
      <div id="step-3" className="flex gap-4 items-stretch">
        <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${currentStep < 3 ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> 콘텐츠 설정</p>
          {PF('글의 어조', { type: 'select', value: promptSettings.content.tone, onChange: v => updatePrompt('content', 'tone', v), options: [{ value: 'auto', label: '자동' }, { value: 'friendly', label: '친근한' }, { value: 'professional', label: '전문적인' }, { value: 'humorous', label: '유머러스' }, { value: 'formal', label: '진지한' }] })}
          {PF('공통 추가 지시', { optional: true, type: 'textarea', placeholder: '모든 채널에 공통 적용', value: promptSettings.content.commonExtra, onChange: v => updatePrompt('content', 'commonExtra', v) })}
          <div className="border-t border-border/30 my-1" />
          {PF('📝 블로그', { optional: true, type: 'textarea', placeholder: 'SEO 키워드 등', value: promptSettings.content.blogExtra, onChange: v => updatePrompt('content', 'blogExtra', v) })}
          {PF('📧 뉴스레터', { optional: true, type: 'textarea', placeholder: '구독자 톤, CTA 등', value: promptSettings.content.newsletterExtra, onChange: v => updatePrompt('content', 'newsletterExtra', v) })}
          {PF('📷 인스타', { optional: true, type: 'textarea', placeholder: '수치 강조 등', value: promptSettings.content.instaExtra, onChange: v => updatePrompt('content', 'instaExtra', v) })}
          {PF('🎬 숏폼', { optional: true, type: 'textarea', placeholder: '후킹 문구 등', value: promptSettings.content.shortsExtra, onChange: v => updatePrompt('content', 'shortsExtra', v) })}
        </div>
        <div className={`flex-1 min-w-0 bg-surface rounded-xl border transition-all ${currentStep === 3 ? 'border-primary/40' : 'border-border'} ${currentStep < 3 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasAnyContent ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <PenTool size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-base">Step {displayStepNum(3)}. 콘텐츠 생성</h3>
              <p className="text-xs text-text-muted">컨텐츠에 적합한 문구 생성</p>
            </div>
          </div>
          <div className="flex items-center gap-2">

            {hasAnyContent && (() => {
              const total = Object.values(selectedChannels).filter(Boolean).length
              return (
                <span className={`text-xs font-medium flex items-center gap-1 ${stepErrors.content?.length ? 'text-warning' : 'text-success'}`}>
                  {stepErrors.content?.length ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                  {total - (stepErrors.content?.length || 0)}/{total} 채널 생성 완료
                </span>
              )
            })()}
            {currentStep === 3 && !hasAnyContent && (
              <button
                onClick={runContentGeneration}
                disabled={loading.content || loading.analysis || loading.summary}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading.content ? <><Loader2 size={14} className="animate-spin" /> 생성중...</> : <><Sparkles size={14} /> 실행</>}
              </button>
            )}
            {hasAnyContent && (
              <button
                onClick={runContentGeneration}
                disabled={loading.content || loading.analysis || loading.summary}
                className="px-3 py-1.5 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-surface hover:text-text disabled:opacity-50 transition-all flex items-center gap-1.5 border border-border"
              >
                {loading.content ? <><Loader2 size={12} className="animate-spin" /> 재생성중...</> : <><RefreshCw size={12} /> 전체 재생성</>}
              </button>
            )}
          </div>
        </div>
        {hasAnyContent && (
          <div className="p-5">
            <div className="space-y-2">
              {[
                { key: 'blog', label: '네이버 블로그', icon: FileText, color: 'text-emerald-500 bg-emerald-500/10', data: blogContent, detail: blogContent ? `${blogContent.sections?.length || 0}개 섹션` : null },
                { key: 'newsletter', label: '뉴스레터', icon: Mail, color: 'text-blue-500 bg-blue-500/10', data: newsletterContent, detail: newsletterContent ? `${newsletterContent.keyPoints?.length || 0}개 포인트` : null },
                { key: 'instagram', label: '인스타그램', icon: ImageIcon, color: 'text-pink-400 bg-pink-400/10', data: instagramContent, detail: instagramContent ? `본문 작성` : null },
                { key: 'shorts', label: '숏폼 대본', icon: Film, color: 'text-red-500 bg-red-500/10', data: shortsScript, detail: shortsScript ? `${shortsScript.scenes?.length || 0}씬 · ${shortsScript.duration || 0}초` : null },
              ].filter(ch => selectedChannels[ch.key]).map((ch, i) => {
                const Icon = ch.icon
                const errObj = stepErrors.content?.find(e => e.channel === ch.label)
                const failed = !ch.data && !!errObj
                return (
                  <div key={i}
                    onClick={() => ch.data && setContentPreview(prev => prev === ch.key ? null : ch.key)}
                    className={`rounded-lg px-4 py-3 border transition-all flex items-center gap-3 ${ch.data ? 'cursor-pointer hover:shadow-md' : ''} ${contentPreview === ch.key ? 'ring-2 ring-primary/40' : ''} ${failed ? 'bg-danger/5 border-danger/20' : ch.data ? 'bg-success/5 border-success/20' : 'bg-surface-light border-border'}`}>
                    <span className={`p-1.5 rounded-lg ${ch.color} shrink-0`}><Icon size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text">{ch.label}</span>
                        {ch.data && <span className="text-xs text-text-muted">{ch.detail}</span>}
                      </div>
                    </div>
                    {ch.data ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <CheckCircle size={12} className="text-success" />
                          <span className="text-xs text-success">완료</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); regenerateChannel(ch.key) }}
                          disabled={retrying === `regen-${ch.key}`}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-light hover:bg-surface text-text-muted text-[11px] font-medium transition-all border border-border disabled:opacity-50"
                        >
                          {retrying === `regen-${ch.key}`
                            ? <><Loader2 size={10} className="animate-spin" /> 생성중</>
                            : <><RefreshCw size={10} /> 재생성</>
                          }
                        </button>
                      </div>
                    ) : failed ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <XCircle size={12} className="text-danger" />
                          <span className="text-xs text-danger">실패</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); retryContentChannel(errObj) }}
                          disabled={retrying === `${errObj.service}-${errObj.channel}`}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary-light text-xs font-medium transition-all"
                        >
                          {retrying === `${errObj.service}-${errObj.channel}`
                            ? <><Loader2 size={10} className="animate-spin" /> 재시도중</>
                            : <><RefreshCw size={10} /> 재시도</>
                          }
                        </button>
                      </div>
                    ) : loading.content ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Loader2 size={12} className="text-text-muted animate-spin" />
                        <span className="text-xs text-text-muted">생성중...</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted shrink-0">-</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 콘텐츠 미리보기 */}
            {contentPreview && (
              <div className="mt-4 bg-background rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-light">
                  <span className="text-sm font-semibold text-text">
                    {contentPreview === 'blog' && '📝 블로그 미리보기'}
                    {contentPreview === 'newsletter' && '📧 뉴스레터 미리보기'}
                    {contentPreview === 'instagram' && '📷 인스타그램 미리보기'}
                    {contentPreview === 'shorts' && '🎬 숏폼 대본 미리보기'}
                  </span>
                  <button onClick={() => setContentPreview(null)} className="text-text-muted hover:text-text transition-colors"><XCircle size={16} /></button>
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto text-sm text-text space-y-3">

                  {/* 블로그 */}
                  {contentPreview === 'blog' && blogContent && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-base font-bold text-text">{blogContent.title}</h4>
                        {blogContent.metaDescription && <p className="text-xs text-text-muted mt-1">{blogContent.metaDescription}</p>}
                      </div>
                      {blogContent.sections?.map((sec, i) => (
                        <div key={i} className="border-l-2 border-primary/30 pl-3">
                          <h5 className="font-semibold text-sm text-text">{sec.heading}</h5>
                          {sec.keyPhrase && <span className="inline-block text-xs bg-primary/10 text-primary-light px-2 py-0.5 rounded mt-1">{sec.keyPhrase}</span>}
                          <p className="text-sm text-text-muted mt-1.5 whitespace-pre-wrap">{sec.content}</p>
                        </div>
                      ))}
                      {blogContent.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                          {blogContent.tags.map((tag, i) => <span key={i} className="text-xs px-2 py-0.5 bg-surface-light rounded-full text-text-muted">#{tag}</span>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 뉴스레터 */}
                  {contentPreview === 'newsletter' && newsletterContent && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-text-muted mb-1">제목</p>
                        <h4 className="text-base font-bold text-text">{newsletterContent.subject}</h4>
                        {newsletterContent.preheader && <p className="text-xs text-text-muted mt-1">{newsletterContent.preheader}</p>}
                      </div>
                      {newsletterContent.headline && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-1">헤드라인</p>
                          <p className="text-sm font-semibold text-text">{newsletterContent.headline}</p>
                        </div>
                      )}
                      {newsletterContent.keyPoints?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-1">핵심 포인트</p>
                          <ul className="space-y-1">
                            {newsletterContent.keyPoints.map((point, i) => (
                              <li key={i} className="text-sm text-text flex items-start gap-2">
                                <CheckCircle size={13} className="text-primary shrink-0 mt-0.5" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {newsletterContent.body && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-1">본문</p>
                          <p className="text-sm text-text-muted whitespace-pre-wrap leading-6">{newsletterContent.body}</p>
                        </div>
                      )}
                      {newsletterContent.dataHighlights?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-1">데이터 하이라이트</p>
                          <div className="grid grid-cols-2 gap-2">
                            {newsletterContent.dataHighlights.map((d, i) => (
                              <div key={i} className="bg-surface-light rounded-lg p-2.5 border border-border text-center">
                                <p className="text-sm font-bold text-primary-light">{d.value}</p>
                                <p className="text-xs text-text-muted mt-0.5">{d.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {newsletterContent.cta?.text && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs font-semibold text-text-muted mb-1">CTA</p>
                          <p className="text-sm font-semibold text-text">{newsletterContent.cta.text}</p>
                          {newsletterContent.cta.description && <p className="text-xs text-text-muted mt-0.5">{newsletterContent.cta.description}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 인스타그램 */}
                  {contentPreview === 'instagram' && instagramContent && (
                    <div className="space-y-3">
                      {instagramContent.caption && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-1">캡션</p>
                          <p className="text-sm text-text whitespace-pre-wrap">{instagramContent.caption}</p>
                        </div>
                      )}
                      {instagramContent.cardTopics?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-text-muted mb-2">카드 소재 ({instagramContent.cardTopics.length}개)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {instagramContent.cardTopics.map((card, i) => (
                              <div key={i} className="bg-surface-light rounded-lg p-2.5 border border-border">
                                <p className="text-xs font-bold text-text">{card.headline}</p>
                                <p className="text-xs text-text-muted mt-0.5">{card.content}</p>
                                {card.dataPoint && <p className="text-xs font-semibold text-primary mt-1">{card.dataPoint}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {instagramContent.hashtags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {instagramContent.hashtags.map((tag, i) => <span key={i} className="text-xs text-primary-light">{tag}</span>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 숏폼 대본 */}
                  {contentPreview === 'shorts' && shortsScript && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-base font-bold text-text">{shortsScript.title}</h4>
                        <p className="text-xs text-text-muted">총 {shortsScript.duration}초 · {shortsScript.scenes?.length || 0}씬</p>
                      </div>

                      {/* 서브탭: 대본 / 업로드 정보 */}
                      <div className="flex gap-1 p-1 bg-surface-light rounded-lg border border-border">
                        <button
                          onClick={() => setShortsTab('script')}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${shortsTab === 'script' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text'}`}
                        >
                          🎬 대본
                        </button>
                        <button
                          onClick={() => setShortsTab('upload')}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${shortsTab === 'upload' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text'}`}
                        >
                          📺 업로드 정보
                        </button>
                      </div>

                      {/* 대본 탭 */}
                      {shortsTab === 'script' && (
                        <div className="space-y-3">
                          {shortsScript.hook && (
                            <div className="bg-warning/10 rounded-lg p-2.5 border border-warning/20">
                              <p className="text-xs font-semibold text-warning mb-0.5">🎣 오프닝 훅</p>
                              <p className="text-sm text-text">{shortsScript.hook}</p>
                            </div>
                          )}
                          {shortsScript.scenes?.map((scene, i) => (
                            <div key={i} className="border-l-2 border-warning/30 pl-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">씬 {scene.sceneNumber}</span>
                                <span className="text-xs text-text-muted">{scene.duration}초</span>
                              </div>
                              <p className="text-sm text-text">{scene.narration}</p>
                              {scene.textOverlay && <p className="text-xs text-text-muted mt-1">📌 {scene.textOverlay}</p>}
                              {scene.visualDescription && <p className="text-xs text-text-muted/60 mt-0.5">🎬 {scene.visualDescription}</p>}
                            </div>
                          ))}
                          {shortsScript.cta && (
                            <div className="bg-primary/5 rounded-lg p-2.5 border border-primary/20">
                              <p className="text-xs font-semibold text-primary mb-0.5">📢 CTA</p>
                              <p className="text-sm text-text">{shortsScript.cta}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 업로드 정보 탭 */}
                      {shortsTab === 'upload' && (
                        <div className="space-y-2.5">
                          {!shortsScript.uploadTitle && !shortsScript.uploadDescription && !shortsScript.hashtags?.length && (
                            <div className="text-center py-8 text-text-muted">
                              <p className="text-sm">업로드 정보가 생성되지 않았습니다.</p>
                              <p className="text-xs mt-1">대본을 다시 생성해주세요.</p>
                            </div>
                          )}
                          {shortsScript.uploadTitle && (
                            <div className="bg-surface-light rounded-lg p-3 border border-border">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-semibold text-text-muted">제목</p>
                                <span className="text-[10px] text-text-muted">{shortsScript.uploadTitle.length}/60자</span>
                              </div>
                              <p className="text-sm text-text font-medium">{shortsScript.uploadTitle}</p>
                            </div>
                          )}
                          {shortsScript.uploadDescription && (
                            <div className="bg-surface-light rounded-lg p-3 border border-border">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-semibold text-text-muted">설명</p>
                                <span className="text-[10px] text-text-muted">{shortsScript.uploadDescription.length}자</span>
                              </div>
                              <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{shortsScript.uploadDescription}</p>
                            </div>
                          )}
                          {shortsScript.hashtags?.length > 0 && (
                            <div className="bg-surface-light rounded-lg p-3 border border-border">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-text-muted">태그</p>
                                <span className="text-[10px] text-text-muted">{shortsScript.hashtags.length}개</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {shortsScript.hashtags.map((tag, i) => (
                                  <span key={i} className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 font-medium">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        )}
        {stepErrors.content?.length > 1 && (
          <div className="mx-5 mb-4">
            <button
              onClick={retryAllFailedContent}
              disabled={retrying === 'content-all'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-all border border-primary/20 disabled:opacity-50"
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
      </div>

      {/* Step 4: Media Generation */}
      {(selectedChannels.blog || selectedChannels.instagram) && (
      <div id="step-4" className="flex gap-4 items-stretch">
        <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${currentStep < 4 ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> 이미지 설정</p>
          {PF('이미지 스타일', { type: 'select', value: promptSettings.media.imageStyle, onChange: v => updatePrompt('media', 'imageStyle', v), options: [{ value: 'pastel', label: '파스텔 일러스트' }, { value: '3d', label: '3D 렌더링' }, { value: 'minimal', label: '미니멀 플랫' }, { value: 'photo', label: '사실적 사진' }, { value: 'watercolor', label: '수채화' }] })}
          {PF('메인 컬러', { type: 'select', value: promptSettings.media.mainColor, onChange: v => updatePrompt('media', 'mainColor', v), options: [{ value: 'auto', label: '자동' }, { value: 'blue', label: '파란 계열' }, { value: 'pink', label: '분홍 계열' }, { value: 'green', label: '초록 계열' }, { value: 'purple', label: '보라 계열' }] })}
          {PF('추가 지시사항', { optional: true, type: 'textarea', placeholder: '캐릭터 포함 등', value: promptSettings.media.extra, onChange: v => updatePrompt('media', 'extra', v) })}
        </div>
        <div className={`flex-1 min-w-0 bg-surface rounded-xl border transition-all ${currentStep === 4 ? 'border-primary/40' : 'border-border'} ${currentStep < 4 ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${blogImages ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <ImageIcon size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-base">Step {displayStepNum(4)}. 이미지 생성</h3>
              <p className="text-xs text-text-muted">블로그/인스타그램 이미지 생성</p>
            </div>
          </div>
          <div className="flex items-center gap-2">

            {currentStep >= 4 && !loading.media && !mediaGenerationDone && (
              <button
                onClick={runMediaGeneration}
                disabled={loading.analysis || loading.summary || loading.content}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-2"
              >
                <Sparkles size={14} /> 전체 실행
              </button>
            )}
            {mediaGenerationDone && !loading.media && (
              <button
                onClick={runMediaGeneration}
                disabled={loading.analysis || loading.summary || loading.content}
                className="px-3 py-1.5 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-surface hover:text-text disabled:opacity-50 transition-all flex items-center gap-1.5 border border-border"
              >
                <RefreshCw size={12} /> 전체 재생성
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
        {currentStep >= 4 && (
          <div className="p-5 space-y-4">
            {/* 블로그 이미지 */}
            {selectedChannels.blog && (() => {
              const failed = stepErrors.media?.some(e => e.channel === '블로그 이미지')
              const isLoading = mediaItemLoading['블로그 이미지']
              const ok = blogImages?.some(i => i.imageUrl)
              return (
                <div className={`rounded-lg p-3 border ${
                  isLoading ? 'bg-primary/5 border-primary/20' :
                  failed ? 'bg-danger/5 border-danger/20' :
                  ok ? 'bg-success/5 border-success/20' :
                  'bg-surface-light border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <ImageIcon size={12} className="text-purple-400" />
                      <p className="text-sm font-medium text-text">블로그 이미지</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLoading && <div className="flex items-center gap-1"><Loader2 size={10} className="text-primary animate-spin" /><span className="text-xs text-primary">생성중...</span></div>}
                      {!isLoading && ok && <div className="flex items-center gap-1"><CheckCircle size={10} className="text-success" /><p className="text-xs text-success">{blogImages.filter(i => i.imageUrl).length}/{blogImages.length}개</p></div>}
                      {!isLoading && failed && <div className="flex items-center gap-1"><XCircle size={10} className="text-danger" /><span className="text-xs text-danger">실패</span></div>}
                      {!isLoading && !ok && !failed && <span className="text-xs text-text-muted">대기</span>}
                      {!isLoading && !ok && !!blogContent?.sections && !loading.media && (
                        <button onClick={() => runSingleMedia('blogImg')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-all border border-primary/20"><Sparkles size={10} /> 실행</button>
                      )}
                      {!isLoading && ok && !loading.media && (
                        <button onClick={() => runSingleMedia('blogImg')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-light hover:bg-surface text-text-muted text-sm font-medium transition-all border border-border"><RefreshCw size={10} /> 재생성</button>
                      )}
                    </div>
                  </div>
                  {ok && (
                    <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                      {blogImages.filter(i => i.imageUrl).map((img, i) => (
                        <div
                          key={i}
                          onClick={() => setPreviewImage({ src: img.imageUrl, title: `블로그 이미지 ${i + 1}` })}
                          className="shrink-0 w-20 h-14 rounded-md overflow-hidden border border-border bg-surface-light cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                        >
                          <img src={img.imageUrl} alt={`블로그 ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 인스타 카드 */}
            {selectedChannels.instagram && (() => {
              const failed = stepErrors.media?.some(e => e.channel === '인스타 카드')
              const isLoading = mediaItemLoading['인스타 카드']
              const ok = instagramImages?.length > 0
              const hasImages = instagramImages?.some(i => i.imageUrl)
              return (
                <div className={`rounded-lg p-3 border ${
                  isLoading ? 'bg-primary/5 border-primary/20' :
                  failed ? 'bg-danger/5 border-danger/20' :
                  ok ? 'bg-success/5 border-success/20' :
                  'bg-surface-light border-border'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <ImageIcon size={12} className="text-pink-400" />
                      <p className="text-sm font-medium text-text">인스타 카드</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLoading && <div className="flex items-center gap-1"><Loader2 size={10} className="text-primary animate-spin" /><span className="text-xs text-primary">생성중...</span></div>}
                      {!isLoading && ok && <div className="flex items-center gap-1"><CheckCircle size={10} className="text-success" /><p className="text-xs text-success">{instagramImages.length}장 카드</p></div>}
                      {!isLoading && failed && <div className="flex items-center gap-1"><XCircle size={10} className="text-danger" /><span className="text-xs text-danger">실패</span></div>}
                      {!isLoading && !ok && !failed && <span className="text-xs text-text-muted">대기</span>}
                      {!isLoading && !ok && !!instagramContent?.cardTopics?.length && !loading.media && (
                        <button onClick={() => runSingleMedia('instaImg')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary-light text-sm font-medium transition-all border border-primary/20"><Sparkles size={10} /> 실행</button>
                      )}
                      {!isLoading && ok && !loading.media && (
                        <button onClick={() => runSingleMedia('instaImg')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-light hover:bg-surface text-text-muted text-sm font-medium transition-all border border-border"><RefreshCw size={10} /> 재생성</button>
                      )}
                    </div>
                  </div>
                  {hasImages && (
                    <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                      {instagramImages.filter(i => i.imageUrl).map((img, i) => (
                        <div
                          key={i}
                          onClick={() => setPreviewImage({ src: img.imageUrl, title: `인스타 카드 ${i + 1}` })}
                          className="relative shrink-0 w-14 h-14 rounded-md overflow-hidden border border-border bg-surface-light cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                        >
                          <img src={img.imageUrl} alt={`인스타 ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-xs font-bold px-1 rounded">
                            {img.cardNumber || i + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
        <ErrorPanel errors={stepErrors.media} onRetry={retryMediaItem} retrying={retrying} />
      </div>
      </div>
      )}

      {/* Step 5: 숏폼 생성 (아바타 + 목소리 + 영상) */}
      {selectedChannels.shorts && (
      <div id="step-5">
        <div className={`bg-surface rounded-2xl border transition-all shadow-sm ${currentStep === 5 ? 'border-primary/40' : 'border-border'} ${currentStep < 4 ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-xl ${shortsVideo ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              <Film size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-text text-base">Step {displayStepNum(5)}. 숏폼 생성</h3>
              <p className="text-xs text-text-muted">아바타 + 나레이션 + HeyGen 영상</p>
            </div>
          </div>

          {shortsVideo && <span className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle size={14} /> 생성 완료</span>}
        </div>
        {currentStep >= 4 && (
          <div className="p-5 space-y-5">
            {!shortsScript ? (
              <p className="text-xs text-text-muted">Step 3에서 숏폼 대본이 생성되어야 합니다.</p>
            ) : (
              <>
                {/* 5-1: 아바타 생성 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">1</span>
                    <p className="text-base font-semibold text-text">아바타 생성</p>
                    {avatarImage && <CheckCircle size={14} className="text-success" />}
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={avatarPrompt}
                        onChange={e => setAvatarPrompt(e.target.value)}
                        placeholder="예: 도서관에서 공부하는 하얀 말티즈"
                        className="w-full px-3 py-2.5 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      <p className="text-xs text-text-muted mt-1">원하는 캐릭터/인물을 설명하면 정면 아바타 이미지를 생성합니다</p>
                    </div>
                    <button
                      onClick={generateAvatar}
                      disabled={!avatarPrompt.trim() || mediaItemLoading['아바타']}
                      className="px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0 h-fit"
                    >
                      {mediaItemLoading['아바타'] ? <><Loader2 size={14} className="animate-spin" /> 생성중</> : avatarImage ? <><RefreshCw size={14} /> 재생성</> : <><Sparkles size={14} /> 생성</>}
                    </button>
                  </div>
                  {avatarImage && (
                    <div className="flex flex-col items-center gap-3">
                      <div className={`w-36 rounded-xl overflow-hidden shadow-lg ${avatarConfirmed ? 'border-2 border-success/50' : 'border-2 border-primary/30'}`} style={{ aspectRatio: '9/16' }}>
                        <img src={avatarImage} alt="아바타" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage({ src: avatarImage, title: '아바타 미리보기' })} />
                      </div>
                      {avatarConfirmed ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-success flex items-center gap-1"><CheckCircle size={12} /> 확정됨</span>
                          <button onClick={() => { setAvatarConfirmed(false); setHeygenAvatarId(null); setHeygenReady(false); setHeygenUploading(false); setSelectedVoice(null); setRecommendedVoices([]) }}
                            className="text-sm text-text-muted hover:text-text transition-colors">변경</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={generateAvatar} disabled={mediaItemLoading['아바타']}
                            className="px-3 py-1.5 bg-surface-light text-text-muted text-sm font-medium rounded-lg hover:bg-border transition-all border border-border flex items-center gap-1">
                            <RefreshCw size={11} /> 재시도
                          </button>
                          <button onClick={confirmAndUploadAvatar}
                            className="px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all flex items-center gap-1">
                            <CheckCircle size={11} /> 확정
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 5-2: 나레이션 목소리 선택 (HeyGen) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">2</span>
                    <p className="text-base font-semibold text-text">나레이션 목소리</p>
                    {selectedVoice && <CheckCircle size={14} className="text-success" />}
                  </div>

                  {!avatarConfirmed ? (
                    <p className="text-xs text-text-muted p-3 bg-surface-light rounded-lg border border-border">
                      아바타를 먼저 생성하고 확정하면 어울리는 목소리를 추천해드립니다.
                    </p>
                  ) : !HEYGEN_KEY ? (
                    <p className="text-xs text-text-muted p-3 bg-surface-light rounded-lg border border-border">
                      <code>VITE_HEYGEN_API_KEY</code>를 .env.local에 추가해주세요.
                    </p>
                  ) : voicesLoading ? (
                    <div className="flex items-center gap-2 p-3">
                      <Loader2 size={14} className="text-primary animate-spin" />
                      <span className="text-xs text-text-muted">캐릭터에 어울리는 목소리 추천 중...</span>
                    </div>
                  ) : voicesError ? (
                    <p className="text-sm text-danger p-3 bg-danger/5 rounded-lg border border-danger/20">{voicesError}</p>
                  ) : (
                    <>
                      {/* 선택된 음성 표시 */}
                      {selectedVoice && (() => {
                        const sv = filteredVoices.find(v => v.voice_id === selectedVoice) || displayVoices.find(v => v.voice_id === selectedVoice)
                        if (!sv) return null
                        const svName = sv.display_name || sv.name || selectedVoice
                        const svGender = sv.gender || ''
                        return (
                          <div className="flex items-center gap-3 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
                            <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                              {svGender.toLowerCase().startsWith('f') ? 'F' : svGender.toLowerCase().startsWith('m') ? 'M' : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-primary truncate">{svName}</p>
                              <p className="text-xs text-text-muted">{[sv.language, svGender].filter(Boolean).join(' · ')}</p>
                            </div>
                            <CheckCircle size={14} className="text-primary shrink-0" />
                          </div>
                        )
                      })()}
                      <div className="max-h-56 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5">
                        {filteredVoices.length === 0 ? (
                          <p className="text-xs text-text-muted text-center py-3">추천 음성을 불러오는 중...</p>
                        ) : filteredVoices.map((v, idx) => {
                          const vid = v.voice_id
                          const isSelected = selectedVoice === vid
                          const name = v.display_name || v.name || vid
                          const lang = v.language || ''
                          const gender = v.gender || ''
                          return (
                            <button
                              key={vid}
                              onClick={() => setSelectedVoice(vid)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all ${
                                isSelected
                                  ? 'bg-primary/10 border border-primary/30'
                                  : 'hover:bg-surface-light border border-transparent'
                              }`}
                            >
                              <span className={`w-5 text-[11px] font-bold text-center shrink-0 ${idx < 3 ? 'text-warning' : 'text-text-muted/40'}`}>{idx + 1}</span>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                isSelected ? 'bg-primary text-white' : 'bg-surface-light text-text-muted border border-border'
                              }`}>
                                {gender.toLowerCase().startsWith('f') ? 'F' : gender.toLowerCase().startsWith('m') ? 'M' : '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                                  {name}
                                  {lang === 'Korean' && <span className="ml-1 text-[9px] text-success bg-success/10 px-1 rounded">KO</span>}
                                </p>
                                <p className="text-xs text-text-muted truncate">{[lang, gender].filter(Boolean).join(' · ')}</p>
                              </div>
                              {v.preview_audio && (
                                <div role="button" onClick={e => { e.stopPropagation(); playPreview(vid, v.preview_audio) }}
                                  className={`p-1 rounded-md transition-all shrink-0 cursor-pointer ${playingVoice === vid ? 'bg-primary/20 text-primary' : 'bg-surface-light text-text-muted hover:text-primary'}`}>
                                  {playingVoice === vid ? <Pause size={12} /> : <Play size={12} />}
                                </div>
                              )}
                              {isSelected && <CheckCircle size={12} className="text-primary shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-xs text-text-muted">
                        🎯 AI 추천 {filteredVoices.length}개 · 캐릭터에 어울리는 순서로 정렬
                      </p>
                    </>
                  )}
                </div>

                {/* 5-3: 자막 스타일 선택 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">3</span>
                    <p className="text-base font-semibold text-text">자막 스타일</p>
                    {subtitleStyle && <CheckCircle size={14} className="text-success" />}
                  </div>
                  {/* 폰트 선택 */}
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-text-muted">폰트</p>
                    {[
                      { value: 'default', label: '기본', style: {} },
                      { value: 'bold', label: '볼드', style: { fontFamily: 'A2z, sans-serif', fontWeight: 700 } },
                      { value: 'dongle', label: '동글', style: { fontFamily: 'TmoneyRoundWind, sans-serif', fontWeight: 400 } },
                      { value: 'handwriting', label: '손글씨', style: { fontFamily: 'Maplestory, sans-serif', fontWeight: 300 } },
                      { value: 'gothic', label: '고딕', style: { fontFamily: 'KBODiaGothic, sans-serif', fontWeight: 300 } },
                    ].map(f => {
                      const isSel = subtitleFont === f.value
                      return (
                        <button
                          key={f.value}
                          onClick={() => setSubtitleFont(f.value)}
                          style={f.style}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${isSel ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-light border-border text-text-muted hover:border-primary/20'}`}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                  {/* 스타일 카드 */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'style1', label: 'Style1', desc: '흰 글자 + 검정 반투명 박스' },
                      { value: 'style2', label: 'Style2', desc: '흰 글자 + 외곽선 (배경 없음)' },
                    ].map(s => {
                      const isSelected = subtitleStyle === s.value
                      const fontStyle =
                        subtitleFont === 'bold' ? { fontFamily: 'A2z, sans-serif', fontWeight: 700 } :
                        subtitleFont === 'dongle' ? { fontFamily: 'TmoneyRoundWind, sans-serif', fontWeight: 400 } :
                        subtitleFont === 'handwriting' ? { fontFamily: 'Maplestory, sans-serif', fontWeight: 300 } :
                        subtitleFont === 'gothic' ? { fontFamily: 'KBODiaGothic, sans-serif', fontWeight: 300 } : {}
                      return (
                        <button
                          key={s.value}
                          onClick={() => setSubtitleStyle(s.value)}
                          className={`flex flex-col gap-2 p-3 rounded-xl transition-all border ${isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-surface-light border-border hover:border-primary/20'}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-text'}`}>{s.label}</p>
                            {isSelected && <CheckCircle size={14} className="text-primary" />}
                          </div>
                          <p className="text-[11px] text-text-muted text-left">{s.desc}</p>
                          <div className="bg-slate-400 rounded-lg px-2 py-2 flex items-center justify-center">
                            {s.value === 'style1' && (
                              <div className="bg-black/70 px-3 py-1.5 rounded">
                                <p className="text-white text-xs font-medium text-center" style={fontStyle}>안녕하세요 AI 분석입니다</p>
                              </div>
                            )}
                            {s.value === 'style2' && (
                              <div className="px-3 py-1.5">
                                <p className="text-white text-xs font-bold text-center" style={{ ...fontStyle, textShadow: '0 0 1px rgba(0,0,0,1), 0 0 1px rgba(0,0,0,0.8)' }}>안녕하세요 AI 분석입니다</p>
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 5-4: 영상 생성 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">4</span>
                    <p className="text-base font-semibold text-text">영상 생성</p>
                    {shortsVideo && <CheckCircle size={14} className="text-success" />}
                  </div>
                  {shortsVideo ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-success/5 rounded-lg border border-success/20">
                        <CheckCircle size={16} className="text-success" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text">숏폼 영상 생성 완료</p>
                          <p className="text-xs text-text-muted">{shortsVideo.duration || shortsScript?.duration}초</p>
                        </div>
                        <button
                          onClick={() => setCreditConfirm(true)}
                          disabled={loading.shorts}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-light hover:bg-surface text-text-muted border border-border transition-all flex items-center gap-1"
                        >
                          <RefreshCw size={10} /> 재생성
                        </button>
                      </div>
                      {shortsVideo.url && (
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-full max-w-[240px] rounded-xl overflow-hidden border-2 border-red-500/30 shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                            <video src={shortsVideo.url} controls className="w-full h-full object-contain" />
                          </div>
                          <a href={shortsVideo.url} download="shorts_video.mp4" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-all shadow-md shadow-red-500/20">
                            <Download size={14} /> 다운로드
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => demoMode ? runShortsGeneration() : setCreditConfirm(true)}
                      disabled={demoMode
                        ? (!shortsScript || loading.shorts || loading.media)
                        : (!avatarConfirmed || !selectedVoice || !shortsScript || loading.shorts || loading.media || !heygenReady)}
                      className="w-full px-4 py-3 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                      {loading.shorts
                        ? <><Loader2 size={16} className="animate-spin" /> {demoMode ? '데모 영상 준비 중...' : 'HeyGen 영상 생성 중...'}</>
                        : <><Film size={16} /> {demoMode ? '데모 숏폼 영상 로드' : '숏폼 영상 생성'}</>}
                    </button>
                  )}
                  {!avatarConfirmed && !shortsVideo && (
                    <p className="text-xs text-text-muted">아바타를 생성하고 확정해주세요</p>
                  )}
                  {avatarConfirmed && heygenUploading && !heygenReady && !shortsVideo && (
                    <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                      <Loader2 size={14} className="text-primary animate-spin" />
                      <p className="text-xs text-primary">아바타를 HeyGen에 등록 중입니다... 목소리를 선택해주세요.</p>
                    </div>
                  )}
                  {avatarConfirmed && heygenReady && !shortsVideo && !loading.shorts && (
                    <div className="flex items-center gap-2 p-2.5 bg-success/5 rounded-lg border border-success/20">
                      <CheckCircle size={14} className="text-success" />
                      <p className="text-xs text-success">아바타 준비 완료! 영상을 생성할 수 있습니다.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <ErrorPanel errors={stepErrors.shorts} onRetry={(err) => {
          if (err.channel === '아바타') { generateAvatar() }
          else { retryMediaItem(err) }
        }} retrying={retrying} />
      </div>
      </div>
      )}

      {/* View Results Button - 콘텐츠 또는 미디어가 하나라도 있으면 활성화, 로딩 중이면 비활성 */}
      <div className="flex justify-end">
        <button
          onClick={viewResults}
          disabled={!(hasAnyContent || mediaGenerationDone) || loading.content || loading.media || loading.shorts}
          className={`px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 ${
            (hasAnyContent || mediaGenerationDone) && !loading.content && !loading.media && !loading.shorts
              ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20'
              : 'bg-surface-light text-text-muted border border-border cursor-not-allowed'
          }`}
        >
          {loading.content || loading.media || loading.shorts ? (
            <><Loader2 size={18} className="animate-spin" /> 작업 중...</>
          ) : (
            <><Eye size={18} /> 결과 확인 <ArrowRight size={16} /></>
          )}
        </button>
      </div>
      </div>{/* 스텝 카드 끝 */}
      </div>{/* 메인 레이아웃 끝 */}
    </div>
  )
}
