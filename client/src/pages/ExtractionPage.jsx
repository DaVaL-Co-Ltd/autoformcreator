import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, ChevronDown, ChevronUp, Eye, ArrowRight,
  XCircle, AlertTriangle, RefreshCw, Film, Settings2, Download,
  Mail, Play, Pause, ZoomIn, X
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
import { PRESET_SHORTS_AVATARS, findPresetShortsAvatar, findPresetById, getPresetCategory, getPresetsByCategory } from '../utils/presetShortsAvatars'
import { SHORTS_VIDEO_CONCEPT_OPTIONS, findShortsVideoConcept, buildShortsConceptExtra } from '../utils/shortsVideoConcepts'
import { resolveAvatarGroupLook } from '../utils/avatarGroupLook'
import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
} from '../utils/contentImageOverlay'
import { renderBlogUploadImageDataUrl } from '../utils/uploadImageComposite'
import {
  buildInstagramDisplayCards,
  buildInstagramKnowledgeBullets,
  getInstagramCardNumber,
  getInstagramOverlayTitle,
} from '../utils/instagramCarousel'
import { stripMarkdownEmphasis } from '../utils/platformFormatter'
import NavigationBlockerModal from '../components/NavigationBlockerModal'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { absorbHookIntoFirstScene, buildShortsVideoAgentPrompt, mapShortsSubtitleStyleToBurnStyle } from '../utils/shortsVideoAgent.js'
import { toSpokenText } from '../utils/shortsTtsText.js'
import { callGeminiWithFallback, findInlineDataPart, requestGeminiContent } from '../services/gemini-core'
import {
  BLOG_CATEGORY_OPTIONS,
  getBlogCategoryProfile,
} from '../services/blogCategoryProfile'
import { composeBlogSectionBody } from '../utils/blogBodySanitizer'
import { isAutomaticBlogQuoteCategory } from '../utils/blogHeadingStyle'

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

  return {
    uploadedImages: safeUploaded,
    generatedImages: safeGenerated.map((image) => ({ ...image, isThumbnail: false })),
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
      blogTone: 'auto',
      newsletterTone: 'auto',
      instagramTone: 'auto',
      shortsTone: 'auto',
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
  // 컨셉 선택 상태에서 그 컨셉에 없는 아바타를 직접 고르면 컨셉이 초기화되며 이 안내를 띄운다.
  const [conceptResetNotice, setConceptResetNotice] = useState(false)
  // 프리셋 아바타 미리보기 URL 캐시 (avatarId → preview_image_url)
  const [presetAvatarPreviews, setPresetAvatarPreviews] = useState({})
  // 프리셋 voice 샘플 URL 캐시 (voiceId → preview_audio URL)
  const [presetVoicePreviews, setPresetVoicePreviews] = useState({})
  // 그룹 룩 캐시 (groupId → looks 배열) — avatarGroupId 가 있는 preset 들에서 펼침 표시용.
  const [groupLooks, setGroupLooks] = useState({})
  // 내 voice 목록 (HeyGen 본인 계정 voice). voice 선택 그리드에서 사용.
  const [myVoices, setMyVoices] = useState([])
  // 사용자가 voice 그리드에서 고른 voice_id. null 이면 아바타 preset.defaultVoiceId 사용.
  const [selectedVoiceId, setSelectedVoiceId] = useState(null)
  // 2인 슬롯 컨셉(study_dialogue·mock_interview)에서 역할별로 고른 아바타+목소리.
  // 각 항목: { presetId, voiceId }. 인덱스는 concept.avatarSlots 와 1:1 대응.
  const [conceptAvatarSlots, setConceptAvatarSlots] = useState([])
  // 아바타 그리드 카테고리 필터 — 동완쌤·후라이쌤·제자 중 하나만 표시.
  const [selectedAvatarCategory, setSelectedAvatarCategory] = useState('dongwan_ssaem')
  // 아바타 카드 확대 모달 — 돋보기 버튼 클릭 시 이미지 URL 을 담아 모달을 띄운다.
  const [lightboxImageUrl, setLightboxImageUrl] = useState(null)
  // 현재 재생 중인 voice 미리듣기 voice_id. ▶/⏸ 토글 아이콘 표시와 같은 voice 클릭 시 정지에 사용.
  const [playingVoiceId, setPlayingVoiceId] = useState(null)
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

  // 그룹 룩 fetch — avatarGroupId 가 있는 preset(동완쌤·후라이쌤)의 그룹 안 룩을 받아온다.
  useEffect(() => {
    if (!selectedChannels.shorts) return
    const groupIds = Array.from(new Set(
      PRESET_SHORTS_AVATARS.map((p) => p.avatarGroupId).filter(Boolean)
    ))
    const missing = groupIds.filter((gid) => !groupLooks[gid])
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map((gid) =>
      apiFetch(`/api/heygen/avatar-group/${gid}/looks`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => ({ gid, looks: Array.isArray(data?.looks) ? data.looks : [] }))
        .catch(() => ({ gid, looks: [] }))
    )).then((results) => {
      if (cancelled) return
      setGroupLooks((prev) => {
        const next = { ...prev }
        for (const { gid, looks } of results) next[gid] = looks
        return next
      })
    })
    return () => { cancelled = true }
  }, [selectedChannels.shorts, groupLooks])

  // 아바타 카드 그리드용 — 동완쌤·후라이쌤·제자들 3개 카테고리로 분리해서 표시한다.
  // 그룹 있는 preset 은 룩별로 펼쳐 각각 카드 1개로 만들고, 가로(16:9) 룩까지 모두 포함한다.
  const avatarCategories = useMemo(() => {
    const expandPreset = (preset) => (
      preset.avatarGroupId
        ? (groupLooks[preset.avatarGroupId] || []).map((look) => ({
            key: `${preset.id}:${look.id}`,
            preset,
            lookId: look.id,
            preview: look.preview || null,
          }))
        : [{
            key: preset.id,
            preset,
            lookId: preset.avatarId,
            preview: presetAvatarPreviews[preset.avatarId] || null,
          }]
    )
    const dongwan = []
    const fry = []
    const students = []
    for (const preset of PRESET_SHORTS_AVATARS) {
      const items = expandPreset(preset)
      if (preset.id === 'dongwan_ssaem') dongwan.push(...items)
      else if (preset.id === 'fry_ssaem') fry.push(...items)
      else students.push(...items)
    }
    // 같은 lookId 가 개별 preset 카드와 '다 제자' 그룹 룩 양쪽에서 나와 중복될 수 있어 dedup (미리보기 있는 쪽 우선).
    const dedup = (items) => {
      const map = new Map()
      for (const item of items) {
        const cur = map.get(item.lookId)
        if (!cur || (!cur.preview && item.preview)) map.set(item.lookId, item)
      }
      return [...map.values()]
    }
    return [
      { id: 'dongwan_ssaem', label: '동완쌤', items: dedup(dongwan) },
      { id: 'fry_ssaem', label: '후라이쌤', items: dedup(fry) },
      { id: 'students', label: '제자', items: dedup(students) },
    ]
  }, [groupLooks, presetAvatarPreviews])

  // 단일 컨셉이 그룹형 아바타(동완쌤·후라이쌤)를 자동 선택하면 heygenAvatarId 에 그룹 ID 가 들어간다.
  // 그리드 카드는 그룹을 펼친 개별 룩(look.id)이라 그룹 ID 로는 어떤 카드도 선택 표시되지 않으므로,
  // 그룹 룩이 로드되면 첫 룩으로 치환해 실제 카드가 선택돼 보이게 한다.
  useEffect(() => {
    if (!heygenAvatarId) return
    const preset = findPresetShortsAvatar(heygenAvatarId)
    if (preset?.avatarGroupId && preset.avatarGroupId === heygenAvatarId) {
      const looks = groupLooks[preset.avatarGroupId]
      if (Array.isArray(looks) && looks.length > 0 && looks[0]?.id) {
        setHeygenAvatarId(looks[0].id)
        if (looks[0].preview) setAvatarImage(looks[0].preview)
      }
    }
  }, [heygenAvatarId, groupLooks])

  // 내 voice 목록 fetch — 숏폼이 선택됐을 때만 1회.
  useEffect(() => {
    if (!selectedChannels.shorts) return
    if (myVoices.length > 0) return
    let cancelled = false
    apiFetch('/api/heygen/my-voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const voices = Array.isArray(data?.voices) ? data.voices : []
        if (voices.length > 0) setMyVoices(voices)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedChannels.shorts, myVoices])

  // voice 토글 재생/정지 — 같은 voice 다시 누르면 정지, 다른 voice 누르면 정지 후 새로 재생.
  const toggleVoiceUrl = (voiceId, url) => {
    const ref = avatarVoiceAudioRef
    if (playingVoiceId === voiceId && ref.current) {
      ref.current.pause()
      ref.current.currentTime = 0
      ref.current = null
      setPlayingVoiceId(null)
      return
    }
    if (ref.current) {
      ref.current.pause()
      ref.current.currentTime = 0
      ref.current = null
    }
    if (!url) return
    try {
      const audio = new Audio(url)
      ref.current = audio
      setPlayingVoiceId(voiceId)
      audio.onended = () => {
        if (ref.current === audio) {
          ref.current = null
          setPlayingVoiceId(null)
        }
      }
      audio.play().catch(() => {
        if (ref.current === audio) {
          ref.current = null
          setPlayingVoiceId(null)
        }
      })
    } catch {
      setPlayingVoiceId(null)
    }
  }

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

  // 활성 컨셉이 2인 슬롯 컨셉이면 그 컨셉, 아니면 null.
  const activeSlotConcept = (() => {
    const concept = findShortsVideoConcept(promptSettings.shorts.videoConcept)
    return Array.isArray(concept?.avatarSlots) && concept.avatarSlots.length > 0 ? concept : null
  })()

  // 슬롯 한 칸 갱신 (avatar 또는 voice).
  const updateSlot = (index, patch) => {
    setConceptAvatarSlots((prev) => {
      const next = prev.slice()
      next[index] = { ...(next[index] || {}), ...patch }
      return next
    })
  }

  // 2인 슬롯 컨셉 선택 검증. 통과면 null, 위반이면 사용자에게 보여줄 경고 메시지를 반환.
  const validateSlotConcept = (concept, slots) => {
    if (!Array.isArray(concept?.avatarSlots) || concept.avatarSlots.length === 0) return null
    for (let i = 0; i < concept.avatarSlots.length; i++) {
      const slotDef = concept.avatarSlots[i]
      const sel = slots[i]
      if (!sel?.presetId) return `'${slotDef.role}' 아바타를 선택해주세요.`
      if (getPresetCategory(sel.presetId) !== slotDef.category) {
        const catLabel = slotDef.category === 'teachers' ? '동완쌤 또는 후라이쌤' : '제자 카테고리'
        return `'${slotDef.role}' 자리에는 ${catLabel}에서만 선택할 수 있습니다.`
      }
      if (!sel?.voiceId) return `'${slotDef.role}'의 목소리를 선택해주세요.`
    }
    const presetIds = slots.slice(0, concept.avatarSlots.length).map((s) => s.presetId)
    if (new Set(presetIds).size !== presetIds.length) return '서로 다른 아바타 2명을 선택해주세요.'
    return null
  }

  // 슬롯 컨셉이면 슬롯이 모두 유효해야, 아니면 아바타+목소리 단일 선택이 돼야 준비 완료.
  const isShortsAvatarVoiceReady = activeSlotConcept
    ? validateSlotConcept(activeSlotConcept, conceptAvatarSlots) === null
    : (!!avatarConfirmed && !!selectedVoiceId)

  const isShortsVideoReady =
    isShortsAvatarVoiceReady &&
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
    if (step <= 3) { setBlogContent(null); setBlogImages(null) }
    if (step <= 4) setNewsletterContent(null)
    if (step <= 5) { setInstagramContent(null); setInstagramImages(null) }
    if (step <= 6) setShortsScript(null)
    if (step <= 7) {
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

    try {
      const result = await summarizeContent(targetText, { keywords: promptSettings.summary.keywords, style: promptSettings.summary.style, extra: promptSettings.summary.extra })
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

    const contentOptions = {
      ...buildContentPromptOptions(),
      tone: promptSettings.content[`${channelKey}Tone`] || 'auto',
      signal: options.signal,
    }
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
    if (channelKey === 'shorts') {
      if (activeSlotConcept) {
        // 2인 슬롯 컨셉: 역할별 아바타+목소리 규칙 위반 시 경고 팝업 후 중단.
        const violation = validateSlotConcept(activeSlotConcept, conceptAvatarSlots)
        if (violation) {
          addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: violation }])
          setErrorAlert(violation)
          return
        }
      } else if (!avatarConfirmed || !selectedVoiceId) {
        const message = !avatarConfirmed
          ? '숏폼 생성 전에 아바타를 먼저 선택해주세요.'
          : '숏폼 생성 전에 목소리를 먼저 선택해주세요.'
        addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message }])
        showErrorAlert('숏폼 생성', message)
        return
      }
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

    // 채널 4종은 서로 의존성이 없어 동시에 생성한다(블로그/인스타는 내부에서 이미지까지 포함).
    setRetrying('content-all')
    const settled = await Promise.allSettled(
      channels.map((channel) => generateContentChannel(channel.key, { clearError: false, signal: abortController.signal })),
    )

    let cancelled = abortController.signal.aborted
    settled.forEach((outcome, index) => {
      const channel = channels[index]
      if (outcome.status === 'fulfilled') {
        if (outcome.value) {
          anySuccess = true
        } else {
          errors.push({ service: 'gemini', channel: channel.label, message: '해당 채널 콘텐츠가 생성되지 않았습니다.' })
        }
      } else if (isContentGenerationCancelledError(outcome.reason)) {
        cancelled = true
      } else {
        errors.push({ service: 'gemini', channel: channel.label, message: outcome.reason?.message || '생성 실패' })
      }
    })

    if (cancelled) {
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

  // 하이브리드 컨셉(인포그래픽 + verbatim): 아바타 씬은 표준 엔드포인트(우리 대본 그대로),
  // 인포그래픽 씬은 Video Agent(HeyGen 차트 연출)로 따로 렌더해 씬 순서대로 합친다.
  // infographic-full 이지만 보여줄 데이터(숫자)가 없는 씬은 아바타 씬으로 폴백한다.
  // 자막은 아바타 씬에만 (server 가 infographic-full 씬은 skip).
  const runHybridSegmentedShorts = async ({ targetScript, avatarId, voiceId }) => {
    const scenes = Array.isArray(targetScript?.scenes) ? targetScript.scenes : []
    if (scenes.length === 0) throw new Error('쇼츠 대본에 씬이 없습니다.')
    const sceneText = (s) => String(s?.caption || s?.narration || '')
    const hasData = (s) => /\d/.test(`${sceneText(s)} ${s?.textOverlay || ''}`)
    const typeOf = (s) => ((s?.layout === 'infographic-full' && hasData(s)) ? 'info' : 'avatar')

    // 연속 동일 타입을 세그먼트로 묶는다(순서 유지).
    const segments = []
    for (const scene of scenes) {
      const t = typeOf(scene)
      const last = segments[segments.length - 1]
      if (last && last.type === t) last.scenes.push(scene)
      else segments.push({ type: t, scenes: [scene] })
    }

    const pollVideoUrl = async (videoId) => {
      for (let i = 0; i < 240; i++) {
        await delay(5000)
        const r = await apiFetch(`/api/heygen/video/status/${videoId}`)
        const d = await readApiResponse(r)
        if (!r.ok) continue
        const st = d.data?.status
        if (st === 'completed') {
          const u = resolveMediaUrl(d.data?.video_url)
          if (!u) throw new Error('HeyGen 영상 URL이 비어 있습니다.')
          return u
        }
        if (st === 'failed') throw new Error('HeyGen 렌더 실패')
      }
      throw new Error('HeyGen 렌더 타임아웃')
    }

    const segmentUrls = []
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]
      setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': `세그먼트 ${si + 1}/${segments.length} 생성 중 (${seg.type === 'info' ? '인포그래픽' : '아바타'})...` }))
      if (seg.type === 'avatar') {
        const video_inputs = seg.scenes
          .map((scene) => ({
            character: { type: 'talking_photo', talking_photo_id: avatarId },
            voice: { type: 'text', input_text: toSpokenText(sceneText(scene).trim()), voice_id: voiceId },
          }))
          .filter((v) => v.voice.input_text && v.voice.voice_id)
        if (video_inputs.length === 0) continue
        const r = await apiFetch('/api/heygen/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_inputs, dimension: { width: 720, height: 1280 } }),
        })
        const d = await readApiResponse(r)
        if (!r.ok) throw new Error(getApiErrorMessage(d, `아바타 세그먼트 생성 실패 (${r.status})`))
        const vid = d.data?.video_id || d.data?.id || d.video_id || d.id
        if (!vid) throw new Error('아바타 세그먼트 video_id 를 받지 못했습니다.')
        segmentUrls.push(await pollVideoUrl(vid))
      } else {
        const prompt = buildShortsVideoAgentPrompt({
          script: { ...targetScript, scenes: seg.scenes },
          avatar: { id: avatarId, kind: 'talking_photo', name: '', subjectPrompt: '' },
          subtitleStyle,
          subtitleFont,
          extraPrompt: '이 클립은 인포그래픽(차트) 씬만 포함합니다. 인트로/아웃트로 아바타 화면을 추가하지 말고, 각 씬은 아바타 없이 풀화면 인포그래픽으로만 구성하세요.',
          videoStyle: promptSettings.shorts.videoStyle,
          narrationTone: promptSettings.shorts.narrationTone,
        })
        const r = await apiFetch('/api/heygen/video-agent/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, config: { avatar_id: avatarId, voice_id: voiceId } }),
        })
        const d = await readApiResponse(r)
        if (!r.ok) throw new Error(getApiErrorMessage(d, `인포그래픽 세그먼트 생성 실패 (${r.status})`))
        const vid = d.data?.video_id || d.data?.id || d.video_id || d.id
        if (!vid) throw new Error('인포그래픽 세그먼트 video_id 를 받지 못했습니다.')
        segmentUrls.push(await pollVideoUrl(vid))
      }
    }
    if (segmentUrls.length === 0) throw new Error('생성된 세그먼트가 없습니다.')

    let rawUrl
    if (segmentUrls.length === 1) {
      rawUrl = segmentUrls[0]
    } else {
      setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '세그먼트 합치는 중...' }))
      const cr = await apiFetch('/api/video/concat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrls: segmentUrls }),
      })
      const cd = await readApiResponse(cr)
      if (!cr.ok || !cd?.jobId) throw new Error(cd?.error || `합치기 요청 실패 (${cr.status})`)
      let done = null
      for (let i = 0; i < 120; i++) {
        await delay(5000)
        const sr = await apiFetch(`/api/video/concat/status/${cd.jobId}`)
        const sd = await readApiResponse(sr)
        if (!sr.ok) continue
        if (sd?.status === 'done') { done = sd; break }
        if (sd?.status === 'failed') throw new Error(sd?.error || '합치기 실패')
      }
      if (!done?.url) throw new Error('합치기 시간 초과 또는 결과 URL 없음')
      rawUrl = resolveMediaUrl(done.url)
    }

    // 자막 번인 — 아바타 씬에만(server 가 infographic-full 씬은 skip).
    setShortsVideo({ url: rawUrl, rawUrl, srtUrl: null, duration: targetScript.duration, mode: 'hybrid', subtitleStatus: 'processing' })
    setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '자막 합성 중...' }))
    let finalUrl = rawUrl
    let srtUrl = null
    let subtitleStatus = 'processing'
    try {
      const burnStartRes = await apiFetch('/api/subtitle/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: rawUrl,
          scenes: targetScript.scenes,
          subtitleStyle: mapShortsSubtitleStyleToBurnStyle(subtitleStyle),
          subtitleFont,
        }),
      })
      const burnStartData = await readApiResponse(burnStartRes)
      if (!burnStartRes.ok || !burnStartData?.jobId) {
        throw new Error(burnStartData?.error?.message || burnStartData?.error || `자막 번인 요청 실패 (${burnStartRes.status})`)
      }
      let burnData = null
      for (let bi = 0; bi < 120; bi++) {
        await delay(5000)
        const stRes = await apiFetch(`/api/subtitle/burn/status/${burnStartData.jobId}`)
        const stData = await readApiResponse(stRes)
        if (!stRes.ok) continue
        if (stData?.status === 'done') { burnData = stData; break }
        if (stData?.status === 'failed') throw new Error(stData?.error || '자막 번인 실패')
      }
      if (!burnData?.url) throw new Error('자막 번인 시간 초과 또는 결과 URL 없음')
      finalUrl = resolveMediaUrl(burnData.url)
      srtUrl = resolveMediaUrl(burnData.srtUrl || null)
      subtitleStatus = 'done'
    } catch (burnErr) {
      console.warn('[하이브리드 자막 합성] 실패:', burnErr.message)
      subtitleStatus = 'failed'
    }
    return { url: finalUrl, rawUrl, srtUrl, duration: targetScript.duration, mode: 'hybrid', subtitleStatus }
  }

  const runShortsGeneration = async (options = {}) => {
    // 오프닝 훅을 첫 씬에 미리 흡수시켜, HeyGen 음성·자막 모두 동일한 흐름으로 진행되게 한다.
    // 원본 shortsScript(편집/저장 데이터) 는 그대로 두고 영상 생성용 사본에서만 합친다.
    const targetScript = absorbHookIntoFirstScene(options.scriptOverride || shortsScript)
    if (!targetScript) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: '쇼츠 대본이 없습니다.' }])
      return
    }

    const conceptForRun = findShortsVideoConcept(promptSettings.shorts.videoConcept)
    const slotConcept = Array.isArray(conceptForRun?.avatarSlots) && conceptForRun.avatarSlots.length > 0 ? conceptForRun : null

    if (slotConcept) {
      // 2인 슬롯 컨셉: 역할별 아바타+목소리 규칙 위반 시 경고 팝업 후 중단.
      const violation = validateSlotConcept(slotConcept, conceptAvatarSlots)
      if (violation) {
        setErrorAlert(violation)
        addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: violation }])
        return
      }
    } else {
      if (!avatarImage) {
        addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: '아바타를 먼저 생성해주세요.' }])
        return
      }

      if (!selectedVoiceId) {
        addStepErrors('shorts', [{ service: 'heygen', channel: '쇼츠', message: '목소리를 먼저 선택해주세요.' }])
        return
      }
    }

    setStepLoading('shorts', true)
    clearStepErrors('shorts')
    setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': true }))

    try {
      const talkingPhotoId = slotConcept
        ? (findPresetById(conceptAvatarSlots[0]?.presetId)?.avatarId || null)
        : (heygenAvatarId || await uploadAvatarToHeyGen())
      const avatarReady = slotConcept ? true : (heygenReady || await waitForHeygenAvatarReady(talkingPhotoId, {
        attempts: 24,
        intervalMs: 5000,
        progressLabel: '아바타 준비 확인 중...',
      }))

      if (!avatarReady) {
        throw new Error('HeyGen 아바타가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')
      }

      // 등록 아바타에 avatar group 이 있으면 그룹 안 9:16 룩 중 하나를 랜덤 선택해 쓴다.
      // 그룹이 없는 아바타(스톡·사용자 업로드)는 talkingPhotoId 가 그대로 반환된다.
      const resolvedAvatarId = await resolveAvatarGroupLook(talkingPhotoId)
      if (resolvedAvatarId !== talkingPhotoId) {
        console.log(`[shorts] avatar group 랜덤 룩 선택: ${talkingPhotoId} → ${resolvedAvatarId}`)
      }

      // 하이브리드 컨셉(인포그래픽+verbatim): 세그먼트 렌더+합치기 경로로 처리하고 종료.
      if (conceptForRun?.hybridSegments) {
        const fbPreset = findPresetShortsAvatar(conceptForRun.preferredAvatarIds?.[0])
        const finalVideo = await runHybridSegmentedShorts({
          targetScript,
          avatarId: resolvedAvatarId,
          voiceId: selectedVoiceId || fbPreset?.defaultVoiceId,
        })
        if (!finalVideo) throw new Error('하이브리드 영상 생성 실패')
        setShortsVideo(finalVideo)
        setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': false }))
        setStepLoading('shorts', false)
        return
      }

      // 항상 /v2/video/generate(표준) 로 만든다 — HeyGen 이 우리 대본(caption)을 그대로 읽어야
      // 나레이션과 자막 문구가 일치하기 때문. (Video Agent 는 대본을 새로 써서 어긋남)
      //   1) 멀티 아바타 컨셉 (preferredAvatarIds.length > 1)
      //   2) 솔로 컨셉(useStandardEndpoint) 또는 컨셉 미선택(무컨셉) — 모두 표준으로.
      const selectedConcept = findShortsVideoConcept(promptSettings.shorts.videoConcept)
      const useMultiAvatar = !!selectedConcept && Array.isArray(selectedConcept.preferredAvatarIds) && selectedConcept.preferredAvatarIds.length > 1
      const useSoloStandard = !useMultiAvatar && (!selectedConcept || selectedConcept.useStandardEndpoint === true)
      const useStandardEndpoint = useMultiAvatar || useSoloStandard

      // 2인 슬롯 컨셉: 사용자가 슬롯별로 고른 아바타+목소리를 실제 영상에 반영한다.
      // slotRoleRemap: 컨셉 기본 역할 아바타 ID → 사용자가 고른 아바타 ID (씬에 역할 avatarId 가 박힌 mock_interview 용).
      // slotVoiceByAvatarId: 사용자가 고른 아바타 ID → 그 인물에 고른 목소리 ID.
      const isSlotConcept = Array.isArray(selectedConcept?.avatarSlots) && selectedConcept.avatarSlots.length > 0
      let slotAvatarIds = null
      let slotRoleRemap = null
      let slotVoiceByAvatarId = null
      if (isSlotConcept) {
        const resolvedSlots = await Promise.all(
          selectedConcept.avatarSlots.map(async (slotDef, i) => {
            const sel = conceptAvatarSlots[i] || {}
            const preset = findPresetById(sel.presetId)
            const avatarId = await resolveAvatarGroupLook(preset?.avatarId)
            return { defaultId: selectedConcept.preferredAvatarIds?.[i], avatarId, voiceId: sel.voiceId || preset?.defaultVoiceId }
          })
        )
        slotAvatarIds = resolvedSlots.map((r) => r.avatarId)
        slotRoleRemap = {}
        slotVoiceByAvatarId = {}
        resolvedSlots.forEach((r) => {
          if (r.defaultId) slotRoleRemap[r.defaultId] = r.avatarId
          if (r.avatarId) slotVoiceByAvatarId[r.avatarId] = r.voiceId
        })
        console.log(`[shorts] ${selectedConcept.id}: 슬롯 선택 → ${slotAvatarIds.join(', ')}`)
      }

      let generateRes
      let generatedVideoPrompt = null
      if (useStandardEndpoint) {
        const scenesForStandard = Array.isArray(targetScript?.scenes) ? targetScript.scenes : []
        if (scenesForStandard.length === 0) {
          throw new Error('쇼츠 대본에 씬이 없어 영상을 만들 수 없습니다.')
        }
        // 솔로 standard 면 talkingPhotoId 한 명, 멀티면 round-robin.
        // sceneAvatarIds 가 정의된 솔로 컨셉은 같은 인물의 variant 들을 씬마다 순환.
        // randomVariantPerVideo: true → 영상 1개당 1개를 랜덤 픽해 모든 씬에 동일 적용
        //   (한 영상 안에서는 같은 배경, 영상마다 배경이 달라짐 — dongwan_secret).
        // shuffleSceneVariants: true → 영상 생성 시마다 풀을 셔플해 씬마다 다른 variant
        //   (한 영상 안에서 룩 다양, 영상마다 4가지 룩 조합도 달라짐 — godsaeng_routine).
        const hasSceneAvatars = !useMultiAvatar
          && Array.isArray(selectedConcept?.sceneAvatarIds)
          && selectedConcept.sceneAvatarIds.length > 0
        const randomVariantPerVideo = hasSceneAvatars
          && selectedConcept.randomVariantPerVideo === true
        const shuffleSceneVariants = hasSceneAvatars
          && !randomVariantPerVideo
          && selectedConcept.shuffleSceneVariants === true
        const pickedVariantId = randomVariantPerVideo
          ? selectedConcept.sceneAvatarIds[
              Math.floor(Math.random() * selectedConcept.sceneAvatarIds.length)
            ]
          : null
        const shuffledSceneAvatarIds = shuffleSceneVariants
          ? [...selectedConcept.sceneAvatarIds].sort(() => Math.random() - 0.5)
          : null
        if (pickedVariantId) {
          console.log(`[shorts] ${selectedConcept.id}: variant ${pickedVariantId} 랜덤 픽 (영상 전 씬 동일 적용)`)
        }
        if (shuffledSceneAvatarIds) {
          console.log(`[shorts] ${selectedConcept.id}: variant 셔플 — 앞 ${Math.min(scenesForStandard.length, shuffledSceneAvatarIds.length)}개: ${shuffledSceneAvatarIds.slice(0, scenesForStandard.length).join(', ')}`)
        }
        const conceptAvatarIds = isSlotConcept
          ? slotAvatarIds
          : (useMultiAvatar
            ? await Promise.all(selectedConcept.preferredAvatarIds.map(resolveAvatarGroupLook))
            : (pickedVariantId
                ? [pickedVariantId]
                : (shuffledSceneAvatarIds
                    ? shuffledSceneAvatarIds
                    : (hasSceneAvatars ? selectedConcept.sceneAvatarIds : [resolvedAvatarId]))))

        // quiz-countdown: 3→2→1 카운트다운 배경 영상. 영상당 1회만 fetch (서버에서 생성·캐시).
        let quizCountdownAssetId = null
        const hasCountdownScene = scenesForStandard.some((s) => s?.layout === 'quiz-countdown')
        if (hasCountdownScene) {
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '카운트다운 영상 준비 중...' }))
          try {
            const cdRes = await apiFetch('/api/heygen/quiz-countdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
            const cdData = await readApiResponse(cdRes)
            if (cdRes.ok && cdData?.video_asset_id) {
              quizCountdownAssetId = cdData.video_asset_id
            }
          } catch (err) {
            console.warn('[quiz countdown] 실패:', err.message)
          }
        }

        // sceneAvatarIds variant 는 PRESET_SHORTS_AVATARS 에 등록되어 있지 않을 수 있어
        // 컨셉의 기본 아바타(preferredAvatarIds[0]) preset 으로 fallback 해서 voice 를 가져온다.
        const fallbackPreset = findPresetShortsAvatar(selectedConcept?.preferredAvatarIds?.[0])

        // 솔로 컨셉(한 아바타가 전 씬 동일)은 씬을 나누지 않고 나레이션을 모두 이어붙여
        // video_input 1개로 만든다 → HeyGen 이 끊김 없는 연속 테이크로 렌더(씬 전환 컷 제거).
        // 자막은 이후 자막 번인 단계에서 그대로 씬별로 입혀진다(타이밍은 비율 계산이라 영향 없음).
        const canMergeSoloTake = !useMultiAvatar
          && conceptAvatarIds.length === 1
          && scenesForStandard.every((s) => !s?.avatarId
            && s?.layout !== 'quiz-countdown'
            && s?.layout !== 'infographic-full')

        // voice override: 사용자가 voice 그리드에서 voice 를 골랐고 컨셉이 솔로면 그 voice 로 통일.
        // 멀티 컨셉은 인물별 voice 가 따로 필요하므로 override 하지 않는다.
        const overrideVoiceId = !useMultiAvatar ? selectedVoiceId : null

        let video_inputs
        if (canMergeSoloTake) {
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '연속 테이크 영상 준비 중...' }))
          const soloAvatarId = conceptAvatarIds[0]
          const soloPreset = findPresetShortsAvatar(soloAvatarId) || fallbackPreset
          // caption 이 자막+TTS 공용 텍스트. 옛 스크립트(narration 만 있음)도 함께 지원.
          // toSpokenText 는 분수·영문 약어처럼 HeyGen 이 잘못 읽는 표기만 한글로 변환한다.
          const mergedText = scenesForStandard
            .map((s) => toSpokenText(String(s?.caption || s?.narration || '').trim()))
            .filter(Boolean)
            .join(' ')
          const mergedInput = {
            character: { type: 'talking_photo', talking_photo_id: soloAvatarId },
            voice: { type: 'text', input_text: mergedText, voice_id: overrideVoiceId || soloPreset?.defaultVoiceId },
          }
          if (selectedConcept?.backgroundColor) {
            mergedInput.background = { type: 'color', value: selectedConcept.backgroundColor }
          }
          video_inputs = [mergedInput]
          console.log(`[shorts] ${selectedConcept?.id || 'no-concept'}: 솔로 연속 테이크 — 씬 ${scenesForStandard.length}개를 video_input 1개로 병합`)
        } else {
          // 씬별 layout 분기.
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '씬별 배경 준비 중...' }))
          video_inputs = await Promise.all(scenesForStandard.map(async (scene, idx) => {
            // 씬이 avatarId 를 직접 지정하면 우선 사용 (ox_quiz 처럼 한 문제의 질문/대기/정답
            // 씬을 같은 인물로 고정할 때). 없으면 conceptAvatarIds 순환.
            let avatarId = scene?.avatarId || conceptAvatarIds[idx % conceptAvatarIds.length]
            // 슬롯 컨셉: 씬에 박힌 기본 역할 아바타 ID 를 사용자가 고른 아바타로 치환 (mock_interview 역할 매핑).
            if (slotRoleRemap && slotRoleRemap[avatarId]) avatarId = slotRoleRemap[avatarId]
            const preset = findPresetShortsAvatar(avatarId) || fallbackPreset
            // quiz-countdown: 아바타가 3초간 말 없이 대기하는 씬 → voice 를 silence 로.
            const isCountdownScene = scene?.layout === 'quiz-countdown'
            const baseInput = {
              character: {
                type: 'talking_photo',
                talking_photo_id: avatarId,
              },
              voice: isCountdownScene
                ? { type: 'silence', duration: Number(scene?.duration) || 3 }
                : {
                    type: 'text',
                    // caption 이 자막+TTS 공용 텍스트. 옛 스크립트(narration) 도 함께 지원.
                    // toSpokenText 가 분수·영문 약어만 한글로 변환해 HeyGen TTS 가 자연스럽게 읽도록 한다.
                    input_text: toSpokenText(String(scene?.caption || scene?.narration || '').trim()),
                    voice_id: (slotVoiceByAvatarId && slotVoiceByAvatarId[avatarId]) || overrideVoiceId || preset?.defaultVoiceId,
                  },
            }
            if (scene?.layout === 'quiz-countdown' && quizCountdownAssetId) {
              // 3초 대기 씬 — 카운트다운 영상을 배경으로 깖. 아바타는 중앙 풀샷 idle.
              baseInput.background = {
                type: 'video',
                video_asset_id: quizCountdownAssetId,
              }
            }
            // 컨셉이 backgroundColor 를 지정했고 위 layout 분기에서 배경이 안 깔렸으면 단색 배경 적용
            // (아바타가 9:16 을 못 채울 때 여백을 일관된 색으로 — study_dialogue 영상 통화 프레이밍 통일).
            if (!baseInput.background && selectedConcept?.backgroundColor) {
              baseInput.background = { type: 'color', value: selectedConcept.backgroundColor }
            }
            return baseInput
          }))
        }
        const filteredInputs = video_inputs.filter((input) =>
          input.voice?.type === 'silence'
            ? Number(input.voice.duration) > 0
            : (input.voice?.input_text && input.voice?.voice_id)
        )

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
            id: resolvedAvatarId,
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
              avatar_id: resolvedAvatarId,
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
          let subtitleStatus = 'processing'

          // 렌더 완료 즉시 — 자막 없는 원본을 미리보기에 먼저 띄운다 (자막 합성은 이어서 진행).
          const baseVideo = {
            url: rawUrl,
            rawUrl,
            srtUrl: null,
            duration: targetScript.duration,
            videoId,
            prompt: generatedVideoPrompt,
            mode: 'recommended',
          }
          setShortsVideo({ ...baseVideo, subtitleStatus: 'processing' })
          setMediaItemLoading((prev) => ({ ...prev, '쇼츠 영상': '자막 합성 중...' }))

          try {
            // 자막 번인은 비동기 잡 — POST 는 jobId 만 즉시 반환, 무거운 FFmpeg 는 백그라운드.
            // (동기 요청이 약한 Render 인스턴스를 타임아웃시켜 502 가 나던 문제 해결.)
            const burnStartRes = await apiFetch('/api/subtitle/burn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoUrl: rawUrl,
                scenes: targetScript.scenes,
                subtitleStyle: mapShortsSubtitleStyleToBurnStyle(subtitleStyle),
                subtitleFont,
              }),
            })
            const burnStartData = await readApiResponse(burnStartRes)
            if (!burnStartRes.ok || !burnStartData?.jobId) {
              throw new Error(
                burnStartData?.error?.message ||
                burnStartData?.error ||
                `자막 번인 요청 실패 (${burnStartRes.status})`
              )
            }
            // jobId 폴링 — 5초 간격, 최대 ~10분.
            let burnData = null
            for (let bi = 0; bi < 120; bi++) {
              await delay(5000)
              const stRes = await apiFetch(`/api/subtitle/burn/status/${burnStartData.jobId}`)
              const stData = await readApiResponse(stRes)
              if (!stRes.ok) continue
              if (stData?.status === 'done') { burnData = stData; break }
              if (stData?.status === 'failed') {
                throw new Error(stData?.error || '자막 번인 실패')
              }
            }
            if (!burnData?.url) {
              throw new Error('자막 번인 시간 초과 또는 결과 영상 URL이 없습니다.')
            }
            finalUrl = resolveMediaUrl(burnData.url)
            srtUrl = resolveMediaUrl(burnData.srtUrl || null)
            subtitleStatus = 'done'
          } catch (burnErr) {
            // 자막 합성이 실패해도 원본 영상은 유지한다 — 미리보기엔 자막 없는 영상이 남는다.
            console.warn('[자막 합성] 실패:', burnErr.message)
            subtitleStatus = 'failed'
          }

          finalVideo = {
            ...baseVideo,
            url: finalUrl,
            srtUrl,
            subtitleStatus,
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
    // 숏폼 아바타·목소리 — 영상이 이미 생성됐으면(shortsVideo) 선택이 끝난 것이므로 미완료로 보지 않는다.
    // 영상이 아직 없을 때만, 아바타+목소리(2인 슬롯은 슬롯 검증)가 안 됐으면 미완료로 안내한다.
    if (selectedChannels.shorts && !shortsVideo && !isShortsAvatarVoiceReady) incomplete.push('숏폼 아바타·목소리')
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
      fileName: file?.name,
      fileBase64,
      savedFromExtraction: true,
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

  const ScaledKnowledgeCard = ({ headline, bullets, imageUrl, index = 0 }) => {
    const wrapperRef = useRef(null)
    const innerRef = useRef(null)

    useEffect(() => {
      const wrapper = wrapperRef.current
      const inner = innerRef.current
      if (!wrapper || !inner) return undefined
      const update = () => {
        const size = wrapper.clientWidth
        if (!size) return
        inner.style.transform = `scale(${size / 600})`
      }
      update()
      if (typeof ResizeObserver === 'undefined') return undefined
      const ro = new ResizeObserver(update)
      ro.observe(wrapper)
      return () => ro.disconnect()
    }, [])

    return (
      <div ref={wrapperRef} className="relative aspect-square w-full overflow-hidden bg-white">
        <div
          ref={innerRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: 600, height: 600 }}
        >
          <KnowledgeInsightCard
            index={index}
            headline={headline}
            bullets={bullets}
            imageUrl={imageUrl}
          />
        </div>
      </div>
    )
  }

  const ContentImagePreviewStrip = ({ items, label }) => {
    if (!Array.isArray(items) || items.length === 0) return null
    return (
      <div className="rounded-lg border border-border bg-surface-light p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
          <ImageIcon size={12} />
          <span>{label} ({items.length}장)</span>
          <span className="text-[10px] opacity-70">— 클릭하면 확대됩니다</span>
        </div>
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item, idx) => {
            if (item.pending) {
              return (
                <div
                  key={`content-preview-${idx}-${item.alt || idx}`}
                  title={item.alt}
                  className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface flex items-center justify-center"
                >
                  <span className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Loader2 size={11} className="animate-spin" /> 준비 중
                  </span>
                </div>
              )
            }
            if (item.card) {
              const { headline, bullets, imageUrl, index } = item.card
              const clickable = headline || (bullets && bullets.length > 0)
              return (
                <button
                  key={`content-preview-${idx}-${item.alt || idx}`}
                  type="button"
                  onClick={() => clickable && setImageLightbox({
                    kind: 'knowledge',
                    headline,
                    bullets,
                    imageUrl,
                    index,
                  })}
                  disabled={!clickable}
                  title={item.alt}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border bg-white hover:border-primary/50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ScaledKnowledgeCard
                    headline={headline}
                    bullets={bullets}
                    imageUrl={imageUrl}
                    index={index}
                  />
                </button>
              )
            }
            return (
              <button
                key={`content-preview-${idx}-${item.alt || idx}`}
                type="button"
                onClick={() => item.url && setImageLightbox({ kind: 'image', src: item.url })}
                disabled={!item.url}
                title={item.alt}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-white hover:border-primary/50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {item.url ? (
                  <img src={item.url} alt={item.alt || ''} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface text-[10px] text-text-muted">
                    준비 중...
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const blogPreviewItems = (() => {
    const blogImageList = Array.isArray(blogImages) ? blogImages : []
    const sections = Array.isArray(blogContent?.sections) ? blogContent.sections : []
    const blogCategoryId = blogContent?.categoryInfo?.finalCategoryId || ''
    // 카드뉴스 카테고리는 카테고리만으로 판정한다(이미지 태깅 타이밍에 의존하지 않음).
    const isCardNewsCategory = blogCategoryId === 'knowledge_insight' || blogCategoryId === 'interview_prep'

    if (isCardNewsCategory) {
      if (!sections.length) return []
      const sectionImageList = blogImageList.filter((img) => !img?.isThumbnail)
      // 카드뉴스는 "글자 + 우하단 그림"이 모두 준비됐을 때만 최종 카드를 노출한다.
      return sections.map((section, index) => {
        const match = sectionImageList.find((img) =>
          img?.heading && section?.heading && img.heading === section.heading
        ) || sectionImageList[index]
        // renderedImageUrl / pngUrl 은 합성된 완성 카드. imageUrl 은 우하단 코너 원본.
        const composedUrl = match?.renderedImageUrl || match?.pngUrl || null
        const cornerImageUrl = match?.imageUrl || null
        const alt = section?.heading || `블로그 카드 ${index + 1}`
        // 합성본이 이미 있으면 그 이미지를 그대로 노출한다.
        if (composedUrl) {
          return { alt, url: composedUrl }
        }
        const cardSummary = section?.cardSummary || {}
        const headline = String(cardSummary.headline || section?.heading || '').trim()
        const bullets = Array.isArray(cardSummary.bullets)
          ? cardSummary.bullets.map((line) => String(line || '').trim()).filter(Boolean)
          : []
        const hasText = Boolean(headline) || bullets.length > 0
        const ready = hasText && Boolean(cornerImageUrl)
        return {
          alt,
          pending: !ready,
          card: ready ? { headline, bullets, imageUrl: cornerImageUrl, index } : null,
        }
      })
    }

    if (!blogImageList.length) return []
    const list = []
    const seen = new Set()
    const push = (url, alt) => {
      if (!url || seen.has(url)) return
      seen.add(url)
      list.push({ url, alt })
    }
    const thumb = blogImageList.find((img) => img?.isThumbnail && (img?.imageUrl || img?.renderedImageUrl || img?.pngUrl))
    if (thumb) {
      push(thumb.renderedImageUrl || thumb.pngUrl || thumb.imageUrl, '블로그 썸네일')
    }
    const sectionImageList = blogImageList.filter((img) => !img?.isThumbnail)
    sections.forEach((section, index) => {
      const match = sectionImageList.find((img) =>
        img?.heading && section?.heading && img.heading === section.heading
      ) || sectionImageList[index]
      const url = match?.renderedImageUrl || match?.pngUrl || match?.imageUrl
      if (url) push(url, section?.heading || `블로그 이미지 ${index + 1}`)
    })
    return list
  })()

  const instagramPreviewItems = (() => {
    if (!instagramContent) return []
    const displayCards = buildInstagramDisplayCards(instagramContent)
    const images = Array.isArray(instagramImages) ? instagramImages : []
    if (!displayCards.length) return []
    return displayCards.map((card, idx) => {
      const cardNumber = getInstagramCardNumber(card, idx)
      const match = card?.isCaptionCta
        ? (images[images.length - 1] || images[0])
        : (images.find((img, i) => {
          const imageCardNumber = img?.cardNumber || img?.card_number || i + 1
          return imageCardNumber === cardNumber
        }) || images[idx])
      // renderedImageUrl / pngUrl 은 합성된 완성 카드. imageUrl 은 우하단 코너 원본.
      const composedUrl = match?.renderedImageUrl || match?.pngUrl || null
      const cornerImageUrl = match?.imageUrl || null
      const alt = card?.title || card?.heading || `인스타 카드 ${cardNumber}`
      // 합성본이 이미 있으면 그 이미지를 그대로 노출한다.
      if (composedUrl) {
        return { alt, url: composedUrl }
      }
      const headline = getInstagramOverlayTitle(card, idx)
      const bullets = buildInstagramKnowledgeBullets(card)
      const hasText = Boolean(headline) || bullets.length > 0
      // CTA 카드는 우하단 그림이 없는 게 정상 → 글자만 있으면 완성.
      // 일반 카드는 글자 + 우하단 그림이 모두 준비됐을 때만 최종 카드를 노출.
      const ready = hasText && (Boolean(card?.isCaptionCta) || Boolean(cornerImageUrl))
      return {
        alt,
        pending: !ready,
        card: ready ? { headline, bullets, imageUrl: cornerImageUrl, index: idx } : null,
      }
    })
  })()

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
      {currentStep >= 3 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface rounded-xl border border-border p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">콘텐츠 일괄 생성</p>
            <p className="text-xs text-text-muted mt-0.5">
              선택한 {selectedContentChannels().length}개 채널을 한 번에 병렬로 생성합니다. (쇼츠는 대본까지)
            </p>
          </div>
          <button
            onClick={runContentGeneration}
            disabled={loading.content || loading.analysis || loading.summary || selectedContentChannels().length === 0}
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shrink-0 bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading.content
              ? <><Loader2 size={14} className="animate-spin" /> 생성 중...</>
              : <><Sparkles size={14} /> 선택 채널 전체 생성</>}
          </button>
        </div>
      )}
      {contentStepRows.map((row) => {
        const Icon = row.icon
        const errObj = stepErrors.content?.find(e => e.channel === (row.errorLabel || row.label))
        const failed = !row.data && !!errObj
        const generating = retrying === `content-${row.key}` || retrying === `regen-${row.key}` || retrying === `${errObj?.service}-${errObj?.channel}`
          || (retrying === 'content-all' && !!selectedChannels[row.key])
        const generatingLabel = getChannelGenerationLabel(row.key)
        const isAvailable = currentStep >= row.stepId || !!row.data
        // 일괄 생성 흐름에서 채널별 프롬프트를 미리 편집할 수 있도록, 콘텐츠 단계에 진입했거나 이미 결과가 있으면 항상 편집 가능.
        const promptEditable = currentStep >= 3 || !!row.data
        return (
          <div key={row.key} id={`step-${row.stepId}`} className="flex gap-4 items-stretch">
            <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${!promptEditable ? 'opacity-50 pointer-events-none' : ''}`}>
              <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> {row.label} 설정</p>
              {PF('글의 어조', { type: 'select', value: promptSettings.content[`${row.key}Tone`], onChange: v => updatePrompt('content', `${row.key}Tone`, v), options: [{ value: 'auto', label: '자동' }, { value: 'friendly', label: '친근한' }, { value: 'professional', label: '전문적인' }, { value: 'humorous', label: '유머러스' }, { value: 'formal', label: '진지한' }] })}
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
                      setConceptResetNotice(false)
                      const concept = findShortsVideoConcept(v)
                      if (concept) {
                        updatePrompt('shorts', 'extra', buildShortsConceptExtra(v))
                        if (Array.isArray(concept.avatarSlots) && concept.avatarSlots.length > 0) {
                          // 2인 슬롯 컨셉: 역할별 기본 아바타를 미리 채우고, 목소리는 직접 선택하도록 비워둔다.
                          setConceptAvatarSlots(concept.avatarSlots.map((slot) => ({ presetId: slot.defaultPresetId, voiceId: null })))
                          // 단일 아바타 선택 상태는 쓰지 않으므로 초기화. preset 아바타라 별도 준비 대기 불필요.
                          setAvatarPrompt('')
                          setAvatarImage(null)
                          setHeygenAvatarId(null)
                          setAvatarConfirmed(false)
                          setSelectedVoiceId(null)
                          setHeygenReady(true)
                          setHeygenUploading(false)
                        } else {
                          // 단일 아바타 컨셉: 기존대로 첫 추천 아바타 자동 선택.
                          setConceptAvatarSlots([])
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
                        }
                      } else {
                        updatePrompt('shorts', 'extra', '')
                        setConceptAvatarSlots([])
                      }
                    },
                    options: SHORTS_VIDEO_CONCEPT_OPTIONS,
                    hint: '선택 시 영상 추가 지시 + 컨셉에 등장하는 아바타가 자동 선택됩니다. 2인 컨셉은 역할별로 아바타·목소리를 직접 골라야 합니다. 선택하지 않으면 HeyGen 의 자동 연출(Video Agent)에 맡깁니다.',
                  })}
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
                  {row.key === 'blog' && blogContent && (() => {
                    // 결과·수정 화면과 동일한 본문을 보여주도록 같은 가공 함수를 거친다.
                    const blogCategoryId = blogContent?.categoryInfo?.finalCategoryId || ''
                    const isProseBlog = isAutomaticBlogQuoteCategory(blogCategoryId)
                    const showIntro = (isProseBlog || blogCategoryId === 'lecture_event')
                      && typeof blogContent.introduction === 'string'
                      && blogContent.introduction.trim()
                    const introText = showIntro
                      ? composeBlogSectionBody(blogContent.introduction, { prose: isProseBlog })
                      : ''
                    return (
                    <div className="space-y-4">
                      <ContentImagePreviewStrip items={blogPreviewItems} label="블로그 이미지 미리보기" />
                      <div>
                        <h4 className="text-base font-bold text-text">{blogContent.title}</h4>
                        {blogContent.metaDescription && <p className="text-xs text-text-muted mt-1">{blogContent.metaDescription}</p>}
                      </div>
                      {introText && (
                        <p className="text-sm text-text-muted whitespace-pre-wrap">{introText}</p>
                      )}
                      {blogContent.sections?.map((sec, i) => (
                        <div key={i} className="border-l-2 border-primary/30 pl-3">
                          <h5 className="font-semibold text-sm text-text">{sec.heading}</h5>
                          <p className="text-sm text-text-muted mt-1.5 whitespace-pre-wrap">{composeBlogSectionBody(sec.content, { prose: isProseBlog })}</p>
                        </div>
                      ))}
                    </div>
                    )
                  })()}
                  {row.key === 'newsletter' && newsletterContent && (
                    <div className="space-y-3">
                      <h4 className="text-base font-bold text-text">{stripMarkdownEmphasis(newsletterContent.subject || '')}</h4>
                      {newsletterContent.preheader && <p className="text-xs text-text-muted">{stripMarkdownEmphasis(newsletterContent.preheader)}</p>}
                      {Array.isArray(newsletterContent.keyPoints) && newsletterContent.keyPoints.length > 0 && (
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <p className="text-[11px] font-bold text-primary-light mb-2 uppercase tracking-wide">KEY POINTS</p>
                          <ul className="space-y-1.5">
                            {newsletterContent.keyPoints.map((point, i) => (
                              <li key={i} className="text-sm text-text flex items-start gap-2">
                                <CheckCircle size={14} className="text-primary shrink-0 mt-0.5" />
                                <span>{stripMarkdownEmphasis(point)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {newsletterContent.body && <p className="text-sm text-text-muted whitespace-pre-wrap leading-6">{stripMarkdownEmphasis(newsletterContent.body)}</p>}
                    </div>
                  )}
                  {row.key === 'instagram' && instagramContent && (
                    <div className="space-y-3">
                      <ContentImagePreviewStrip items={instagramPreviewItems} label="인스타 카드 미리보기" />
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
                              <p className="text-sm text-text">{scene.caption || scene.narration}</p>
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
                            {(activeSlotConcept ? isShortsAvatarVoiceReady : heygenAvatarId) && <CheckCircle size={14} className="text-success" />}
                          </div>
                          {activeSlotConcept ? (
                          <div className="space-y-4">
                            <p className="text-xs text-text-muted">
                              이 컨셉은 {activeSlotConcept.avatarSlots.length}명이 등장합니다. 역할별로 아바타와 목소리를 각각 선택해야 영상이 생성됩니다.
                            </p>
                            {activeSlotConcept.avatarSlots.map((slotDef, slotIndex) => {
                              const sel = conceptAvatarSlots[slotIndex] || {}
                              const slotPresets = getPresetsByCategory(slotDef.category)
                              const catLabel = slotDef.category === 'teachers' ? '동완쌤·후라이쌤' : '제자 카테고리'
                              const selVoice = myVoices.find((mv) => mv.voice_id === sel.voiceId)
                              return (
                                <div key={slotDef.id} className="rounded-xl border border-border bg-surface-light/40 p-3 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">{slotDef.role}</span>
                                    <span className="text-[11px] text-text-muted">{catLabel}에서 선택</span>
                                    {sel.presetId && sel.voiceId && <CheckCircle size={13} className="text-success" />}
                                  </div>
                                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                                    {slotPresets.map((preset) => {
                                      const isSel = sel.presetId === preset.id
                                      const preview = presetAvatarPreviews[preset.avatarId]
                                        || (preset.avatarGroupId ? groupLooks[preset.avatarGroupId]?.[0]?.preview : null)
                                        || null
                                      return (
                                        <button
                                          type="button"
                                          key={preset.id}
                                          onClick={() => updateSlot(slotIndex, { presetId: preset.id })}
                                          className={`relative rounded-lg border overflow-hidden bg-surface text-left transition-all ${isSel ? 'border-primary/60 ring-2 ring-primary/30' : 'border-border hover:border-primary/30'}`}
                                          aria-label={`${slotDef.role} - ${preset.name} 선택`}
                                        >
                                          <div className="relative bg-surface" style={{ aspectRatio: '3/4' }}>
                                            {preview ? (
                                              <img src={preview} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="h-full w-full flex items-center justify-center text-[10px] text-text-muted">
                                                <Loader2 size={12} className="animate-spin" />
                                              </div>
                                            )}
                                          </div>
                                          <span className="block px-1.5 py-1 text-[11px] font-medium text-text truncate">{preset.name}</span>
                                          {isSel && (
                                            <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white">
                                              <CheckCircle size={10} />
                                            </span>
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={sel.voiceId || ''}
                                      onChange={(e) => updateSlot(slotIndex, { voiceId: e.target.value || null })}
                                      className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
                                    >
                                      <option value="">목소리 선택 (필수)</option>
                                      {myVoices.map((voice) => {
                                        const meta = [voice.gender, voice.language].filter(Boolean).join(' · ')
                                        return (
                                          <option key={voice.voice_id} value={voice.voice_id}>
                                            {voice.name || voice.voice_id}{meta ? ` · ${meta}` : ''}
                                          </option>
                                        )
                                      })}
                                    </select>
                                    {selVoice?.preview_audio && (
                                      <button
                                        type="button"
                                        onClick={() => toggleVoiceUrl(selVoice.voice_id, selVoice.preview_audio)}
                                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                                        aria-label={playingVoiceId === selVoice.voice_id ? '목소리 정지' : '목소리 미리듣기'}
                                      >
                                        {playingVoiceId === selVoice.voice_id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                            {myVoices.length === 0 && (
                              <p className="text-xs text-text-muted flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 목소리 목록 불러오는 중...</p>
                            )}
                          </div>
                          ) : (
                          <>
                          {conceptResetNotice && (
                            <div className="bg-warning/10 rounded-lg p-2.5 border border-warning/20 flex items-start gap-2">
                              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                              <p className="text-xs text-warning leading-5">
                                선택한 컨셉의 인물과 다른 아바타를 골라 <strong>컨셉이 해제</strong>됐습니다.
                                컨셉 없이 영상을 만들면 HeyGen 의 자동 연출(Video Agent)에 맡겨 알아서 만들어집니다.
                              </p>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {[
                              { id: 'dongwan_ssaem', label: '동완쌤' },
                              { id: 'fry_ssaem', label: '후라이쌤' },
                              { id: 'students', label: '제자' },
                            ].map((tab) => (
                              <button
                                type="button"
                                key={tab.id}
                                onClick={() => setSelectedAvatarCategory(tab.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                  selectedAvatarCategory === tab.id
                                    ? 'bg-primary text-white'
                                    : 'bg-surface-light text-text-muted hover:bg-surface'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-5">
                            {avatarCategories
                              .filter((category) => category.id === selectedAvatarCategory)
                              .map((category) => (
                              <div key={category.id} className="space-y-2">
                                {category.items.length === 0 ? (
                                  <p className="text-xs text-text-muted flex items-center gap-1">
                                    <Loader2 size={12} className="animate-spin" /> 불러오는 중...
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {category.items.map(({ key, preset, lookId, preview }) => {
                                      // 그룹 안 룩들도 1개만 선택 표시 — 컨셉 매칭은 원본 preset.avatarId(=group ID) 기준.
                                      const isSelected = heygenAvatarId === lookId
                                      return (
                                        <button
                                          type="button"
                                          key={key}
                                          onClick={() => {
                                            // 컨셉이 선택돼 있을 때, 같은 그룹 안 다른 룩을 골라도 같은 인물로 간주돼 컨셉이 유지된다.
                                            // 다른 인물(preset)을 고르면 컨셉 초기화 + 안내.
                                            const activeConcept = findShortsVideoConcept(promptSettings.shorts.videoConcept)
                                            if (activeConcept && !activeConcept.preferredAvatarIds?.includes(preset.avatarId)) {
                                              updatePrompt('shorts', 'videoConcept', '')
                                              updatePrompt('shorts', 'extra', '')
                                              setConceptResetNotice(true)
                                            } else {
                                              setConceptResetNotice(false)
                                            }
                                            setAvatarPrompt('')
                                            setAvatarImage(preview)
                                            setHeygenAvatarId(lookId)
                                            setAvatarConfirmed(true)
                                            setHeygenReady(true)
                                            setHeygenUploading(false)
                                          }}
                                          className={`relative rounded-xl border bg-surface-light overflow-hidden transition-all text-left ${
                                            isSelected ? 'border-primary/60 ring-2 ring-primary/30 shadow-md' : 'border-border hover:border-primary/30'
                                          }`}
                                          aria-label={`${preset.name} 아바타 선택`}
                                        >
                                          <div className="relative bg-surface" style={{ aspectRatio: '3/4' }}>
                                            {preview ? (
                                              <img src={preview} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="h-full w-full flex items-center justify-center text-xs text-text-muted">
                                                <Loader2 size={14} className="animate-spin mr-1" /> 미리보기
                                              </div>
                                            )}
                                            {/* 돋보기 — 좌상단 항상 노출. 클릭 시 이미지 확대 모달. */}
                                            {preview && (
                                              <div
                                                role="button"
                                                tabIndex={-1}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setLightboxImageUrl(preview)
                                                }}
                                                className="absolute top-1.5 left-1.5 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer shadow"
                                                aria-label={`${preset.name} 아바타 확대 보기`}
                                              >
                                                <ZoomIn size={14} />
                                              </div>
                                            )}
                                          </div>
                                          {isSelected && (
                                            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                                              <CheckCircle size={10} /> 선택됨
                                            </span>
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          </>
                          )}
                        </div>

                        {/* 아바타 확대 모달 — 카드 돋보기 클릭 시 표시. body 로 portal 해 그리드 스택 영향 없게. */}
                        {lightboxImageUrl && createPortal(
                          <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onClick={() => setLightboxImageUrl(null)}
                          >
                            <img
                              src={lightboxImageUrl}
                              alt=""
                              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              onClick={() => setLightboxImageUrl(null)}
                              className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/90 text-gray-900 hover:bg-white shadow-lg"
                              aria-label="확대 보기 닫기"
                            >
                              <X size={20} />
                            </button>
                          </div>,
                          document.body,
                        )}

                        {/* 목소리 선택 (필수, 슬롯 컨셉이 아닐 때만) — 슬롯 컨셉은 슬롯별 목소리를 사용한다. */}
                        {!activeSlotConcept && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-text">목소리 선택</p>
                            <span className="text-xs text-text-muted">(필수)</span>
                            {selectedVoiceId && <CheckCircle size={14} className="text-success" />}
                          </div>
                          {myVoices.length === 0 ? (
                            <p className="text-xs text-text-muted">목소리 목록 불러오는 중...</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {myVoices.map((voice) => {
                                const isSelected = selectedVoiceId === voice.voice_id
                                return (
                                  <button
                                    type="button"
                                    key={voice.voice_id}
                                    onClick={() => setSelectedVoiceId(voice.voice_id)}
                                    className={`relative rounded-lg border bg-surface-light p-2.5 text-left transition-all ${
                                      isSelected ? 'border-primary/60 ring-2 ring-primary/30' : 'border-border hover:border-primary/30'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-text'}`}>{voice.name || voice.voice_id}</p>
                                        <p className="text-[11px] text-text-muted truncate">{[voice.gender, voice.language].filter(Boolean).join(' · ')}</p>
                                      </div>
                                      {voice.preview_audio && (
                                        <div
                                          role="button"
                                          tabIndex={-1}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleVoiceUrl(voice.voice_id, voice.preview_audio)
                                          }}
                                          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                          aria-label={playingVoiceId === voice.voice_id ? '목소리 정지' : '목소리 미리듣기'}
                                        >
                                          {playingVoiceId === voice.voice_id ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                                        </div>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white">
                                        <CheckCircle size={8} /> 선택
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        )}

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
                              <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                                shortsVideo.subtitleStatus === 'processing'
                                  ? 'bg-primary/5 border-primary/20'
                                  : shortsVideo.subtitleStatus === 'failed'
                                  ? 'bg-warning/10 border-warning/20'
                                  : 'bg-success/5 border-success/20'
                              }`}>
                                {shortsVideo.subtitleStatus === 'processing' ? (
                                  <Loader2 size={16} className="text-primary animate-spin" />
                                ) : shortsVideo.subtitleStatus === 'failed' ? (
                                  <AlertTriangle size={16} className="text-warning" />
                                ) : (
                                  <CheckCircle size={16} className="text-success" />
                                )}
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-text">
                                    {shortsVideo.subtitleStatus === 'processing'
                                      ? '영상 생성 완료 · 자막 합성 중...'
                                      : shortsVideo.subtitleStatus === 'failed'
                                      ? '영상 생성 완료 · 자막 합성 실패'
                                      : '숏폼 영상 생성 완료'}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {shortsVideo.subtitleStatus === 'processing'
                                      ? '자막이 입혀지면 미리보기가 자동으로 갱신됩니다'
                                      : shortsVideo.subtitleStatus === 'failed'
                                      ? '자막 없는 원본 영상입니다 — 필요 시 재생성하세요'
                                      : `${shortsVideo.duration || shortsScript?.duration}초`}
                                  </p>
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
                                    <p className="text-xs font-medium text-text-muted">
                                      {shortsVideo.subtitleStatus === 'processing'
                                        ? '원본 (자막 합성 중)'
                                        : shortsVideo.subtitleStatus === 'failed'
                                        ? '원본 (자막 없음)'
                                        : '자막 포함 최종본'}
                                    </p>
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
                          {activeSlotConcept ? (
                            !shortsVideo && !loading.shorts && (
                              isShortsAvatarVoiceReady ? (
                                <div className="flex items-center gap-2 p-2.5 bg-success/5 rounded-lg border border-success/20">
                                  <CheckCircle size={14} className="text-success" />
                                  <p className="text-xs text-success">역할별 아바타·목소리 준비 완료! 영상을 생성할 수 있습니다.</p>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 p-2.5 bg-warning/10 rounded-lg border border-warning/20">
                                  <AlertTriangle size={14} className="text-warning" />
                                  <p className="text-xs text-warning">{validateSlotConcept(activeSlotConcept, conceptAvatarSlots) || '역할별 아바타와 목소리를 모두 선택해주세요.'}</p>
                                </div>
                              )
                            )
                          ) : (
                          <>
                          {!avatarImage && !shortsVideo && <p className="text-xs text-text-muted">아바타를 생성하고 확정해주세요</p>}
                          {avatarConfirmed && heygenUploading && !heygenReady && !shortsVideo && (
                            <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                              <Loader2 size={14} className="text-primary animate-spin" />
                              <p className="text-xs text-primary">아바타를 HeyGen에 등록 중입니다... 목소리를 선택해주세요.</p>
                            </div>
                          )}
                          {avatarConfirmed && heygenReady && !selectedVoiceId && !shortsVideo && !loading.shorts && (
                            <div className="flex items-center gap-2 p-2.5 bg-warning/10 rounded-lg border border-warning/20">
                              <AlertTriangle size={14} className="text-warning" />
                              <p className="text-xs text-warning">목소리를 선택해주세요. 아바타와 목소리를 모두 선택해야 영상을 생성할 수 있습니다.</p>
                            </div>
                          )}
                          {avatarConfirmed && heygenReady && selectedVoiceId && !shortsVideo && !loading.shorts && (
                            <div className="flex items-center gap-2 p-2.5 bg-success/5 rounded-lg border border-success/20">
                              <CheckCircle size={14} className="text-success" />
                              <p className="text-xs text-success">아바타·목소리 준비 완료! 영상을 생성할 수 있습니다.</p>
                            </div>
                          )}
                          </>
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
          <div className="relative max-h-[90vh] max-w-[90vw] flex items-center justify-center pointer-events-none">
            {imageLightbox.kind === 'knowledge' ? (
              <div className="w-[min(80vh,80vw,36rem)]">
                <KnowledgeInsightCard
                  index={imageLightbox.index || 0}
                  headline={imageLightbox.headline}
                  bullets={imageLightbox.bullets}
                  imageUrl={imageLightbox.imageUrl}
                />
              </div>
            ) : imageLightbox.kind === 'artwork' ? (
              <div className="w-[min(80vh,80vw,36rem)] aspect-square rounded-lg overflow-hidden shadow-2xl">
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

