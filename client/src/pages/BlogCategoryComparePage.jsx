import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckSquare, Loader2, Sparkles } from 'lucide-react'
import { summarizeContent } from '../services/gemini'
import { generateBlogContent } from '../services/gemini-content'
import { getBlogImageStyleLabel, getOrderedBlogCategoryProfiles } from '../services/blogCategoryProfile'

const DEFAULT_SOURCE_TEXT = `2027학년도 대입 준비 환경은 빠르게 바뀌고 있습니다.
학생부 종합전형에서는 전공 적합성과 활동의 연결성이 더 중요해졌고, 수시 지원 학생들은 자기소개서 대신 학교생활기록부와 면접 준비에 더 많은 시간을 쓰고 있습니다.
상위권 대학 다수는 면접 비중을 유지하거나 확대하고 있으며, 일부 대학은 제시문 기반 면접과 서류 확인 면접을 병행합니다.
한편 학부모들은 변화된 전형 구조를 이해하는 데 어려움을 느끼고 있고, 학생들은 내신 관리와 수능 최저, 비교과 정리 사이에서 우선순위를 잡지 못하는 경우가 많습니다.
교육 현장에서는 대학별 평가 포인트를 미리 파악하고, 학년별로 준비 전략을 나눠 실행하는 것이 가장 중요하다는 조언이 이어지고 있습니다.`

const DEFAULT_SELECTED_CATEGORY_IDS = getOrderedBlogCategoryProfiles().map((profile) => profile.id)

function buildCategorySummary(result, profile) {
  const sections = Array.isArray(result?.sections) ? result.sections : []
  const firstSection = sections[0] || null
  const lastSection = sections[sections.length - 1] || null

  return {
    intro: firstSection?.content ? `${String(firstSection.content).slice(0, 110)}...` : '도입부 없음',
    structure: sections.length ? sections.map((section) => section.heading).join(' / ') : '섹션 없음',
    closing: lastSection?.content ? `${String(lastSection.content).slice(0, 90)}...` : '마무리 없음',
    cta: profile?.ctaLevel === 'high' ? '강한 행동 유도' : profile?.ctaLevel === 'medium' ? '중간 강도 행동 유도' : '정보 중심 마무리',
  }
}

function normalizeError(error) {
  if (!error) return '알 수 없는 오류가 발생했습니다.'
  if (typeof error === 'string') return error
  return error.message || '알 수 없는 오류가 발생했습니다.'
}

export default function BlogCategoryComparePage() {
  const profiles = useMemo(() => getOrderedBlogCategoryProfiles(), [])
  const [sourceText, setSourceText] = useState(DEFAULT_SOURCE_TEXT)
  const [summaryExtra, setSummaryExtra] = useState('')
  const [blogExtra, setBlogExtra] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(DEFAULT_SELECTED_CATEGORY_IDS)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summarySnapshot, setSummarySnapshot] = useState(null)

  const selectedCount = selectedCategoryIds.length

  const sortedSelectedProfiles = useMemo(
    () => profiles.filter((profile) => selectedCategoryIds.includes(profile.id)),
    [profiles, selectedCategoryIds],
  )

  function toggleCategory(categoryId) {
    setSelectedCategoryIds((current) => (
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    ))
  }

  async function runComparison() {
    if (!String(sourceText).trim()) {
      setError('비교할 원문을 먼저 입력해주세요.')
      return
    }
    if (!selectedCategoryIds.length) {
      setError('비교할 블로그 카테고리를 하나 이상 선택해주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const summary = await summarizeContent(sourceText, {
        style: 'auto',
        extra: summaryExtra,
      })

      setSummarySnapshot(summary)

      const settled = await Promise.allSettled(
        selectedCategoryIds.map(async (categoryId) => {
          const profile = profiles.find((item) => item.id === categoryId)
          const blog = await generateBlogContent(summary, sourceText, '', {
            tone: 'auto',
            blogCategoryMode: 'manual',
            blogCategoryId: categoryId,
            blogExtra,
          })

          return {
            categoryId,
            profile,
            blog,
            summary: buildCategorySummary(blog, profile),
          }
        }),
      )

      const nextResults = settled.map((item, index) => {
        const categoryId = selectedCategoryIds[index]
        const profile = profiles.find((entry) => entry.id === categoryId)

        if (item.status === 'fulfilled') {
          return {
            status: 'success',
            categoryId,
            profile,
            ...item.value,
          }
        }

        return {
          status: 'error',
          categoryId,
          profile,
          error: normalizeError(item.reason),
        }
      })

      setResults(nextResults)
    } catch (runError) {
      setResults([])
      setError(normalizeError(runError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,_rgba(32,86,157,0.14),_transparent_38%),linear-gradient(135deg,_#ffffff_0%,_#f4f7fb_42%,_#eef3f8_100%)] shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
              <Sparkles size={12} />
              블로그 카테고리 비교 실험실
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-text sm:text-3xl">
                같은 원문이 카테고리에 따라 어떻게 달라지는지 한 화면에서 비교합니다
              </h1>
              <p className="text-sm leading-6 text-text-muted sm:text-[15px]">
                자동 추천이 아니라 수동 카테고리 규칙을 강제로 적용해, 제목 톤과 도입부 구조, CTA 강도까지
                어떻게 달라지는지 바로 체감할 수 있게 구성했습니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/prompt-lab"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-sm font-medium text-text-muted transition-all hover:bg-surface-light hover:text-text"
            >
              <ArrowLeft size={14} />
              프롬프트 실험실로 돌아가기
            </Link>
            <button
              onClick={runComparison}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
              카테고리 비교 실행
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-text">비교할 원문</h2>
            <p className="text-sm leading-6 text-text-muted">
              보고서, 칼럼, 강연 안내, 책 소개 등 어떤 원문이든 넣을 수 있습니다.
            </p>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="min-h-[280px] w-full rounded-2xl border border-border bg-surface-light px-4 py-3 text-sm leading-6 text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            placeholder="카테고리별 결과를 비교할 원문을 붙여 넣으세요."
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">요약 단계 추가 지시</label>
              <input
                value={summaryExtra}
                onChange={(event) => setSummaryExtra(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                placeholder="예: 학부모가 이해하기 쉽게 정리"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">블로그 공통 추가 지시</label>
              <input
                value={blogExtra}
                onChange={(event) => setBlogExtra(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-light px-3 py-2 text-sm text-text outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                placeholder="예: 문장 길이를 조금 더 짧게"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text">비교할 카테고리</h3>
                <p className="text-xs text-text-muted">{selectedCount}개 선택됨</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategoryIds(DEFAULT_SELECTED_CATEGORY_IDS)}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted transition-all hover:bg-surface-light hover:text-text"
                >
                  전체 선택
                </button>
                <button
                  onClick={() => setSelectedCategoryIds([])}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted transition-all hover:bg-surface-light hover:text-text"
                >
                  전체 해제
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {profiles.map((profile) => {
                const selected = selectedCategoryIds.includes(profile.id)

                return (
                  <button
                    key={profile.id}
                    onClick={() => toggleCategory(profile.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-primary/40 bg-primary/8 shadow-sm'
                        : 'border-border bg-surface-light hover:border-primary/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-text">{profile.label}</p>
                        <p className="text-xs leading-5 text-text-muted">{profile.goal}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selected ? 'bg-primary text-white' : 'bg-white text-text-muted'}`}>
                        {selected ? '선택됨' : '선택'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-text-muted">
                        CTA {profile.ctaLevel}
                      </span>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-text-muted">
                        이미지 {getBlogImageStyleLabel(profile.recommendedImageStyle)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-text">차이 요약</h2>
            <p className="text-sm leading-6 text-text-muted">
              생성 후에는 제목 톤, 도입부, 섹션 구조, CTA 강도를 먼저 이 영역에서 훑어보면 차이가 가장 빨리 보입니다.
            </p>
          </div>

          {summarySnapshot ? (
            <div className="rounded-2xl border border-border bg-surface-light p-4">
              <p className="text-xs font-medium text-text-muted">공통 요약 기준</p>
              <p className="mt-1 text-base font-semibold text-text">{summarySnapshot.title}</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">{summarySnapshot.summary}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface-light/60 p-4 text-sm text-text-muted">
              아직 공통 요약이 없습니다. 비교 실행 후 결과 기준점이 표시됩니다.
            </div>
          )}

          <div className="space-y-3">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface-light/60 p-4 text-sm text-text-muted">
                아직 비교 결과가 없습니다. 카테고리를 선택하고 실행해 주세요.
              </div>
            ) : (
              results.map((item) => (
                <div key={item.categoryId} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{item.profile?.label || item.categoryId}</p>
                      <p className="mt-1 text-xs text-text-muted">{item.profile?.titlePattern}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-danger/10 text-danger'}`}>
                      {item.status === 'success' ? '생성 완료' : '실패'}
                    </span>
                  </div>

                  {item.status === 'success' ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-surface-light p-3">
                        <p className="text-[11px] font-semibold text-text-muted">제목 톤</p>
                        <p className="mt-1 text-sm font-semibold text-text">{item.blog?.title}</p>
                      </div>
                      <div className="rounded-2xl bg-surface-light p-3">
                        <p className="text-[11px] font-semibold text-text-muted">CTA 강도</p>
                        <p className="mt-1 text-sm text-text">{item.summary?.cta}</p>
                      </div>
                      <div className="rounded-2xl bg-surface-light p-3 sm:col-span-2">
                        <p className="text-[11px] font-semibold text-text-muted">도입부 톤</p>
                        <p className="mt-1 text-sm leading-6 text-text">{item.summary?.intro}</p>
                      </div>
                      <div className="rounded-2xl bg-surface-light p-3 sm:col-span-2">
                        <p className="text-[11px] font-semibold text-text-muted">섹션 구조</p>
                        <p className="mt-1 text-sm leading-6 text-text">{item.summary?.structure}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-danger">{item.error}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">카테고리별 결과 카드</h2>
            <p className="mt-1 text-sm text-text-muted">
              각 카드에서 제목, 메타 설명, 섹션 설계, 태그를 같이 보면 카테고리 규칙이 실제 결과에 어떻게 반영됐는지 명확해집니다.
            </p>
          </div>
          {loading && <Loader2 size={18} className="animate-spin text-primary" />}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-light/60 p-5 text-sm text-text-muted xl:col-span-2">
              결과가 여기에 표시됩니다.
            </div>
          ) : (
            results.map((item) => (
              <article key={item.categoryId} className="overflow-hidden rounded-[26px] border border-border bg-white shadow-sm">
                <div className="border-b border-border bg-[linear-gradient(135deg,_rgba(32,86,157,0.08),_transparent_70%)] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {item.profile?.label || item.categoryId}
                      </div>
                      <h3 className="text-lg font-bold leading-snug text-text">
                        {item.blog?.title || '결과 없음'}
                      </h3>
                    </div>
                    <div className="space-y-2 text-right">
                      <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-text-muted shadow-sm">
                        이미지 {item.profile ? getBlogImageStyleLabel(item.profile.recommendedImageStyle) : '-'}
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-text-muted shadow-sm">
                        CTA {item.profile?.ctaLevel || '-'}
                      </div>
                    </div>
                  </div>
                  {item.blog?.metaDescription && (
                    <p className="mt-3 text-sm leading-6 text-text-muted">{item.blog.metaDescription}</p>
                  )}
                </div>

                <div className="space-y-5 p-5">
                  {item.status === 'error' ? (
                    <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
                      {item.error}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-surface-light p-4">
                          <p className="text-[11px] font-semibold text-text-muted">적용 목적</p>
                          <p className="mt-2 text-sm leading-6 text-text">{item.profile?.goal}</p>
                        </div>
                        <div className="rounded-2xl bg-surface-light p-4">
                          <p className="text-[11px] font-semibold text-text-muted">도입 방식</p>
                          <p className="mt-2 text-sm leading-6 text-text">{item.profile?.introPattern}</p>
                        </div>
                        <div className="rounded-2xl bg-surface-light p-4">
                          <p className="text-[11px] font-semibold text-text-muted">추천 구조</p>
                          <p className="mt-2 text-sm leading-6 text-text">{Array.isArray(item.profile?.bodyPattern) ? item.profile.bodyPattern.join(' / ') : '-'}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-text">섹션 미리보기</p>
                        <div className="mt-3 space-y-3">
                          {(item.blog?.sections || []).slice(0, 3).map((section, index) => (
                            <div key={`${item.categoryId}-${index}`} className="rounded-2xl border border-border bg-surface-light p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-text">{section.heading}</p>
                                  {section.keyPhrase && (
                                    <p className="mt-1 text-xs font-medium text-primary">{section.keyPhrase}</p>
                                  )}
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                                  섹션 {index + 1}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-text-muted">{section.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                        <div className="rounded-2xl bg-surface-light p-4">
                          <p className="text-[11px] font-semibold text-text-muted">마무리 톤</p>
                          <p className="mt-2 text-sm leading-6 text-text">{item.summary?.closing}</p>
                        </div>
                        <div className="rounded-2xl bg-surface-light p-4">
                          <p className="text-[11px] font-semibold text-text-muted">태그</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(item.blog?.tags || []).length > 0 ? (
                              item.blog.tags.map((tag) => (
                                <span key={`${item.categoryId}-${tag}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-text-muted">
                                  #{tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-text-muted">태그 없음</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">선택된 카테고리 가이드</h2>
            <p className="mt-1 text-sm text-text-muted">
              결과와 함께 카테고리 규칙 자체를 같이 보면 왜 다르게 생성됐는지 해석하기 쉽습니다.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {selectedCount}개 가이드
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {sortedSelectedProfiles.map((profile) => (
            <div key={profile.id} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">{profile.label}</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{profile.goal}</p>
                </div>
                <span className="rounded-full bg-surface-light px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                  {getBlogImageStyleLabel(profile.recommendedImageStyle)}
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm text-text-muted">
                <div>
                  <p className="text-[11px] font-semibold text-text-muted">제목 패턴</p>
                  <p className="mt-1 leading-6 text-text">{profile.titlePattern}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-text-muted">도입 방식</p>
                  <p className="mt-1 leading-6 text-text">{profile.introPattern}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-text-muted">프롬프트 포인트</p>
                  <ul className="mt-1 space-y-1">
                    {(profile.promptLines || []).map((line) => (
                      <li key={`${profile.id}-${line}`} className="leading-6 text-text">• {line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
