import { useState } from 'react'
import { Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { summarizeContent } from '../services/gemini'
import { generateBlogContent } from '../services/gemini-content'
import KnowledgeInsightCard from '../components/KnowledgeInsightCard'

const SAMPLE_TEXT = `뇌과학 연구는 공부할 때 뇌 구조가 실제로 변한다는 사실을 보여줍니다.
신경가소성(neuroplasticity)이라는 개념인데요, 이는 뇌가 평생에 걸쳐 변할 수 있다는 뜻입니다.
예를 들어, 저글링 연습을 꾸준히 하면 뇌의 회색질이 증가한다는 연구(Draganski et al., 2004)가 있습니다.
런던 택시기사들의 경우에도 해마가 발달한다는 흥미로운 연구 결과(Maguire et al., 2000)가 있죠.

학습 동기는 뇌의 보상 회로와 깊이 연결되어 있습니다.
도파민이 분비되는 작은 성취 경험이 다음 학습으로 이어지는 추진력을 만들어 줍니다.
스스로 학습 목표를 잘게 쪼개고 단계별 성공을 자주 경험하도록 설계하면 학습이 훨씬 잘 유지됩니다.
반대로 한 번에 큰 목표만 두면 보상이 너무 멀어 동기가 빨리 식어버립니다.`

export default function KnowledgeCardsTestPage() {
  const [sourceText, setSourceText] = useState(SAMPLE_TEXT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [blogContent, setBlogContent] = useState(null)
  const [rawJson, setRawJson] = useState('')

  const runTest = async () => {
    if (!sourceText.trim()) {
      setError('테스트할 본문을 입력하세요.')
      return
    }
    setLoading(true)
    setError('')
    setBlogContent(null)
    setRawJson('')
    try {
      const summary = await summarizeContent(sourceText)
      const blog = await generateBlogContent(summary, sourceText, '', {
        blogCategoryMode: 'manual',
        blogCategoryId: 'knowledge_insight',
      })
      setBlogContent(blog)
      setRawJson(JSON.stringify(blog?.sections || [], null, 2))
    } catch (err) {
      setError(err?.message || '테스트 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const sections = Array.isArray(blogContent?.sections) ? blogContent.sections : []

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">지식 공유(카드뉴스) 테스트</h1>
        <p className="text-sm text-gray-600">
          본문을 붙여 넣고 테스트 버튼을 누르면 AI가 카드 헤드라인과 불릿 요약을 생성합니다.
          knowledge_insight 카테고리를 강제 적용한 결과만 보여줍니다.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <label className="block text-sm font-semibold text-gray-700">테스트 본문</label>
        <textarea
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          className="w-full min-h-[200px] border border-gray-300 rounded-lg p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="여기에 블로그 본문을 붙여넣으세요."
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? '생성 중...' : '카드 요약 생성'}
          </button>
          <button
            type="button"
            onClick={() => setSourceText(SAMPLE_TEXT)}
            className="text-sm text-gray-600 underline"
            disabled={loading}
          >
            샘플 본문 다시 채우기
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {sections.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">결과 카드 미리보기</h2>
          <p className="text-sm text-gray-600">
            cardSummary 필드(헤드라인 + 압축 불릿)만 사용해서 렌더링합니다. content(본문) 필드는 JSON 데이터에 그대로 보존되며 네이버 업로드 시 본문으로 사용됩니다.
          </p>

          {blogContent?.title && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-10">
              <h3 className="text-4xl font-black leading-tight text-gray-900">
                {blogContent.title}
              </h3>
            </div>
          )}

          <div className="grid gap-6">
            {sections.map((section, index) => {
              const cardSummary = section?.cardSummary || {}
              const cardHeadline = String(cardSummary.headline || section?.heading || '').trim()
              const cardBullets = Array.isArray(cardSummary.bullets)
                ? cardSummary.bullets.map((line) => String(line || '').trim()).filter(Boolean)
                : []
              const cornerImageUrl = section?.imageUrl || section?.renderedImageUrl || section?.pngUrl || null
              return (
                <KnowledgeInsightCard
                  key={`card-${index}`}
                  index={index}
                  headline={cardHeadline}
                  bullets={cardBullets}
                  imageUrl={cornerImageUrl}
                />
              )
            })}
          </div>

          <details className="mt-6 text-xs text-gray-500">
            <summary className="cursor-pointer">원본 섹션 데이터 펼쳐보기 (content 포함)</summary>
            <div className="mt-2 space-y-3">
              {sections.map((section, index) => (
                <pre
                  key={`raw-${index}`}
                  className="whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-lg p-3"
                >
                  [Section {index + 1}]
                  {'\n'}heading: {section?.heading || '(없음)'}
                  {'\n'}keyPhrase: {section?.keyPhrase || '(없음)'}
                  {'\n\n'}content:
                  {'\n'}{section?.content || '(없음)'}
                  {section?.cardSummary && (
                    `\n\ncardSummary:\n${JSON.stringify(section.cardSummary, null, 2)}`
                  )}
                </pre>
              ))}
            </div>
          </details>
        </section>
      )}

      {rawJson && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">원본 sections JSON</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-2xl p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {rawJson}
          </pre>
        </section>
      )}
    </div>
  )
}
