import { useMemo, useState } from 'react'
import { AlertCircle, Beaker, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { summarizeContent } from '../services/gemini'
import {
  generateBlogContent,
  generateInstagramContent,
  generateNewsletterContent,
  generateShortsScript,
} from '../services/gemini-content'

const DEFAULT_SOURCE_TEXT = `2026년 디지털 교육 전환 보고서

초중고 디지털 학습 플랫폼 도입률은 78.4%로 집계됐고, 대학 및 평생교육기관의 LMS 활용률은 83.1%까지 확대됐다.
개인화 학습을 적용한 수업에서는 과제 완수율이 26.8% 상승했고, 실시간 피드백을 제공한 경우 학습 지속률은 18.5% 높아졌다.
AI 튜터를 활용한 수업 만족도는 91.2점으로 나타났고, 마이크로러닝 기반 콘텐츠 운영 비율은 58.9%를 기록했다.
교육 기관들은 실시간 수업과 비동기 학습을 병행하는 혼합형 수업 모델을 표준 운영 방식으로 채택하고 있으며, 교사 지원형 자동 채점 및 피드백 도구 도입도 빠르게 늘고 있다.`

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
  { value: 'humorous', label: '유머러스' },
  { value: 'formal', label: '진지한' },
]

const CHANNEL_OPTIONS = [
  { value: 'blog', label: '네이버 블로그' },
  { value: 'newsletter', label: '뉴스레터' },
  { value: 'instagram', label: '인스타그램' },
  { value: 'shorts', label: '유튜브 쇼츠' },
]

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
        <p className="text-xs font-medium text-text-muted">씬 미리보기</p>
        <div className="space-y-2">
          {(result.scenes || []).slice(0, 3).map((scene, index) => (
            <div key={`${scene.sceneNumber}-${index}`} className="rounded-lg border border-border bg-surface-light p-3">
              <p className="text-xs font-semibold text-text-muted">씬 {scene.sceneNumber}</p>
              <p className="mt-1 text-sm text-text leading-6">{scene.narration}</p>
            </div>
          ))}
        </div>
      </div>
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
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [contentLoading, setContentLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedChannelLabel = useMemo(
    () => CHANNEL_OPTIONS.find((option) => option.value === contentChannel)?.label || '네이버 블로그',
    [contentChannel]
  )

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
      setError(runError.message || '요약 스타일 비교에 실패했습니다.')
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
      setError(runError.message || '콘텐츠 어조 비교에 실패했습니다.')
    } finally {
      setContentLoading(false)
    }
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
            <h1 className="text-2xl font-bold text-text">선택지별 결과를 같은 화면에서 비교하세요</h1>
            <p className="max-w-3xl text-sm leading-6 text-text-muted">
              실제 생성 함수로 요약 스타일과 콘텐츠 어조를 각각 실행해, 프롬프트 선택값이 결과에 어떻게 반영되는지 바로 확인할 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => {
              setSourceText(DEFAULT_SOURCE_TEXT)
              setSummaryKeywords('')
              setSummaryExtra('')
              setContentCommonExtra('')
              setContentBlogExtra('')
              setContentNewsletterExtra('')
              setContentInstaExtra('')
              setContentShortsExtra('')
              setSummaryResults([])
              setContentResults([])
              setError('')
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface"
          >
            <RefreshCw size={14} />
            샘플로 초기화
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
              <h2 className="text-lg font-semibold text-text">비교용 원문</h2>
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
                <p className="mt-1 text-sm text-text-muted">{selectedChannelLabel} 결과를 자동, 친근한, 전문적인, 유머러스, 진지한 어조로 비교합니다.</p>
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
                    placeholder="예: 저장 유도 문구를 더 강하게 넣어줘"
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
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">요약 스타일 결과</h2>
              {summaryLoading && <Loader2 size={16} className="animate-spin text-primary" />}
            </div>
            <div className="space-y-4">
              {summaryResults.length === 0 ? (
                <p className="text-sm text-text-muted">아직 비교 결과가 없습니다. “스타일 비교 실행”을 눌러주세요.</p>
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
                <p className="text-sm text-text-muted">아직 비교 결과가 없습니다. “어조 비교 실행”을 눌러주세요.</p>
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
    </div>
  )
}
