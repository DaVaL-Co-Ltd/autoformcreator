import { useState } from 'react'
import { Beaker, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { generateBlogImages } from '../services/cardImage'
import { renderBlogUploadImageDataUrl } from '../utils/uploadImageComposite'

const SAMPLE_TOPICS = [
  { id: 'math', theme: 'math', label: '수학', title: '피보나치 수열의 규칙' },
  { id: 'science', theme: 'science', label: '과학', title: '광합성의 에너지 전환' },
  { id: 'korean', theme: 'korean', label: '국어', title: '비문학 독해의 구조' },
  { id: 'social', theme: 'social', label: '사회', title: '시장 경제의 작동 원리' },
  { id: 'english', theme: 'english', label: '영어', title: '관계대명사의 쓰임' },
  { id: 'history', theme: 'history', label: '역사', title: '조선 후기의 변화' },
  { id: 'computing', theme: 'computing', label: '정보', title: '알고리즘이란 무엇일까' },
  { id: 'generic', theme: 'generic', label: '통합', title: '개념 정리를 잘하는 법' },
]

async function buildRenderedPreview(image, title) {
  if (!image?.imageUrl) return image

  const renderedImageUrl = await renderBlogUploadImageDataUrl({
    imageUrl: image.imageUrl,
    headline: title,
    description: '',
    variant: image.variant || 'poster-title',
    fontPreset: image.overlayFont || 'gothic',
  })

  return {
    ...image,
    renderedImageUrl,
    pngUrl: renderedImageUrl,
  }
}

export default function ConceptDigestImageLabPage() {
  const [results, setResults] = useState({})
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingId, setLoadingId] = useState('')
  const [error, setError] = useState('')
  const fontPreset = 'pretendard'

  const generateOne = async (sample) => {
    setLoadingId(sample.id)
    setError('')

    try {
      const section = {
        heading: sample.title,
        keyPhrase: sample.title,
        content: `${sample.label} 개념 정리 카드뉴스 테스트`,
      }

      const image = (await generateBlogImages([section], {
        categoryId: 'concept_digest',
        subjectTheme: sample.theme,
        imageStyle: 'pastel',
        mainColor: 'auto',
        textOverlay: 'with-text',
        overlayFont: fontPreset,
      }))?.[0] || null

      const rendered = await buildRenderedPreview(image, sample.title)

      setResults((prev) => ({
        ...prev,
        [sample.id]: rendered,
      }))
    } catch (err) {
      setError(err.message || '이미지 생성에 실패했습니다.')
    } finally {
      setLoadingId('')
    }
  }

  const generateAll = async () => {
    setLoadingAll(true)
    setError('')

    try {
      const nextResults = {}

      for (const sample of SAMPLE_TOPICS) {
        const section = {
          heading: sample.title,
          keyPhrase: sample.title,
          content: `${sample.label} 개념 정리 카드뉴스 테스트`,
        }

        const image = (await generateBlogImages([section], {
          categoryId: 'concept_digest',
          subjectTheme: sample.theme,
          imageStyle: 'pastel',
          mainColor: 'auto',
          textOverlay: 'with-text',
          overlayFont: fontPreset,
        }))?.[0] || null

        nextResults[sample.id] = await buildRenderedPreview(image, sample.title)
      }

      setResults(nextResults)
    } catch (err) {
      setError(err.message || '테스트 이미지를 생성하지 못했습니다.')
    } finally {
      setLoadingAll(false)
      setLoadingId('')
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Beaker size={12} />
              교과서 기본 개념 정리 image_keyword
            </div>
            <h1 className="text-2xl font-bold text-text">개념 정리 카드뉴스 이미지 테스트</h1>
            <p className="max-w-3xl text-sm leading-6 text-text-muted">
              주제별 대표 오브젝트를 직접 반영한 배경 위에 제목을 직접 구운 최종 결과만 확인합니다.
              화면 크기에 따라 달라질 수 있는 DOM 미리보기는 제외했습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-border bg-surface-light px-3 py-2 text-sm font-medium text-text-muted">
              제목 폰트: Pretendard Black
            </div>
            <button
              onClick={() => setResults({})}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface"
            >
              <RefreshCw size={14} />
              결과 초기화
            </button>

            <button
              onClick={generateAll}
              disabled={loadingAll}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAll ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              전체 생성
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {SAMPLE_TOPICS.map((sample) => {
          const image = results[sample.id]
          const isLoading = loadingAll || loadingId === sample.id

          return (
            <section key={sample.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm space-y-4">
              <div className="space-y-1">
                <div className="inline-flex rounded-full bg-surface-light px-2.5 py-1 text-xs font-medium text-text-muted">
                  {sample.label}
                </div>
                <h2 className="text-sm font-semibold leading-6 text-text">{sample.title}</h2>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-muted">이미지에 제목을 직접 구운 결과</p>
                  <div className="overflow-hidden rounded-xl border border-border bg-surface-light">
                    {image?.renderedImageUrl ? (
                      <img
                        src={image.renderedImageUrl}
                        alt={`${sample.label} 렌더링 이미지`}
                        className="block w-full"
                      />
                    ) : (
                      <div className="aspect-square flex items-center justify-center px-6 text-center text-sm leading-6 text-text-muted">
                        {isLoading ? '렌더링 중...' : '렌더링 결과가 아직 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-muted">
                  {image?.subjectTheme ? `theme: ${image.subjectTheme}` : 'theme: 대기 중'}
                </span>
                <button
                  onClick={() => generateOne(sample)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-primary/40 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  생성
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
