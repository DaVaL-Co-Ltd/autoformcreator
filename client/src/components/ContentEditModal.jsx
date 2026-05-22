import { useMemo, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { composeBlogSectionBody } from '../utils/blogBodySanitizer'
import { isAutomaticBlogQuoteCategory } from '../utils/blogHeadingStyle'

// 채널별 결과물의 "본문 텍스트"만 수정하는 모달. 이미지·영상은 편집 대상이 아니다.
// content 는 채널 콘텐츠 객체(blogContent/newsletterContent/instagramContent/shortsScript).
// onSave(updatedContent) 로 수정본을 돌려준다.

const deepClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}))
  } catch {
    return {}
  }
}

// blog 채널은 콘텐츠 생성·결과 화면과 동일한 본문을 편집하도록,
// 도입부·섹션 본문을 결과 화면과 같은 표시 규칙(composeBlogSectionBody)으로 가공한다.
function buildInitialDraft(channel, content) {
  const cloned = deepClone(content)
  if (channel !== 'blog') return cloned

  const categoryId = cloned?.categoryInfo?.finalCategoryId || ''
  const prose = isAutomaticBlogQuoteCategory(categoryId)
  if (typeof cloned.introduction === 'string') {
    cloned.introduction = composeBlogSectionBody(cloned.introduction, { prose })
  }
  if (Array.isArray(cloned.sections)) {
    cloned.sections = cloned.sections.map((section) => {
      const next = { ...section }
      if (typeof next.content === 'string') {
        next.content = composeBlogSectionBody(next.content, { prose })
      }
      if (typeof next.body === 'string') {
        next.body = composeBlogSectionBody(next.body, { prose })
      }
      return next
    })
  }
  return cloned
}

const inputClass = 'w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-text focus:border-primary/50 focus:outline-none'
const labelClass = 'text-xs font-semibold text-text-muted'

function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <input
        type="text"
        className={inputClass}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function AreaField({ label, value, onChange, rows = 4, placeholder }) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <textarea
        className={`${inputClass} resize-y leading-6`}
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-3">
      {title && <p className="text-xs font-bold text-primary-light">{title}</p>}
      {children}
    </div>
  )
}

export default function ContentEditModal({ channel, channelLabel, content, onClose, onSave }) {
  const [draft, setDraft] = useState(() => buildInitialDraft(channel, content))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 해시태그 배열은 입력 편의를 위해 공백 구분 문자열로 따로 관리한다.
  const initialHashtags = useMemo(
    () => (Array.isArray(content?.hashtags) ? content.hashtags : []).join(' '),
    [content],
  )
  const [hashtagsText, setHashtagsText] = useState(initialHashtags)

  // 도입부를 실제 본문에 노출하는 카테고리(프로즈·강의/특강)에서만 도입부 필드를 보여준다.
  // 그래야 콘텐츠 생성·결과 화면과 수정 화면의 본문 구성이 동일하게 유지된다.
  const blogCategoryId = channel === 'blog' ? (content?.categoryInfo?.finalCategoryId || '') : ''
  const blogUsesIntroduction = isAutomaticBlogQuoteCategory(blogCategoryId) || blogCategoryId === 'lecture_event'

  const setTop = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const setArrayItem = (arrKey, index, itemKey, value) => setDraft((d) => ({
    ...d,
    [arrKey]: (Array.isArray(d[arrKey]) ? d[arrKey] : []).map((it, i) => (
      i === index ? { ...it, [itemKey]: value } : it
    )),
  }))
  const setStringArrayItem = (arrKey, index, value) => setDraft((d) => ({
    ...d,
    [arrKey]: (Array.isArray(d[arrKey]) ? d[arrKey] : []).map((v, i) => (i === index ? value : v)),
  }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = { ...draft }
      if (channel === 'instagram' || channel === 'shorts') {
        updated.hashtags = hashtagsText
          .split(/\s+/)
          .map((t) => t.trim().replace(/^#+/, ''))
          .filter(Boolean)
          .map((t) => `#${t}`)
      }
      await onSave(updated)
    } catch (err) {
      setError(err?.message || '저장에 실패했습니다.')
      setSaving(false)
    }
  }

  const renderBlog = () => (
    <>
      <TextField label="제목" value={draft.title} onChange={(v) => setTop('title', v)} />
      {blogUsesIntroduction && typeof draft.introduction === 'string' && draft.introduction.trim() && (
        <AreaField label="도입부" value={draft.introduction} rows={4} onChange={(v) => setTop('introduction', v)} />
      )}
      {(Array.isArray(draft.sections) ? draft.sections : []).map((section, i) => (
        <SectionCard key={i} title={`섹션 ${i + 1}`}>
          <TextField label="소제목" value={section.heading} onChange={(v) => setArrayItem('sections', i, 'heading', v)} />
          <AreaField label="본문" value={section.content ?? section.body} rows={6}
            onChange={(v) => setArrayItem('sections', i, section.content !== undefined || section.body === undefined ? 'content' : 'body', v)} />
        </SectionCard>
      ))}
    </>
  )

  const renderNewsletter = () => (
    <>
      <TextField label="메일 제목" value={draft.subject} onChange={(v) => setTop('subject', v)} />
      <TextField label="헤드라인" value={draft.headline} onChange={(v) => setTop('headline', v)} />
      <TextField label="프리헤더" value={draft.preheader} onChange={(v) => setTop('preheader', v)} />
      {Array.isArray(draft.keyPoints) && draft.keyPoints.length > 0 && (
        <SectionCard title="키포인트">
          {draft.keyPoints.map((point, i) => (
            <TextField key={i} label={`키포인트 ${i + 1}`} value={point}
              onChange={(v) => setStringArrayItem('keyPoints', i, v)} />
          ))}
        </SectionCard>
      )}
      <AreaField label="본문" value={draft.body} rows={10} onChange={(v) => setTop('body', v)} />
    </>
  )

  const renderInstagram = () => {
    const cardsKey = Array.isArray(draft.cardTopics) ? 'cardTopics' : (Array.isArray(draft.cards) ? 'cards' : null)
    const cards = cardsKey ? draft[cardsKey] : []
    const cardTextKeys = ['title', 'headline', 'subtitle', 'dataPoint', 'content', 'summary']
    return (
      <>
        <AreaField label="캡션" value={draft.caption ?? draft.body} rows={6}
          onChange={(v) => setTop(draft.caption !== undefined || draft.body === undefined ? 'caption' : 'body', v)} />
        {cards.map((card, i) => (
          <SectionCard key={i} title={`카드 ${card.cardNumber || i + 1}`}>
            {cardTextKeys
              .filter((k) => typeof card[k] === 'string' && card[k].trim())
              .map((k) => (
                <AreaField key={k} label={k} value={card[k]} rows={k === 'content' || k === 'summary' ? 4 : 2}
                  onChange={(v) => setArrayItem(cardsKey, i, k, v)} />
              ))}
            {Array.isArray(card.bullets) && card.bullets.map((bullet, bi) => (
              <TextField key={`b${bi}`} label={`불릿 ${bi + 1}`} value={bullet}
                onChange={(v) => setDraft((d) => ({
                  ...d,
                  [cardsKey]: d[cardsKey].map((c, ci) => (ci === i
                    ? { ...c, bullets: c.bullets.map((bv, bvi) => (bvi === bi ? v : bv)) }
                    : c)),
                }))} />
            ))}
          </SectionCard>
        ))}
        <TextField label="해시태그 (공백으로 구분)" value={hashtagsText} onChange={setHashtagsText} placeholder="#태그1 #태그2" />
      </>
    )
  }

  const renderShorts = () => (
    <>
      <TextField label="제목" value={draft.title} onChange={(v) => setTop('title', v)} />
      {(draft.uploadTitle !== undefined) && (
        <TextField label="업로드 제목" value={draft.uploadTitle} onChange={(v) => setTop('uploadTitle', v)} />
      )}
      <AreaField label="오프닝 훅" value={draft.hook} rows={2} onChange={(v) => setTop('hook', v)} />
      {(Array.isArray(draft.scenes) ? draft.scenes : []).map((scene, i) => (
        <SectionCard key={i} title={`씬 ${scene.sceneNumber || i + 1}`}>
          <AreaField label="나레이션" value={scene.narration} rows={3}
            onChange={(v) => setArrayItem('scenes', i, 'narration', v)} />
          {scene.textOverlay !== undefined && (
            <TextField label="자막" value={scene.textOverlay}
              onChange={(v) => setArrayItem('scenes', i, 'textOverlay', v)} />
          )}
        </SectionCard>
      ))}
      <AreaField label="마무리 문구 (CTA)" value={draft.cta} rows={2} onChange={(v) => setTop('cta', v)} />
      {draft.uploadDescription !== undefined && (
        <AreaField label="업로드 설명" value={draft.uploadDescription} rows={5}
          onChange={(v) => setTop('uploadDescription', v)} />
      )}
      <TextField label="해시태그 (공백으로 구분)" value={hashtagsText} onChange={setHashtagsText} placeholder="#태그1 #태그2" />
    </>
  )

  const body = {
    blog: renderBlog,
    newsletter: renderNewsletter,
    instagram: renderInstagram,
    shorts: renderShorts,
  }[channel]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-2xl max-h-[85vh] flex-col rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-text">{channelLabel || '콘텐츠'} 본문 수정</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-light hover:text-text disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {body ? body() : <p className="text-sm text-text-muted">수정할 수 있는 콘텐츠가 없습니다.</p>}
          <p className="text-xs text-text-muted">이미지·영상은 이 화면에서 수정할 수 없습니다. 본문 텍스트만 변경됩니다.</p>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-text disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
