// HeyGen 영상 생성 테스트 페이지.
// 동완쌤·후라이쌤·다 제자 세 그룹 안의 9:16 룩들을 모두 펼쳐 표시하고,
// my voices 그리드에서 voice 를 골라 10초 분량 짧은 대본으로 테스트 영상을 만든다.
// 자막·합성·DB 저장 등 메인 파이프라인은 건너뛰고 raw HeyGen 영상만 확인한다.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Play, CheckCircle, Sparkles, ZoomIn, X } from 'lucide-react'
import { HEYGEN_AVATARS } from '../utils/heygenAvatars'
import { readApiResponse } from '../utils/apiResponse.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.headers || {}) } })
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// 표시할 그룹: avatarGroupId 가 있는 preset 들. 라벨은 HEYGEN_AVATARS 의 name 을 그대로 따라가
// 이름이 바뀌면 자동 반영된다.
const TEST_GROUPS = [
  { groupId: HEYGEN_AVATARS.dongwan_ssaem.avatarGroupId, label: HEYGEN_AVATARS.dongwan_ssaem.name, defaultVoiceId: HEYGEN_AVATARS.dongwan_ssaem.defaultVoiceId },
  { groupId: HEYGEN_AVATARS.fry_ssaem.avatarGroupId, label: HEYGEN_AVATARS.fry_ssaem.name, defaultVoiceId: HEYGEN_AVATARS.fry_ssaem.defaultVoiceId },
  { groupId: HEYGEN_AVATARS.dog_student.avatarGroupId, label: HEYGEN_AVATARS.dog_student.name, defaultVoiceId: HEYGEN_AVATARS.dog_student.defaultVoiceId },
]

const DEFAULT_TEST_SCRIPT = '안녕하세요, HeyGen 테스트 영상입니다. 약 10초 분량으로 음성과 입 모양이 잘 맞는지 확인해보세요.'

export default function HeygenTestPage() {
  const [groupLooks, setGroupLooks] = useState({}) // groupId → looks[]
  const [myVoices, setMyVoices] = useState([])
  const [selectedAvatar, setSelectedAvatar] = useState(null) // { lookId, groupLabel, preview, defaultVoiceId }
  const [selectedVoiceId, setSelectedVoiceId] = useState(null)
  // 아바타 그리드 카테고리 필터 — 동완쌤·후라이쌤·제자 중 하나만 표시.
  const [selectedCategory, setSelectedCategory] = useState('dongwan_ssaem')
  // 아바타 카드 확대 모달 — 돋보기 버튼 클릭 시 이미지 URL 을 담아 모달을 띄운다.
  const [lightboxImageUrl, setLightboxImageUrl] = useState(null)
  const [script, setScript] = useState(DEFAULT_TEST_SCRIPT)
  const [previewAudio, setPreviewAudio] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState('')

  // 그룹별 룩 fetch (각 그룹마다 1회).
  useEffect(() => {
    const missing = TEST_GROUPS.filter((g) => g.groupId && !groupLooks[g.groupId])
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map((g) =>
      apiFetch(`/api/heygen/avatar-group/${g.groupId}/looks`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => ({ groupId: g.groupId, looks: Array.isArray(data?.looks) ? data.looks : [] }))
        .catch(() => ({ groupId: g.groupId, looks: [] }))
    )).then((results) => {
      if (cancelled) return
      setGroupLooks((prev) => {
        const next = { ...prev }
        for (const { groupId, looks } of results) next[groupId] = looks
        return next
      })
    })
    return () => { cancelled = true }
  }, [groupLooks])

  // my voices 1회 fetch.
  useEffect(() => {
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
  }, [myVoices])

  // 그룹별 룩을 동완쌤·후라이쌤·제자 3개 카테고리로 분리. 가로(16:9) 룩까지 포함해 그룹 안 전체를 노출.
  const avatarCategories = useMemo(() => {
    const dongwan = []
    const fry = []
    const students = []
    for (const group of TEST_GROUPS) {
      const items = (groupLooks[group.groupId] || []).map((look) => ({
        key: `${group.groupId}:${look.id}`,
        lookId: look.id,
        groupLabel: group.label,
        preview: look.preview || null,
        defaultVoiceId: group.defaultVoiceId,
      }))
      if (group.groupId === HEYGEN_AVATARS.dongwan_ssaem.avatarGroupId) dongwan.push(...items)
      else if (group.groupId === HEYGEN_AVATARS.fry_ssaem.avatarGroupId) fry.push(...items)
      else students.push(...items)
    }
    return [
      { id: 'dongwan_ssaem', label: '동완쌤', items: dongwan },
      { id: 'fry_ssaem', label: '후라이쌤', items: fry },
      { id: 'students', label: '제자', items: students },
    ]
  }, [groupLooks])

  const playVoiceUrl = (url) => {
    if (!url) return
    try {
      if (previewAudio) { previewAudio.pause() }
      const audio = new Audio(url)
      setPreviewAudio(audio)
      audio.play().catch(() => {})
    } catch { /* 재생 실패 무시 */ }
  }

  const canGenerate = !!selectedAvatar && !!(selectedVoiceId || selectedAvatar?.defaultVoiceId) && script.trim().length > 0 && !generating

  const handleGenerate = async () => {
    if (!canGenerate) return
    setError('')
    setVideoUrl(null)
    setGenerating(true)
    setProgressMsg('영상 생성 요청 중...')
    try {
      const voiceId = selectedVoiceId || selectedAvatar.defaultVoiceId
      const body = {
        video_inputs: [{
          character: { type: 'talking_photo', talking_photo_id: selectedAvatar.lookId },
          voice: { type: 'text', input_text: script.trim(), voice_id: voiceId },
        }],
        dimension: { width: 720, height: 1280 },
      }
      const genRes = await apiFetch('/api/heygen/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const genData = await readApiResponse(genRes)
      if (!genRes.ok) throw new Error(genData?.error || `영상 생성 실패 (${genRes.status})`)
      const videoId = genData?.data?.video_id || genData?.video_id
      if (!videoId) throw new Error('video_id 를 받지 못했습니다.')
      setProgressMsg(`영상 렌더링 중... (id ${videoId.slice(0, 8)})`)

      const startedAt = Date.now()
      while (true) {
        if (Date.now() - startedAt > 5 * 60 * 1000) throw new Error('타임아웃 (5분)')
        await delay(5000)
        const statusRes = await apiFetch(`/api/heygen/video/status/${videoId}`)
        const statusData = await readApiResponse(statusRes)
        const status = statusData?.data?.status
        if (status === 'completed') {
          const url = statusData?.data?.video_url
          if (!url) throw new Error('완료됐지만 video_url 이 비어있습니다.')
          setVideoUrl(url)
          setProgressMsg(`완료 (${Math.round((Date.now() - startedAt) / 1000)}초 소요)`)
          break
        }
        if (status === 'failed' || status === 'error') {
          throw new Error(`렌더링 실패: ${JSON.stringify(statusData?.data || {}).slice(0, 200)}`)
        }
        setProgressMsg(`영상 렌더링 중... ${status || 'processing'} · ${Math.round((Date.now() - startedAt) / 1000)}초`)
      }
    } catch (err) {
      setError(err?.message || String(err))
      setProgressMsg('')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text flex items-center gap-2">
          <Sparkles size={20} className="text-primary" /> HeyGen 영상 테스트
        </h1>
        <p className="text-sm text-text-muted">
          동완쌤·후라이쌤·다 제자 그룹 안 9:16 룩과 my voices 를 골라 10초 분량 테스트 영상을 만들어본다.
          자막·합성 없이 raw HeyGen 영상만 확인한다.
        </p>
      </header>

      {/* 1. 아바타 선택 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">1. 아바타 선택</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'dongwan_ssaem', label: '동완쌤' },
            { id: 'fry_ssaem', label: '후라이쌤' },
            { id: 'students', label: '제자' },
          ].map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                selectedCategory === tab.id
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
            .filter((cat) => cat.id === selectedCategory)
            .map((category) => (
              <div key={category.id} className="space-y-2">
                {category.items.length === 0 ? (
                  <p className="text-xs text-text-muted flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> 불러오는 중...
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {category.items.map(({ key, lookId, groupLabel, preview, defaultVoiceId }) => {
                      const isSelected = selectedAvatar?.lookId === lookId
                      return (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setSelectedAvatar({ lookId, groupLabel, preview, defaultVoiceId })}
                          className={`relative rounded-xl border bg-surface-light overflow-hidden transition-all text-left ${
                            isSelected ? 'border-primary/60 ring-2 ring-primary/30 shadow-md' : 'border-border hover:border-primary/30'
                          }`}
                          aria-label={`${groupLabel} 룩 선택`}
                        >
                          <div className="relative bg-surface" style={{ aspectRatio: '3/4' }}>
                            {preview ? (
                              <img src={preview} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-xs text-text-muted">
                                <Loader2 size={14} className="animate-spin mr-1" /> 미리보기
                              </div>
                            )}
                            {/* 돋보기 — 좌상단. 클릭 시 이미지 확대 모달. */}
                            {preview && (
                              <div
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setLightboxImageUrl(preview)
                                }}
                                className="absolute top-1.5 left-1.5 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer shadow"
                                aria-label={`${groupLabel} 아바타 확대 보기`}
                              >
                                <ZoomIn size={14} />
                              </div>
                            )}
                          </div>
                          <span className="absolute bottom-1 left-1 inline-flex items-center rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                            {groupLabel}
                          </span>
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
      </section>

      {/* 2. 목소리 선택 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">
          2. 목소리 선택 <span className="text-xs text-text-muted font-normal">(고르지 않으면 아바타 그룹의 기본 voice)</span>
          {selectedVoiceId && (
            <button
              type="button"
              onClick={() => setSelectedVoiceId(null)}
              className="ml-3 text-xs text-text-muted hover:text-primary font-normal"
            >
              선택 해제
            </button>
          )}
        </h2>
        {myVoices.length === 0 ? (
          <p className="text-xs text-text-muted flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> my voices 불러오는 중... (비면 휴리스틱 필터가 0개일 수 있음 — /api/heygen/my-voices?debug=1 확인)
          </p>
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
                        onClick={(e) => { e.stopPropagation(); playVoiceUrl(voice.preview_audio) }}
                        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                        aria-label="목소리 미리듣기"
                      >
                        <Play size={12} className="ml-0.5" />
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
      </section>

      {/* 3. 대본 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">
          3. 대본 <span className="text-xs text-text-muted font-normal">(약 10초 분량 권장 · 한국어 기준 50~70자)</span>
        </h2>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border bg-surface-light p-3 text-sm text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="짧은 테스트 대본을 입력하세요."
        />
        <p className="text-[11px] text-text-muted">현재 {script.trim().length} 자</p>
      </section>

      {/* 4. 생성 */}
      <section className="space-y-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            canGenerate ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-surface-light text-text-muted cursor-not-allowed'
          }`}
        >
          {generating ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 생성 중...
            </span>
          ) : '테스트 영상 생성'}
        </button>
        {progressMsg && <p className="text-xs text-text-muted">{progressMsg}</p>}
        {error && (
          <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}
        {videoUrl && (
          <div className="space-y-2">
            <video src={videoUrl} controls autoPlay className="w-full max-w-sm rounded-lg border border-border" />
            <p className="text-[11px] text-text-muted break-all">{videoUrl}</p>
          </div>
        )}
      </section>

      {/* 아바타 확대 모달 — 카드 돋보기 클릭 시 body 로 portal 해 화면 중앙에 표시. */}
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
    </div>
  )
}
