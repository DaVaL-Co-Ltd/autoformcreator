import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Beaker,
  FileImage,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { summarizeContent } from '../services/gemini'
import {
  generateBlogContent,
  generateInstagramContent,
  generateNewsletterContent,
  generateShortsScript,
} from '../services/gemini-content'
import { generateBlogImages, generateInstagramImages } from '../services/flux'

const DEFAULT_SOURCE_TEXT = `2026 디지털 교육 전환 보고서
초중등 교육기관의 78.4%가 AI 기반 학습 플랫폼을 도입했고, 대학 및 평생교육기관의 LMS 활용률은 83.1%까지 확대됐습니다.
개인화 학습을 적용한 수업에서는 과제 완수율이 26.8% 상승했고, 실시간 피드백을 제공할 경우 학습 지속률은 18.5% 높아졌습니다.
AI 튜터를 활용한 수업 만족도는 91.2%로 나타났고, 마이크로러닝 기반 콘텐츠 운영 비율은 58.9%를 기록했습니다.
교육 기관 다수는 실시간 수업과 비동기 학습을 병행하는 혼합형 수업 모델을 채택하고 있으며, 교사 지원형 자동 채점 및 피드백 도구 도입도 빠르게 진행되고 있습니다.`

const SUMMARY_STYLE_OPTIONS = [
  { value: 'auto', label: '자동' },
  { value: 'data', label: '데이터 중심' },
  { value: 'story', label: '스토리텔링' },
  { value: 'compare', label: '비교 분석' },
]

const TONE_OPTIONS = [
  { value: 'auto', label: '자동' },
  { value: 'friendly', label: '친근한' },
  { value: 'professional', label: '전문적인' },
  { value: 'humorous', label: '유머러스한' },
  { value: 'formal', label: '격식 있는' },
]

const CHANNEL_OPTIONS = [
  { value: 'blog', label: '네이버 블로그' },
  { value: 'newsletter', label: '뉴스레터' },
  { value: 'instagram', label: '인스타그램' },
  { value: 'shorts', label: '유튜브 숏츠' },
]

const IMAGE_STYLE_OPTIONS = [
  { value: 'pastel', label: '파스텔 일러스트' },
  { value: '3d', label: '3D 렌더링' },
  { value: 'photo', label: '사실적 사진' },
  { value: 'watercolor', label: '수채화' },
  { value: 'solid-pattern', label: '단색/패턴 배경' },
]

const MAIN_COLOR_OPTIONS = [
  { value: 'auto', label: '자동' },
  { value: 'blue', label: '파란 계열' },
  { value: 'pink', label: '분홍 계열' },
  { value: 'green', label: '초록 계열' },
  { value: 'purple', label: '보라 계열' },
]

const INSTAGRAM_CARD_STYLE_OPTIONS = [
  { value: 'photo-overlay', label: '사진 위 글자' },
  { value: 'color-overlay', label: '배경색 위 글자' },
  { value: 'center-focus', label: '중앙 강조형' },
  { value: 'editorial-side', label: '사이드 라벨형' },
  { value: 'split-banner', label: '상하 분할형' },
]

const INSTAGRAM_CARD_STYLE_COMPARE_OPTIONS = [
  { value: 'background-text', label: '배경 + 텍스트' },
  { value: 'center-card', label: '중앙 카드 강조 텍스트' },
]

const normalizeInstagramCardStyle = (value) => {
  if (!INSTAGRAM_CARD_STYLE_OPTIONS.length) return 'background-text'
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
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

const splitCardTokens = (text = '') => {
  const clean = cleanCardText(text)
  if (!clean) return []
  return clean
    .split(/(\s+|,+|:+|\/+|\\+)/)
    .map(token => token.trim())
    .filter(Boolean)
}

const truncateCardText = (text, maxLength = 34) => {
  const clean = trimCardTitleEnding(cleanCardText(text))
  if (clean.length <= maxLength) return clean
  const words = splitCardTokens(clean)
  if (words.length <= 1) return `${clean.slice(0, maxLength).trim()}…`

  let truncated = ''
  for (const word of words) {
    const next = truncated ? `${truncated} ${word}` : word
    if (next.length > maxLength) break
    truncated = next
  }

  return `${(truncated || clean.slice(0, maxLength)).trim()}…`
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
    .replace(new RegExp(`^${cleanHeadline}(은|는|이|가|을|를|와|과|도)?\\s*`), '')
    .trim()

  if (headingRemainder) return headingRemainder

  return cleanCardText(fallbackContent || '')
    .split(/[.!?\n]/)
    .map(line => line.trim())
    .find(Boolean) || cleanHeading
}

const splitHeading = (text = '', maxLineLength = 10) => {
  const clean = trimCardTitleEnding(cleanCardText(text))
  if (!clean) return ['']
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

function renderCardHeading(text, fontSize, options = {}) {
  const clean = trimCardTitleEnding(cleanCardText(text))
  const lines = splitHeading(clean)
  const textClassName = options.light ? 'text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]' : 'text-gray-800 drop-shadow-sm'
  return (
    <p className={`font-black leading-snug ${textClassName}`} style={{ fontSize, letterSpacing: '-0.5px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {line}
        </span>
      ))}
    </p>
  )
}

function renderContentResult(channel, result) {
  if (!result) {
    return <p className="text-sm text-text-muted">결과가 없습니다.</p>
  }

  if (channel === 'blog') {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-text-muted">제목</p>
          <p className="text-sm font-semibold text-text">{result.title}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">요약</p>
          <p className="text-sm text-text leading-6">{result.summary}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">섹션 미리보기</p>
          <div className="space-y-2">
            {(result.sections || []).slice(0, 2).map((section, index) => (
              <div key={`${section.heading}-${index}`} className="rounded-lg border border-border bg-surface-light p-3">
                <p className="text-sm font-medium text-text">{section.heading}</p>
                <p className="mt-1 text-xs text-text-muted leading-5">{section.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (channel === 'newsletter') {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-text-muted">제목</p>
          <p className="text-sm font-semibold text-text">{result.subject}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">헤드라인</p>
          <p className="text-sm text-text">{result.headline}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">본문 미리보기</p>
          <p className="text-sm text-text leading-6 whitespace-pre-wrap">{result.body}</p>
        </div>
      </div>
    )
  }

  if (channel === 'instagram') {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-text-muted">제목</p>
          <p className="text-sm font-semibold text-text">{result.title}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">캡션</p>
          <p className="text-sm text-text leading-6 whitespace-pre-wrap">{result.caption}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">해시태그</p>
          <p className="text-sm text-text">{(result.hashtags || []).join(' ')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-text-muted">제목</p>
        <p className="text-sm font-semibold text-text">{result.title}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-text-muted">훅</p>
        <p className="text-sm text-text">{result.hook}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-text-muted">장면 미리보기</p>
        <div className="space-y-2">
          {(result.scenes || []).slice(0, 3).map((scene, index) => (
            <div key={`${scene.sceneNumber}-${index}`} className="rounded-lg border border-border bg-surface-light p-3">
              <p className="text-xs font-semibold text-text-muted">장면 {scene.sceneNumber}</p>
              <p className="mt-1 text-sm text-text leading-6">{scene.narration}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function _renderImageResultCardLegacy(title, image) {
  return (
    <div className="rounded-2xl border border-border bg-surface-light p-4">
      <div className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        {title}
      </div>
      {image?.imageUrl ? (
        <div className="space-y-3">
          <img
            src={image.imageUrl}
            alt={image.heading || title}
            className="w-full rounded-xl border border-border object-cover"
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted">이미지 헤딩</p>
            <p className="text-sm font-medium text-text">{image.heading || '없음'}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">이미지 결과가 없습니다.</p>
      )}
    </div>
  )
}

function renderBlogOverlayPreview(image, preview) {
  if (!image?.imageUrl || !preview) return null

  const headingText = cleanCardText(preview.heading || '')
  const keyPhrase = cleanCardText(preview.keyPhrase || '')
  const headline = truncateCardText(deriveHeadlineKeyword(keyPhrase || headingText), 12)
  const description = truncateCardText(
    deriveDescriptionCopy(headingText, headline, preview.content || ''),
    34
  )

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white">
      <img src={image.imageUrl} alt={headingText || '블로그 미리보기'} className="w-full rounded-xl object-cover" />
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-[52%] max-w-[280px] aspect-square rounded-full bg-white/[0.94] shadow flex flex-col items-center justify-center text-center px-5 py-5">
          {renderCardHeading(headline, 22)}
          <div className="w-12 h-1 rounded-full mt-3 mb-3 bg-primary/70" />
          <p className="text-sm text-gray-600 font-semibold leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

function renderInstagramOverlayPreview(image, preview) {
  if (!image?.imageUrl || !preview) return null

  const cardStyle = normalizeInstagramCardStyle(preview.cardStyle)
  const isCenterCard = cardStyle === 'center-card'
  const cardNumber = preview.cardNumber || 1
  const headline = truncateCardText(preview.headline || `移대뱶 ${cardNumber}`, 16)
  const description = truncateCardText(preview.dataPoint || preview.content || '', 24)

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-border shadow-sm bg-white">
      <img src={image.imageUrl} alt={`?몄뒪? ${cardNumber}`} className="absolute inset-0 h-full w-full object-cover" />
      <div className={`absolute inset-0 ${isCenterCard ? 'bg-black/14' : 'bg-black/18'}`} />

      {isCenterCard ? (
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <div className="w-[78%] rounded-[18px] border border-white/70 bg-white/84 px-3 py-3 text-center shadow-sm backdrop-blur-sm">
            <div className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary-dark">
              CARD {cardNumber}
            </div>
            <p className="text-[9px] font-black leading-tight text-gray-800">{headline}</p>
            {description && (
              <p className="mt-1.5 text-[6px] font-semibold leading-tight text-gray-600">{description}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-2">
          <div className="self-start inline-flex items-center rounded-full border border-white/50 bg-white/86 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] font-extrabold tracking-[0.18em] text-primary-dark">CARD {String(cardNumber).padStart(2, '0')}</span>
          </div>
          <div className="space-y-2">
            <div className="rounded-2xl border border-white/50 bg-white/82 px-3 py-3 shadow-sm backdrop-blur-sm">
              <p className="text-[9px] font-black leading-tight text-primary-dark">{headline}</p>
            </div>
            {description && (
              <div className="rounded-2xl border border-white/12 bg-black/26 px-3 py-2 shadow-sm backdrop-blur-[1px]">
                <p className="text-[7px] font-semibold leading-snug text-white/92">{description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
function renderImageResultCard(title, image, preview) {
  return (
    <div className="rounded-2xl border border-border bg-surface-light p-4">
      <div className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        {title}
      </div>
      {image?.imageUrl ? (
        <div className="space-y-3">
          <img
            src={image.imageUrl}
            alt={image.heading || title}
            className="w-full rounded-xl border border-border object-cover"
          />
          {preview?.type === 'blog' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted">오버레이 적용 결과</p>
              {renderBlogOverlayPreview(image, preview)}
            </div>
          )}
          {preview?.type === 'instagram' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted">오버레이 적용 결과</p>
              {renderInstagramOverlayPreview(image, preview)}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted">?대?吏 ?ㅻ뵫</p>
            <p className="text-sm font-medium text-text">{image.heading || '?놁쓬'}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">?대?吏 寃곌낵媛 ?놁뒿?덈떎.</p>
      )}
    </div>
  )
}

export default function PromptLabPage() {
  const [sourceText, setSourceText] = useState(DEFAULT_SOURCE_TEXT)
  const [summaryKeywords, setSummaryKeywords] = useState('')
  const [summaryExtra, setSummaryExtra] = useState('')
  const [summaryResults, setSummaryResults] = useState([])
  const [contentChannel, setContentChannel] = useState('blog')
  const [contentCommonExtra, setContentCommonExtra] = useState('')
  const [contentBlogExtra, setContentBlogExtra] = useState('')
  const [contentNewsletterExtra, setContentNewsletterExtra] = useState('')
  const [contentInstaExtra, setContentInstaExtra] = useState('')
  const [contentShortsExtra, setContentShortsExtra] = useState('')
  const [contentResults, setContentResults] = useState([])
  const [imageExtra, setImageExtra] = useState('')
  const [imageComparisonResults, setImageComparisonResults] = useState({
    blogStyles: [],
    blogColors: [],
    instagramStyles: [],
    instagramCardStyles: [],
  })
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [contentLoading, setContentLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedChannelLabel = useMemo(
    () => CHANNEL_OPTIONS.find((option) => option.value === contentChannel)?.label || '네이버 블로그',
    [contentChannel]
  )

  async function buildBaseAssets() {
    const baseSummary = await summarizeContent(sourceText, {
      style: 'auto',
      keywords: summaryKeywords,
      extra: summaryExtra,
    })

    const blogResult = await generateBlogContent(baseSummary, sourceText, '', {
      tone: 'auto',
      commonExtra: contentCommonExtra,
      blogExtra: contentBlogExtra,
      newsletterExtra: contentNewsletterExtra,
      instaExtra: contentInstaExtra,
      shortsExtra: contentShortsExtra,
    })

    const instagramResult = await generateInstagramContent(baseSummary, sourceText, '', {
      tone: 'auto',
      commonExtra: contentCommonExtra,
      blogExtra: contentBlogExtra,
      newsletterExtra: contentNewsletterExtra,
      instaExtra: contentInstaExtra,
      shortsExtra: contentShortsExtra,
    })

    return { baseSummary, blogResult, instagramResult }
  }

  async function runSummaryComparison() {
    if (!sourceText.trim()) {
      setError('비교할 원문을 입력해주세요.')
      return
    }

    setSummaryLoading(true)
    setError('')

    try {
      const results = await Promise.all(
        SUMMARY_STYLE_OPTIONS.map(async (option) => ({
          key: option.value,
          label: option.label,
          result: await summarizeContent(sourceText, {
            style: option.value,
            keywords: summaryKeywords,
            extra: summaryExtra,
          }),
        }))
      )
      setSummaryResults(results)
    } catch (runError) {
      setError(runError.message || '요약 스타일 비교를 실행하지 못했습니다.')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function runToneComparison() {
    if (!sourceText.trim()) {
      setError('비교할 원문을 입력해주세요.')
      return
    }

    setContentLoading(true)
    setError('')

    try {
      const baseSummary = await summarizeContent(sourceText, {
        style: 'auto',
        keywords: summaryKeywords,
        extra: summaryExtra,
      })

      const generatorMap = {
        blog: generateBlogContent,
        newsletter: generateNewsletterContent,
        instagram: generateInstagramContent,
        shorts: generateShortsScript,
      }

      const contentOptions = {
        commonExtra: contentCommonExtra,
        blogExtra: contentBlogExtra,
        newsletterExtra: contentNewsletterExtra,
        instaExtra: contentInstaExtra,
        shortsExtra: contentShortsExtra,
      }

      const generator = generatorMap[contentChannel]
      const results = await Promise.all(
        TONE_OPTIONS.map(async (option) => ({
          key: option.value,
          label: option.label,
          result: await generator(baseSummary, sourceText, '', {
            ...contentOptions,
            tone: option.value,
          }),
        }))
      )
      setContentResults(results)
    } catch (runError) {
      setError(runError.message || '콘텐츠 어조 비교를 실행하지 못했습니다.')
    } finally {
      setContentLoading(false)
    }
  }

  async function runImageComparison() {
    if (!sourceText.trim()) {
      setError('비교할 원문을 입력해주세요.')
      return
    }

    setImageLoading(true)
    setError('')

    try {
      const { blogResult, instagramResult } = await buildBaseAssets()
      const firstBlogSection = (blogResult?.sections || []).slice(0, 1)
      const firstInstagramCard = (instagramResult?.cardTopics || []).slice(0, 1)

      const [blogStyleResults, blogColorResults, instagramStyleResults, instagramCardStyleResults] =
        await Promise.all([
          Promise.all(
            IMAGE_STYLE_OPTIONS.map(async (option) => ({
              key: option.value,
              label: option.label,
              preview: firstBlogSection.length
                ? {
                    type: 'blog',
                    heading: firstBlogSection[0]?.heading || '',
                    keyPhrase: firstBlogSection[0]?.keyPhrase || '',
                    content: firstBlogSection[0]?.content || '',
                  }
                : null,
              image: firstBlogSection.length
                ? (await generateBlogImages(firstBlogSection, {
                    imageStyle: option.value,
                    mainColor: 'auto',
                    extra: imageExtra,
                  }))?.[0] || null
                : null,
            }))
          ),
          Promise.all(
            MAIN_COLOR_OPTIONS.map(async (option) => ({
              key: option.value,
              label: option.label,
              preview: firstBlogSection.length
                ? {
                    type: 'blog',
                    heading: firstBlogSection[0]?.heading || '',
                    keyPhrase: firstBlogSection[0]?.keyPhrase || '',
                    content: firstBlogSection[0]?.content || '',
                  }
                : null,
              image: firstBlogSection.length
                ? (await generateBlogImages(firstBlogSection, {
                    imageStyle: 'pastel',
                    mainColor: option.value,
                    extra: imageExtra,
                  }))?.[0] || null
                : null,
            }))
          ),
          Promise.all(
            IMAGE_STYLE_OPTIONS.map(async (option) => ({
              key: option.value,
              label: option.label,
              preview: firstInstagramCard.length
                ? {
                    type: 'instagram',
                    cardNumber: firstInstagramCard[0]?.cardNumber || firstInstagramCard[0]?.card_number || 1,
                    headline: firstInstagramCard[0]?.headline || firstInstagramCard[0]?.title || '',
                    content: firstInstagramCard[0]?.content || firstInstagramCard[0]?.subtitle || '',
                    dataPoint: firstInstagramCard[0]?.dataPoint || '',
                    cardStyle: 'background-text',
                  }
                : null,
              image: firstInstagramCard.length
                ? (await generateInstagramImages(firstInstagramCard, {
                    imageStyle: option.value,
                    instagramCardStyle: 'background-text',
                    extra: imageExtra,
                  }))?.[0] || null
                : null,
            }))
          ),
          Promise.all(
            INSTAGRAM_CARD_STYLE_COMPARE_OPTIONS.map(async (option) => ({
              key: option.value,
              label: option.label,
              preview: firstInstagramCard.length
                ? {
                    type: 'instagram',
                    cardNumber: firstInstagramCard[0]?.cardNumber || firstInstagramCard[0]?.card_number || 1,
                    headline: firstInstagramCard[0]?.headline || firstInstagramCard[0]?.title || '',
                    content: firstInstagramCard[0]?.content || firstInstagramCard[0]?.subtitle || '',
                    dataPoint: firstInstagramCard[0]?.dataPoint || '',
                    cardStyle: option.value,
                  }
                : null,
              image: firstInstagramCard.length
                ? (await generateInstagramImages(firstInstagramCard, {
                    imageStyle: 'pastel',
                    instagramCardStyle: option.value,
                    extra: imageExtra,
                  }))?.[0] || null
                : null,
            }))
          ),
        ])

      setImageComparisonResults({
        blogStyles: blogStyleResults,
        blogColors: blogColorResults,
        instagramStyles: instagramStyleResults,
        instagramCardStyles: instagramCardStyleResults,
      })
    } catch (runError) {
      setError(runError.message || '이미지 생성 비교를 실행하지 못했습니다.')
    } finally {
      setImageLoading(false)
    }
  }

  function resetAll() {
    setSourceText(DEFAULT_SOURCE_TEXT)
    setSummaryKeywords('')
    setSummaryExtra('')
    setContentCommonExtra('')
    setContentBlogExtra('')
    setContentNewsletterExtra('')
    setContentInstaExtra('')
    setContentShortsExtra('')
    setImageExtra('')
    setSummaryResults([])
    setContentResults([])
    setImageComparisonResults({
      blogStyles: [],
      blogColors: [],
      instagramStyles: [],
      instagramCardStyles: [],
    })
    setError('')
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Beaker size={12} />
              프롬프트 비교 실험실
            </div>
            <h1 className="text-2xl font-bold text-text">선택지별 결과를 한 화면에서 비교하세요</h1>
            <p className="max-w-3xl text-sm leading-6 text-text-muted">
              실제 생성 함수를 호출해 요약 스타일, 콘텐츠 어조, Step 4 이미지 생성 선택지 결과를 비교합니다.
              이미지 비교는 블로그 첫 섹션과 인스타 첫 카드 기준으로 각 선택지 결과를 나란히 보여줍니다.
            </p>
          </div>
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface"
          >
            <RefreshCw size={14} />
            실험 초기화
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <h2 className="text-lg font-semibold text-text">비교할 원문</h2>
            </div>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              className="min-h-[260px] w-full rounded-xl border border-border bg-surface-light px-4 py-3 text-sm leading-6 text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              placeholder="여기에 비교할 원문을 붙여 넣으세요."
            />
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">요약 스타일 비교</h2>
                <p className="mt-1 text-sm text-text-muted">자동, 데이터 중심, 스토리텔링, 비교 분석 결과를 한 번에 확인합니다.</p>
              </div>
              <button
                onClick={runSummaryComparison}
                disabled={summaryLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {summaryLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                스타일 비교 실행
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">강조 키워드</label>
                <input
                  value={summaryKeywords}
                  onChange={(event) => setSummaryKeywords(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  placeholder="예: 교육 성과, 학습 지속률"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">추가 지시사항</label>
                <input
                  value={summaryExtra}
                  onChange={(event) => setSummaryExtra(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  placeholder="예: 학부모 관점으로 정리"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">콘텐츠 어조 비교</h2>
                <p className="mt-1 text-sm text-text-muted">{selectedChannelLabel} 결과를 선택한 어조별로 비교합니다.</p>
              </div>
              <button
                onClick={runToneComparison}
                disabled={contentLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {contentLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                어조 비교 실행
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">비교 채널</label>
                <select
                  value={contentChannel}
                  onChange={(event) => setContentChannel(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">공통 추가 지시</label>
                <input
                  value={contentCommonExtra}
                  onChange={(event) => setContentCommonExtra(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  placeholder="예: 숫자를 더 강조해줘"
                />
              </div>

              {contentChannel === 'blog' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-text">블로그 추가 지시</label>
                  <input
                    value={contentBlogExtra}
                    onChange={(event) => setContentBlogExtra(event.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    placeholder="예: SEO 키워드를 제목 앞쪽에 배치"
                  />
                </div>
              )}

              {contentChannel === 'newsletter' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-text">뉴스레터 추가 지시</label>
                  <input
                    value={contentNewsletterExtra}
                    onChange={(event) => setContentNewsletterExtra(event.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    placeholder="예: 구독자에게 바로 행동을 유도해줘"
                  />
                </div>
              )}

              {contentChannel === 'instagram' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-text">인스타그램 추가 지시</label>
                  <input
                    value={contentInstaExtra}
                    onChange={(event) => setContentInstaExtra(event.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    placeholder="예: 저장을 유도하는 문구를 더 강조해줘"
                  />
                </div>
              )}

              {contentChannel === 'shorts' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-text">숏츠 추가 지시</label>
                  <input
                    value={contentShortsExtra}
                    onChange={(event) => setContentShortsExtra(event.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    placeholder="예: 첫 3초 훅을 더 강하게 만들어줘"
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text">Step 4 이미지 생성 비교</h2>
                <p className="mt-1 text-sm text-text-muted">
                  블로그는 이미지 스타일과 메인 컬러를, 인스타는 이미지 스타일과 카드 스타일을 각각 비교합니다.
                </p>
              </div>
              <button
                onClick={runImageComparison}
                disabled={imageLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {imageLoading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                이미지 비교 실행
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">이미지 추가 지시사항</label>
              <input
                value={imageExtra}
                onChange={(event) => setImageExtra(event.target.value)}
                className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                placeholder="예: 교육 현장 분위기를 더 밝게 보여줘"
              />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">요약 스타일 결과</h2>
              {summaryLoading && <Loader2 size={16} className="animate-spin text-primary" />}
            </div>
            <div className="space-y-4">
              {summaryResults.length === 0 ? (
                <p className="text-sm text-text-muted">아직 비교 결과가 없습니다. 스타일 비교 실행을 눌러주세요.</p>
              ) : (
                summaryResults.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-border bg-surface-light p-4">
                    <div className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {item.label}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-text-muted">제목</p>
                        <p className="text-sm font-semibold text-text">{item.result?.title}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted">요약</p>
                        <p className="text-sm leading-6 text-text">{item.result?.summary}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted">핵심 인사이트</p>
                        <ul className="space-y-1">
                          {(item.result?.insights || []).slice(0, 3).map((insight, index) => (
                            <li key={`${item.key}-insight-${index}`} className="text-sm leading-6 text-text">
                              • {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">{selectedChannelLabel} 어조 결과</h2>
              {contentLoading && <Loader2 size={16} className="animate-spin text-primary" />}
            </div>
            <div className="space-y-4">
              {contentResults.length === 0 ? (
                <p className="text-sm text-text-muted">아직 비교 결과가 없습니다. 어조 비교 실행을 눌러주세요.</p>
              ) : (
                contentResults.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-border bg-surface-light p-4">
                    <div className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {item.label}
                    </div>
                    {renderContentResult(contentChannel, item.result)}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileImage size={16} className="text-primary" />
              <h2 className="text-lg font-semibold text-text">블로그 이미지 스타일 비교</h2>
            </div>
            {imageLoading && <Loader2 size={16} className="animate-spin text-primary" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {imageComparisonResults.blogStyles.length === 0 ? (
              <p className="text-sm text-text-muted xl:col-span-5">아직 이미지 비교 결과가 없습니다. 이미지 비교 실행을 눌러주세요.</p>
            ) : (
              imageComparisonResults.blogStyles.map((item) => renderImageResultCard(item.label, item.image, item.preview))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Beaker size={16} className="text-primary" />
              <h2 className="text-lg font-semibold text-text">블로그 메인 컬러 비교</h2>
            </div>
            {imageLoading && <Loader2 size={16} className="animate-spin text-primary" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {imageComparisonResults.blogColors.length === 0 ? (
              <p className="text-sm text-text-muted xl:col-span-5">아직 이미지 비교 결과가 없습니다.</p>
            ) : (
              imageComparisonResults.blogColors.map((item) => renderImageResultCard(item.label, item.image, item.preview))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileImage size={16} className="text-primary" />
              <h2 className="text-lg font-semibold text-text">인스타 이미지 스타일 비교</h2>
            </div>
            {imageLoading && <Loader2 size={16} className="animate-spin text-primary" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {imageComparisonResults.instagramStyles.length === 0 ? (
              <p className="text-sm text-text-muted xl:col-span-5">아직 이미지 비교 결과가 없습니다.</p>
            ) : (
              imageComparisonResults.instagramStyles.map((item) => renderImageResultCard(item.label, item.image, item.preview))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-primary" />
              <h2 className="text-lg font-semibold text-text">인스타 카드 스타일 비교</h2>
            </div>
            {imageLoading && <Loader2 size={16} className="animate-spin text-primary" />}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            {imageComparisonResults.instagramCardStyles.length === 0 ? (
              <p className="text-sm text-text-muted xl:col-span-2">아직 이미지 비교 결과가 없습니다.</p>
            ) : (
              imageComparisonResults.instagramCardStyles.map((item) => renderImageResultCard(item.label, item.image, item.preview))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

