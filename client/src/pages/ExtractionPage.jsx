import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, Brain, PenTool,
  ImageIcon, AlertCircle, ChevronRight, ChevronDown, ChevronUp, Eye, ArrowRight,
  XCircle, AlertTriangle, RefreshCw, Film, Settings2, ToggleLeft, ToggleRight, Download,
  Mail
} from 'lucide-react'
import { parsePDF } from '../services/llamaparse'
import { verifyParsedContent, summarizeContent } from '../services/gemini'
import {
  generateAllContent, retryFailedChannels,
  generateBlogContent, generateNewsletterContent,
  generateInstagramContent, generateShortsScript
} from '../services/gemini-content'
import { generateBlogImages, generateInstagramImages } from '../services/cardImage'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse.js'
import { buildShortsVideoAgentPrompt, mapShortsSubtitleStyleToBurnStyle } from '../utils/shortsVideoAgent.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || ''
const API_HEADERS = API_SECRET ? { 'x-app-secret': API_SECRET } : {}

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...API_HEADERS,
      ...(options.headers || {}),
    },
  })
}

function resolveMediaUrl(url) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/output/') && API_BASE) return `${API_BASE}${url}`
  if (url.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${url}`
  return url
}

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

const mockVerification = {
  isValid: true,
  confidence: 0.95,
  issues: [],
  correctedText: null,
}

const mockSummary = {
  title: '2026년 디지털 교육 전환 트렌드 요약',
  summary: '디지털 교육 전환은 이미 선택이 아니라 기본 운영 방식이 되었고, 개인화 학습과 AI 기반 수업 지원이 교육 성과를 끌어올리는 핵심 축으로 자리 잡고 있습니다.',
  keyData: [
    { label: '디지털 학습 도입률', value: '78.4%', context: '초중고 기준' },
    { label: 'LMS 활용률', value: '83.1%', context: '대학 및 평생교육기관' },
    { label: '과제 완수율 상승', value: '+26.8%', context: '개인화 학습 적용 시' },
    { label: '수업 만족도', value: '91.2점', context: 'AI 튜터 활용 수업' },
  ],
  insights: [
    '개인화 학습 도입이 학습 완수율을 끌어올리며 교육 성과 개선에 직접 연결되고 있습니다.',
    'LMS와 마이크로러닝 조합이 온오프라인 혼합형 수업의 기본 모델로 자리 잡고 있습니다.',
    '교사 지원형 자동 피드백 도구가 행정 부담을 줄이고 수업 집중도를 높이고 있습니다.',
  ],
  keywords: ['디지털 교육', '에듀테크', 'AI 튜터', '개인화 학습', '마이크로러닝'],
}

const mockBlogContent = {
  title: '[데모] 2026 디지털 교육 트렌드: 개인화 학습이 바꾸는 수업 현장',
  metaDescription: '디지털 교육 전환, LMS 활용, AI 튜터, 마이크로러닝이 만드는 2026 교육 현장 변화',
  sections: [
    {
      heading: '디지털 학습은 이제 기본 운영 방식입니다',
      content: '초중고 디지털 학습 플랫폼 도입률은 78.4%, 대학 및 평생교육기관 LMS 활용률은 83.1%까지 올라가며 디지털 학습이 교육 현장의 기본 운영 방식으로 자리 잡고 있습니다.',
      imagePrompt: 'modern digital education classroom with tablets and large display',
    },
    {
      heading: '개인화 학습과 AI 튜터가 성과를 끌어올립니다',
      content: '개인화 학습을 적용한 수업에서는 과제 완수율이 26.8% 상승했고, 실시간 피드백을 제공한 경우 학습 지속률도 18.5% 높아졌습니다. AI 튜터를 활용한 수업 만족도는 91.2점으로 나타났습니다.',
      imagePrompt: 'AI tutor supporting personalized learning for students',
    },
  ],
  tags: ['디지털교육', '에듀테크', 'AI튜터'],
  summary: '디지털 교육 전환과 개인화 학습이 2026년 교육 현장의 핵심 변화로 자리 잡고 있습니다.',
}

const mockInstagramContent = {
  title: '[데모] 디지털 교육 핵심 인사이트',
  body: '2026년 교육 현장은 디지털 학습과 개인화 학습 중심으로 빠르게 전환되고 있습니다.\n\n초중고 디지털 학습 플랫폼 도입률은 **78.4%**, 대학 및 평생교육기관 LMS 활용률은 **83.1%**까지 확대됐습니다.\n\n개인화 학습 적용 시 과제 완수율은 **26.8%**, 실시간 피드백을 제공하면 학습 지속률은 **18.5%** 상승합니다.',
  caption: '📚 2026 디지털 교육 핵심 인사이트\n✅ 디지털 학습 도입률 78.4%\n✅ LMS 활용률 83.1%\n✅ 개인화 학습 적용 시 과제 완수율 +26.8%\n✅ AI 튜터 수업 만족도 91.2점',
  hashtags: ['#디지털교육', '#에듀테크', '#AI튜터', '#개인화학습', '#교육트렌드'],
  cardTopics: [
    { cardNumber: 1, headline: '디지털 학습 도입', content: '초중고 교육 현장 도입률', dataPoint: '78.4%' },
    { cardNumber: 2, headline: 'LMS 활용 확대', content: '대학 및 평생교육기관 기준', dataPoint: '83.1%' },
    { cardNumber: 3, headline: '과제 완수율 상승', content: '개인화 학습 적용 효과', dataPoint: '+26.8%' },
    { cardNumber: 4, headline: '학습 지속률 상승', content: '실시간 피드백 제공 효과', dataPoint: '+18.5%' },
    { cardNumber: 5, headline: 'AI 튜터 만족도', content: '학생 체감 만족도', dataPoint: '91.2점' },
    { cardNumber: 6, headline: '핵심 운영 방식', content: '짧고 반복 가능한 학습 구조', dataPoint: '마이크로러닝' },
  ],
}

const mockNewsletterContent = {
  subject: '[데모] 주간 교육 브리핑 - 디지털 학습 도입률 78.4%',
  preheader: '개인화 학습과 AI 튜터가 바꾸는 2026 교육 현장',
  greeting: '안녕하세요, 교육 트렌드 구독자 여러분!',
  headline: '2026 디지털 교육 전환, 무엇이 달라졌을까요?',
  keyPoints: ['디지털 학습 도입률 78.4%', 'LMS 활용률 83.1%', '개인화 학습 시 과제 완수율 +26.8%'],
  body: '2026년 교육 현장은 디지털 학습과 개인화 학습 중심으로 빠르게 재편되고 있습니다.\n\n초중고의 디지털 학습 플랫폼 도입률은 78.4%, 대학 및 평생교육기관의 LMS 활용률은 83.1%까지 확대됐습니다.\n\n특히 개인화 학습과 AI 튜터를 활용한 수업은 학습 성과와 만족도를 동시에 높이며, 교육 운영의 표준 모델로 자리 잡고 있습니다.',
  dataHighlights: [
    { label: '디지털 학습 도입률', value: '78.4%' },
    { label: 'LMS 활용률', value: '83.1%' },
    { label: '과제 완수율 상승', value: '+26.8%' },
    { label: 'AI 튜터 만족도', value: '91.2점' },
  ],
  cta: { text: '교육 인사이트 확인', description: '이번 주 핵심 데이터를 한눈에 정리했습니다.' },
  closingNote: '다음 브리핑에서도 교육 현장의 실질적인 변화와 인사이트를 전해드리겠습니다.',
}

const mockShortsScript = {
  title: '[데모] 디지털 교육 핵심 트렌드',
  duration: '30',
  hook: '요즘 교육 현장에서 가장 빠르게 바뀌는 건 무엇일까요?',
  scenes: [
    { sceneNumber: 1, duration: '8', narration: '안녕하세요. 오늘은 2026년 디지털 교육 전환의 핵심 흐름을 빠르게 정리해보겠습니다.', visualDescription: 'digital education intro scene', textOverlay: '2026 디지털 교육' },
    { sceneNumber: 2, duration: '8', narration: '초중고 디지털 학습 플랫폼 도입률은 78.4퍼센트, 대학과 평생교육기관의 LMS 활용률은 83.1퍼센트까지 확대됐습니다.', visualDescription: 'students using digital learning platform', textOverlay: '도입률 78.4%' },
    { sceneNumber: 3, duration: '8', narration: '개인화 학습을 적용하면 과제 완수율이 26.8퍼센트 상승하고, 실시간 피드백은 학습 지속률을 18.5퍼센트 높입니다.', visualDescription: 'personalized learning analytics', textOverlay: '완수율 +26.8%' },
    { sceneNumber: 4, duration: '6', narration: 'AI 튜터와 마이크로러닝이 교육 현장의 기본 포맷이 되고 있습니다. 지금은 디지털 교육 운영 전략이 경쟁력입니다.', visualDescription: 'AI tutor in modern classroom', textOverlay: 'AI 튜터 & 마이크로러닝' },
  ],
  cta: '디지털 교육 전략을 점검하고 수업 운영 방식을 다시 설계해보세요.',
  thumbnailPrompt: 'digital education trend analysis thumbnail',
  uploadTitle: '[디지털 교육 리포트] 2026 교육 현장은 어떻게 바뀌고 있을까?',
  uploadDescription: `2026년 교육 현장은 디지털 학습과 개인화 학습 중심으로 빠르게 전환되고 있습니다.

핵심은 디지털 학습 플랫폼, LMS, AI 튜터, 마이크로러닝의 조합입니다.

📊 핵심 수치
• 디지털 학습 도입률: 78.4%
• LMS 활용률: 83.1%
• 개인화 학습 적용 시 과제 완수율: +26.8%
• AI 튜터 수업 만족도: 91.2점

교육 운영 효율과 학습 성과를 동시에 높이는 구조가 이미 현장에 자리 잡고 있습니다.`,
  hashtags: ['#Shorts', '#디지털교육', '#에듀테크', '#AI튜터', '#개인화학습', '#교육트렌드', '#마이크로러닝', '#교육콘텐츠'],
}

const mockShortsVideo = {
  url: '/test.mp4',
  videoUrl: '/test.mp4',
  duration: '30',
  status: 'completed',
  isDemo: true,
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

const normalizeInstagramCardStyle = (value) => {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
}

function getMockBlogImages(style = 'pastel', textOverlay = 'with-text') {
  const src = BLOG_IMAGE_STYLE_EXAMPLES[style]?.src || BLOG_IMAGE_STYLE_EXAMPLES.pastel.src
  if (textOverlay === 'without-text') {
    return [
      { imageUrl: src, prompt: style === 'photo' ? 'full realistic classroom photo' : 'digital education classroom' },
      { imageUrl: src, prompt: style === 'photo' ? 'full realistic study scene photo' : 'LMS adoption education visual' },
    ]
  }
  return [
    { imageUrl: src, prompt: 'digital education classroom' },
    { imageUrl: src, prompt: 'digital education classroom' },
  ]
}

function getMockInstagramImages(style = 'pastel') {
  const src = INSTAGRAM_IMAGE_STYLE_EXAMPLES[style]?.src || INSTAGRAM_IMAGE_STYLE_EXAMPLES.pastel.src
  return [
    { cardNumber: 1, imageUrl: src, prompt: style === 'photo' ? 'full realistic study photo' : 'digital learning adoption' },
    { cardNumber: 2, imageUrl: src, prompt: style === 'photo' ? 'full realistic campus photo' : 'LMS usage in education' },
    { cardNumber: 3, imageUrl: src, prompt: style === 'photo' ? 'full realistic tutoring photo' : 'personalized learning improvement' },
    { cardNumber: 4, imageUrl: src, prompt: style === 'photo' ? 'full realistic classroom feedback photo' : 'real-time feedback in classroom' },
    { cardNumber: 5, imageUrl: src, prompt: style === 'photo' ? 'full realistic AI tutor photo' : 'AI tutor classroom' },
    { cardNumber: 6, imageUrl: src, prompt: style === 'photo' ? 'full realistic microlearning photo' : 'microlearning education content' },
  ]
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
  const [shortsTab, setShortsTab] = useState('script') // 'script' | 'upload'
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState({
    blogStyle: false,
    instagramStyle: false,
    mainColor: false,
    instagramCardStyle: false,
  })

  // 프롬프트 설정 (각 Step별)
  const [promptSettings, setPromptSettings] = useState({
    analysis: { focus: '', extra: '' },
    summary: { keywords: '', style: 'auto', extra: '' },
    content: { tone: 'auto', commonExtra: '', blogExtra: '', newsletterExtra: '', instaExtra: '', shortsExtra: '' },
    media: {
      blogImageStyle: 'pastel',
      instagramImageStyle: 'pastel',
      blogTextOverlay: 'with-text',
      mainColor: 'auto',
      instagramCardStyle: 'background-text',
      extra: '',
    },
    shorts: { videoStyle: 'avatar', narrationTone: 'auto', voiceStyle: 'auto', extra: '' },
  })
  const updatePrompt = (step, field, value) => setPromptSettings(p => ({ ...p, [step]: { ...p[step], [field]: value } }))
  const toggleMediaPreview = (key) => setMediaPreviewOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  const contentPromptOptions = promptSettings.content

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
  const [heygenAvatarId, setHeygenAvatarId] = useState(null) // talking_photo_id
  const [heygenReady, setHeygenReady] = useState(false)
  const [heygenUploading, setHeygenUploading] = useState(false)
  const [subtitleStyle, setSubtitleStyle] = useState('style1')
  const [subtitleFont, setSubtitleFont] = useState('default')
  const shortsStepNumbers = {
    avatar: 1,
    subtitle: 2,
    video: 3,
  }
  const isShortsVideoReady =
    !!avatarConfirmed &&
    !!shortsScript &&
    !loading.shorts &&
    !loading.media


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

  const cleanCardText = (text = '') => (
    String(text)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~`-]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )

  const trimCardTitleEnding = (text = '') => String(text).replace(/[\s,.:;!?/\\]+$/g, '').trim()
  const BLOG_HEADLINE_MAX_LENGTH = 28
  const BLOG_DESCRIPTION_MAX_LENGTH = 34

  const escapeRegExp = (value = '') => (
    String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )

  const limitBlogOverlayText = (text = '', maxLength = BLOG_DESCRIPTION_MAX_LENGTH) => {
    const clean = trimCardTitleEnding(cleanCardText(text))
    if (!clean || clean.length <= maxLength) return clean

    const tokens = clean.split(/\s+/).filter(Boolean)
    let limited = ''

    for (const token of tokens) {
      const next = limited ? `${limited} ${token}` : token
      if (next.length > maxLength && limited) break
      limited = next
      if (next.length >= maxLength) break
    }

    return trimCardTitleEnding(limited || clean)
  }

  const splitCardTokens = (text = '') => {
    const clean = cleanCardText(text)
    if (!clean) return []
    return clean
      .split(/(\s+|,+|:+|\/+|\\+)/)
      .map(token => token.trim())
      .filter(Boolean)
  }

  const splitHeading = (text) => {
    const clean = trimCardTitleEnding(cleanCardText(text || ''))
    if (!clean) return ['']

    const maxLineLength = clean.length <= 14 ? 18 : 14
    if (clean.length <= maxLineLength) return [clean]

    const tokens = splitCardTokens(clean)
    if (tokens.length <= 1) return [clean]

    let line1 = ''
    let splitIndex = -1
    for (let i = 0; i < tokens.length; i++) {
      const next = line1 ? `${line1} ${tokens[i]}` : tokens[i]
      if (next.length > maxLineLength) break
      line1 = next
      splitIndex = i
    }

    if (splitIndex <= -1 || splitIndex >= tokens.length - 1) return [clean]

    const line2 = tokens.slice(splitIndex + 1).join(' ')
    return line2 ? [line1, line2] : [clean]
  }

  // 단어/특수문자 단위로 분리한 뒤 minimax 분할로 각 줄 길이가 비슷해지도록 균형을 맞춘다.
  // 마지막 줄에 단어 한 개만 남는 경우 앞 줄 단어를 함께 끌어내려 자연스럽게 채운다.
  const balanceLines = (text, maxLineLength) => {
    const clean = trimCardTitleEnding(cleanCardText(text || ''))
    if (!clean) return []
    if (clean.length <= maxLineLength) return [clean]
    const tokens = splitCardTokens(clean)
    if (tokens.length <= 1) return [clean]

    const partition = (toks, maxLen) => {
      const lines = []
      let line = ''
      for (const t of toks) {
        const next = line ? `${line} ${t}` : t
        if (next.length > maxLen && line) { lines.push(line); line = t }
        else line = next
      }
      if (line) lines.push(line)
      return lines
    }

    const greedy = partition(tokens, maxLineLength)
    const lineCount = greedy.length
    if (lineCount <= 1) return greedy

    let lo = Math.max(...tokens.map(t => t.length))
    let hi = clean.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (partition(tokens, mid).length <= lineCount) hi = mid
      else lo = mid + 1
    }
    return partition(tokens, lo)
  }

  const renderBalancedLines = (text, maxLineLength) => {
    const lines = balanceLines(text, maxLineLength)
    if (lines.length === 0) return null
    return lines.map((line, idx) => (
      <span key={idx}>
        {idx > 0 && <br />}
        {line}
      </span>
    ))
  }

  const renderCardHeading = (text, fontSize) => {
    const clean = trimCardTitleEnding(cleanCardText(text))
    const lines = splitHeading(clean)
    return (
      <p
        className="font-black text-gray-800 leading-snug"
        style={{ fontSize, letterSpacing: '-0.35px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}
      >
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {line}
          </span>
        ))}
      </p>
    )
  }

  const deriveBlogHeadline = (keyPhrase = '', heading = '') => {
    const source = cleanCardText(heading) || cleanCardText(keyPhrase)
    return limitBlogOverlayText(source, BLOG_HEADLINE_MAX_LENGTH)
  }

  const deriveHeadlineKeyword = (text = '') => {
    const clean = trimCardTitleEnding(cleanCardText(text))
      .replace(/\b(입니다|합니다|였습니다|됩니다|되었어요|있습니다|없습니다)\b/g, '')
      .trim()

    const particleMatch = clean.match(/^(.+?)(은|는|이|가|을|를|도)\s+/)
    if (particleMatch?.[1]) return trimCardTitleEnding(particleMatch[1])

    const dividerMatch = clean.split(/\s+(?:이제|정리|핵심|전략|방법|가이드|포인트|트렌드)\b/)[0]?.trim()
    if (dividerMatch && dividerMatch.length < clean.length) return trimCardTitleEnding(dividerMatch)

    const words = clean.split(/\s+/).filter(Boolean)
    if (words.length >= 2) return trimCardTitleEnding(words.slice(0, 2).join(' '))
    return trimCardTitleEnding(clean)
  }

  const deriveDescriptionCopy = (heading = '', headline = '', fallbackContent = '') => {
    const cleanHeading = cleanCardText(heading)
    const cleanHeadline = cleanCardText(headline)
    const headingRemainder = cleanHeading
      .replace(new RegExp(`^${escapeRegExp(cleanHeadline)}(은|는|이|가|을|를|와|과|도)?\\s*`), '')
      .trim()

    if (headingRemainder && headingRemainder !== cleanHeading) {
      return limitBlogOverlayText(headingRemainder, BLOG_DESCRIPTION_MAX_LENGTH)
    }

    const contentPhrase = cleanCardText(fallbackContent || '')
      .split(/(?<=[.!?。！？])\s+|\n+| {2,}/)
      .map(line => trimCardTitleEnding(line))
      .filter(Boolean)
      .find(line => line.length <= BLOG_DESCRIPTION_MAX_LENGTH)

    return limitBlogOverlayText(contentPhrase || cleanHeading, BLOG_DESCRIPTION_MAX_LENGTH)
  }

  const deriveBlogImageDescription = (keyPhrase = '', heading = '', fallbackContent = '') => {
    const cleanKeyPhrase = cleanCardText(keyPhrase)
    const headline = deriveBlogHeadline(keyPhrase, heading)
    if (cleanKeyPhrase && cleanKeyPhrase !== headline) return limitBlogOverlayText(cleanKeyPhrase, BLOG_DESCRIPTION_MAX_LENGTH)

    return deriveDescriptionCopy(heading, headline, fallbackContent)
  }

  const deriveInstagramDetailLines = (card) => {
    const lines = []
    const contentText = cleanCardText(card?.content || '')
    const dataPointText = cleanCardText(card?.dataPoint || '')

    const contentSentences = contentText
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map(sentence => sentence.trim())
      .filter(Boolean)

    for (const sentence of contentSentences) {
      lines.push(trimCardTitleEnding(cleanCardText(sentence)))
    }

    if (dataPointText) {
      lines.push(trimCardTitleEnding(dataPointText))
    }

    if (lines.length === 0 && contentText) {
      lines.push(trimCardTitleEnding(contentText))
    }

    return lines.filter(Boolean)
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

  const renderBlogTextOverlay = ({
    variant = 'circle',
    headline,
    description,
    accentColor,
    mode = 'thumb',
  }) => {
    if (variant === 'plain') {
      return mode === 'modal' ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/34 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="rounded-[24px] bg-white/92 border border-white/85 shadow-lg px-5 py-4">
              {renderCardHeading(headline, 22)}
              {description && (
                <p
                  className="mt-2 text-[13px] font-semibold text-gray-600 leading-relaxed"
                  style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                >
                  {renderBalancedLines(description, 22)}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/28 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2">
            <div className="rounded-xl bg-white/92 border border-white/85 shadow-sm px-2.5 py-2">
              {renderCardHeading(headline, 7)}
              {description && (
                <p
                  className="mt-1 text-[5px] font-semibold text-gray-600 leading-tight"
                  style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                >
                  {renderBalancedLines(description, 18)}
                </p>
              )}
            </div>
          </div>
        </>
      )
    }

    return mode === 'modal' ? (
      <>
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="w-[52%] max-w-[320px] aspect-square rounded-full bg-white/[0.94] shadow-xl flex flex-col items-center justify-center text-center px-5 py-5">
            {renderCardHeading(headline, 24)}
            <div className="w-12 h-1 rounded-full mt-3 mb-3" style={{ background: accentColor }} />
            {description && (
              <p
                className="text-[13px] text-gray-600 font-semibold leading-relaxed"
                style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
              >
                {renderBalancedLines(description, 14)}
              </p>
            )}
          </div>
        </div>
      </>
    ) : (
      <>
        <div className="absolute inset-0 bg-black/8" />
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <div className="w-[72%] aspect-square rounded-full bg-white/[0.94] shadow flex flex-col items-center justify-center text-center px-2 py-2">
            {renderCardHeading(headline, 7)}
            <div className="w-4 h-0.5 rounded-full mt-1 mb-1" style={{ background: accentColor }} />
            {description && (
              <p
                className="text-[5px] text-gray-600 font-semibold leading-tight"
                style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
              >
                {renderBalancedLines(description, 14)}
              </p>
            )}
          </div>
        </div>
      </>
    )
  }

  const renderBlogPreviewCards = (section, index) => {
    const blogImageList = Array.isArray(blogImages) ? blogImages : []
    const matchedImage =
      blogImageList.find(img => img?.heading === section?.heading && img?.imageUrl) ||
      blogImageList[index] ||
      null
    const bgImageUrl = matchedImage?.imageUrl || null
    const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
    const accentPalette = {
      'bg-[#FFF3E0]': '#e57a00',
      'bg-[#E8F5E9]': '#2e7d32',
      'bg-[#E3F2FD]': '#1565c0',
      'bg-[#F3E5F5]': '#7b1fa2',
    }
    const fallbackBg = bgColors[index % bgColors.length]
    const accentColor = accentPalette[fallbackBg] || '#6366f1'
    const heading = cleanCardText(section?.heading || '')
    const keyPhrase = cleanCardText(matchedImage?.keyPhrase || section?.keyPhrase || '')
    const headline = deriveBlogHeadline(keyPhrase, heading)
    const description = deriveBlogImageDescription(keyPhrase, heading, section?.content || '')
    const showBlogTextOverlay = promptSettings.media.blogTextOverlay !== 'without-text'

    if (!bgImageUrl) return []

    const variants = showBlogTextOverlay
      ? [{ key: 'circle', label: null }]
      : [{ key: 'image', label: null }]

    return variants.map((variant) => (
      <div
        key={`${section?.heading || 'blog'}-${index}-${variant.key}`}
        className="shrink-0 flex flex-col items-center gap-1.5"
      >
        <button
          type="button"
          className={`relative w-28 h-28 rounded-md overflow-hidden border border-border bg-surface-light shadow-sm ${
            bgImageUrl ? 'cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all' : ''
          }`}
          style={{ fontFamily: "'Pretendard', sans-serif" }}
          onClick={() => {
            if (!bgImageUrl) return
            setPreviewImage(
              showBlogTextOverlay
                ? {
                    renderType: 'blog-card',
                    variant: variant.key,
                    src: bgImageUrl,
                    title: section?.heading || `블로그 이미지 ${index + 1}`,
                    headline,
                    description,
                    accentColor,
                  }
                : {
                    src: bgImageUrl,
                    title: section?.heading || `블로그 이미지 ${index + 1}`,
                  }
            )
          }}
        >
          {bgImageUrl ? (
            <img src={bgImageUrl} alt={section?.heading || `블로그 이미지 ${index + 1}`} className="w-full h-full object-cover absolute inset-0" loading="lazy" />
          ) : (
            <div className={`w-full h-full absolute inset-0 ${fallbackBg}`} />
          )}

          {showBlogTextOverlay && renderBlogTextOverlay({
            variant: variant.key,
            headline,
            description,
            accentColor,
            mode: 'thumb',
          })}
        </button>
      </div>
    ))
  }

  const renderInstagramPreviewCard = (image, index) => {
    const cardNumber = Number(image?.cardNumber) || index + 1
    const cards = Array.isArray(instagramContent?.cardTopics) ? instagramContent.cardTopics : []
    const matchedCard = cards.find(card => Number(card?.cardNumber) === cardNumber) || cards[index] || null
    const imageUrl = image?.imageUrl || null
    const headline = trimCardTitleEnding(cleanCardText(matchedCard?.headline || `카드 ${cardNumber}`))
    const detailLines = deriveInstagramDetailLines(matchedCard)
    // 설명(content)과 요약(dataPoint)을 한 텍스트 블록으로 합쳐 카드가 너무 비어 보이지 않도록 한다.
    const descriptionLines = detailLines.filter(Boolean)
    const cardStyle = normalizeInstagramCardStyle(promptSettings.media.instagramCardStyle)
    const isCenterCard = cardStyle === 'center-card'

    if (!imageUrl) return null

    const renderInstagramPreviewOverlay = (mode = 'thumb') => {
      const isModal = mode === 'modal'
      if (isCenterCard) {
        return (
          <div className={`absolute inset-0 ${isModal ? 'p-[7%]' : 'p-2'} flex items-center justify-center`}>
            <div className={`${isModal ? 'w-[70%] rounded-[30px] px-[7%] py-[8%]' : 'w-[78%] rounded-[18px] px-3 py-3'} bg-white/82 backdrop-blur-sm border border-white/70 shadow-sm text-center`}>
              <div className={`inline-flex items-center rounded-full bg-primary/10 text-primary-dark ${isModal ? 'px-3 py-1 mb-4 text-xs font-extrabold tracking-[0.18em]' : 'px-2 py-0.5 mb-2 text-[9px] font-bold'}`}>
                CARD {cardNumber}
              </div>
              <p className={`${isModal ? 'text-[clamp(16px,2.2vw,24px)]' : 'text-[9px]'} font-black text-gray-800 leading-tight`}>{headline}</p>
              {descriptionLines.length > 0 && (
                <div className={`${isModal ? 'mt-3 space-y-1.5' : 'mt-1.5 space-y-1'}`}>
                  {descriptionLines.map((line, idx) => (
                    <p
                      key={idx}
                      className={`${isModal ? 'text-[clamp(10px,1.2vw,13px)]' : 'text-[6px]'} font-semibold text-gray-600 leading-tight`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }

      return (
        <div className={`absolute inset-0 ${isModal ? 'p-[7%]' : 'p-2'} flex flex-col justify-between`}>
          <div className={`self-start rounded-full bg-black/65 text-white font-bold ${isModal ? 'px-3 py-1.5 text-[clamp(11px,1.2vw,14px)]' : 'px-1.5 py-0.5 text-[10px]'}`}>
            {cardNumber}
          </div>
          <div className={`${isModal ? 'rounded-[24px] px-[5%] py-[4.5%]' : 'rounded-lg px-2 py-1.5'} bg-white/88 shadow-sm`}>
            <p className={`${isModal ? 'text-[clamp(15px,2vw,22px)]' : 'text-[8px]'} font-black text-gray-800 leading-tight`}>{headline}</p>
            {descriptionLines.length > 0 && (
              <div className={`${isModal ? 'mt-2 space-y-1.5' : 'mt-1 space-y-1'}`}>
                {descriptionLines.map((line, idx) => (
                  <p
                    key={idx}
                    className={`${isModal ? 'text-[clamp(10px,1.1vw,12px)]' : 'text-[6px]'} font-semibold text-gray-600 leading-tight`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <button
        key={`insta-preview-${cardNumber}-${index}`}
        type="button"
        onClick={() => setPreviewImage({
          renderType: 'instagram-card',
          src: imageUrl,
          title: `인스타 카드 ${cardNumber}`,
          cardNumber,
          headline,
          descriptionLines,
          cardStyle,
        })}
        className="relative shrink-0 w-24 h-24 rounded-md overflow-hidden border border-border bg-surface-light cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all text-left"
      >
        <img src={imageUrl} alt={`인스타 ${cardNumber}`} className="w-full h-full object-cover absolute inset-0" loading="lazy" />
        <div className={`absolute inset-0 ${isCenterCard ? 'bg-black/14' : 'bg-black/10'}`} />
        {renderInstagramPreviewOverlay('thumb')}
      </button>
    )
  }

  const renderImageStyleExample = (kind, label) => {
    const styleValue = kind === 'blog' ? promptSettings.media.blogImageStyle : promptSettings.media.instagramImageStyle
    const example =
      kind === 'blog'
        ? BLOG_IMAGE_STYLE_EXAMPLES[styleValue]
        : INSTAGRAM_IMAGE_STYLE_EXAMPLES[styleValue]
    if (!example) return null

    return (
      <div className="mt-2 rounded-lg border border-border bg-surface-light p-2.5 overflow-hidden">
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setPreviewImage({ src: example.src, title: `${label} - ${example.title}` })}
            className="relative w-full aspect-square max-w-[160px] overflow-hidden rounded-md border border-border bg-white hover:ring-2 hover:ring-primary/30 transition-all"
          >
            <img src={example.src} alt={example.title} className="w-full h-full object-cover" loading="lazy" />
          </button>
          <div className="min-w-0 space-y-1">
            <p className="break-words text-xs font-semibold text-text">{example.title}</p>
            <p className="break-words text-[11px] leading-5 text-text-muted">{example.description}</p>
            <button
              type="button"
              onClick={() => setPreviewImage({ src: example.src, title: `${label} - ${example.title}` })}
              className="inline-flex max-w-full items-center gap-1 break-words text-[11px] font-medium text-primary hover:text-primary-dark transition-colors"
            >
              <Eye size={12} />
              크게 보기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderMainColorExample = () => {
    const example = MAIN_COLOR_EXAMPLES[promptSettings.media.mainColor] || MAIN_COLOR_EXAMPLES.auto
    if (!example) return null

    return (
      <div className="mt-2 rounded-lg border border-border bg-surface-light p-2.5 overflow-hidden">
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setPreviewImage({ src: example.src, title: `대표 색상 - ${example.title}` })}
            className="relative w-full aspect-square max-w-[160px] overflow-hidden rounded-md border border-border bg-white hover:ring-2 hover:ring-primary/30 transition-all"
          >
            <img src={example.src} alt={example.title} className="w-full h-full object-cover" loading="lazy" />
          </button>
          <div className="min-w-0 space-y-1">
            <p className="break-words text-xs font-semibold text-text">{example.title}</p>
            <p className="break-words text-[11px] leading-5 text-text-muted">{example.description}</p>
            <button
              type="button"
              onClick={() => setPreviewImage({ src: example.src, title: `대표 색상 - ${example.title}` })}
              className="inline-flex max-w-full items-center gap-1 break-words text-[11px] font-medium text-primary hover:text-primary-dark transition-colors"
            >
              <Eye size={12} />
              크게 보기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderInstagramCardStyleExample = () => {
    const cardStyle = normalizeInstagramCardStyle(promptSettings.media.instagramCardStyle)
    const example = INSTAGRAM_CARD_STYLE_EXAMPLES[cardStyle]
    if (!example) return null

    return (
      <div className="mt-2 rounded-lg border border-border bg-surface-light p-2.5 overflow-hidden">
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setPreviewImage({ src: example.src, title: `인스타 카드 스타일 - ${example.title}` })}
            className="relative w-full aspect-square max-w-[160px] overflow-hidden rounded-md border border-border bg-white hover:ring-2 hover:ring-primary/30 transition-all"
          >
            <img src={example.src} alt={example.title} className="w-full h-full object-cover" loading="lazy" />
          </button>
          <div className="min-w-0 space-y-1">
            <p className="break-words text-xs font-semibold text-text">{example.title}</p>
            <p className="break-words text-[11px] leading-5 text-text-muted">{example.description}</p>
            <button
              type="button"
              onClick={() => setPreviewImage({ src: example.src, title: `인스타 카드 스타일 - ${example.title}` })}
              className="inline-flex max-w-full items-center gap-1 break-words text-[11px] font-medium text-primary hover:text-primary-dark transition-colors"
            >
              <Eye size={12} />
              크게 보기
            </button>
          </div>
        </div>
      </div>
    )
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
      const results = await retryFailedChannels(failedKeys, summary, parsedText, emphasisText, contentPromptOptions)

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
      const results = await retryFailedChannels([key], summary, parsedText, emphasisText, contentPromptOptions)
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
      blog: () => generateBlogContent(summary, parsedText, emphasisText, contentPromptOptions),
      newsletter: () => generateNewsletterContent(summary, parsedText, emphasisText, contentPromptOptions),
      instagram: () => generateInstagramContent(summary, parsedText, emphasisText, contentPromptOptions),
      shorts: () => generateShortsScript(summary, parsedText, emphasisText, contentPromptOptions),
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
        { key: 'blogImg', service: 'gemini', channel: '블로그 이미지', fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.blogImageStyle, textOverlay: promptSettings.media.blogTextOverlay, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]), setter: setBlogImages },
      )
    }

    if (selectedChannels.instagram && !alreadyDone.instaImg && instagramContent?.cardTopics?.length) {
      tasks.push(
        { key: 'instaImg', service: 'gemini', channel: '인스타 카드', fn: () => generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.instagramImageStyle, instagramCardStyle: promptSettings.media.instagramCardStyle, extra: promptSettings.media.extra }), setter: setInstagramImages },
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
    setShortsVideo(null)
    try {
      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          setMediaItemLoading((prev) => ({ ...prev, '숏츠 영상': progressLabel }))
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

  const confirmAndUploadAvatar = async () => {
    setAvatarConfirmed(true)
    setHeygenAvatarId(null)
    setHeygenReady(false)
    if (!avatarImage) return

    try {
      const groupId = await uploadAvatarToHeyGen(true)
      void waitForHeygenAvatarReady(groupId, {
        attempts: 24,
        intervalMs: 5000,
        progressLabel: '',
      }).catch((err) => {
        console.error('[HeyGen readiness check failed]', err)
      })
    } catch (err) {
      console.error('[HeyGen avatar upload failed]', err)
      addStepErrors('shorts', [{ service: 'heygen', channel: '아바타 업로드', message: err.message || 'HeyGen 업로드 실패' }])
    }
  }

  const runShortsGeneration = async () => {
    if (!shortsScript) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏츠', message: '숏츠 대본이 없습니다.' }])
      return
    }

    if (!avatarImage) {
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏츠', message: '아바타를 먼저 생성해주세요.' }])
      return
    }

    setStepLoading('shorts', true)
    clearStepErrors('shorts')
    setMediaItemLoading((prev) => ({ ...prev, '숏츠 영상': true }))

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

      const prompt = buildShortsVideoAgentPrompt({

        script: shortsScript,
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

      setMediaItemLoading((prev) => ({ ...prev, '숏츠 영상': 'HeyGen Video Agent 생성 요청 중...' }))

      const generateRes = await apiFetch('/api/heygen/video-agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          config: {
            avatar_id: talkingPhotoId,
          },
        }),
      })
      const generateData = await readApiResponse(generateRes)
      if (!generateRes.ok) {
        throw new Error(getApiErrorMessage(generateData, `HeyGen Video Agent 요청 실패 (${generateRes.status})`))
      }

      const videoId =
        generateData.data?.video_id ||
        generateData.data?.id ||
        generateData.video_id ||
        generateData.id

      if (!videoId) {
        throw new Error('HeyGen video_id를 받지 못했습니다.')
      }

      setMediaItemLoading((prev) => ({ ...prev, '숏츠 영상': 'HeyGen 렌더가 완료되는 중...' }))

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
                scenes: shortsScript.scenes,
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
            duration: shortsScript.duration,
            videoId,
            prompt,
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
      addStepErrors('shorts', [{ service: 'heygen', channel: '숏츠 영상', message: err.message || '숏츠 생성 실패' }])
      showErrorAlert('숏츠 생성', err.message)
    }

    setMediaItemLoading((prev) => ({ ...prev, '숏츠 영상': false }))
    setStepLoading('shorts', false)
  }


  // Step 4: 개별 미디어 생성
  const runSingleMedia = async (key) => {
    const taskMap = {
      blogImg: {
        channel: '블로그 이미지',
        service: 'gemini',
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.blogImageStyle, textOverlay: promptSettings.media.blogTextOverlay, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]),
        setter: setBlogImages,
        demoData: getMockBlogImages(promptSettings.media.blogImageStyle, promptSettings.media.blogTextOverlay),
      },
      instaImg: {
        channel: '인스타 카드',
        service: 'gemini',
        fn: () => instagramContent?.cardTopics?.length
          ? generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.instagramImageStyle, instagramCardStyle: promptSettings.media.instagramCardStyle, extra: promptSettings.media.extra })
          : Promise.resolve([]),
        setter: setInstagramImages,
        demoData: getMockInstagramImages(promptSettings.media.instagramImageStyle),
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
        '블로그 이미지': { data: getMockBlogImages(promptSettings.media.blogImageStyle, promptSettings.media.blogTextOverlay), setter: setBlogImages },
        '인스타 카드': { data: getMockInstagramImages(promptSettings.media.instagramImageStyle), setter: setInstagramImages },
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
        fn: () => blogContent?.sections ? generateBlogImages(blogContent.sections, { imageStyle: promptSettings.media.blogImageStyle, textOverlay: promptSettings.media.blogTextOverlay, mainColor: promptSettings.media.mainColor, extra: promptSettings.media.extra }) : Promise.resolve([]),
        setter: setBlogImages,
      },
      '인스타 카드': {
        fn: () => instagramContent?.cardTopics ? generateInstagramImages(instagramContent.cardTopics, { imageStyle: promptSettings.media.instagramImageStyle, instagramCardStyle: promptSettings.media.instagramCardStyle, extra: promptSettings.media.extra }) : Promise.resolve([]),
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

  const fileToBase64 = (f) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(f)
  })

  // 결과 확인에 사용할 미완료/실패 목록 수집
  const getIncompleteItems = () => {
    const incomplete = []
    const isSelectedErrorChannel = (channel = '') => {
      if (channel.includes('뉴스레터')) return selectedChannels.newsletter
      if (channel.includes('인스타')) return selectedChannels.instagram
      if (channel.includes('블로그')) return selectedChannels.blog
      if (channel.includes('숏폼') || channel.includes('숏츠') || channel.includes('아바타')) return selectedChannels.shorts
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
    if (selectedChannels.blog && !blogImages?.some(i => i.imageUrl)) incomplete.push('블로그 이미지')
    if (selectedChannels.instagram && !instagramImages?.length) incomplete.push('인스타 카드 이미지')
    // Step 5
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
    const incomplete = getIncompleteItems()

    if (incomplete.length > 0) {
      setConfirmDialog(
        `다음 과정이 완료되지 않았습니다:\n\n${incomplete.map(f => `  • ${f}`).join('\n')}\n\n완료되지 않은 항목은 결과에 포함되지 않습니다.\n그래도 결과를 확인하시겠습니까?`
      )
      return
    }

    await navigateToResults()
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
        }
      : blogContent

    const instagramContentForResult = instagramContent
      ? {
          ...instagramContent,
          cardStyle: promptSettings.media.instagramCardStyle,
        }
      : instagramContent

    navigate('/extraction/result', {
      state: {
        parsedText, verification, summary,
        blogContent: blogContentForResult, newsletterContent, instagramContent: instagramContentForResult,
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
            {previewImage.renderType === 'blog-card' ? (
              <div
                className="relative w-[min(78vw,640px)] aspect-square rounded-[28px] overflow-hidden shadow-2xl bg-surface-light"
                style={{ fontFamily: "'Pretendard', sans-serif" }}
              >
                <img src={previewImage.src} alt={previewImage.title} className="w-full h-full object-cover absolute inset-0" />
                {renderBlogTextOverlay({
                  variant: previewImage.variant,
                  headline: previewImage.headline,
                  description: previewImage.description,
                  accentColor: previewImage.accentColor,
                  mode: 'modal',
                })}
              </div>
            ) : previewImage.renderType === 'instagram-card' ? (
              <div
                className="relative w-[min(78vw,640px)] aspect-square rounded-[28px] overflow-hidden shadow-2xl bg-surface-light"
                style={{ fontFamily: "'Pretendard', sans-serif" }}
              >
                <img src={previewImage.src} alt={previewImage.title} className="w-full h-full object-cover absolute inset-0" />
                <div className={`absolute inset-0 ${previewImage.cardStyle === 'center-card' ? 'bg-black/14' : 'bg-black/10'}`} />
                {previewImage.cardStyle === 'center-card' ? (
                  <div className="absolute inset-0 p-[7%] flex items-center justify-center">
                    <div className="w-[70%] rounded-[30px] bg-white/82 backdrop-blur-sm border border-white/70 px-[7%] py-[8%] shadow-sm text-center">
                      <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold tracking-[0.18em] text-primary-dark mb-4">
                        CARD {previewImage.cardNumber}
                      </div>
                      <p className="text-[clamp(16px,2.2vw,24px)] font-black text-gray-800 leading-tight">{previewImage.headline}</p>
                      {Array.isArray(previewImage.descriptionLines) && previewImage.descriptionLines.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {previewImage.descriptionLines.map((line, idx) => (
                            <p key={idx} className="text-[clamp(10px,1.2vw,13px)] font-semibold text-gray-600 leading-tight">{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 p-[7%] flex flex-col justify-between">
                    <div className="self-start rounded-full bg-black/65 px-3 py-1.5 text-[clamp(11px,1.2vw,14px)] font-bold text-white">
                      {previewImage.cardNumber}
                    </div>
                    <div className="rounded-[24px] bg-white/88 px-[5%] py-[4.5%] shadow-sm">
                      <p className="text-[clamp(15px,2vw,22px)] font-black text-gray-800 leading-tight">{previewImage.headline}</p>
                      {Array.isArray(previewImage.descriptionLines) && previewImage.descriptionLines.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {previewImage.descriptionLines.map((line, idx) => (
                            <p key={idx} className="text-[clamp(10px,1.1vw,12px)] font-semibold text-gray-600 leading-tight">{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <img src={previewImage.src} alt={previewImage.title} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
            )}
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
          {selectedChannels.blog && PF('📝 블로그', { optional: true, type: 'textarea', placeholder: 'SEO 키워드 등', value: promptSettings.content.blogExtra, onChange: v => updatePrompt('content', 'blogExtra', v) })}
          {selectedChannels.newsletter && PF('📧 뉴스레터', { optional: true, type: 'textarea', placeholder: '구독자 톤, CTA 등', value: promptSettings.content.newsletterExtra, onChange: v => updatePrompt('content', 'newsletterExtra', v) })}
          {selectedChannels.instagram && PF('📷 인스타', { optional: true, type: 'textarea', placeholder: '수치 강조 등', value: promptSettings.content.instaExtra, onChange: v => updatePrompt('content', 'instaExtra', v) })}
          {selectedChannels.shorts && PF('🎬 숏폼', { optional: true, type: 'textarea', placeholder: '후킹 문구 등', value: promptSettings.content.shortsExtra, onChange: v => updatePrompt('content', 'shortsExtra', v) })}
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

                      {/* 서브탭: 대본 / 생성 정보 */}
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
                          🎬 생성 정보
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

                      {/* 생성 정보 탭 */}
                      {shortsTab === 'upload' && (
                        <div className="space-y-2.5">
                          {!shortsScript.uploadTitle && !shortsScript.uploadDescription && !shortsScript.hashtags?.length && (
                            <div className="text-center py-8 text-text-muted">
                              <p className="text-sm">생성 정보가 준비되지 않았습니다.</p>
                              <p className="text-xs mt-1">대본을 다시 생성하거나 수정해주세요.</p>
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> 이미지 설정</p>
            <span className="text-[11px] text-text-muted">예시는 필요할 때만 펼쳐보기</span>
          </div>

          {selectedChannels.blog && (
            <div className="rounded-xl border border-border bg-surface-light p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">블로그</p>
                  <p className="text-xs text-text-muted">대표 이미지 스타일과 글자 표시 방식을 정합니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleMediaPreview('blogStyle')}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-border transition-all"
                >
                  {mediaPreviewOpen.blogStyle ? '예시 숨기기' : '예시 보기'}
                </button>
              </div>
              {PF('블로그 이미지 스타일', {
                type: 'select',
                value: promptSettings.media.blogImageStyle,
                onChange: v => updatePrompt('media', 'blogImageStyle', v),
                options: [{ value: 'pastel', label: '파스텔 일러스트' }, { value: '3d', label: '3D 렌더링' }, { value: 'photo', label: '사실적 사진' }, { value: 'watercolor', label: '수채화' }, { value: 'solid-pattern', label: '단색/패턴 배경' }],
              })}
              {PF('블로그 이미지 글자 표시', {
                type: 'select',
                value: promptSettings.media.blogTextOverlay,
                onChange: v => updatePrompt('media', 'blogTextOverlay', v),
                options: [
                  { value: 'with-text', label: '글자 넣기' },
                  { value: 'without-text', label: '글자 없이 보기' },
                ],
              })}
              {PF('블로그 메인 컬러', { type: 'select', value: promptSettings.media.mainColor, onChange: v => updatePrompt('media', 'mainColor', v), options: [{ value: 'auto', label: '자동' }, { value: 'blue', label: '파란 계열' }, { value: 'pink', label: '분홍 계열' }, { value: 'green', label: '초록 계열' }, { value: 'purple', label: '보라 계열' }] })}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleMediaPreview('mainColor')}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-border transition-all"
                >
                  {mediaPreviewOpen.mainColor ? '색상 숨기기' : '색상 예시'}
                </button>
              </div>
              {mediaPreviewOpen.blogStyle && renderImageStyleExample('blog', '블로그 이미지 스타일')}
              {mediaPreviewOpen.mainColor && renderMainColorExample()}
            </div>
          )}

          {selectedChannels.instagram && (
            <div className="rounded-xl border border-border bg-surface-light p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">인스타그램</p>
                  <p className="text-xs text-text-muted">배경 스타일과 카드 텍스트 배치를 함께 조정합니다.</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMediaPreview('instagramStyle')}
                    className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-border transition-all"
                  >
                    {mediaPreviewOpen.instagramStyle ? '배경 숨기기' : '배경 예시'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMediaPreview('instagramCardStyle')}
                    className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-border transition-all"
                  >
                    {mediaPreviewOpen.instagramCardStyle ? '카드 숨기기' : '카드 예시'}
                  </button>
                </div>
              </div>
              {PF('인스타 이미지 스타일', {
                type: 'select',
                value: promptSettings.media.instagramImageStyle,
                onChange: v => updatePrompt('media', 'instagramImageStyle', v),
                options: [{ value: 'pastel', label: '파스텔 일러스트' }, { value: '3d', label: '3D 렌더링' }, { value: 'photo', label: '사실적 사진' }, { value: 'watercolor', label: '수채화' }, { value: 'solid-pattern', label: '단색/패턴 배경' }],
              })}
              {PF('인스타 카드 스타일', {
                type: 'select',
                value: promptSettings.media.instagramCardStyle,
                onChange: v => updatePrompt('media', 'instagramCardStyle', v),
                options: [
                  { value: 'background-text', label: '배경 + 텍스트' },
                  { value: 'center-card', label: '중앙 카드 강조 텍스트' },
                ],
              })}
              {mediaPreviewOpen.instagramStyle && renderImageStyleExample('instagram', '인스타 이미지 스타일')}
              {mediaPreviewOpen.instagramCardStyle && renderInstagramCardStyleExample()}
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface-light p-3 space-y-3">
            <div>
              <div>
                <p className="text-sm font-semibold text-text">공통</p>
                <p className="text-xs text-text-muted">추가 지시사항만 전체 이미지 생성에 공통 적용합니다.</p>
              </div>
            </div>
            {PF('추가 지시사항', { optional: true, type: 'textarea', placeholder: '캐릭터 포함 등', value: promptSettings.media.extra, onChange: v => updatePrompt('media', 'extra', v) })}
          </div>
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
                      {(blogContent?.sections || [])
                        .flatMap((section, i) => renderBlogPreviewCards(section, i))
                        .filter(Boolean)}
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
                      {instagramImages
                        .filter(i => i.imageUrl)
                        .map((img, i) => renderInstagramPreviewCard(img, i))
                        .filter(Boolean)}
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
      <div id="step-5" className="flex gap-4 items-stretch">
        <div className={`w-[34%] shrink-0 bg-surface rounded-xl border border-border p-4 space-y-3 ${currentStep < 4 ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm font-semibold text-text-muted flex items-center gap-2"><Settings2 size={14} /> 숏폼 설정</p>
          {PF('비주얼 스타일', {
            type: 'select',
            value: promptSettings.shorts.videoStyle,
            onChange: v => updatePrompt('shorts', 'videoStyle', v),
            options: [
              { value: 'avatar', label: '아바타 중심' },
              { value: 'clean modern studio explainer', label: '모던 스튜디오' },
              { value: 'infographic-driven explainer visuals', label: '인포그래픽 중심' },
              { value: 'documentary-style editorial visuals', label: '다큐멘터리 스타일' },
              { value: 'fast-paced social media visuals', label: '소셜 숏폼 스타일' },
            ],
          })}
          {PF('나레이션 톤', {
            type: 'select',
            value: promptSettings.shorts.narrationTone,
            onChange: v => updatePrompt('shorts', 'narrationTone', v),
            options: [
              { value: 'auto', label: '자동' },
              { value: 'friendly and conversational', label: '친근한 설명형' },
              { value: 'energetic and punchy', label: '빠르고 에너지 있게' },
              { value: 'professional and authoritative', label: '전문가형' },
              { value: 'calm and trustworthy', label: '차분하고 신뢰감 있게' },
            ],
          })}
          {PF('목소리 스타일', {
            type: 'select',
            value: promptSettings.shorts.voiceStyle,
            onChange: v => updatePrompt('shorts', 'voiceStyle', v),
            options: [
              { value: 'auto', label: '자동 추천' },
              { value: 'warm and friendly Korean narrator voice', label: '따뜻하고 친근하게' },
              { value: 'bright and youthful Korean voice with lively energy', label: '밝고 경쾌하게' },
              { value: 'calm and intelligent Korean explainer voice', label: '차분하고 똑똑하게' },
              { value: 'cute and lovable Korean character voice', label: '귀엽고 캐릭터처럼' },
              { value: 'confident and polished Korean presenter voice', label: '또렷한 진행자 톤' },
            ],
          })}
          {PF('추가 지시사항', {
            optional: true,
            type: 'textarea',
            placeholder: '예: 핵심 수치는 화면 상단 텍스트로만 강조, 텍스트는 짧고 강하게',
            value: promptSettings.shorts.extra,
            onChange: v => updatePrompt('shorts', 'extra', v),
            hint: '추천 모드(Video Agent)에서 가장 강하게 반영됩니다.',
          })}
        </div>
        <div className={`flex-1 min-w-0 bg-surface rounded-2xl border transition-all shadow-sm ${currentStep === 5 ? 'border-primary/40' : 'border-border'} ${currentStep < 4 ? 'opacity-40 pointer-events-none' : ''}`}>
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
                          <button onClick={() => { setAvatarConfirmed(false); setHeygenAvatarId(null); setHeygenReady(false); setHeygenUploading(false) }}
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

                {/* 5-3: 자막 스타일 선택 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">{shortsStepNumbers.subtitle}</span>
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
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-full max-w-[240px] rounded-xl overflow-hidden border-2 border-red-500/30 shadow-lg bg-black" style={{ aspectRatio: '9/16' }}>
                            <video src={shortsVideo.url} controls className="w-full h-full object-contain" />
                          </div>
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
                        ? <><Loader2 size={16} className="animate-spin" /> {demoMode ? '데모 영상 생성 준비 중...' : 'HeyGen 영상 생성 중...'}</>
                        : <><Film size={16} /> {demoMode ? '데모 숏폼 영상 생성' : '숏폼 영상 생성'}</>}
                    </button>
                  )}
                  {!avatarImage && !shortsVideo && (
                    <p className="text-xs text-text-muted">아바타를 생성하고 확정해주세요</p>
                  )}
                  {!demoMode && avatarConfirmed && heygenUploading && !heygenReady && !shortsVideo && (
                    <div className="flex items-center gap-2 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                      <Loader2 size={14} className="text-primary animate-spin" />
                      <p className="text-xs text-primary">아바타를 HeyGen에 등록 중입니다... 목소리를 선택해주세요.</p>
                    </div>
                  )}
                  {!demoMode && avatarConfirmed && heygenReady && !shortsVideo && !loading.shorts && (
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

