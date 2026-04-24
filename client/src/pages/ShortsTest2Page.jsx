import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Pause,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { DEMO_SHORTS_SCRIPT } from '../constants/demoShortsScript.js'
import { buildShortsVideoAgentPrompt, mapShortsSubtitleStyleToBurnStyle } from '../utils/shortsVideoAgent.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || ''

const API_HEADERS = API_SECRET ? { 'x-app-secret': API_SECRET } : {}

const LEGACY_DEMO_SHORTS_SCRIPT = {
  title: '[데모] 2024 AI 시장 트렌드 분석',
  duration: '30',
  hook: '여러분, AI 시장이 올해 얼마나 커졌는지 아시나요?',
  scenes: [
    {
      sceneNumber: 1,
      duration: '8',
      narration: '안녕하세요. 오늘은 2024년 글로벌 AI 시장의 핵심 트렌드를 30초 안에 빠르게 정리해보겠습니다.',
      textOverlay: '2024 AI 시장 분석',
    },
    {
      sceneNumber: 2,
      duration: '8',
      narration: '올해 글로벌 AI 시장은 184조 원 규모를 돌파하며 사상 최대 기록을 세웠습니다.',
      textOverlay: '시장 규모 184조 원',
    },
    {
      sceneNumber: 3,
      duration: '8',
      narration: '특히 생성형 AI가 전년 대비 67퍼센트 넘게 성장하면서 전체 시장을 끌어올리고 있습니다.',
      textOverlay: '생성형 AI +67%',
    },
    {
      sceneNumber: 4,
      duration: '6',
      narration: '전문가들은 2030년까지 AI 시장이 826조 원 규모로 커질 것으로 전망합니다.',
      textOverlay: '2030년 826조 원 전망',
    },
  ],
  cta: '더 자세한 데이터와 인사이트는 프로필 링크에서 확인해보세요.',
  uploadTitle: '[2024 AI 리포트] 시장 184조 돌파, 생성형 AI가 이끈다',
  uploadDescription:
    '2024년 글로벌 AI 시장은 184조 원을 돌파했고, 생성형 AI가 가장 빠르게 성장했습니다.\n\n30초 요약으로 핵심만 확인해보세요.',
  hashtags: ['#Shorts', '#AI시장', '#생성형AI', '#AI', '#테크트렌드', '#시장분석'],
}

const demoShortsScript = DEMO_SHORTS_SCRIPT

function fetchJson(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...API_HEADERS,
      ...(options.headers || {}),
    },
  })
}

async function readJsonSafely(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

export default function ShortsTest2Page() {
  const [avatars, setAvatars] = useState([])
  const [avatarsLoading, setAvatarsLoading] = useState(false)
  const [selectedAvatarId, setSelectedAvatarId] = useState('')
  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarImage, setAvatarImage] = useState('')
  const [customAvatarLoading, setCustomAvatarLoading] = useState(false)
  const [customAvatarUploading, setCustomAvatarUploading] = useState(false)
  const [customAvatarId, setCustomAvatarId] = useState('')
  const [customAvatarReady, setCustomAvatarReady] = useState(false)
  const [customAvatarStatus, setCustomAvatarStatus] = useState('')
  const [voices, setVoices] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [generating, setGenerating] = useState(false)

  const previewAudioRef = useRef(null)
  const cancelRef = useRef(false)

  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) || null,
    [avatars, selectedAvatarId]
  )
  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voice_id === selectedVoiceId) || null,
    [voices, selectedVoiceId]
  )
  const customAvatars = useMemo(
    () => avatars.filter((avatar) => avatar.kind === 'talking_photo'),
    [avatars]
  )
  const stockAvatars = useMemo(
    () => avatars.filter((avatar) => avatar.kind !== 'talking_photo'),
    [avatars]
  )

  useEffect(() => {
    setAvatarsLoading(true)
    fetchJson('/api/heygen/public-avatars')
      .then((response) => response.json())
      .then((data) => {
        const nextAvatars = (data.avatars || []).slice(0, 10)
        setAvatars(nextAvatars)
        if (nextAvatars[0]?.id) {
          setSelectedAvatarId((current) => current || nextAvatars[0].id)
        }
      })
      .catch((err) => setError(`아바타 목록을 불러오지 못했습니다: ${err.message}`))
      .finally(() => setAvatarsLoading(false))
  }, [])

  useEffect(() => {
    setVoicesLoading(true)
    fetchJson('/api/heygen/voices')
      .then((response) => response.json())
      .then((data) => {
        const allVoices = data?.data?.voices || []
        const koreanVoices = allVoices.filter(
          (voice) => (voice.language || '').includes('Korean') || voice.support_locale
        )
        setVoices(koreanVoices)
        if (koreanVoices[0]?.voice_id) {
          setSelectedVoiceId((current) => current || koreanVoices[0].voice_id)
        }
      })
      .catch((err) => setError(`음성 목록을 불러오지 못했습니다: ${err.message}`))
      .finally(() => setVoicesLoading(false))
  }, [])

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
    }
  }, [])

  const playVoicePreview = (voice) => {
    if (!voice?.preview_audio) return

    if (playingVoiceId === voice.voice_id) {
      previewAudioRef.current?.pause()
      setPlayingVoiceId('')
      return
    }

    previewAudioRef.current?.pause()
    const audio = new Audio(voice.preview_audio)
    previewAudioRef.current = audio
    audio.play().catch(() => setPlayingVoiceId(''))
    audio.onended = () => setPlayingVoiceId('')
    setPlayingVoiceId(voice.voice_id)
  }

  const generateCustomAvatar = async () => {
    if (!avatarPrompt.trim()) return

    setCustomAvatarLoading(true)
    setError('')
    setAvatarImage('')
    setCustomAvatarId('')
    setCustomAvatarReady(false)
    setCustomAvatarStatus('커스텀 아바타 이미지를 생성하는 중입니다.')

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Generate a photorealistic vertical portrait photograph. Subject: ${avatarPrompt.trim()}.

IMPORTANT REQUIREMENTS:
- Look like a real camera photo, not AI art
- Ultra realistic skin, fur, hair, feathers, eyes, and natural texture depending on the subject
- Use authentic photographic detail with warm natural window light and realistic indoor shadows
- 9:16 vertical portrait orientation
- Medium shot framing, not an extreme close-up
- Show the head, shoulders, and upper torso or upper body naturally
- Keep the subject slightly smaller in frame so the composition feels relaxed and believable
- The subject should stay near the center with comfortable margins around the head and body
- Mouth clearly visible and slightly open or naturally relaxed so lip movement can read well later
- Include a realistic environment that naturally matches the subject
- Prefer a cozy study, desk, bookshelf, notebook, or soft home-office environment with believable real-world props
- Background should look like a real place captured by a camera, with subtle depth of field
- Use premium editorial or documentary photography style, not fantasy concept art
- Avoid fake-looking bokeh, surreal colors, glossy CGI surfaces, plastic skin, empty fake backdrops, or overdesigned AI backgrounds
- The image should feel like a real portrait photo taken in a lived-in room, not a generated showroom
- Do not crop too tightly on the face
- No illustration, no 3D render, no painting, no text, no watermark`,
              }],
            }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Gemini 오류 (${response.status})`)
      }

      const data = await response.json()
      let imagePart = null
      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
            imagePart = part
            break
          }
        }
        if (imagePart) break
      }

      if (!imagePart) {
        throw new Error('커스텀 아바타 이미지를 생성하지 못했습니다.')
      }

      const base64 = imagePart.inlineData.data
      const mimeType = imagePart.inlineData.mimeType || 'image/png'
      setAvatarImage(`data:${mimeType};base64,${base64}`)
      setCustomAvatarStatus('이미지 생성이 완료되었습니다. 업로드를 진행하세요.')
    } catch (err) {
      setError(err.message)
      setCustomAvatarStatus('')
    } finally {
      setCustomAvatarLoading(false)
    }
  }

  const uploadCustomAvatar = async () => {
    if (!avatarImage) return

    setCustomAvatarUploading(true)
    setError('')
    setCustomAvatarStatus('HeyGen에 커스텀 아바타를 등록하는 중입니다.')

    try {
      const match = avatarImage.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        throw new Error('아바타 이미지 데이터 형식이 올바르지 않습니다.')
      }

      const [, mimeType, base64] = match
      const uploadResponse = await fetchJson('/api/heygen/upload-asset', {
        method: 'POST',
        body: JSON.stringify({ base64, mimeType }),
      })
      const uploadData = await readJsonSafely(uploadResponse)
      if (!uploadResponse.ok) {
        throw new Error(uploadData.error?.message || uploadData.error || `이미지 업로드 실패 (${uploadResponse.status})`)
      }

      const imageKey = uploadData.data?.image_key
      if (!imageKey) throw new Error('image_key를 받지 못했습니다.')

      const avatarName = avatarPrompt.trim() || `avatar_${Date.now()}`
      const groupResponse = await fetchJson('/api/heygen/avatar-group/create', {
        method: 'POST',
        body: JSON.stringify({
          name: `avatar_${Date.now()}`,
          image_key: imageKey,
        }),
      })
      const groupData = await readJsonSafely(groupResponse)
      if (!groupResponse.ok) {
        throw new Error(groupData.error?.message || groupData.error || `커스텀 아바타 생성 실패 (${groupResponse.status})`)
      }

      const groupId = groupData.data?.group_id
      if (!groupId) throw new Error('group_id를 받지 못했습니다.')

      setCustomAvatarId(groupId)
      setCustomAvatarStatus('아바타 준비 상태를 확인하는 중입니다.')

      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        const statusResponse = await fetchJson(`/api/heygen/avatar-status/${groupId}`)
        const statusData = await readJsonSafely(statusResponse)

        if (statusResponse.ok && statusData.ready) {
          const nextAvatar = {
            id: groupId,
            name: avatarName,
            preview: statusData.data?.preview_image_url || avatarImage,
            gender: '',
            kind: 'talking_photo',
            source: 'generated',
          }
          setAvatars((current) => [nextAvatar, ...current.filter((avatar) => avatar.id !== groupId)])
          setSelectedAvatarId(groupId)
          setCustomAvatarReady(true)
          setCustomAvatarStatus('커스텀 아바타 등록이 완료되었습니다.')
          return
        }
      }

      const fallbackAvatar = {
        id: groupId,
        name: avatarName,
        preview: avatarImage,
        gender: '',
        kind: 'talking_photo',
        source: 'generated',
      }
      setAvatars((current) => [fallbackAvatar, ...current.filter((avatar) => avatar.id !== groupId)])
      setSelectedAvatarId(groupId)
      setCustomAvatarReady(true)
      setCustomAvatarStatus('아바타를 목록에 추가했습니다. HeyGen 반영까지 잠시 기다려주세요.')
    } catch (err) {
      setError(err.message)
      setCustomAvatarStatus('')
    } finally {
      setCustomAvatarUploading(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedAvatar || !selectedVoice) return

    setGenerating(true)
    setError('')
    setResult(null)
    setStatus('Video Agent 요청 준비 중...')
    cancelRef.current = false

    try {
      const prompt = buildShortsVideoAgentPrompt({
        script: demoShortsScript,
        avatar: selectedAvatar,
        voice: selectedVoice,
        subtitleStyle: 'style1',
        subtitleFont: 'default',
      })

      const generateResponse = await fetchJson('/api/heygen/video-agent/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          config: {
            avatar_id: selectedAvatar.id,
          },
        }),
      })
      const generateData = await generateResponse.json()
      if (!generateResponse.ok) {
        throw new Error(generateData?.error?.message || generateData.error || `Video Agent 요청 실패 (${generateResponse.status})`)
      }

      const videoId =
        generateData?.data?.video_id ||
        generateData?.video_id ||
        generateData?.data?.id ||
        generateData?.id

      if (!videoId) {
        throw new Error('Video Agent 응답에서 video_id를 찾지 못했습니다.')
      }

      setStatus('렌더링 상태 확인 중...')
      for (let attempt = 0; attempt < 240; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        if (cancelRef.current) {
          setGenerating(false)
          setStatus('중단됨')
          return
        }

        const statusResponse = await fetchJson(`/api/heygen/video/status/${videoId}`)
        const statusData = await statusResponse.json()
        if (!statusResponse.ok) continue

        const videoData = statusData.data || {}
        const state = videoData.status
        setStatus(`렌더링 중... [${state || 'processing'}]`)

        if (state === 'completed') {
          const rawUrl = videoData.video_url
          let finalUrl = rawUrl
          let srtUrl = ''

          setStatus('자막 번인 중...')

          try {
            const burnResponse = await fetchJson('/api/subtitle/burn', {
              method: 'POST',
              body: JSON.stringify({
                videoUrl: rawUrl,
                scenes: demoShortsScript.scenes,
                subtitleStyle: mapShortsSubtitleStyleToBurnStyle('style1'),
                subtitleFont: 'default',
              }),
            })
            const burnData = await readJsonSafely(burnResponse)
            if (!burnResponse.ok) {
              throw new Error(
                burnData.error?.message || burnData.error || `자막 번인 실패 (${burnResponse.status})`
              )
            }
            if (burnData.url) {
              finalUrl = burnData.url
              srtUrl = burnData.srtUrl || ''
            }
          } catch (burnError) {
            console.warn('[ShortsTest2] subtitle burn fallback:', burnError)
          }

          setResult({
            videoId,
            url: finalUrl,
            rawUrl,
            shareUrl: videoData.share_url || videoData.video_share_page_url || '',
            duration: demoShortsScript.duration,
            prompt,
            srtUrl,
          })
          setStatus('완료')
          setGenerating(false)
          return
        }

        if (state === 'failed') {
          throw new Error(
            videoData.error?.message ||
              videoData.error?.detail ||
              videoData.error ||
              'HeyGen Video Agent 렌더링 실패'
          )
        }
      }

      throw new Error('렌더링 시간 초과 (20분)')
    } catch (err) {
      setError(err.message)
      setStatus('')
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-text">숏츠 테스트 2</h1>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500/10 text-amber-500">Video Agent</span>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text">데모 대본</h2>
          <p className="text-sm text-text-muted mt-1">
            기존 데모 버전 숏폼 대본을 그대로 사용합니다. 길이는 {demoShortsScript.duration}초 기준입니다.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-light p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">{demoShortsScript.title}</p>
            <p className="text-sm text-text-muted mt-1">{demoShortsScript.hook}</p>
          </div>
          {demoShortsScript.scenes.map((scene) => (
            <div key={scene.sceneNumber} className="rounded-lg bg-white/60 border border-border px-3 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  씬 {scene.sceneNumber}
                </span>
                <span className="text-xs text-text-muted">{scene.duration}초</span>
              </div>
              <p className="text-sm text-text">{scene.narration}</p>
              <p className="text-xs text-text-muted mt-1">텍스트 오버레이: {scene.textOverlay}</p>
            </div>
          ))}
          <div className="rounded-lg bg-white/60 border border-border px-3 py-3">
            <p className="text-xs font-semibold text-text-muted mb-1">CTA</p>
            <p className="text-sm text-text">{demoShortsScript.cta}</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text">아바타 선택</h2>
            {selectedAvatar ? <CheckCircle size={16} className="text-success" /> : null}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-light p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-text">커스텀 아바타 생성</p>
                <p className="text-xs text-text-muted mt-1">
                  콘텐츠 추출 화면의 숏폼 아바타 생성 흐름을 그대로 붙였습니다. 프롬프트로 이미지를 만들고 HeyGen talking photo로 등록합니다.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={avatarPrompt}
                  onChange={(event) => setAvatarPrompt(event.target.value)}
                  placeholder="예: 책상 앞에서 설명하는 밝은 톤의 30대 여성 마케터"
                  className="flex-1 px-3 py-2.5 bg-white border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={generateCustomAvatar}
                  disabled={!avatarPrompt.trim() || customAvatarLoading}
                  className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-all"
                >
                  {customAvatarLoading ? '생성 중' : '이미지 생성'}
                </button>
              </div>

              {avatarImage ? (
                <div className="flex items-start gap-4">
                  <div className="w-28 rounded-xl overflow-hidden border border-border bg-white" style={{ aspectRatio: '9 / 16' }}>
                    <img src={avatarImage} alt="커스텀 아바타" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={generateCustomAvatar}
                        disabled={customAvatarLoading}
                        className="px-3 py-2 rounded-lg border border-border text-sm text-text-muted hover:border-primary/30 hover:text-primary transition-all"
                      >
                        다시 생성
                      </button>
                      <button
                        onClick={uploadCustomAvatar}
                        disabled={customAvatarUploading}
                        className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-all"
                      >
                        {customAvatarUploading ? '업로드 중' : 'HeyGen 아바타로 등록'}
                      </button>
                    </div>
                    {customAvatarStatus ? (
                      <p className="text-xs text-text-muted leading-5">{customAvatarStatus}</p>
                    ) : null}
                    {customAvatarReady && customAvatarId ? (
                      <p className="text-xs text-success">등록된 아바타 ID: {customAvatarId}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {avatarsLoading ? (
              <div className="flex items-center gap-2 py-6 text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                아바타 목록 로딩 중...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-2">내 아바타 / Talking Photos</p>
                  {customAvatars.length === 0 ? (
                    <div className="rounded-lg border border-border bg-surface-light px-3 py-3 text-xs text-text-muted">
                      아직 등록된 커스텀 아바타가 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                      {customAvatars.map((avatar) => (
                        <button
                          key={avatar.id}
                          onClick={() => setSelectedAvatarId(avatar.id)}
                          className={`rounded-xl overflow-hidden border-2 text-left transition-all ${
                            selectedAvatarId === avatar.id
                              ? 'border-primary shadow-lg shadow-primary/20'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="aspect-[3/4] bg-surface-light">
                            {avatar.preview ? (
                              <img src={avatar.preview} alt={avatar.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-text-muted">No Preview</div>
                            )}
                          </div>
                          <div className="px-2 py-2">
                            <p className="text-xs font-medium text-text truncate">{avatar.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-muted mb-2">기본 제공 아바타</p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[320px] overflow-y-auto pr-1">
                    {stockAvatars.map((avatar) => (
                      <button
                        key={avatar.id}
                        onClick={() => setSelectedAvatarId(avatar.id)}
                        className={`rounded-xl overflow-hidden border-2 text-left transition-all ${
                          selectedAvatarId === avatar.id
                            ? 'border-primary shadow-lg shadow-primary/20'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="aspect-[3/4] bg-surface-light">
                          {avatar.preview ? (
                            <img src={avatar.preview} alt={avatar.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-text-muted">No Preview</div>
                          )}
                        </div>
                        <div className="px-2 py-2">
                          <p className="text-xs font-medium text-text truncate">{avatar.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text">목소리 선택</h2>
            {selectedVoice ? <CheckCircle size={16} className="text-success" /> : null}
          </div>
          {voicesLoading ? (
            <div className="flex items-center gap-2 py-6 text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              음성 목록 로딩 중...
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {voices.map((voice) => (
                <button
                  key={voice.voice_id}
                  onClick={() => setSelectedVoiceId(voice.voice_id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${
                    selectedVoiceId === voice.voice_id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{voice.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {[voice.language, voice.gender].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {voice.preview_audio ? (
                    <div
                      role="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        playVoicePreview(voice)
                      }}
                      className={`p-2 rounded-lg ${
                        playingVoiceId === voice.voice_id
                          ? 'bg-primary/15 text-primary'
                          : 'bg-surface-light text-text-muted hover:text-primary'
                      }`}
                    >
                      {playingVoiceId === voice.voice_id ? <Pause size={14} /> : <Play size={14} />}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-text-muted leading-6">
            <p>Video Agent 공식 문서 기준으로 자막은 생성 흐름에 포함되는 기능이라 기본 포함을 프롬프트에 명시해두었습니다.</p>
            <p>폰트 설정은 Video Agent API 파라미터로 확인되지 않아 자동 선택으로 두고, 자막은 하단 안전 영역에 배치하도록 프롬프트에 지시했습니다.</p>
            <p>자막과 장면별 텍스트 오버레이가 아바타 얼굴을 가리지 않도록 별도 프롬프트도 추가했습니다.</p>
            <p>아바타는 `config.avatar_id`로 직접 지정하고, 목소리는 현재 선택한 음성 이름을 프롬프트에 반영하는 방식입니다.</p>
          </div>
        </div>

        {!API_SECRET ? (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/20 bg-warning/5">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-text-muted leading-6">
              <p>로컬에서 `/api` 프록시를 쓸 때는 괜찮지만, 원격 서버를 직접 볼 경우 `VITE_API_SECRET`가 필요할 수 있습니다.</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/5 border border-danger/20 text-danger">
            <XCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        ) : null}

        {status ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-primary">
            <Loader2 size={16} className={generating ? 'animate-spin' : ''} />
            <span className="text-sm">{status}</span>
          </div>
        ) : null}

        {!result ? (
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={!selectedAvatar || !selectedVoice || generating}
              className="px-5 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Video Agent로 30초 숏츠 생성
            </button>
            {generating ? (
              <button
                onClick={() => {
                  cancelRef.current = true
                }}
                className="px-5 py-3 rounded-xl border border-danger/30 text-danger font-medium hover:bg-danger/5 transition-all"
              >
                중단
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
              <CheckCircle size={18} className="text-success" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">Video Agent 생성 완료</p>
                <p className="text-xs text-text-muted">video_id: {result.videoId}</p>
              </div>
            </div>

            {result.url ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-full max-w-[320px] rounded-2xl overflow-hidden border border-border bg-black" style={{ aspectRatio: '9 / 16' }}>
                  <video src={result.url} controls playsInline className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-all flex items-center gap-2"
                  >
                    <Download size={14} />
                    영상 열기
                  </a>
                  {result.shareUrl ? (
                    <a
                      href={result.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-text-muted hover:text-primary hover:border-primary/30 transition-all"
                    >
                      공유 페이지
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-surface-light p-4">
              <p className="text-xs font-semibold text-text-muted mb-2">전송 프롬프트</p>
              <pre className="text-xs text-text whitespace-pre-wrap leading-5">{result.prompt}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
