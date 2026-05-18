import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, ChevronDown, ChevronUp, Eye, ArrowRight,
  XCircle, AlertTriangle, RefreshCw, Film, Settings2, ToggleLeft, ToggleRight, Download,
  Mail, Play
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generateBlogContent, generateNewsletterContent,
  generateInstagramContent, generateShortsScript, recommendBlogCategory
} from '../services/gemini-content'
import { generateBlogImages, generateInstagramImages } from '../services/cardImage'
import { BlogImageArtwork } from '../components/contentImageOverlays'
import KnowledgeInsightCard from '../components/KnowledgeInsightCard'
import { PRESET_SHORTS_AVATARS, findPresetShortsAvatar } from '../utils/presetShortsAvatars'
import { SHORTS_VIDEO_CONCEPT_OPTIONS, findShortsVideoConcept, buildShortsConceptExtra } from '../utils/shortsVideoConcepts'
import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
} from '../utils/contentImageOverlay'
import { renderBlogUploadImageDataUrl } from '../utils/uploadImageComposite'
import NavigationBlockerModal from '../components/NavigationBlockerModal'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { buildShortsVideoAgentPrompt, mapShortsSubtitleStyleToBurnStyle } from '../utils/shortsVideoAgent.js'
import { callGeminiWithFallback, findInlineDataPart, requestGeminiContent } from '../services/gemini-core'
import {
  BLOG_CATEGORY_OPTIONS,
  getBlogCategoryProfile,
} from '../services/blogCategoryProfile'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const RESULT_DRAFT_WINDOW_KEY = '__AUTOFORM_RESULT_DRAFTS__'
const RESULT_DRAFT_STORAGE_PREFIX = 'autoform:result-draft:'

function buildSessionPersistedResultDraft(resultState = {}) {
  return {
    ...resultState,
    fileBase64: null,
    blogImages: null,
    instagramImages: null,
    shortsVideo: null,
  }
}

function storeResultDraftSession(draftKey, resultState) {
  if (typeof window === 'undefined' || !draftKey) return

  const storageKey = `${RESULT_DRAFT_STORAGE_PREFIX}${draftKey}`
  const persistedDraft = buildSessionPersistedResultDraft(resultState)

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(persistedDraft))
    return
  } catch (error) {
    const isQuotaError = error?.name === 'QuotaExceededError'
    if (!isQuotaError) {
      console.warn('[ExtractionPage] 결과 초안 세션 저장 실패', error)
      return
    }
  }

  try {
    const draftKeys = Object.keys(sessionStorage).filter((key) => key.startsWith(RESULT_DRAFT_STORAGE_PREFIX))
    draftKeys.forEach((key) => sessionStorage.removeItem(key))
    sessionStorage.setItem(storageKey, JSON.stringify(persistedDraft))
  } catch (error) {
    console.warn('[ExtractionPage] 결과 초안 세션 저장 실패', error)
  }
}

function sanitizeHistoryState(value, seen = new WeakSet()) {
  if (value == null) return value
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value !== 'object') return value

  if (value instanceof Date) return value.toISOString()
  if (typeof File !== 'undefined' && value instanceof File) return undefined
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined

  if (seen.has(value)) return undefined
  seen.add(value)

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeHistoryState(item, seen))
      .filter((item) => item !== undefined)
  }

  const sanitized = {}
  Object.entries(value).forEach(([key, nestedValue]) => {
    const nextValue = sanitizeHistoryState(nestedValue, seen)
    if (nextValue !== undefined) {
      sanitized[key] = nextValue
    }
  })
  return sanitized
}

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  })
}

function getBlogImagePreviewUrl(image) {
  return image?.renderedImageUrl || image?.pngUrl || image?.imageUrl || null
}

function normalizeSingleThumbnail(images = [], preferredIndex = -1) {
  const list = Array.isArray(images) ? images.map((image) => ({ ...image, isThumbnail: false })) : []
  if (list.length === 0) return list
  const safeIndex = preferredIndex >= 0 && preferredIndex < list.length ? preferredIndex : 0
  list[safeIndex].isThumbnail = true
  return list
}

function normalizeBlogThumbnailSelection({
  uploadedImages = [],
  generatedImages = [],
  disabled = false,
}) {
  const safeUploaded = Array.isArray(uploadedImages) ? uploadedImages.map((image) => ({ ...image })) : []
  const safeGenerated = Array.isArray(generatedImages) ? generatedImages.map((image) => ({ ...image })) : []

  if (disabled) {
    return {
      uploadedImages: safeUploaded.map((image) => ({ ...image, isThumbnail: false })),
      generatedImages: safeGenerated.map((image) => ({ ...image, isThumbnail: false })),
    }
  }

  const selectedUploadedIndex = safeUploaded.findIndex((image) => image?.isThumbnail)
  const selectedGeneratedIndex = safeGenerated.findIndex((image) => image?.isThumbnail)

  if (selectedUploadedIndex >= 0) {
    return {
      uploadedImages: normalizeSingleThumbnail(safeUploaded, selectedUploadedIndex),
      generatedImages: safeGenerated.map((image) => ({ ...image, isThumbnail: false })),
    }
  }

  if (selectedGeneratedIndex >= 0) {
    return {
      uploadedImages: safeUploaded.map((image) => ({ ...image, isThumbnail: false })),
      generatedImages: normalizeSingleThumbnail(safeGenerated, selectedGeneratedIndex),
    }
  }

  if (safeUploaded.length > 0) {
    return {
      uploadedImages: normalizeSingleThumbnail(safeUploaded, 0),
      generatedImages: safeGenerated.map((image) => ({ ...image, isThumbnail: false })),
    }
  }

  if (safeGenerated.length > 0) {
    return {
      uploadedImages: safeUploaded,
      generatedImages: normalizeSingleThumbnail(safeGenerated, 0),
    }
  }

  return {
    uploadedImages: safeUploaded,
    generatedImages: safeGenerated,
  }
}

function resolveMediaUrl(url) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/output/') && API_BASE) return `${API_BASE}${url}`
  if (url.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${url}`
  return url
}

function getDistinctRawShortsUrl(video) {
  const rawUrl = resolveMediaUrl(video?.rawUrl)
  const finalUrl = resolveMediaUrl(video?.url || video?.videoUrl || video?.combinedVideoUrl)
  if (!rawUrl || rawUrl === finalUrl) return null
  return rawUrl
}

const steps = [
  { id: 0, label: '채널 선택', icon: CheckCircle, desc: '작업할 채널을 선택하세요' },
  { id: 1, label: '문서 업로드', icon: Upload, desc: '분석할 문서 파일을 업로드하세요' },
  { id: 2, label: '문서 분석', icon: Brain, desc: 'PDF 텍스트 추출 및 데이터 검증' },
  { id: 3, label: '블로그', icon: FileText, desc: '블로그 글 생성' },
  { id: 4, label: '뉴스레터', icon: Mail, desc: '뉴스레터 생성' },
  { id: 5, label: '인스타그램', icon: ImageIcon, desc: '인스타그램 문구 생성' },
  { id: 6, label: '숏폼', icon: Film, desc: '숏폼 대본 및 영상 생성' },
]

const CONTENT_CHANNEL_STEPS = {
  blog: 3,
  newsletter: 4,
  instagram: 5,
  shorts: 6,
}

const CONTENT_CHANNEL_ORDER = ['blog', 'newsletter', 'instagram', 'shorts']
const SHORTS_VOICE_PRESET_OPTIONS = [
  {
    value: 'auto',
    label: '자동 추천',
    narrationTone: 'auto',
    voiceStyle: 'auto',
  },
  {
    value: 'friendly',
    label: '친근한 설명형',
    narrationTone: 'friendly and conversational',
    voiceStyle: 'warm and friendly Korean narrator voice',
  },
  {
    value: 'energetic',
    label: '빠르고 에너지 있게',
    narrationTone: 'energetic and punchy',
    voiceStyle: 'bright and youthful Korean voice with lively energy',
  },
  {
    value: 'professional',
    label: '전문가형',
    narrationTone: 'professional and authoritative',
    voiceStyle: 'confident and polished Korean presenter voice',
  },
  {
    value: 'calm',
    label: '차분하고 신뢰감 있게',
    narrationTone: 'calm and trustworthy',
    voiceStyle: 'calm and intelligent Korean explainer voice',
  },
  {
    value: 'cute',
    label: '귀엽고 캐릭터처럼',
    narrationTone: 'friendly and conversational',
    voiceStyle: 'cute and lovable Korean character voice',
  },
]

const CHANNEL_OPTIONS = [
  { key: 'blog',       label: '네이버 블로그', icon: FileText,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'newsletter', label: '뉴스레터',      icon: Mail,      color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  { key: 'instagram',  label: '인스타그램',    icon: ImageIcon, color: 'text-pink-500',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30' },
  { key: 'shorts',     label: '유튜브 쇼츠/릴스', icon: Film,    color: 'text-red-500',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
]

// AI 서비스별 색상 매핑
const aiServiceInfo = {
  llamaparse: { name: 'LlamaParse', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  gemini: { name: 'Gemini', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
}

const MOCK_DELAY = 800

const mockParsedText = `[데모 모드] 2026년 디지털 교육 전환 트렌드 보고서

1. 교육 현장 도입 현황
- 초중고 디지털 학습 플랫폼 도입률: 78.4%
- 대학 및 평생교육기관 LMS 활용률: 83.1%
- AI 기반 학습 지원 도구 도입 학교 비율: 46.7%

2. 학습 성과 변화
- 개인화 학습 적용 시 과제 완수율: +26.8%
- 실시간 피드백 제공 시 학습 지속률: +18.5%
- AI 튜터 활용 수업 만족도: 91.2점

3. 주요 운영 방식
- 실시간 수업과 비동기 학습 병행: 64.3%
- 마이크로러닝 콘텐츠 운영: 58.9%
- 교사 지원형 자동 채점 및 피드백: 42.6%

4. 핵심 트렌드
- AI 기반 맞춤형 학습 경로 추천 확대
- 짧고 반복 가능한 마이크로러닝 콘텐츠 증가
- 교사 행정 업무를 줄이는 자동 피드백 도구 확산
- 온오프라인 혼합형 수업 운영 모델 정착`

// 데모 모드에서는 Gemini 를 호출하지 않고 아래 더미 데이터를 그대로 사용한다.
const mockVerification = {
  isValid: true,
  issues: [],
  correctedText: mockParsedText,
  confidence: 0.95,
}

const mockSummary = {
  title: '2026 디지털 교육 전환 트렌드 보고서',
  keyData: [
    { label: '초중등 AI 학습 플랫폼 도입률', value: '78.4%', context: '2026년 기준 전국 표본' },
    { label: '대학·평생교육기관 LMS 활용률', value: '83.1%', context: '전년 대비 확대' },
    { label: '개인화 학습 과제 완수율', value: '+26.8%', context: '맞춤형 수업 적용 시' },
    { label: '실시간 피드백 학습 지속률', value: '+18.5%', context: '즉시 피드백 환경' },
    { label: 'AI 튜터 활용 만족도', value: '91.2점', context: '학습자 응답' },
    { label: '마이크로러닝 운영 비율', value: '58.9%', context: '전체 콘텐츠 중' },
  ],
  insights: [
    'AI 기반 개인화 학습이 과제 완수율과 지속률을 동시에 끌어올린다.',
    '실시간 피드백과 마이크로러닝이 디지털 학습 만족도를 좌우한다.',
    '혼합형 수업 모델(실시간 + 비동기)이 교육기관 표준으로 정착하고 있다.',
  ],
  keywords: ['디지털 전환', 'AI 학습', '개인화 학습', '실시간 피드백', '마이크로러닝', '혼합형 수업'],
  summary:
    '2026년 교육 기관 다수가 AI 기반 개인화 학습과 실시간 피드백을 도입했고, 마이크로러닝과 혼합형 수업 모델이 학습 성과를 끌어올리는 핵심 요소로 자리잡고 있다.',
  rawDataPoints: [
    '초중등 교육기관의 78.4%가 AI 기반 학습 플랫폼을 도입',
    '대학 및 평생교육기관 LMS 활용률 83.1%',
    '개인화 학습 적용 시 과제 완수율 26.8% 상승',
    '실시간 피드백 제공 시 학습 지속률 18.5% 상승',
    'AI 튜터 활용 수업 만족도 91.2점',
    '마이크로러닝 콘텐츠 운영 비율 58.9%',
  ],
  blogLabelHints: [
    { keyPhrase: '디지털 전환', heading: '학교에 자리잡은 AI 플랫폼' },
    { keyPhrase: '개인화 학습 효과', heading: '맞춤형 수업이 만든 변화' },
    { keyPhrase: '실시간 피드백', heading: '즉시 피드백이 만드는 힘' },
    { keyPhrase: '마이크로러닝', heading: '짧고 자주 배우는 흐름' },
  ],
}

const BLOG_IMAGE_STYLE_EXAMPLES = {
  pastel: {
    src: '/prompt-examples/style-pastel.png',
    title: '파스텔 일러스트 예시',
    description: '부드러운 컬러와 손그림 느낌이 살아 있는 블로그 대표 이미지 예시입니다.',
  },
  '3d': {
    src: '/prompt-examples/style-3d.png',
    title: '3D 렌더링 예시',
    description: '입체감과 광택이 느껴지는 블로그 대표 이미지 예시입니다.',
  },
  photo: {
    src: '/prompt-examples/style-photo.png',
    title: '사실적 사진 예시',
    description: '실제 사람과 사물이 보이는 현실 사진형 블로그 대표 이미지 예시입니다.',
  },
  watercolor: {
    src: '/prompt-examples/style-watercolor.png',
    title: '수채화 예시',
    description: '번짐과 질감이 살아 있는 블로그 대표 이미지 예시입니다.',
  },
  'solid-pattern': {
    src: '/prompt-examples/style-solid-pattern.png',
    title: '단색/패턴 배경 예시',
    description: '단색 또는 단순 패턴 배경 위에 글자가 올라가는 블로그 대표 이미지 예시입니다.',
  },
}

const INSTAGRAM_IMAGE_STYLE_EXAMPLES = {
  pastel: {
    src: '/prompt-examples/style-pastel.png',
    title: '파스텔 일러스트 예시',
    description: '부드러운 일러스트 배경에 카드 오버레이가 올라가는 인스타 대표 예시입니다.',
  },
  '3d': {
    src: '/prompt-examples/style-3d.png',
    title: '3D 렌더링 예시',
    description: '입체 오브젝트와 광택이 느껴지는 인스타 대표 예시입니다.',
  },
  photo: {
    src: '/prompt-examples/style-photo.png',
    title: '사실적 사진 예시',
    description: '실제 사람과 학습 공간이 보이는 인스타 대표 예시입니다.',
  },
  watercolor: {
    src: '/prompt-examples/style-watercolor.png',
    title: '수채화 예시',
    description: '수채화 질감의 배경 위에 카드 텍스트가 올라가는 인스타 대표 예시입니다.',
  },
  'solid-pattern': {
    src: '/prompt-examples/style-solid-pattern.png',
    title: '단색/패턴 배경 예시',
    description: '단순 배경색과 패턴 중심의 인스타 대표 예시입니다.',
  },
}

const MAIN_COLOR_EXAMPLES = {
  auto: {
    src: '/prompt-examples/color-auto.png',
    title: '자동 추천 색상 예시',
    description: '글과 어울리는 저채도 대표 색상을 자동으로 추천해 적용한 예시입니다.',
  },
  blue: {
    src: '/prompt-examples/color-blue.png',
    title: '파란 계열 예시',
    description: '슬레이트 블루와 차분한 쿨톤 계열 대표 색상 예시입니다.',
  },
  pink: {
    src: '/prompt-examples/color-pink.png',
    title: '분홍 계열 예시',
    description: '로즈 톤과 부드러운 핑크 계열 대표 색상 예시입니다.',
  },
  green: {
    src: '/prompt-examples/color-green.png',
    title: '초록 계열 예시',
    description: '세이지/틸 계열의 안정적인 초록 대표 색상 예시입니다.',
  },
  purple: {
    src: '/prompt-examples/color-purple.png',
    title: '보라 계열 예시',
    description: '스모키 바이올렛 중심의 차분한 보라 대표 색상 예시입니다.',
  },
}

const INSTAGRAM_CARD_STYLE_EXAMPLES = {
  'background-text': {
    src: '/prompt-examples/instagram-card-background-text.svg',
    title: '배경 + 텍스트 예시',
    description: '배경 이미지를 크게 보여주고 하단 정보 박스에 텍스트가 올라가는 인스타 카드 예시입니다.',
  },
  'center-card': {
    src: '/prompt-examples/instagram-card-center-card.svg',
    title: '중앙 카드 강조 텍스트 예시',
    description: '배경 위 중앙 카드 영역에 핵심 텍스트를 강조해서 보여주는 인스타 카드 예시입니다.',
  },
}

function ImagePreviewModal({ previewImage, onClose }) {
  if (!previewImage || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img src={previewImage.src} alt={previewImage.title} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
        <div className="absolute -top-10 left-0 right-0 flex items-center justify-between">
          <span className="text-sm text-white font-medium">{previewImage.title}</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors"><XCircle size={20} /></button>
        </div>
      </div>
    </div>,
    document.body,
  )
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
  const blogImageInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [demoMode, setDemoMode] = useState(true)
  const [selectedChannels, setSelectedChannels] = useState({ blog: true, newsletter: true, instagram: true, shorts: true })
  const [channelsConfirmed, setChannelsConfirmed] = useState(false)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState({})
  const [stepErrors, setStepErrors] = useState({})
  const [emphasisText] = useState('')
  const [editingText, setEditingText] = useState(false)
  const [showParsedText, setShowParsedText] = useState(false)
  const [showSummaryDetail, setShowSummaryDetail] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [fixingIssues, setFixingIssues] = useState(false)

  // Popup states
  const [errorAlert, setErrorAlert] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [creditConfirm, setCreditConfirm] = useState(false) // 크레딧 소모 확인 팝업
  const [previewImage, setPreviewImage] = useState(null)
  const [contentPreview, setContentPreview] = useState(null) // 'blog' | 'instagram' | 'shorts' | null
  const [imageLightbox, setImageLightbox] = useState(null) // { kind: 'image', src } | { kind: 'knowledge', headline, bullets, imageUrl, index }
  const [shortsTab, setShortsTab] = useState('script') // 'script' | 'upload'

  // 프롬프트 설정 (각 Step별)
  const [promptSettings, setPromptSettings] = useState({
    analysis: { focus: '', extra: '' },
    summary: { keywords: '', style: 'auto', extra: '' },
    content: {
      tone: 'auto',
      blogCategoryMode: 'auto',
      blogCategoryId: '',
      includeBlogFooter: true,
      blogExtra: '',
      newsletterExtra: '',
      instaExtra: '',
      shortsExtra: '',
    },
    media: {
      blogGenerateImages: true,
      blogAttachImages: false,
      blogImageStyle: 'pastel',
      instagramImageStyle: 'pastel',
      blogTextOverlay: 'with-text',
      mainColor: 'auto',
      instagramCardStyle: 'background-text',
      extra: '',
    },
    shorts: { videoStyle: 'avatar', narrationTone: 'auto', voiceStyle: 'auto', extra: '', videoConcept: '' },
  })
  const updatePrompt = (step, field, value) => setPromptSettings(p => ({ ...p, [step]: { ...p[step], [field]: value } }))
  const buildContentPromptOptions = () => {
    const conceptExtra = buildShortsConceptExtra(promptSettings.shorts.videoConcept)
    const manualShortsExtra = promptSettings.content.shortsExtra || ''
    return {
      ...promptSettings.content,
      shortsExtra: [conceptExtra, manualShortsExtra].filter(Boolean).join('\n\n'),
      videoConceptId: promptSettings.shorts.videoConcept || '',
      enableBlogCategory: selectedChannels.blog,
      blogCategorySelection: promptSettings.content.blogCategoryMode === 'auto'
        ? blogContent?.categoryInfo || recommendedBlogCategory || null
        : null,
    }
  }

  // Data states
  const [parsedText, setParsedText] = useState('')
  const [verification, setVerification] = useState(null)
  const [summary, setSummary] = useState(null)
  const [recommendedBlogCategory, setRecommendedBlogCategory] = useState(null)
  const [loadingBlogCategoryRecommendation, setLoadingBlogCategoryRecommendation] = useState(false)
  const [blogContent, setBlogContent] = useState(null)
  const [newsletterContent, setNewsletterContent] = useState(null)
  const [instagramContent, setInstagramContent] = useState(null)
  const [shortsScript, setShortsScript] = useState(null)
  const [blogImages, setBlogImages] = useState(null)
  const [blogUploadedImages, setBlogUploadedImages] = useState([])
  const blogUploadedImagesRef = useRef([])
  const blogImageProcessingPromiseRef = useRef(Promise.resolve())
  const pendingBlogImagesPromiseRef = useRef(null)
  const pendingInstagramImagesPromiseRef = useRef(null)
  const [processingBlogImages, setProcessingBlogImages] = useState(false)
  const [blogThumbnailDisabled, setBlogThumbnailDisabled] = useState(false)
  const [instagramImages, setInstagramImages] = useState(null)
  const [shortsVideo, setShortsVideo] = useState(null)
  const [contentGenerationStage, setContentGenerationStage] = useState('')
  const contentGenerationAbortRef = useRef(null)

  // Step 5: 숏폼 서브 상태
  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarImage, setAvatarImage] = useState(null) // data:image URL 또는 HeyGen preview URL
  const [avatarConfirmed, setAvatarConfirmed] = useState(false)
  const [heygenAvatarId, setHeygenAvatarId] = useState(null) // talking_photo_id 또는 프리셋 avatar_id
  const [heygenReady, setHeygenReady] = useState(false)
  // 프리셋 아바타 미리보기 URL 캐시 (avatarId → preview_image_url)
  const [presetAvatarPreviews, setPresetAvatarPreviews] = useState({})
  // 프리셋 voice 샘플 URL 캐시 (voiceId → preview_audio URL)
  const [presetVoicePreviews, setPresetVoicePreviews] = useState({})
  const avatarVoiceAudioRef = useRef(null)
  const [heygenUploading, setHeygenUploading] = useState(false)
  const [subtitleStyle, setSubtitleStyle] = useState('style1')
  const [subtitleFont, setSubtitleFont] = useState('default')
  const shortsStepNumbers = {
    avatar: 1,
    subtitle: 2,
    video: 3,
  }

  // 프리셋 아바타 미리보기 URL 1회 fetch — 숏폼이 선택됐을 때만.
  useEffect(() => {
    if (!selectedChannels.shorts) return
    if (Object.keys(presetAvatarPreviews).length >= PRESET_SHORTS_AVATARS.length) return
    let cancelled = false
    apiFetch('/api/heygen/public-avatars')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const all = [
          ...(Array.isArray(data?.avatars) ? data.avatars : []),
        ]
        const lookup = {}
        PRESET_SHORTS_AVATARS.forEach((preset) => {
          const matched = all.find((entry) => entry?.id === preset.avatarId)
          if (matched?.preview) lookup[preset.avatarId] = matched.preview
        })
        if (Object.keys(lookup).length > 0) setPresetAvatarPreviews(lookup)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedChannels.shorts, presetAvatarPreviews])

  // 프리셋 voice 샘플 URL 1회 fetch — 숏폼이 선택됐을 때만.
  useEffect(() => {
    if (!selectedChannels.shorts) return
    if (Object.keys(presetVoicePreviews).length >= PRESET_SHORTS_AVATARS.length) return
    let cancelled = false
    apiFetch('/api/heygen/voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const voices = data?.data?.voices || data?.voices || []
        const lookup = {}
        PRESET_SHORTS_AVATARS.forEach((preset) => {
          const matched = voices.find((voice) => voice?.voice_id === preset.defaultVoiceId)
          const previewUrl = matched?.preview_audio || matched?.preview_audio_url || null
          if (previewUrl) lookup[preset.defaultVoiceId] = previewUrl
        })
        if (Object.keys(lookup).length > 0) setPresetVoicePreviews(lookup)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedChannels.shorts, presetVoicePreviews])

  const playVoicePreview = (preset) => {
    if (!preset) return
    // 사전 합성한 자기소개 mp3 가 있으면 그것 우선, 없으면 HeyGen 기본 sample fallback
    const url = preset.samplePreviewUrl || presetVoicePreviews[preset.defaultVoiceId]
    if (!url) return
    try {
      if (avatarVoiceAudioRef.current) {
        avatarVoiceAudioRef.current.pause()
        avatarVoiceAudioRef.current.currentTime = 0
      }
      const audio = new Audio(url)
      avatarVoiceAudioRef.current = audio
      audio.play().catch(() => {})
    } catch {
      /* 재생 실패는 조용히 무시 — 카드 선택은 정상 진행 */
    }
  }

  useEffect(() => {
    let cancelled = false

    const hydrateRenderedBlogImages = async () => {
      const images = Array.isArray(blogImages) ? blogImages : []
      const sections = Array.isArray(blogContent?.sections) ? blogContent.sections : []

      if (!images.length || !sections.length) return

      const needsRenderedPreview = images.some((image) => (
        image
        && image?.overlayMode !== 'none'
        && image?.imageUrl
        && !image?.renderedImageUrl
        && !image?.pngUrl
      ))

      if (!needsRenderedPreview) return

      const nextImages = await Promise.all(images.map(async (image, index) => {
        if (!image || image?.overlayMode === 'none' || !image?.imageUrl || image?.renderedImageUrl || image?.pngUrl) {
          return image
        }

        const section = sections.find((item) => item?.heading === image?.heading) || sections[index] || {}
        const headingText = cleanCardText(section?.heading || image?.heading || '')
        const keyPhrase = cleanCardText(image?.keyPhrase || section?.keyPhrase || '')
        const headline = image?.overlayMode === 'headline-only'
          ? cleanCardText(image?.overlayHeadline || headingText || keyPhrase)
          : deriveBlogHeadline(keyPhrase, headingText)
        const description = image?.overlayMode === 'headline-only'
          ? ''
          : deriveBlogImageDescription(image?.keyPhrase || '', headingText, section?.content || '')

        try {
          const renderedImageUrl = await renderBlogUploadImageDataUrl({
            imageUrl: image.imageUrl,
            headline,
            description,
            variant: image?.variant || 'circle',
            fontPreset: image?.overlayFont || 'pretendard',
          })

          if (!renderedImageUrl || renderedImageUrl === image.imageUrl) {
            return image
          }

          return {
            ...image,
            renderedImageUrl,
            pngUrl: renderedImageUrl,
          }
        } catch {
          return image
        }
      }))

      if (cancelled) return

      const changed = nextImages.some((image, index) => image !== images[index])
      if (changed) {
        setBlogImages(nextImages)
      }
    }

    hydrateRenderedBlogImages()

    return () => {
      cancelled = true
    }
  }, [blogImages, blogContent])

  const applyBlogThumbnailState = ({ uploadedImages = blogUploadedImagesRef.current, generatedImages = blogImages, disabled = blogThumbnailDisabled }) => {
    const normalized = normalizeBlogThumbnailSelection({
      uploadedImages,
      generatedImages,
      disabled,
    })
    blogUploadedImagesRef.current = normalized.uploadedImages
    setBlogUploadedImages(normalized.uploadedImages)
    setBlogImages(normalized.generatedImages)
    return normalized
  }

  const setThumbnailDisabledState = (disabled) => {
    setBlogThumbnailDisabled(disabled)
    applyBlogThumbnailState({
      uploadedImages: blogUploadedImagesRef.current,
      generatedImages: blogImages,
      disabled,
    })
  }

  const selectBlogThumbnailCandidate = ({ source, index }) => {
    const uploadedImages = blogUploadedImagesRef.current.map((image) => ({ ...image, isThumbnail: false }))
    const generatedImages = (Array.isArray(blogImages) ? blogImages : []).map((image) => ({ ...image, isThumbnail: false }))

    if (source === 'uploaded' && uploadedImages[index]) {
      uploadedImages[index].isThumbnail = true
    }

    if (source === 'generated' && generatedImages[index]) {
      generatedImages[index].isThumbnail = true
    }

    setBlogThumbnailDisabled(false)
    applyBlogThumbnailState({
      uploadedImages,
      generatedImages,
      disabled: false,
    })
  }

  const isShortsVideoReady =
    !!avatarConfirmed &&
    !!shortsScript &&
    !loading.shorts &&
    !loading.media


  // 미디어 항목별 로딩 상태
  const [mediaItemLoading, setMediaItemLoading] = useState({})
  const [retrying, setRetrying] = useState(null)

  const isBusy = !!(
    loading.analysis || loading.summary || loading.content ||
    loading.media || loading.shorts || heygenUploading || fixingIssues || loadingBlogCategoryRecommendation || processingBlogImages
  )

  useEffect(() => {
    if (!isBusy) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isBusy])

  const setStepLoading = (step, val) => setLoading(p => ({ ...p, [step]: val }))
  const isContentGenerationCancelledError = (error) => (
    error?.name === 'AbortError' || /aborted|abort|취소/i.test(String(error?.message || ''))
  )

  const resetContentGenerationFlowState = () => {
    setRetrying(null)
    setContentGenerationStage('')
    setStepLoading('content', false)
    setStepLoading('media', false)
    pendingBlogImagesPromiseRef.current = null
    pendingInstagramImagesPromiseRef.current = null
    contentGenerationAbortRef.current = null
  }

  const abortContentGeneration = () => {
    contentGenerationAbortRef.current?.abort()
    resetContentGenerationFlowState()
  }
  const shortsVoicePresetValue = SHORTS_VOICE_PRESET_OPTIONS.find(option => (
    option.narrationTone === promptSettings.shorts.narrationTone &&
    option.voiceStyle === promptSettings.shorts.voiceStyle
  ))?.value || 'auto'
  const applyShortsVoicePreset = (value) => {
    const preset = SHORTS_VOICE_PRESET_OPTIONS.find(option => option.value === value) || SHORTS_VOICE_PRESET_OPTIONS[0]
    setPromptSettings(p => ({
      ...p,
      shorts: {
        ...p.shorts,
        narrationTone: preset.narrationTone,
        voiceStyle: preset.voiceStyle,
      },
    }))
  }
  const addStepErrors = (step, errs) => setStepErrors(p => ({ ...p, [step]: errs }))
  const clearStepErrors = (step) => setStepErrors(p => ({ ...p, [step]: null }))
  const removeStepError = (step, service, channel) => {
    setStepErrors(p => ({
      ...p,
      [step]: (p[step] || []).filter(e => !(e.service === service && e.channel === channel))
    }))
  }

  useEffect(() => {
    if (!selectedChannels.blog || promptSettings.content.blogCategoryMode !== 'auto' || !summary || !parsedText) {
      setRecommendedBlogCategory(null)
      setLoadingBlogCategoryRecommendation(false)
      return
    }

    let cancelled = false
    setLoadingBlogCategoryRecommendation(true)

    recommendBlogCategory(summary, parsedText, emphasisText, {
      enableBlogCategory: true,
      blogCategoryMode: 'auto',
    })
      .then((selection) => {
        if (!cancelled) {
          setRecommendedBlogCategory(selection || null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendedBlogCategory(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBlogCategoryRecommendation(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedChannels.blog, promptSettings.content.blogCategoryMode, summary, parsedText, emphasisText])

  // 에러 발생 시 팝업 표시
  const showErrorAlert = (serviceName, detail) => {
    setErrorAlert(`${serviceName} 서비스에서 오류가 발생했습니다.\n\n${detail}\n\n해당 작업의 재시도 버튼을 눌러 다시 시도할 수 있습니다.`)
  }

  const ensureBlogCategoryReady = (targetsBlog = selectedChannels.blog) => {
    if (!targetsBlog) return true
    if (promptSettings.content.blogCategoryMode !== 'manual') return true
    if (promptSettings.content.blogCategoryId) return true

    showErrorAlert('블로그 카테고리', '직접 선택 모드에서는 블로그 카테고리를 먼저 지정해주세요.')
    return false
  }

  const getVisibleStepIds = () => {
    const ids = [0, 1, 2]
    CONTENT_CHANNEL_ORDER.forEach(channelKey => {
      if (selectedChannels[channelKey]) ids.push(CONTENT_CHANNEL_STEPS[channelKey])
    })
    return ids
  }

  const getNextVisibleStep = (stepId) => {
    const ids = getVisibleStepIds()
    return ids.find(id => id > stepId) || stepId
  }

  const getFirstContentStep = () => {
    const firstChannel = CONTENT_CHANNEL_ORDER.find(channelKey => selectedChannels[channelKey])
    return firstChannel ? CONTENT_CHANNEL_STEPS[firstChannel] : getNextVisibleStep(2)
  }

  // 특정 단계 이후의 모든 결과를 초기화
  const resetFromStep = (step) => {
    setCurrentStep(step)
    // Step 1 이하(파일 변경 포함) → 모든 후속 단계 초기화
    if (step <= 2) { setParsedText(''); setVerification(null); setSummary(null); setRecommendedBlogCategory(null); setEditingText(false) }
    if (step <= 3) setBlogContent(null)
    if (step <= 4) setNewsletterContent(null)
    if (step <= 5) setInstagramContent(null)
    if (step <= 6) setShortsScript(null)
    if (step <= 7) {
      setBlogImages(null)
      setInstagramImages(null)
      setMediaItemLoading({})
    }
    if (step <= 2) {
      blogUploadedImagesRef.current = []
      setBlogUploadedImages([])
      setBlogThumbnailDisabled(false)
    }
    if (step <= 8) { setShortsVideo(null); setAvatarImage(null); setAvatarPrompt(''); setAvatarConfirmed(false) }
    // 에러 초기화
    if (step <= 1) clearStepErrors('upload')
    if (step <= 2) { clearStepErrors('analysis'); clearStepErrors('summary') }
    if (step <= 3) clearStepErrors('content')
    if (step <= 7) clearStepErrors('media')
    if (step <= 8) clearStepErrors('shorts')
  }

  const handleFile = (f) => {
    const supportedExts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.jpg', '.jpeg', '.png', '.webp']
    const ext = f?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
    if (f && ext && supportedExts.includes(ext)) {
      setFile(f)
      resetFromStep(2)
      clearStepErrors('upload')
    } else {
      addStepErrors('upload', [{ service: 'upload', message: '지원되는 파일 형식: PDF, HWP, DOCX, PPTX, TXT, JPG, PNG, WEBP' }])
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

    if (!file) {
      addStepErrors('analysis', [{ service: 'llamaparse', message: '분석할 파일을 먼저 업로드해주세요.' }])
      setStepLoading('analysis', false)
      showErrorAlert('PDF 분석', '분석할 파일을 먼저 업로드해주세요.')
      return
    }

    let text = ''
    try {
      text = demoMode ? mockParsedText : await parsePDF(file)
      setParsedText(text)
    } catch (err) {
      errors.push({ service: 'gemini', message: `PDF 분석 실패 - ${err.message}` })
      addStepErrors('analysis', errors)
      setStepLoading('analysis', false)
      showErrorAlert('PDF 분석', err.message)
      return
    }

    try {
      if (demoMode) {
        // 데모 모드: Gemini 호출 없이 더미 검증 결과 사용
        setVerification(mockVerification)
        setParsedText(mockVerification.correctedText || text)
      } else {
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
      }
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

    try {
      let result
      if (demoMode) {
        // 데모 모드: Gemini 호출 없이 더미 요약 사용
        await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY))
        result = mockSummary
      } else {
        result = await summarizeContent(targetText, { keywords: promptSettings.summary.keywords, style: promptSettings.summary.style, extra: promptSettings.summary.extra })
      }
      if (result.title === '요약 생성 실패') {
        addStepErrors('summary', [{ service: 'gemini', message: 'Gemini 응답을 JSON으로 파싱하지 못했습니다. 재시도해주세요.' }])
        setCurrentStep(2)
      } else {
        setSummary(result)
        setShowSummaryDetail(true)
        setCurrentStep(getFirstContentStep())
      }
    } catch (err) {
      addStepErrors('summary', [{ service: 'gemini', message: `요약 생성 실패 - ${err.message}` }])
      showErrorAlert('핵심 요약', err.message)
      setCurrentStep(2)
    } finally {
      setStepLoading('summary', false)
    }
  }

  const contentChannelConfigs = [
    { key: 'blog', label: '네이버 블로그', actionLabel: '블로그 글', setter: setBlogContent, generate: generateBlogContent },
    { key: 'newsletter', label: '뉴스레터', actionLabel: '뉴스레터', setter: setNewsletterContent, generate: generateNewsletterContent },
    { key: 'instagram', label: '인스타그램', actionLabel: '인스타그램', setter: setInstagramContent, generate: generateInstagramContent },
    { key: 'shorts', label: '숏폼 대본', actionLabel: '숏폼 대본', setter: setShortsScript, generate: generateShortsScript },
  ]
  const selectedContentChannels = () => contentChannelConfigs.filter(c => selectedChannels[c.key])

  // 라벨 → API 키 매핑
  const labelToKey = { '네이버 블로그': 'blog', '뉴스레터': 'newsletter', '인스타그램': 'instagram', '숏폼 대본': 'shorts' }
  const keyToSetter = { blog: setBlogContent, newsletter: setNewsletterContent, instagram: setInstagramContent, shorts: setShortsScript }

  const generateContentChannel = async (channelKey, options = {}) => {
    const config = contentChannelConfigs.find(channel => channel.key === channelKey)
    if (!config) return null
    if (!ensureBlogCategoryReady(channelKey === 'blog')) return null

    const contentOptions = { ...buildContentPromptOptions(), signal: options.signal }
    const result = await config.generate(summary, parsedText, emphasisText, contentOptions)
    config.setter(result)
    if (options.clearError !== false) {
      removeStepError('content', 'gemini', config.label)
    }
    if (channelKey === 'blog' && result?.sections?.length && promptSettings.media.blogGenerateImages) {
      setContentGenerationStage('image')
      const generatedImages = await triggerBlogImageGenerationInBackground(result, options.signal)
      if (Array.isArray(generatedImages)) {
        setBlogImages(generatedImages)
      }
    }
    if (channelKey === 'instagram' && Array.isArray(result?.cardTopics) && result.cardTopics.length > 0) {
      setContentGenerationStage('image')
      const generatedInstagramImages = await triggerInstagramImageGenerationInBackground(result, options.signal)
      if (Array.isArray(generatedInstagramImages)) {
        setInstagramImages(generatedInstagramImages)
      }
    }
    return result
  }

  const triggerInstagramImageGenerationInBackground = (instagramContentResult, signal) => {
    if (!instagramContentResult?.cardTopics?.length) return
    setStepLoading('media', true)
    removeStepError('media', 'gemini', '인스타 카드 이미지')
    const task = generateInstagramImages(instagramContentResult.cardTopics, {
      title: instagramContentResult?.title || '',
      imageStyle: promptSettings.media.instagramImageStyle,
      instagramCardStyle: promptSettings.media.instagramCardStyle,
      extra: promptSettings.media.extra,
      signal,
    })
      .catch((err) => {
        if (isContentGenerationCancelledError(err)) return null
        addStepErrors('media', [{ service: 'gemini', channel: '인스타 카드 이미지', message: err?.message || '인스타 카드 이미지 생성 실패' }])
        return null
      })
      .finally(() => {
        setStepLoading('media', false)
        if (pendingInstagramImagesPromiseRef.current === task) {
          pendingInstagramImagesPromiseRef.current = null
        }
      })
    pendingInstagramImagesPromiseRef.current = task
    return task
  }

  const triggerBlogImageGenerationInBackground = (blogContentResult, signal) => {
    if (!blogContentResult?.sections?.length) return
    setStepLoading('media', true)
    removeStepError('media', 'gemini', '블로그 이미지')
    const task = generateBlogImages(blogContentResult.sections || [], {
      title: blogContentResult?.title || '',
      imageStyle: promptSettings.media.blogImageStyle,
      textOverlay: promptSettings.media.blogTextOverlay,
      imageTextOverlay: promptSettings.media.blogTextOverlay,
      mainColor: promptSettings.media.mainColor,
      categoryId: blogContentResult?.categoryInfo?.finalCategoryId || recommendedBlogCategory?.finalCategoryId || null,
      extra: promptSettings.media.extra,
      signal,
    })
      .catch((err) => {
        if (isContentGenerationCancelledError(err)) return null
        addStepErrors('media', [{ service: 'gemini', channel: '블로그 이미지', message: err?.message || '블로그 이미지 생성 실패' }])
        return null
      })
      .finally(() => {
        setStepLoading('media', false)
        if (pendingBlogImagesPromiseRef.current === task) {
          pendingBlogImagesPromiseRef.current = null
        }
      })
    pendingBlogImagesPromiseRef.current = task
    return task
  }

  const runSingleContentStep = async (channelKey) => {
    const config = contentChannelConfigs.find(channel => channel.key === channelKey)
    if (!config) return
    if (!ensureBlogCategoryReady(channelKey === 'blog')) return
    if (channelKey === 'shorts' && !avatarConfirmed) {
      const message = '숏폼 생성 전에 아바타를 먼저 선택하거나 확정해주세요.'
      addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message }])
      showErrorAlert('숏폼 생성', message)
      return
    }

    resetFromStep(CONTENT_CHANNEL_STEPS[channelKey])
    setStepLoading('content', true)
    setContentPreview(null)
    removeStepError('content', 'gemini', config.label)
    setRetrying(`content-${channelKey}`)
    const abortController = new AbortController()
    contentGenerationAbortRef.current = abortController
    setContentGenerationStage('body')

    try {
      const result = await generateContentChannel(channelKey, { signal: abortController.signal })
      if (!result) {
        addStepErrors('content', [{ service: 'gemini', channel: config.label, message: '해당 채널 콘텐츠가 생성되지 않았습니다.' }])
        return
      }
      if (channelKey === 'shorts') {
        setContentGenerationStage('video')
        await runShortsGeneration({ scriptOverride: result })
      }
      setCurrentStep(getNextVisibleStep(CONTENT_CHANNEL_STEPS[channelKey]))
    } catch (err) {
      if (isContentGenerationCancelledError(err)) return
      addStepErrors('content', [{ service: 'gemini', channel: config.label, message: err.message || '생성 실패' }])
      showErrorAlert(config.actionLabel, err.message || '생성 실패')
    } finally {
      resetContentGenerationFlowState()
    }
  }

  // Step 3: 콘텐츠 생성 — 채널별로 별도 API 호출
  const runContentGeneration = async () => {
    const channels = selectedContentChannels()
    if (!channels.length) return
    if (!ensureBlogCategoryReady(channels.some(channel => channel.key === 'blog'))) return

    setStepLoading('content', true)
    clearStepErrors('content')
    setContentPreview(null)
    resetFromStep(3)
    setContentGenerationStage('body')
    const abortController = new AbortController()
    contentGenerationAbortRef.current = abortController

    const errors = []
    let anySuccess = false

    for (const channel of channels) {
      if (abortController.signal.aborted) break
      setRetrying(`content-${channel.key}`)
      try {
        const result = await generateContentChannel(channel.key, { clearError: false, signal: abortController.signal })
        if (result) {
          anySuccess = true
        } else {
          errors.push({ service: 'gemini', channel: channel.label, message: '해당 채널 콘텐츠가 생성되지 않았습니다.' })
        }
      } catch (err) {
        if (isContentGenerationCancelledError(err)) {
          resetContentGenerationFlowState()
          return
        }
        errors.push({ service: 'gemini', channel: channel.label, message: err.message || '생성 실패' })
      }
    }

    if (abortController.signal.aborted) {
      resetContentGenerationFlowState()
      return
    }

    if (errors.length > 0) {
      addStepErrors('content', errors)
      const failedChannels = errors.map(e => e.channel).join(', ')
      showErrorAlert('콘텐츠 생성', `다음 채널 생성에 실패했습니다: ${failedChannels}\n\n각 항목의 재시도 버튼으로 개별 재시도할 수 있습니다.`)
    }

    if (anySuccess) setCurrentStep(getNextVisibleStep(6))
    resetContentGenerationFlowState()
  }

  // Step 3 재시도 — 실패한 채널을 각각 별도 API 호출
  const retryAllFailedContent = async () => {
    const failedErrors = stepErrors.content || []
    if (failedErrors.length === 0) return

    // 실패 채널 키 수집
    const failedKeys = failedErrors.map(e => labelToKey[e.channel]).filter(Boolean)
    if (failedKeys.length === 0) return
    if (!ensureBlogCategoryReady(failedKeys.includes('blog'))) return

    setRetrying('content-all')
    try {
      const newErrors = []
      for (const key of failedKeys) {
        const config = contentChannelConfigs.find(channel => channel.key === key)
        if (!config) continue
        setRetrying(`content-${key}`)
        try {
          const result = await generateContentChannel(key)
          if (!result) {
            newErrors.push({ service: 'gemini', channel: config.label, message: '재생성에서도 해당 채널이 누락되었습니다.' })
          }
        } catch (retryErr) {
          const label = failedErrors.find(e => labelToKey[e.channel] === key)?.channel || key
          newErrors.push({ service: 'gemini', channel: label, message: retryErr.message || '재시도 실패' })
        }
      }

      if (newErrors.length > 0) {
        addStepErrors('content', newErrors)
      } else {
        clearStepErrors('content')
      }
      if (currentStep < getNextVisibleStep(6)) setCurrentStep(getNextVisibleStep(6))
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
    const key = labelToKey[err.channel]
    if (!key) return
    if (!ensureBlogCategoryReady(key === 'blog')) return

    setRetrying(`${err.service}-${err.channel}`)
    try {
      const result = await generateContentChannel(key)
      if (result) {
        removeStepError('content', err.service, err.channel)
        if (currentStep < getNextVisibleStep(CONTENT_CHANNEL_STEPS[key])) setCurrentStep(getNextVisibleStep(CONTENT_CHANNEL_STEPS[key]))
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
    if (!ensureBlogCategoryReady(channelKey === 'blog')) return
    const setter = keyToSetter[channelKey]
    if (!setter) return

    setRetrying(`regen-${channelKey}`)
    try {
      resetFromStep(CONTENT_CHANNEL_STEPS[channelKey])
      await generateContentChannel(channelKey)
    } catch (err) {
      showErrorAlert('채널 재생성', err.message || '재생성 실패')
    } finally {
      setRetrying(null)
    }
  }

  const contentGenerationButtonLabel =
    contentGenerationStage === 'image'
      ? '이미지 생성 중...'
      : contentGenerationStage === 'video'
        ? '영상 생성 중...'
        : '본문 생성 중...'

  const getChannelGenerationLabel = (channelKey) => {
    if (contentGenerationStage === 'image' && (channelKey === 'blog' || channelKey === 'instagram')) {
      return '이미지 생성 중...'
    }
    if (contentGenerationStage === 'video' && channelKey === 'shorts') {
      return '영상 생성 중...'
    }
    return '본문 생성 중...'
  }

  // 숏폼: 아바타 이미지 생성 (Gemini)
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
    setShortsVideo(null)

    try {
      const data = await requestGeminiContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ parts: [{ text: `Generate a photorealistic vertical portrait photograph. Subject: ${avatarPrompt.trim()}.

IMPORTANT REQUIREMENTS:
- Look like a real camera photo, not AI art
- Realistic DSLR or mirrorless photo quality
- Ultra realistic skin, fur, hair, feathers, eyes, and natural texture depending on the subject
- Character or animal facing toward the camera in a natural way
- Mouth CLEARLY VISIBLE and slightly open or naturally relaxed so lip movement can read well later
- Bright, warm natural window light with realistic indoor shadows
- Subject sitting or standing naturally in a believable real-world environment
- Full upper body or upper torso visible, never an extreme close-up
- The scene should look like a real photograph, NOT a painting, render, or illustration
- The image should feel like a candid editorial portrait taken in a cozy, lived-in study or home office
- Use authentic environmental details such as a desk, notebooks, bookshelves, stationery, or soft home interior elements
- Background should look like a real place a human photographer captured, not a generated fantasy set

COMPOSITION:
- 9:16 VERTICAL portrait orientation
- The final image must be composed specifically for a 9:16 mobile vertical frame (like 1080x1920)
- Do not center-compose for square or landscape crops; compose for full-height vertical viewing only
- Subject occupies about 40-50% of the frame
- Face is well-lit and clearly visible
- Keep enough headroom and torso room so the subject reads cleanly in a tall vertical crop
- Background has real context but is not distracting
- Include a tasteful, realistic background that fits the subject and feels naturally photographed
- Use subtle depth of field like a real portrait lens, but keep nearby objects believable and grounded
- Prefer a composition similar to a realistic subject seated at a desk in front of bookshelves or a softly lit room, with natural object placement and no empty fake backdrop

DO NOT:
- Do not generate square, wide, or ambiguous aspect-ratio compositions
- Use cartoon, anime, 3D render, or illustration style
- Generate extreme close-ups (face only)
- Place objects near or covering the mouth
- Use surreal lighting, glossy CGI textures, fake studio backdrops, empty seamless backgrounds, or obviously AI-looking scenery
- Avoid exaggerated bokeh, fake cinematic haze, plastic fur or skin, or unnatural prop placement
- Include any text or watermarks` }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      })
      const imagePart = findInlineDataPart(data)
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

  // 숏폼: 아바타 확정 시 HeyGen 업로드 + 폴링 대기 (백그라운드)
  const uploadAvatarToHeyGen = async (forceNew = false) => {
    if (!avatarImage) {
      throw new Error('아바타를 먼저 생성해주세요.')
    }

    if (!forceNew && heygenAvatarId) {
      return heygenAvatarId
    }

    const match = avatarImage.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      throw new Error('아바타 이미지 형식이 올바르지 않습니다.')
    }

    const [, mimeType, base64] = match
    setHeygenUploading(true)

    try {
      const uploadRes = await apiFetch('/api/heygen/upload-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      })
      const uploadData = await readApiResponse(uploadRes)
      if (!uploadRes.ok) {
        throw new Error(getApiErrorMessage(uploadData, `아바타 업로드 실패 (${uploadRes.status})`))
      }

      const imageKey = uploadData.data?.image_key
      if (!imageKey) {
        throw new Error('image_key를 받지 못했습니다.')
      }

      const groupRes = await apiFetch('/api/heygen/avatar-group/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `avatar_${Date.now()}`, image_key: imageKey }),
      })
      const groupData = await readApiResponse(groupRes)
      if (!groupRes.ok) {
        throw new Error(getApiErrorMessage(groupData, `아바타 등록 실패 (${groupRes.status})`))
      }

      const groupId = groupData.data?.group_id
      if (!groupId) {
        throw new Error('group_id를 받지 못했습니다.')
      }

      setHeygenAvatarId(groupId)
      setHeygenReady(false)
      return groupId
    } finally {
      setHeygenUploading(false)
    }
  }

  const waitForHeygenAvatarReady = async (groupId, options = {}) => {
    const { attempts = 24, intervalMs = 5000, progressLabel = '아바타 준비 확인 중...' } = options
    if (!groupId) {
      throw new Error('HeyGen 아바타 ID가 없습니다.')
    }

    setHeygenUploading(true)
    try {
      for (let i = 0; i < attempts; i++) {
        if (progressLabel) {
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': progressLabel }))
        }

        const statusRes = await apiFetch(`/api/heygen/avatar-status/${groupId}`)
        const statusData = await readApiResponse(statusRes)
        if (statusRes.ok && statusData.ready) {
          setHeygenReady(true)
          return true
        }

        await delay(intervalMs)
      }

      return false
    } finally {
      setHeygenUploading(false)
    }
  }

  const runShortsGeneration = async (options = {}) => {
    const targetScript = options.scriptOverride || shortsScript
    if (!targetScript) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: '쇼츠 대본이 없습니다.' }])
      return
    }

    if (!avatarImage) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: '아바타를 먼저 생성해주세요.' }])
      return
    }

    setStepLoading('shorts', true)
    clearStepErrors('shorts')
    setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': true }))

    try {
      const talkingPhotoId = heygenAvatarId || await uploadAvatarToHeyGen()
      const avatarReady = heygenReady || await waitForHeygenAvatarReady(talkingPhotoId, {
        attempts: 24,
        intervalMs: 5000,
        progressLabel: '아바타 준비 확인 중...',
      })

      if (!avatarReady) {
        throw new Error('HeyGen 아바타가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')
      }

      // 다음 경우 /v2/video/generate 로 분기:
      //   1) 멀티 아바타 컨셉 (preferredAvatarIds.length > 1)
      //   2) 솔로이지만 useStandardEndpoint: true 로 표시된 컨셉 (자동 연출 불필요)
      // 그 외엔 Video Agent 사용 ($2/분, AI 자동 연출 포함).
      const selectedConcept = findShortsVideoConcept(promptSettings.shorts.videoConcept)
      const useMultiAvatar = !!selectedConcept && Array.isArray(selectedConcept.preferredAvatarIds) && selectedConcept.preferredAvatarIds.length > 1
      const useSoloStandard = !!selectedConcept && !useMultiAvatar && selectedConcept.useStandardEndpoint === true
      const useStandardEndpoint = useMultiAvatar || useSoloStandard

      let generateRes
      let generatedVideoPrompt = null
      if (useStandardEndpoint) {
        const scenesForStandard = Array.isArray(targetScript?.scenes) ? targetScript.scenes : []
        if (scenesForStandard.length === 0) {
          throw new Error('쇼츠 대본에 씬이 없어 영상을 만들 수 없습니다.')
        }
        // 솔로 standard 면 talkingPhotoId 한 명, 멀티면 round-robin.
        // sceneAvatarIds 가 정의된 솔로 컨셉은 같은 인물의 variant 들을 씬마다 순환.
        const hasSceneAvatars = !useMultiAvatar
          && Array.isArray(selectedConcept?.sceneAvatarIds)
          && selectedConcept.sceneAvatarIds.length > 0
        const conceptAvatarIds = useMultiAvatar
          ? selectedConcept.preferredAvatarIds
          : (hasSceneAvatars ? selectedConcept.sceneAvatarIds : [talkingPhotoId])

        // dialogue-shared-bg / quiz-shared-bg: 한 영상에서 모든 씬이 1장의 배경 공유. 미리 1회만 fetch.
        let sharedDialogueBgKey = null
        const hasSharedBgScene = scenesForStandard.some((s) =>
          s?.layout === 'dialogue-shared-bg' || s?.layout === 'quiz-shared-bg'
        )
        if (hasSharedBgScene && targetScript?.sharedBackground?.visualDescription) {
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '공유 배경 준비 중...' }))
          try {
            const sharedBgRes = await apiFetch('/api/heygen/shorts-vlog-background', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                visualDescription: targetScript.sharedBackground.visualDescription,
                sceneNumber: 0,
              }),
            })
            const sharedBgData = await readApiResponse(sharedBgRes)
            if (sharedBgRes.ok && sharedBgData?.image_key) {
              sharedDialogueBgKey = sharedBgData.image_key
            }
          } catch (err) {
            console.warn('[shared dialogue bg] 실패:', err.message)
          }
        }

        // 씬별 layout 분기.
        setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '씬별 배경 준비 중...' }))
        // sceneAvatarIds variant 는 PRESET_SHORTS_AVATARS 에 등록되어 있지 않을 수 있어
        // 컨셉의 기본 아바타(preferredAvatarIds[0]) preset 으로 fallback 해서 voice 를 가져온다.
        const fallbackPreset = findPresetShortsAvatar(selectedConcept?.preferredAvatarIds?.[0])
        const video_inputs = await Promise.all(scenesForStandard.map(async (scene, idx) => {
          const avatarId = conceptAvatarIds[idx % conceptAvatarIds.length]
          const preset = findPresetShortsAvatar(avatarId) || fallbackPreset
          const baseInput = {
            character: {
              type: 'talking_photo',
              talking_photo_id: avatarId,
            },
            voice: {
              type: 'text',
              input_text: String(scene?.narration || '').trim(),
              voice_id: preset?.defaultVoiceId,
            },
          }
          if (scene?.layout === 'pip-tl' && scene?.infographic) {
            try {
              const bgRes = await apiFetch('/api/heygen/shorts-pip-background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  headline: scene.infographic.headline || '',
                  value: scene.infographic.value || '',
                  subtitle: scene.infographic.subtitle || '',
                  chartType: scene.infographic.chartType || 'bar',
                  theme: scene.infographic.theme || 'navy',
                }),
              })
              const bgData = await readApiResponse(bgRes)
              if (bgRes.ok && bgData?.image_key) {
                baseInput.character.scale = 0.3
                baseInput.character.offset = { x: -0.30, y: -0.32 }
                baseInput.background = {
                  type: 'image',
                  image_asset_id: bgData.image_key,
                }
              }
            } catch (err) {
              console.warn(`[shorts pip bg] scene ${scene?.sceneNumber} 실패:`, err.message)
            }
          } else if (scene?.layout === 'dialogue-shared-bg' && sharedDialogueBgKey) {
            // 모든 씬이 같은 배경 공유. speakerSide 로 좌우 위치만 다르게.
            const side = scene?.speakerSide === 'right' ? 0.30 : -0.30
            baseInput.character.scale = 0.85
            baseInput.character.offset = { x: side, y: 0 }
            baseInput.background = {
              type: 'image',
              image_asset_id: sharedDialogueBgKey,
            }
          } else if (scene?.layout === 'quiz-shared-bg' && sharedDialogueBgKey) {
            // 모든 씬이 같은 배경 공유. 아바타는 중앙 풀샷 (scale·offset 기본값).
            baseInput.background = {
              type: 'image',
              image_asset_id: sharedDialogueBgKey,
            }
          } else if (scene?.layout === 'full-vlog' && scene?.visualDescription) {
            try {
              const bgRes = await apiFetch('/api/heygen/shorts-vlog-background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  visualDescription: scene.visualDescription,
                  sceneNumber: scene.sceneNumber || idx + 1,
                }),
              })
              const bgData = await readApiResponse(bgRes)
              if (bgRes.ok && bgData?.image_key) {
                // 풀화면 아바타 유지 (scale·offset 기본값) + 브이로그 배경만 합성
                baseInput.background = {
                  type: 'image',
                  image_asset_id: bgData.image_key,
                }
              }
            } catch (err) {
              console.warn(`[shorts vlog bg] scene ${scene?.sceneNumber} 실패:`, err.message)
            }
          }
          return baseInput
        }))
        const filteredInputs = video_inputs.filter((input) => input.voice.input_text && input.voice.voice_id)

        if (filteredInputs.length === 0) {
          throw new Error('씬 narration 또는 voice_id 가 비어있어 영상을 만들 수 없습니다.')
        }

        const modeLabel = useMultiAvatar ? '멀티 아바타' : '표준'
        setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': `HeyGen ${modeLabel} 영상 생성 요청 중 (씬 ${filteredInputs.length}개)...` }))

        generateRes = await apiFetch('/api/heygen/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_inputs: filteredInputs,
            dimension: { width: 720, height: 1280 },
          }),
        })
      } else {
        generatedVideoPrompt = buildShortsVideoAgentPrompt({
          script: targetScript,
          avatar: {
            id: talkingPhotoId,
            kind: 'talking_photo',
            name: avatarPrompt?.trim() || 'custom avatar',
            subjectPrompt: avatarPrompt?.trim() || '',
          },
          subtitleStyle,
          subtitleFont,
          extraPrompt: promptSettings.shorts.extra,
          videoStyle: promptSettings.shorts.videoStyle,
          narrationTone: promptSettings.shorts.narrationTone,
          voiceStyle: promptSettings.shorts.voiceStyle,
        })

        setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': 'HeyGen Video Agent 생성 요청 중...' }))

        generateRes = await apiFetch('/api/heygen/video-agent/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: generatedVideoPrompt,
            config: {
              avatar_id: talkingPhotoId,
            },
          }),
        })
      }

      const generateData = await readApiResponse(generateRes)
      if (!generateRes.ok) {
        throw new Error(getApiErrorMessage(generateData, `HeyGen ${useStandardEndpoint ? (useMultiAvatar ? '멀티 아바타 영상' : '표준 영상') : 'Video Agent'} 요청 실패 (${generateRes.status})`))
      }

      const videoId =
        generateData.data?.video_id ||
        generateData.data?.id ||
        generateData.video_id ||
        generateData.id

      if (!videoId) {
        throw new Error('HeyGen video_id를 받지 못했습니다.')
      }

      setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': 'HeyGen 렌더가 완료되는 중...' }))

      let finalVideo = null
      for (let i = 0; i < 240; i++) {
        await delay(5000)

        const pollRes = await apiFetch(`/api/heygen/video/status/${videoId}`)
        const pollData = await readApiResponse(pollRes)
        if (!pollRes.ok) continue

        const status = pollData.data?.status
        if (status === 'completed') {
          const rawUrl = resolveMediaUrl(pollData.data?.video_url)
          if (!rawUrl) {
            throw new Error('HeyGen 영상 URL이 없습니다.')
          }

          let finalUrl = rawUrl
          let srtUrl = null

          try {
            const burnRes = await apiFetch('/api/subtitle/burn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: rawUrl,
                scenes: targetScript.scenes,
                subtitleStyle: mapShortsSubtitleStyleToBurnStyle(subtitleStyle),
                subtitleFont,
              }),
            })
            const burnData = await readApiResponse(burnRes)
            if (!burnRes.ok) {
              throw new Error(
                burnData?.error?.message ||
                burnData?.error ||
                `자막 번인 실패 (${burnRes.status})`
              )
            }
            if (!burnData?.url) {
              throw new Error('자막 번인 결과 영상 URL이 없습니다.')
            }
            finalUrl = resolveMediaUrl(burnData.url)
            srtUrl = resolveMediaUrl(burnData.srtUrl || null)
          } catch (burnErr) {
            throw new Error(burnErr.message || '자막 번인 실패')
          }

          finalVideo = {
            url: finalUrl,
            rawUrl,
            srtUrl,
            duration: targetScript.duration,
            videoId,
            prompt: generatedVideoPrompt,
            mode: 'recommended',
          }
          break
        }

        if (status === 'failed') {
          const errDetail = pollData.data?.error
          const errMsg =
            typeof errDetail === 'object'
              ? (errDetail.message || errDetail.detail || JSON.stringify(errDetail))
              : (errDetail || pollData.data?.error_message || '알 수 없는 오류')
          throw new Error(`HeyGen 렌더 실패: ${errMsg}`)
        }
      }

      if (!finalVideo) {
        throw new Error('HeyGen 영상 생성 시간 초과 (20분)')
      }

      setShortsVideo(finalVideo)
    } catch (err) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠 영상', message: err.message || '쇼츠 생성 실패' }])
      showErrorAlert('쇼츠 생성', err.message)
    }

    setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': false }))
    setStepLoading('shorts', false)
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

  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(f)
  })

  const isImageFile = (fileItem) => (
    fileItem?.type?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileItem?.name || '')
  )

  const handleBlogImageFiles = async (files) => {
    const imageFiles = Array.from(files || []).filter(isImageFile)
    if (imageFiles.length === 0) return
    const processingTask = (async () => {
      setProcessingBlogImages(true)
      const currentUploadedImages = blogUploadedImagesRef.current

      const nextImages = await Promise.all(imageFiles.map(async (imageFile, index) => {
        const dataUrl = await fileToBase64(imageFile)
        const targetIndex = currentUploadedImages.length + index
        const imageId = `${Date.now()}-${targetIndex}-${imageFile.name}`
        return {
          id: imageId,
          imageUrl: dataUrl,
          renderedImageUrl: dataUrl,
          pngUrl: dataUrl,
          title: imageFile.name,
          heading: blogContent?.sections?.[targetIndex]?.heading || '',
          source: 'uploaded',
          isThumbnail: false,
        }
      }))

      applyBlogThumbnailState({
        uploadedImages: [...currentUploadedImages, ...nextImages],
        generatedImages: promptSettings.media.blogGenerateImages ? blogImages : [],
        disabled: blogThumbnailDisabled,
      })
      updatePrompt('media', 'blogAttachImages', true)
    })()

    blogImageProcessingPromiseRef.current = processingTask.finally(() => {
      setProcessingBlogImages(false)
    })

    await blogImageProcessingPromiseRef.current
  }

  // 결과 확인에 사용할 미완료/실패 목록 수집
  const getIncompleteItems = () => {
    const incomplete = []
    const isSelectedErrorChannel = (channel = '') => {
      if (channel.includes('뉴스레터')) return selectedChannels.newsletter
      if (channel.includes('인스타')) return selectedChannels.instagram
      if (channel.includes('블로그')) return selectedChannels.blog
      if (channel.includes('숏폼') || channel.includes('쇼츠') || channel.includes('아바타')) return selectedChannels.shorts
      return true
    }

    if (!parsedText && !verification) incomplete.push('문서 분석')
    if (!summary) incomplete.push('핵심 요약')
    if (!blogContent && !newsletterContent && !instagramContent && !shortsScript) incomplete.push('콘텐츠 생성')
    else {
      if (selectedChannels.blog && !blogContent) incomplete.push('네이버 블로그 콘텐츠')
      if (selectedChannels.newsletter && !newsletterContent) incomplete.push('뉴스레터 콘텐츠')
      if (selectedChannels.instagram && !instagramContent) incomplete.push('인스타그램 콘텐츠')
      if (selectedChannels.shorts && !shortsScript) incomplete.push('숏폼 대본')
    }
    // 숏폼 영상
    if (selectedChannels.shorts && !avatarImage) incomplete.push('숏폼 아바타')
    if (selectedChannels.shorts && !shortsVideo) incomplete.push('숏폼 영상')
    // 실패 항목
    const contentErrors = (stepErrors.content || []).filter(e => isSelectedErrorChannel(e.channel))
    const mediaErrors = (stepErrors.media || []).filter(e => !e.noRetry && isSelectedErrorChannel(e.channel))
    const shortsErrors = (stepErrors.shorts || []).filter(e => !e.noRetry && isSelectedErrorChannel(e.channel))
    contentErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    mediaErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    shortsErrors.forEach(e => { if (!incomplete.includes(e.channel)) incomplete.push(`${e.channel} (실패)`) })
    return incomplete
  }

  const viewResults = async () => {
    await blogImageProcessingPromiseRef.current.catch(() => {})

    if (processingBlogImages) {
      showErrorAlert('블로그 이미지 첨부', '첨부한 이미지를 아직 처리 중입니다. 잠시 후 다시 결과 확인을 눌러주세요.')
      return
    }

    const incomplete = getIncompleteItems()

    if (incomplete.length > 0) {
      setConfirmDialog(
        `다음 과정이 완료되지 않았습니다:\n\n${incomplete.map(f => `  • ${f}`).join('\n')}\n\n완료되지 않은 항목은 결과에 포함되지 않습니다.\n그래도 결과를 확인하시겠습니까?`
      )
      return
    }

    await navigateToResults()
  }

  const buildBlogImagesForResult = async () => {
    if (!selectedChannels.blog || !blogContent) return null

    const shouldAttach = !!promptSettings.media.blogAttachImages
    const shouldGenerate = !!promptSettings.media.blogGenerateImages
    const uploadedImages = shouldAttach
      ? blogUploadedImagesRef.current.map((image, index) => ({
          ...image,
          heading: image?.heading || blogContent?.sections?.[index]?.heading || '',
          source: 'uploaded',
        }))
      : []
    let generatedImages = shouldGenerate ? blogImages : []

    // 콘텐츠 생성 직후 백그라운드 이미지 생성이 실행 중이면 그 결과를 우선 기다린다.
    if (shouldGenerate && pendingBlogImagesPromiseRef.current) {
      const inflight = await pendingBlogImagesPromiseRef.current.catch(() => null)
      if (Array.isArray(inflight) && inflight.length > 0) {
        generatedImages = inflight
      }
    }

    const needsGeneratedImages =
      shouldGenerate &&
      (!Array.isArray(generatedImages) ||
        generatedImages.length === 0 ||
        generatedImages.every(image => !image?.imageUrl && !image?.renderedImageUrl && !image?.pngUrl))

    if (needsGeneratedImages) {
      setStepLoading('media', true)
      try {
        generatedImages = await generateBlogImages(blogContent.sections || [], {
          title: blogContent?.title || '',
          imageStyle: promptSettings.media.blogImageStyle,
          textOverlay: promptSettings.media.blogTextOverlay,
          imageTextOverlay: promptSettings.media.blogTextOverlay,
          mainColor: promptSettings.media.mainColor,
          categoryId: blogContent?.categoryInfo?.finalCategoryId || recommendedBlogCategory?.finalCategoryId || null,
          extra: promptSettings.media.extra,
        })
        setBlogImages(generatedImages)
      } catch (err) {
        addStepErrors('media', [{ service: 'gemini', channel: '블로그 이미지', message: err.message || '블로그 이미지 생성 실패' }])
        showErrorAlert('블로그 이미지 생성', err.message || '블로그 이미지 생성 실패')
        generatedImages = []
      } finally {
        setStepLoading('media', false)
      }
    }

    const normalized = normalizeBlogThumbnailSelection({
      uploadedImages,
      generatedImages: Array.isArray(generatedImages)
        ? generatedImages.map((image) => ({ ...image, source: image?.source || 'generated' }))
        : [],
      disabled: blogThumbnailDisabled,
    })

    const combinedImages = [
      ...normalized.uploadedImages,
      ...normalized.generatedImages,
    ].filter(Boolean)
      .sort((a, b) => Number(!!b?.isThumbnail) - Number(!!a?.isThumbnail))

    return combinedImages.length > 0 ? combinedImages : null
  }

  const navigateToResults = async () => {
    let fileBase64 = null
    if (file) {
      try {
        fileBase64 = await fileToBase64(file)
      } catch {
        fileBase64 = null
      }
    }

    const blogContentForResult = blogContent
      ? {
          ...blogContent,
          imageStyle: promptSettings.media.blogImageStyle,
          imageTextOverlay: promptSettings.media.blogTextOverlay,
          imageMode: [
            promptSettings.media.blogGenerateImages ? 'generate' : null,
            promptSettings.media.blogAttachImages ? 'upload' : null,
          ].filter(Boolean),
        }
      : blogContent

    const blogImagesForResult = await buildBlogImagesForResult()

    const instagramContentForResult = instagramContent
      ? {
          ...instagramContent,
          cardStyle: promptSettings.media.instagramCardStyle,
        }
      : instagramContent

    const resultState = {
      parsedText, verification, summary,
      blogContent: blogContentForResult, newsletterContent, instagramContent: instagramContentForResult,
      shortsScript,
      blogImages: blogImagesForResult, instagramImages, shortsVideo,
      blogFooterEnabled: promptSettings.content.includeBlogFooter !== false,
      fileName: file?.name || (demoMode ? `demo_${new Date().toISOString().slice(0, 10)}.pdf` : undefined),
      fileBase64,
      savedFromExtraction: true,
      isDemo: demoMode,
      draftKey: `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }

    if (typeof window !== 'undefined') {
      const drafts = window[RESULT_DRAFT_WINDOW_KEY] && typeof window[RESULT_DRAFT_WINDOW_KEY] === 'object'
        ? window[RESULT_DRAFT_WINDOW_KEY]
        : {}
      drafts[resultState.draftKey] = resultState
      window[RESULT_DRAFT_WINDOW_KEY] = drafts
    }

    storeResultDraftSession(resultState.draftKey, resultState)
    const historyState = sanitizeHistoryState(resultState)

    navigate('/extraction/result', {
      state: historyState,
    })
  }

  // 프롬프트 필드 렌더
  const PF = (label, { optional, type = 'input', value, onChange, placeholder, hint, tooltip, tooltipTitle = '도움말', options } = {}) => (
    <div className="mb-4 last:mb-0">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-text-muted mb-1.5">
        <span>{label}</span>
        {optional && <span className="font-normal text-text-muted/50">(선택)</span>}
        {tooltip && (
          <span className="relative inline-flex group">
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-bold text-primary-light transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label={`${label} 도움말`}
            >
              ?
            </button>
            <span className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl ring-1 ring-black/5 group-hover:block group-focus-within:block">
              <span className="block border-b border-border bg-surface-light px-3 py-2 text-xs font-bold text-text">
                {tooltipTitle}
              </span>
              <span className="block px-3 py-2.5 text-xs font-normal leading-relaxed text-text-muted">
                {tooltip}
              </span>
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-border bg-surface-light" />
            </span>
          </span>
        )}
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
  const selectedBlogCategoryProfile = getBlogCategoryProfile(promptSettings.content.blogCategoryId)
  const blogCategoryInfo = blogContent?.categoryInfo || recommendedBlogCategory || null
  const BlogCategoryPreview = ({ profile }) => {
    if (!profile) return null

    const sources = profile.suitableSources?.length ? profile.suitableSources : profile.classifierHints
    const examples = (profile.exampleLinks || []).slice(0, 2)

    return (
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-3 text-xs">
        <div>
          <p className="font-semibold text-text">{profile.label}</p>
          <p className="mt-1 leading-relaxed text-text-muted">{profile.goal}</p>
        </div>
        {profile.bodyPattern?.length > 0 && (
          <div>
            <p className="mb-1.5 font-semibold text-text-muted">글 구조</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.bodyPattern.map((item, index) => (
                <span key={`${profile.id}-body-${item}`} className="rounded-full border border-border bg-surface px-2 py-1 text-[11px] text-text-muted">
                  {index + 1}. {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {sources?.length > 0 && (
          <div>
            <p className="mb-1.5 font-semibold text-text-muted">적합한 자료</p>
            <div className="flex flex-wrap gap-1.5">
              {sources.slice(0, 6).map((item) => (
                <span key={`${profile.id}-source-${item}`} className="rounded-md bg-surface-light px-2 py-1 text-[11px] text-text-muted">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {examples.length > 0 && (
          <div>
            <p className="mb-1.5 font-semibold text-text-muted">예시 글</p>
            <div className="space-y-1">
              {examples.map((example, index) => (
                <a
                  key={`${profile.id}-example-${example.url || index}`}
                  href={example.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] text-primary-light transition-colors hover:border-primary/30 hover:bg-primary/10"
                >
                  {example.title || `예시 글 ${index + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
  const BlogCategoryAutoSummary = ({ info, pending = false }) => {
    if (!info && !pending) return null

    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-blue-700">자동 분류 결과</span>
          {info?.finalCategoryLabel && (
            <span className="rounded-full border border-blue-200 bg-white px-2 py-1 font-medium text-blue-700">
              {info.finalCategoryLabel}
            </span>
          )}
          {info?.confidence && info.confidence !== 'manual' && (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">
              신뢰도: {info.confidence}
            </span>
          )}
        </div>
        {info?.reason ? (
          <p className="leading-relaxed text-slate-700">{info.reason}</p>
        ) : (
          pending && (
            <p className="leading-relaxed text-slate-600">
              {loadingBlogCategoryRecommendation
                ? '문서 요약을 바탕으로 블로그 카테고리를 자동 분류하고 있습니다.'
                : '문서 요약을 바탕으로 추천 카테고리와 분류 근거를 여기에서 확인할 수 있습니다.'}
            </p>
          )
        )}
      </div>
    )
  }
  const BlogImageSettings = () => {
    const generateEnabled = promptSettings.media.blogGenerateImages !== false
    const attachEnabled = !!promptSettings.media.blogAttachImages

    return (
      <div className="mb-4 last:mb-0 space-y-2">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-text-muted mb-1.5">
          <span>블로그 이미지 설정</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            {
              key: 'generate',
              label: 'AI 이미지 생성 사용',
              selected: generateEnabled,
              onToggle: () => {
                const next = !generateEnabled
                updatePrompt('media', 'blogGenerateImages', next)
                if (!next) setBlogImages(null)
              },
            },
            {
              key: 'upload',
              label: '이미지 첨부',
              selected: attachEnabled,
              onToggle: () => updatePrompt('media', 'blogAttachImages', !attachEnabled),
            },
          ].map((option) => {
            return (
              <button
                key={option.key}
                type="button"
                onClick={option.onToggle}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                  option.selected
                    ? 'border-primary/40 bg-primary/10 text-primary-light'
                    : 'border-border bg-surface text-text-muted hover:border-primary/30 hover:text-text'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {option.selected && <CheckCircle size={12} />}
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>
        {/* 이미지 미리보기는 오른쪽 본문 영역 상단으로 이동했습니다. */}
        <input
          ref={blogImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleBlogImageFiles(event.target.files)
            event.target.value = ''
          }}
        />
        {attachEnabled && (
          <div className="rounded-xl border border-border bg-surface-light p-3 space-y-2">
            <button
              type="button"
              onClick={() => blogImageInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary/30 hover:text-text"
            >
              <Upload size={12} /> 이미지 선택
            </button>
            {blogThumbnailCandidates.length > 0 ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setThumbnailDisabledState(true)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    blogThumbnailDisabled
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'border-border bg-surface text-text-muted hover:border-primary/30 hover:text-text'
                  }`}
                >
                  썸네일 지정하지 않기
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {blogThumbnailCandidates.map((image, index) => (
                    <div key={`${image.sourceType}-${image.id || image.title || image.heading || index}`} className={`group relative aspect-square overflow-hidden rounded-lg border bg-surface ${
                      image.isThumbnail ? 'border-primary/60 ring-2 ring-primary/20' : 'border-border'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setImageLightbox({ kind: 'image', src: image.previewUrl })}
                        className="absolute inset-0"
                        aria-label={`${image.sourceLabel} ${index + 1} 크게 보기`}
                      >
                        <img src={image.previewUrl} alt={image.title || image.heading || `${image.sourceLabel} ${index + 1}`} className="h-full w-full object-cover" />
                      </button>
                      <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
                        {image.sourceLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectBlogThumbnailCandidate({ source: image.sourceType, index: image.sourceIndex })}
                        className={`absolute bottom-0 left-0 right-0 px-2 py-2 text-center text-xs font-medium transition-colors ${
                          image.isThumbnail
                            ? 'bg-primary text-white'
                            : 'bg-black/70 text-white hover:bg-primary'
                        }`}
                        aria-label="블로그 썸네일로 지정"
                      >
                        {image.isThumbnail ? '현재 썸네일' : '썸네일 지정'}
                      </button>
                      {image.sourceType === 'uploaded' && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextUploaded = blogUploadedImages.filter((_, imageIndex) => imageIndex !== image.sourceIndex)
                            applyBlogThumbnailState({
                              uploadedImages: nextUploaded,
                              generatedImages: blogImages,
                              disabled: blogThumbnailDisabled,
                            })
                          }}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="첨부 이미지 삭제"
                        >
                          <XCircle size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">아직 썸네일로 선택할 이미지가 없습니다.</p>
            )}
          </div>
        )}
        {!generateEnabled && !attachEnabled && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
            이미지 생성과 첨부가 모두 꺼져 있어 결과 블로그에 이미지가 포함되지 않습니다.
          </p>
        )}
      </div>
    )
  }
  const contentStepRows = [
    { key: 'blog', stepId: 3, label: '네이버 블로그', icon: FileText, color: 'text-emerald-500 bg-emerald-500/10', data: blogContent, detail: blogContent ? `${blogContent.sections?.length || 0}개 섹션` : null },
    { key: 'newsletter', stepId: 4, label: '뉴스레터', icon: Mail, color: 'text-blue-500 bg-blue-500/10', data: newsletterContent, detail: newsletterContent ? `${newsletterContent.keyPoints?.length || 0}개 포인트` : null },
    { key: 'instagram', stepId: 5, label: '인스타그램', icon: ImageIcon, color: 'text-pink-400 bg-pink-400/10', data: instagramContent, detail: instagramContent ? '본문 작성' : null },
    { key: 'shorts', stepId: 6, label: '숏폼', errorLabel: '숏폼 대본', icon: Film, color: 'text-red-500 bg-red-500/10', data: shortsScript, detail: shortsScript ? `${shortsScript.scenes?.length || 0}씬 · ${shortsScript.duration || 0}초` : null },
  ].filter(row => selectedChannels[row.key])

  const displayStepNum = (id) => {
    if (id <= 2) return id

    const contentStepIndex = contentStepRows.findIndex(row => row.stepId === id)
    return contentStepIndex >= 0 ? 3 + contentStepIndex : id
  }

  const blogThumbnailCandidates = (() => {
    const normalized = normalizeBlogThumbnailSelection({
      uploadedImages: blogUploadedImages,
      generatedImages: Array.isArray(blogImages) ? blogImages : [],
      disabled: blogThumbnailDisabled,
    })

    const uploadedCandidates = normalized.uploadedImages.map((image, index) => ({
      ...image,
      previewUrl: getBlogImagePreviewUrl(image),
      sourceType: 'uploaded',
      sourceLabel: '첨부 이미지',
      sourceIndex: index,
    }))

    const generatedCandidates = normalized.generatedImages.map((image, index) => ({
      ...image,
      previewUrl: getBlogImagePreviewUrl(image),
      sourceType: 'generated',
      sourceLabel: 'AI 생성 이미지',
      sourceIndex: index,
    }))

    return [...uploadedCandidates, ...generatedCandidates]
      .filter((image) => image.previewUrl)
      .sort((a, b) => Number(!!b?.isThumbnail) - Number(!!a?.isThumbnail))
  })()

  return (
    <div className="w-full">
      <NavigationBlockerModal when={isBusy} />
      {/* 팝업들 (고정 위치, 레이아웃 밖) */}
      <ErrorAlert message={errorAlert} onClose={() => setErrorAlert(null)} />
      <ImagePreviewModal previewImage={previewImage} onClose={() => setPreviewImage(null)} />
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
              if (s.id === 3) return selectedChannels.blog
              if (s.id === 4) return selectedChannels.newsletter
              if (s.id === 5) return selectedChannels.instagram
              if (s.id === 6) return selectedChannels.shorts
              return true
            }).map((step, i, arr) => {
              const Icon = step.icon
              const isActive = step.id === currentStep
              const isDone = step.id < currentStep
              const hasError = stepErrors[step.id >= 3 && step.id <= 6 ? 'content' : ['select', 'upload', 'analysis', null, null, null, null, 'media', 'shorts'][step.id]]?.length > 0
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
            <button
              onClick={() => setDemoMode(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 ${demoMode ? 'bg-warning/15 text-warning border border-warning/30' : 'bg-surface-light text-text-muted border border-border hover:border-primary/30'}`}
              title="데모 모드 전환"
            >
              {demoMode ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              데모
            </button>
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
            demoMode ? (
              <div className="rounded-xl border border-warning/25 bg-warning/5 p-6 text-center">
                <Upload size={28} className="mx-auto mb-3 text-warning" />
                <p className="text-sm text-text">데모 모드에서는 샘플 문서로 바로 진행합니다.</p>
                <p className="text-xs text-text-muted mt-1">파일 업로드 없이 분석, 콘텐츠, 이미지, 숏폼 생성 흐름을 확인할 수 있습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFile({ name: 'demo_report.pdf', size: 2048000, type: 'application/pdf' })
                    clearStepErrors('upload')
                    setCurrentStep(2)
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-dark"
                >
                  <Sparkles size={14} />
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
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt,.txt,.jpg,.jpeg,.png,.webp,text/plain,image/jpeg,image/png,image/webp" onChange={handleFileInput} />
                <Upload size={28} className="mx-auto mb-3 text-text-muted" />
                <p className="text-sm text-text">파일을 드래그하거나 <span className="text-primary font-medium">클릭</span>하여 업로드</p>

                <p className="text-xs text-text-muted mt-1">PDF, HWP, DOCX, PPTX, TXT, 이미지(JPG/PNG/WEBP) 지원</p>
              </div>
            )
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

      {/* Step 3-6: Channel Content Generation */}
      {contentStepRows.map((row) => {
        const Icon = row.icon
        const errObj = stepErrors.content?.find(e => e.channel === (row.errorLabel || row.label))
        const failed = !row.data && !!errObj
        const generating = retrying === `content-${row.key}` || retrying === `regen-${row.key}` || retrying === `${errObj?.service}-${errObj?.channel}`
        const generatingLabel = getChannelGenerationLabel(row.key)
        const isAvailable = currentStep >= row.stepId || !!row.data
        return (
          <div key={row.key} id={`step-${row.stepId}`} className="flex gap-4 items-stretch">
            <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${!isAvailable ? 'opacity-50 pointer-events-none' : ''}`}>
              <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> {row.label} 설정</p>
              {PF('글의 어조', { type: 'select', value: promptSettings.content.tone, onChange: v => updatePrompt('content', 'tone', v), options: [{ value: 'auto', label: '자동' }, { value: 'friendly', label: '친근한' }, { value: 'professional', label: '전문적인' }, { value: 'humorous', label: '유머러스' }, { value: 'formal', label: '진지한' }] })}
              {row.key === 'blog' && (
                <>
                  {PF('카테고리 분류', {
                    type: 'select',
                    value: promptSettings.content.blogCategoryMode,
                    onChange: v => updatePrompt('content', 'blogCategoryMode', v),
                    tooltipTitle: '자동 추천 모드',
                    tooltip: '블로그 생성 시 문서 내용으로 카테고리를 먼저 분류한 뒤 해당 규칙으로 작성합니다.',
                    options: [
                      { value: 'auto', label: '자동 추천' },
                      { value: 'manual', label: '직접 선택' },
                    ],
                  })}
                  {promptSettings.content.blogCategoryMode === 'manual' && PF('블로그 카테고리', {
                    type: 'select',
                    value: promptSettings.content.blogCategoryId,
                    onChange: v => updatePrompt('content', 'blogCategoryId', v),
                    options: BLOG_CATEGORY_OPTIONS,
                    hint: '선택한 카테고리 규칙을 블로그 프롬프트에 바로 반영합니다.',
                  })}
                  {promptSettings.content.blogCategoryMode === 'manual' && selectedBlogCategoryProfile && (
                    <BlogCategoryPreview profile={selectedBlogCategoryProfile} />
                  )}
                  {promptSettings.content.blogCategoryMode === 'auto' && (
                    <BlogCategoryAutoSummary info={blogCategoryInfo} pending />
                  )}
                  {PF('블로그 하단 공통 링크', {
                    type: 'select',
                    value: promptSettings.content.includeBlogFooter === false ? 'off' : 'on',
                    onChange: v => updatePrompt('content', 'includeBlogFooter', v !== 'off'),
                    options: [
                      { value: 'on', label: '사용' },
                      { value: 'off', label: '사용 안 함' },
                    ],
                    hint: '이번 블로그 결과 하단에 저장된 공통 링크를 붙일지 선택합니다.',
                  })}
                  <BlogImageSettings />
                  {PF('블로그 추가 지시', { optional: true, type: 'textarea', placeholder: 'SEO 키워드, 반드시 다뤄야 할 포인트 등', value: promptSettings.content.blogExtra, onChange: v => updatePrompt('content', 'blogExtra', v) })}
                </>
              )}
              {row.key === 'newsletter' && PF('뉴스레터 추가 지시', { optional: true, type: 'textarea', placeholder: '구독자 톤, CTA 등', value: promptSettings.content.newsletterExtra, onChange: v => updatePrompt('content', 'newsletterExtra', v) })}
              {row.key === 'instagram' && PF('인스타그램 추가 지시', { optional: true, type: 'textarea', placeholder: '수치 강조 등', value: promptSettings.content.instaExtra, onChange: v => updatePrompt('content', 'instaExtra', v) })}
              {row.key === 'shorts' && (
                <>
                  {PF('영상 컨셉', {
                    type: 'select',
                    value: promptSettings.shorts.videoConcept,
                    onChange: (v) => {
                      updatePrompt('shorts', 'videoConcept', v)
                      // 컨셉 선택 시: extra 필드 자동 채움 + 첫 번째 추천 아바타 자동 선택
                      const concept = findShortsVideoConcept(v)
                      if (concept) {
                        updatePrompt('shorts', 'extra', buildShortsConceptExtra(v))
                        const firstAvatarId = concept.preferredAvatarIds?.[0]
                        if (firstAvatarId) {
                          const preset = findPresetShortsAvatar(firstAvatarId)
                          if (preset) {
                            setAvatarPrompt('')
                            setAvatarImage(presetAvatarPreviews[firstAvatarId] || null)
                            setHeygenAvatarId(firstAvatarId)
                            setAvatarConfirmed(true)
                            setHeygenReady(true)
                            setHeygenUploading(false)
                          }
                        }
                      } else {
                        updatePrompt('shorts', 'extra', '')
                      }
                    },
                    options: SHORTS_VIDEO_CONCEPT_OPTIONS,
                    hint: '선택 시 영상 추가 지시 + 추천 아바타가 자동 적용됩니다. 멀티 아바타 컨셉은 첫 번째 인물 기준으로 자동 세팅.',
                  })}
                  {promptSettings.shorts.videoConcept && (() => {
                    const concept = findShortsVideoConcept(promptSettings.shorts.videoConcept)
                    if (!concept?.testScript) return null
                    return (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShortsScript(concept.testScript)
                            removeStepError('content', 'gemini', '숏폼 대본')
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Sparkles size={12} /> 테스트 대본 불러오기 (약 {concept.testScript.duration}초)
                        </button>
                        <p className="text-[11px] text-text-muted">
                          현재 쇼츠 대본을 컨셉용 샘플 대본으로 즉시 교체합니다. (HeyGen 비용 절감 — Gemini 호출 없음)
                        </p>
                      </div>
                    )
                  })()}
                  {PF('나레이션 스타일', {
                    type: 'select',
                    value: shortsVoicePresetValue,
                    onChange: applyShortsVoicePreset,
                    options: SHORTS_VOICE_PRESET_OPTIONS.map(option => ({
                      value: option.value,
                      label: option.label,
                    })),
                  })}
                  {PF('영상 추가 지시사항', {
                    optional: true,
                    type: 'textarea',
                    placeholder: '예: 핵심 수치는 화면 상단 텍스트로만 강조, 텍스트는 짧고 강하게',
                    value: promptSettings.shorts.extra,
                    onChange: v => updatePrompt('shorts', 'extra', v),
                    hint: '추천 모드(Video Agent)에서 가장 강하게 반영됩니다.',
                  })}
                </>
              )}
            </div>

            <div className={`flex-1 min-w-0 bg-surface rounded-xl border transition-all ${currentStep === row.stepId ? 'border-primary/40' : 'border-border'} ${!isAvailable ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${row.data ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text text-base">Step {displayStepNum(row.stepId)}. {row.label} 생성</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {row.data && (
                    <span className="text-xs font-medium flex items-center gap-1 text-success">
                      <CheckCircle size={14} /> 완료 {row.detail ? `· ${row.detail}` : ''}
                    </span>
                  )}
                  {(row.key === 'blog' || row.key === 'instagram') && generating && contentGenerationStage === 'image' && (
                    <span className="text-xs font-medium flex items-center gap-1 text-primary">
                      <Loader2 size={14} className="animate-spin" /> 이미지 생성 중...
                    </span>
                  )}
                  {failed && (
                    <span className="text-xs font-medium flex items-center gap-1 text-danger">
                      <XCircle size={14} /> 실패
                    </span>
                  )}
                  <button
                    onClick={() => row.data ? regenerateChannel(row.key) : failed ? retryContentChannel(errObj) : runSingleContentStep(row.key)}
                    disabled={!isAvailable || generating || loading.content || loading.analysis || loading.summary}
                    className={`${row.data ? 'px-3 py-1.5 bg-surface-light text-text-muted hover:bg-surface hover:text-text border border-border' : 'px-4 py-2 bg-primary text-white hover:bg-primary-dark'} text-sm font-medium rounded-lg disabled:opacity-50 transition-all flex items-center gap-2`}
                  >
                    {generating
                      ? <><Loader2 size={14} className="animate-spin" /> {generatingLabel}</>
                      : row.data
                        ? <><RefreshCw size={14} /> 재생성</>
                        : failed
                          ? <><RefreshCw size={14} /> 재시도</>
                          : <><Sparkles size={14} /> 생성</>
                    }
                  </button>
                  {generating && (
                    <button
                      type="button"
                      onClick={abortContentGeneration}
                      className="px-3 py-2 rounded-lg border border-danger/30 bg-danger/5 text-sm font-medium text-danger transition-all hover:bg-danger/10"
                    >
                      작업 중단
                    </button>
                  )}
                </div>
              </div>

              {isAvailable && (
                <div className="p-5">
                  {!row.data && !failed && (
                    <div className="rounded-lg border border-border bg-surface-light p-4 text-sm text-text-muted">
                      {row.key === 'shorts'
                        ? '아바타를 먼저 선택하거나 확정한 뒤 생성하면, 숏폼 대본과 영상이 같은 단계에서 순차적으로 생성됩니다.'
                        : `${row.label} 콘텐츠를 생성하면 다음 단계로 이동합니다.`}
                    </div>
                  )}
                  {failed && (
                    <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
                      {errObj.message}
                    </div>
                  )}
                  {row.key === 'blog' && blogContent && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-base font-bold text-text">{blogContent.title}</h4>
                        {blogContent.metaDescription && <p className="text-xs text-text-muted mt-1">{blogContent.metaDescription}</p>}
                      </div>
                      {blogContent.sections?.map((sec, i) => (
                        <div key={i} className="border-l-2 border-primary/30 pl-3">
                          <h5 className="font-semibold text-sm text-text">{sec.heading}</h5>
                          <p className="text-sm text-text-muted mt-1.5 whitespace-pre-wrap">{sec.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.key === 'newsletter' && newsletterContent && (
                    <div className="space-y-3">
                      <h4 className="text-base font-bold text-text">{newsletterContent.subject}</h4>
                      {newsletterContent.preheader && <p className="text-xs text-text-muted">{newsletterContent.preheader}</p>}
                      {newsletterContent.body && <p className="text-sm text-text-muted whitespace-pre-wrap leading-6">{newsletterContent.body}</p>}
                    </div>
                  )}
                  {row.key === 'instagram' && instagramContent && (
                    <div className="space-y-3">
                      {instagramContent.caption && <p className="text-sm text-text whitespace-pre-wrap">{instagramContent.caption}</p>}
                      {instagramContent.cardTopics?.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {instagramContent.cardTopics.map((card, i) => (
                            <div key={i} className="bg-surface-light rounded-lg p-2.5 border border-border">
                              <p className="text-xs font-bold text-text">{card.headline}</p>
                              <p className="text-xs text-text-muted mt-0.5">{card.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {row.key === 'shorts' && (
                    <div className="space-y-3">
                      {shortsScript && (
                        <>
                          <div>
                            <h4 className="text-base font-bold text-text">{shortsScript.title}</h4>
                            <p className="text-xs text-text-muted">총 {shortsScript.duration}초 · {shortsScript.scenes?.length || 0}씬</p>
                          </div>
                          {shortsScript.hook && (
                            <div className="bg-warning/10 rounded-lg p-2.5 border border-warning/20">
                              <p className="text-xs font-semibold text-warning mb-0.5">오프닝 훅</p>
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
                              {scene.textOverlay && <p className="text-xs text-text-muted mt-1">{scene.textOverlay}</p>}
                            </div>
                          ))}
                        </>
                      )}
                      <div className="border-t border-border pt-5 space-y-5">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">{shortsStepNumbers.avatar}</span>
                            <p className="text-base font-semibold text-text">아바타 선택</p>
                            {heygenAvatarId && <CheckCircle size={14} className="text-success" />}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {PRESET_SHORTS_AVATARS.map((preset) => {
                              const isSelected = heygenAvatarId === preset.avatarId
                              const previewUrl = presetAvatarPreviews[preset.avatarId] || null
                              return (
                                <div
                                  key={preset.id}
                                  className={`group relative rounded-xl border bg-surface-light overflow-hidden transition-all ${
                                    isSelected ? 'border-primary/60 ring-2 ring-primary/30 shadow-md' : 'border-border hover:border-primary/30'
                                  }`}
                                >
                                  <div className="relative bg-surface" style={{ aspectRatio: '3/4' }}>
                                    {previewUrl ? (
                                      <img src={previewUrl} alt={preset.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center text-xs text-text-muted">
                                        <Loader2 size={14} className="animate-spin mr-1" /> 미리보기
                                      </div>
                                    )}
                                    {/* 이미지 영역 호버 시 가운데 ▶ 재생 버튼 — 클릭 시 voice 만 재생 (선택은 아님) */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        playVoicePreview(preset)
                                      }}
                                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                      aria-label={`${preset.name} 목소리 미리듣기`}
                                    >
                                      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/95 text-gray-900 shadow-lg">
                                        <Play size={20} className="ml-0.5" />
                                      </span>
                                    </button>
                                  </div>
                                  {/* 하단 이름 영역 — 클릭 시 아바타 선택 */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAvatarPrompt('')
                                      setAvatarImage(previewUrl)
                                      setHeygenAvatarId(preset.avatarId)
                                      setAvatarConfirmed(true)
                                      setHeygenReady(true)
                                      setHeygenUploading(false)
                                    }}
                                    className={`block w-full px-2 py-2 text-left transition-colors ${
                                      isSelected ? 'bg-primary/10' : 'hover:bg-surface'
                                    }`}
                                    aria-label={`${preset.name} 선택`}
                                  >
                                    <p className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-text'}`}>{preset.name}</p>
                                    <p className="text-[11px] text-text-muted">{preset.kind}</p>
                                  </button>
                                  {isSelected && (
                                    <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                                      <CheckCircle size={10} /> 선택됨
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">{shortsStepNumbers.subtitle}</span>
                            <p className="text-base font-semibold text-text">자막 스타일</p>
                            {subtitleStyle && <CheckCircle size={14} className="text-success" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-text-muted">폰트</p>
                            {[
                              { value: 'default', label: '기본', style: {} },
                              { value: 'bold', label: '볼드', style: { fontFamily: 'A2z, sans-serif', fontWeight: 700 } },
                              { value: 'dongle', label: '동글', style: { fontFamily: 'TmoneyRoundWind, sans-serif', fontWeight: 400 } },
                              { value: 'handwriting', label: '손글씨', style: { fontFamily: 'Maplestory, sans-serif', fontWeight: 300 } },
                              { value: 'gothic', label: '고딕', style: { fontFamily: 'KBODiaGothic, sans-serif', fontWeight: 300 } },
                            ].map(f => (
                              <button
                                key={f.value}
                                onClick={() => setSubtitleFont(f.value)}
                                style={f.style}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${subtitleFont === f.value ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-light border-border text-text-muted hover:border-primary/20'}`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
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
                                    {s.value === 'style1' ? (
                                      <div className="bg-black/70 px-3 py-1.5 rounded">
                                        <p className="text-white text-xs font-medium text-center" style={fontStyle}>안녕하세요 AI 분석입니다</p>
                                      </div>
                                    ) : (
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

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">{shortsStepNumbers.video}</span>
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
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="flex flex-col items-center gap-2">
                                    <p className="text-xs font-medium text-text-muted">자막 포함 최종본</p>
                                    <div className="w-full max-w-[240px] rounded-xl overflow-hidden border-2 border-red-500/30 shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                                      <video src={shortsVideo.url} controls className="w-full h-full object-contain" />
                                    </div>
                                  </div>
                                  {getDistinctRawShortsUrl(shortsVideo) && (
                                    <div className="flex flex-col items-center gap-2">
                                      <p className="text-xs font-medium text-text-muted">자막 추가 전 원본</p>
                                      <div className="w-full max-w-[240px] rounded-xl overflow-hidden border-2 border-border shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                                        <video src={getDistinctRawShortsUrl(shortsVideo)} controls className="w-full h-full object-contain" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => setCreditConfirm(true)}
                              disabled={!isShortsVideoReady}
                              className={`w-full px-4 py-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                                isShortsVideoReady
                                  ? 'bg-primary text-white hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/25'
                                  : 'bg-primary text-white opacity-50 cursor-not-allowed'
                              }`}
                            >
                              {loading.shorts
                                ? <><Loader2 size={16} className="animate-spin" /> HeyGen 영상 생성 중...</>
                                : <><Film size={16} /> 숏폼 영상 생성</>}
                            </button>
                          )}
                          {!avatarImage && !shortsVideo && <p className="text-xs text-text-muted">아바타를 생성하고 확정해주세요</p>}
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
                        <ErrorPanel errors={stepErrors.shorts} onRetry={(err) => {
                          if (err.channel === '아바타') { generateAvatar() }
                          else { runShortsGeneration() }
                        }} retrying={retrying} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
      {/* View Results Button - 콘텐츠가 하나라도 있으면 활성화, 로딩 중이면 비활성 */}
      <div className="flex justify-end">
        <button
          onClick={viewResults}
          disabled={!hasAnyContent || loading.content || loading.media || loading.shorts || processingBlogImages}
          className={`px-6 py-3 font-medium rounded-xl transition-all flex items-center gap-2 ${
            hasAnyContent && !loading.content && !loading.media && !loading.shorts && !processingBlogImages
              ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20'
              : 'bg-surface-light text-text-muted border border-border cursor-not-allowed'
          }`}
        >
          {loading.content || loading.media || loading.shorts || processingBlogImages ? (
            <><Loader2 size={18} className="animate-spin" /> 작업 중...</>
          ) : (
            <><Eye size={18} /> 결과 확인 <ArrowRight size={16} /></>
          )}
        </button>
      </div>
      </div>{/* 스텝 카드 끝 */}
      </div>{/* 메인 레이아웃 끝 */}
      {imageLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setImageLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            {imageLightbox.kind === 'knowledge' ? (
              <div className="w-[min(80vh,80vw)]">
                <KnowledgeInsightCard
                  index={imageLightbox.index || 0}
                  headline={imageLightbox.headline}
                  bullets={imageLightbox.bullets}
                  imageUrl={imageLightbox.imageUrl}
                />
              </div>
            ) : imageLightbox.kind === 'artwork' ? (
              <div className="w-[min(80vh,80vw)] aspect-square rounded-lg overflow-hidden shadow-2xl">
                <BlogImageArtwork
                  src={imageLightbox.src}
                  alt={imageLightbox.alt}
                  headline={imageLightbox.headline}
                  description={imageLightbox.description}
                  showTextOverlay={imageLightbox.showTextOverlay}
                  variant={imageLightbox.variant}
                  fontPreset={imageLightbox.fontPreset}
                  mode="result"
                />
              </div>
            ) : (
              <img
                src={imageLightbox.src}
                alt="블로그 이미지 미리보기"
                className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl object-contain"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setImageLightbox(null)}
            className="absolute top-6 right-6 rounded-full bg-white/90 p-2 text-gray-900 shadow hover:bg-white"
            aria-label="닫기"
          >
            <XCircle size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

