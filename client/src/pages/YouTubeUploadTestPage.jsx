import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Youtube, Upload, Loader2, CheckCircle, XCircle, X, Plus,
  Image as ImageIcon, Film, AlertTriangle,
} from 'lucide-react'
import { validateYouTubeShorts } from '../utils/platformValidator'
import { formatYouTubeRequest } from '../utils/platformFormatter'
import { get } from '../utils/platformConnections'

const API_BASE = 'http://localhost:3001'

export default function YouTubeUploadTestPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [privacy, setPrivacy] = useState('private')
  const [videoFile, setVideoFile] = useState(null)
  const [thumbnail, setThumbnail] = useState(null)
  const [isDraggingVideo, setIsDraggingVideo] = useState(false)
  const [isDraggingThumb, setIsDraggingThumb] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [sentBody, setSentBody] = useState(null)
  const [connection, setConnection] = useState({ connected: false, account: null })
  const [ytAuth, setYtAuth] = useState({ authenticated: false, hasCredentials: false })

  const videoInputRef = useRef(null)
  const thumbInputRef = useRef(null)

  // YouTube OAuth 인증 상태 확인
  useEffect(() => {
    setConnection(get('shorts'))
    fetch(`${API_BASE}/api/youtube/auth-status`)
      .then(r => r.json())
      .then(setYtAuth)
      .catch(() => {})
  }, [])

  // Google 계정 연결
  const connectGoogle = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/youtube/auth-url`)
      const { url } = await res.json()
      const popup = window.open(url, 'youtube-auth', 'width=600,height=700')
      // 팝업 닫힘 + 주기적 auth-status 폴링
      let pollCount = 0
      const timer = setInterval(async () => {
        pollCount++
        try {
          const r = await fetch(`${API_BASE}/api/youtube/auth-status`)
          const st = await r.json()
          if (st.authenticated) {
            setYtAuth(st)
            clearInterval(timer)
            try { popup?.close() } catch {}
            return
          }
        } catch {}
        if (popup?.closed || pollCount > 120) {
          clearInterval(timer)
          // 마지막으로 한번 더 확인
          fetch(`${API_BASE}/api/youtube/auth-status`).then(r => r.json()).then(setYtAuth).catch(() => {})
        }
      }, 1000)
    } catch (err) {
      setError('Google 인증 URL 생성 실패: ' + err.message)
    }
  }

  const disconnectGoogle = async () => {
    await fetch(`${API_BASE}/api/youtube/logout`, { method: 'POST' })
    setYtAuth({ authenticated: false, hasCredentials: true })
  }

  const tagsTotal = tags.join(',').length

  // 실시간 유효성 검사
  const validationContent = {
    title,
    description,
    tags,
    videoSeconds: videoFile?.duration ?? undefined,
  }
  const validation = validateYouTubeShorts(validationContent)

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t))

  const handleVideoFile = useCallback((file) => {
    if (!file || !file.type.startsWith('video/')) return
    if (videoFile) URL.revokeObjectURL(videoFile.preview)
    const preview = URL.createObjectURL(file)
    setVideoFile({ file, preview, name: file.name, duration: null })
  }, [videoFile])

  const handleVideoMetadata = (e) => {
    const dur = e.target.duration
    setVideoFile(prev => prev ? { ...prev, duration: Math.round(dur) } : null)
  }

  const handleVideoDrop = (e) => {
    e.preventDefault()
    setIsDraggingVideo(false)
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('video/'))
    if (file) handleVideoFile(file)
  }

  const handleThumbFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (thumbnail) URL.revokeObjectURL(thumbnail.preview)
    setThumbnail({ file, preview: URL.createObjectURL(file), name: file.name })
  }

  const handleThumbDrop = (e) => {
    e.preventDefault()
    setIsDraggingThumb(false)
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
    if (file) handleThumbFile(file)
  }

  const loadExample = () => {
    setTitle('[Shorts] AI 시장 분석 60초 요약')
    setDescription('2024년 AI 시장의 핵심 트렌드를 60초로 정리했습니다.\n\n#Shorts #AI #트렌드')
    setTags(['Shorts', 'AI', '트렌드', '분석', '2024'])
    setPrivacy('public')
  }

  const upload = async () => {
    if (!ytAuth.authenticated) {
      setError('Google 계정을 먼저 연결하세요.')
      return
    }
    if (!videoFile) {
      setError('영상 파일을 선택하세요.')
      return
    }
    setUploading(true)
    setError(null)
    setResult(null)
    setSentBody(null)

    try {
      // 1) 영상 파일을 서버에 업로드
      const reader = new FileReader()
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(videoFile.file)
      })

      const uploadRes = await fetch(`${API_BASE}/api/output/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `yt_${Date.now()}.mp4`, data: base64, encoding: 'base64' }),
      })
      const uploadData = await uploadRes.json()
      const videoUrl = uploadData.url // /output/yt_xxx.mp4

      // 2) YouTube 업로드 요청
      const requestBody = {
        title: title || '숏폼 테스트',
        description: description || '',
        tags,
        videoUrl,
        privacyStatus: privacy,
      }
      setSentBody(requestBody)

      const res = await fetch(`${API_BASE}/api/youtube/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || '업로드 실패')
      }
    } catch (err) {
      setError(`업로드 실패: ${err.message}`)
    }
    setUploading(false)
  }

  const reset = () => {
    if (videoFile) URL.revokeObjectURL(videoFile.preview)
    if (thumbnail) URL.revokeObjectURL(thumbnail.preview)
    setTitle('')
    setDescription('')
    setTags([])
    setTagInput('')
    setPrivacy('public')
    setVideoFile(null)
    setThumbnail(null)
    setResult(null)
    setError(null)
    setSentBody(null)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Youtube size={24} className="text-red-500" />
        <h1 className="text-2xl font-bold text-text">유튜브 숏츠 업로드 테스트</h1>
        {ytAuth.authenticated ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Google 계정 연결됨
            </span>
            <button onClick={disconnectGoogle} className="text-xs text-text-muted hover:text-red-400 transition-colors">연결 해제</button>
          </div>
        ) : (
          <button
            onClick={connectGoogle}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Google 계정 연결
          </button>
        )}
      </div>

      {/* Mock 안내 */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">
          현재 Mock 모드로 동작합니다. 실제 API 연동은 추후 추가됩니다.
        </p>
      </div>

      {/* 예시 콘텐츠 */}
      <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-text-muted">
          <p className="font-semibold text-red-500 mb-0.5">예시 콘텐츠로 빠르게 테스트해 보세요</p>
          <p>AI 시장 분석 숏츠 샘플 제목, 설명, 태그가 자동으로 채워집니다.</p>
        </div>
        <button
          onClick={loadExample}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0"
        >
          예시 콘텐츠 불러오기
        </button>
      </div>

      {/* 제목 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <label className="text-sm font-semibold text-text">제목</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="숏츠 제목을 입력하세요 (최대 100자)"
          maxLength={120}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-red-500/40 transition-colors"
        />
        <p className={`text-xs ${title.length > 100 ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>
          {title.length}/100자
        </p>
      </div>

      {/* 설명 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <label className="text-sm font-semibold text-text">설명</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="영상 설명을 입력하세요 (최대 5000자)"
          rows={5}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-red-500/40 transition-colors resize-y"
        />
        <p className={`text-xs ${description.length > 5000 ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>
          {description.length}/5000자
        </p>
      </div>

      {/* 태그 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text">태그</label>
          <span className={`text-xs font-medium ${tagsTotal > 500 ? 'text-red-400' : 'text-text-muted'}`}>
            총 {tagsTotal}/500자
          </span>
        </div>
        {tagsTotal > 500 && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle size={12} /> 태그 전체 길이가 500자를 초과했습니다.
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="태그 입력 후 Enter"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-red-500/40 transition-colors"
          />
          <button
            onClick={addTag}
            disabled={!tagInput.trim()}
            className="px-4 py-2 bg-red-500/10 text-red-500 text-sm font-medium rounded-lg hover:bg-red-500/20 border border-red-500/30 disabled:opacity-50 transition-all flex items-center gap-1"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-medium border border-red-500/30">
                #{t}
                <button onClick={() => removeTag(t)} className="hover:text-red-700 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 공개 설정 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text">공개 설정</label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: 'public', label: '공개' },
            { value: 'unlisted', label: '일부공개 (Unlisted)' },
            { value: 'private', label: '비공개' },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all text-sm font-medium
                ${privacy === opt.value
                  ? 'border-red-500/50 bg-red-500/10 text-red-500'
                  : 'border-border bg-surface-light text-text-muted hover:border-red-500/30'}`}
            >
              <input
                type="radio"
                name="privacy"
                value={opt.value}
                checked={privacy === opt.value}
                onChange={() => setPrivacy(opt.value)}
                className="hidden"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 비디오 파일 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text flex items-center gap-2">
          <Film size={16} /> 비디오 파일 (MP4)
        </label>
        {!videoFile ? (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${isDraggingVideo ? 'border-red-500 bg-red-500/5' : 'border-border hover:border-red-500/40'}`}
            onDragOver={e => { e.preventDefault(); setIsDraggingVideo(true) }}
            onDragLeave={() => setIsDraggingVideo(false)}
            onDrop={handleVideoDrop}
            onClick={() => videoInputRef.current?.click()}
          >
            <input
              ref={videoInputRef}
              type="file"
              className="hidden"
              accept="video/mp4,video/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f) }}
            />
            <Film size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text">비디오를 드래그하거나 <span className="text-red-500 font-medium">클릭</span>하여 선택</p>
            <p className="text-xs text-text-muted mt-1">MP4 권장, 최대 60초, 9:16 비율</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-text-muted space-y-0.5">
                <p className="font-medium text-text">{videoFile.name}</p>
                {videoFile.duration !== null && (
                  <p className={videoFile.duration > 60 ? 'text-red-400 font-semibold' : ''}>
                    길이: {videoFile.duration}초
                    {videoFile.duration > 60 && ' — 60초 초과 (숏츠 한도)'}
                  </p>
                )}
              </div>
              <button
                onClick={() => { URL.revokeObjectURL(videoFile.preview); setVideoFile(null) }}
                className="text-xs text-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <X size={13} /> 제거
              </button>
            </div>
            <video
              src={videoFile.preview}
              controls
              className="w-full max-h-64 rounded-lg bg-black"
              onLoadedMetadata={handleVideoMetadata}
            />
            {videoFile.duration !== null && videoFile.duration > 60 && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/20">
                <AlertTriangle size={13} className="shrink-0" />
                숏츠는 최대 60초입니다. 영상을 편집하거나 다른 파일을 선택해주세요.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 썸네일 (선택) */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text flex items-center gap-2">
          <ImageIcon size={16} /> 썸네일 <span className="text-xs font-normal text-text-muted">(선택사항)</span>
        </label>
        {!thumbnail ? (
          <div
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
              ${isDraggingThumb ? 'border-red-500 bg-red-500/5' : 'border-border hover:border-red-500/30'}`}
            onDragOver={e => { e.preventDefault(); setIsDraggingThumb(true) }}
            onDragLeave={() => setIsDraggingThumb(false)}
            onDrop={handleThumbDrop}
            onClick={() => thumbInputRef.current?.click()}
          >
            <input
              ref={thumbInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleThumbFile(f) }}
            />
            <ImageIcon size={20} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text">썸네일 이미지를 드래그하거나 <span className="text-red-500 font-medium">클릭</span>하여 선택</p>
            <p className="text-xs text-text-muted mt-1">JPG, PNG 권장 (16:9 비율)</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <img src={thumbnail.preview} alt="썸네일" className="h-16 w-28 object-cover rounded-lg border border-border" />
            <div className="flex-1 text-xs text-text-muted">
              <p className="font-medium text-text">{thumbnail.name}</p>
            </div>
            <button
              onClick={() => { URL.revokeObjectURL(thumbnail.preview); setThumbnail(null) }}
              className="text-xs text-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <X size={13} /> 제거
            </button>
          </div>
        )}
      </div>

      {/* 검증 결과 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text">검증 결과</label>
          <span className="text-xs text-text-muted">
            {validation.warnings.length > 0 && (
              <span className="text-yellow-500 mr-2">⚠️ 경고 {validation.warnings.length}개</span>
            )}
            {validation.errors.length > 0 && (
              <span className="text-red-400">❌ 에러 {validation.errors.length}개</span>
            )}
            {validation.valid && validation.warnings.length === 0 && (
              <span className="text-emerald-500">✅ 이상 없음</span>
            )}
          </span>
        </div>
        {validation.errors.length === 0 && validation.warnings.length === 0 && (
          <p className="text-xs text-emerald-500 flex items-center gap-1.5">
            <CheckCircle size={13} /> 모든 항목이 유효합니다.
          </p>
        )}
        {validation.errors.map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/20">
            <XCircle size={13} className="shrink-0 mt-0.5" />
            <span>[{e.field}] {e.message}</span>
          </div>
        ))}
        {validation.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/5 rounded-lg px-3 py-2 border border-yellow-500/20">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>[{w.field}] {w.message}</span>
          </div>
        ))}
      </div>

      {/* 에러 / 성공 배너 */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text">업로드 성공!</p>
              <p className="text-xs text-text-muted mt-0.5">Mock 응답입니다. 실제 업로드가 실행되지 않았습니다.</p>
              {result.videoId && <p className="text-xs text-text-muted mt-1">Video ID: <span className="text-text font-mono">{result.videoId}</span></p>}
              {result.url && (
                <a href={result.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-emerald-500 hover:underline mt-1 block break-all">
                  {result.url}
                </a>
              )}
            </div>
            <button
              onClick={reset}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-light hover:bg-surface text-text-muted border border-border transition-all shrink-0"
            >
              초기화
            </button>
          </div>
        </div>
      )}

      {/* 요청/응답 JSON 프리뷰 */}
      {(sentBody || result || error) && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <label className="text-sm font-semibold text-text">요청 / 응답 데이터</label>
          {sentBody && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-muted">요청 바디</p>
              <pre className="bg-surface-light rounded-lg p-3 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(sentBody, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-muted">응답</p>
              <pre className="bg-surface-light rounded-lg p-3 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 업로드 버튼 */}
      <div className="sticky bottom-0 bg-background py-2">
        <button
          onClick={upload}
          disabled={uploading}
          className="w-full px-4 py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white text-sm font-semibold rounded-xl hover:from-red-700 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
        >
          {uploading ? (
            <><Loader2 size={16} className="animate-spin" /> 업로드 중...</>
          ) : (
            <><Upload size={16} /> 유튜브 숏츠에 업로드 (Mock)</>
          )}
        </button>
        {!connection.connected && (
          <p className="text-xs text-center text-text-muted mt-2 flex items-center justify-center gap-1">
            <AlertTriangle size={11} /> 계정이 연결되지 않았지만 Mock 모드에서는 테스트 가능합니다
          </p>
        )}
      </div>
    </div>
  )
}
