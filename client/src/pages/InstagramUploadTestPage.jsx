import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Instagram, Upload, Loader2, CheckCircle, XCircle, X, Plus,
  Image as ImageIcon, Film, AlertTriangle,
} from 'lucide-react'
import { validateInstagram } from '../utils/platformValidator'
import { formatInstagramRequest } from '../utils/platformFormatter'
import { get } from '../utils/platformConnections'

const API_BASE = 'http://localhost:3001'

export default function InstagramUploadTestPage() {
  const [uploadType, setUploadType] = useState('image') // 'image' | 'carousel' | 'reel'
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState([])
  const [hashtagInput, setHashtagInput] = useState('')
  const [images, setImages] = useState([]) // { file, preview, name }
  const [videoFile, setVideoFile] = useState(null) // { file, preview, name, duration }
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [isDraggingVideo, setIsDraggingVideo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [sentBody, setSentBody] = useState(null)
  const [connection, setConnection] = useState({ connected: false, account: null })

  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const videoPreviewRef = useRef(null)

  useEffect(() => {
    setConnection(get('instagram'))
  }, [])

  // 캡션에서 해시태그 자동 분리 (# 으로 시작하는 단어 추출)
  const strippedCaption = caption.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim()

  // 실시간 유효성 검사
  const validationContent = {
    caption: strippedCaption,
    hashtags,
    imageUrls: uploadType !== 'reel' ? images.map(i => i.preview) : [],
    videoSeconds: uploadType === 'reel' && videoFile ? videoFile.duration : undefined,
    isReel: uploadType === 'reel',
  }
  const validation = validateInstagram(validationContent)

  const addHashtag = () => {
    const t = hashtagInput.trim().replace(/^#/, '')
    if (t && !hashtags.includes(t)) setHashtags(prev => [...prev, t])
    setHashtagInput('')
  }

  const removeHashtag = (t) => setHashtags(prev => prev.filter(x => x !== t))

  const handleImageFiles = (files) => {
    const maxCount = uploadType === 'carousel' ? 10 : 1
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const newImgs = imgs.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      name: f.name,
    }))
    setImages(prev => [...prev, ...newImgs].slice(0, maxCount))
  }

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

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

  const handleImageDrop = (e) => {
    e.preventDefault()
    setIsDraggingImage(false)
    handleImageFiles(e.dataTransfer.files)
  }

  const handleVideoDrop = (e) => {
    e.preventDefault()
    setIsDraggingVideo(false)
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('video/'))
    if (file) handleVideoFile(file)
  }

  const loadExample = () => {
    setUploadType('image')
    setCaption('오늘의 추천 콘텐츠를 소개합니다! ✨\n\n여러분이 정말 사랑할 만한 특별한 이야기를 담았어요. 프로필 링크에서 더 많은 정보를 확인해보세요 🔗')
    setHashtags(['일상', '추천', '콘텐츠', '트렌드', '소개'])
  }

  const upload = async () => {
    setUploading(true)
    setError(null)
    setResult(null)
    setSentBody(null)

    const imageUrls = images.map(i => i.preview)
    const instagramContent = {
      caption: strippedCaption,
      hashtags,
    }
    const body = formatInstagramRequest(instagramContent, imageUrls)
    setSentBody(body)

    try {
      const res = await fetch(`${API_BASE}/api/instagram/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || '업로드 실패')
      }
    } catch (err) {
      setError(`서버 연결 실패: ${err.message}`)
    }
    setUploading(false)
  }

  const reset = () => {
    images.forEach(i => URL.revokeObjectURL(i.preview))
    if (videoFile) URL.revokeObjectURL(videoFile.preview)
    setCaption('')
    setHashtags([])
    setHashtagInput('')
    setImages([])
    setVideoFile(null)
    setUploadType('image')
    setResult(null)
    setError(null)
    setSentBody(null)
  }

  const maxImages = uploadType === 'carousel' ? 10 : 1

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Instagram size={24} className="text-pink-500" />
        <h1 className="text-2xl font-bold text-text">인스타그램 업로드 테스트</h1>
        {connection.connected ? (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {connection.account || '연결됨'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            계정 미연결 &mdash; <a href="/settings" className="underline hover:text-red-300">설정에서 연결</a>
          </span>
        )}
      </div>

      {/* Mock 안내 */}
      <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-pink-400 shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">
          현재 Mock 모드로 동작합니다. 실제 API 연동은 추후 추가됩니다.
        </p>
      </div>

      {/* 예시 콘텐츠 */}
      <div className="bg-pink-500/5 rounded-xl border border-pink-500/20 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-text-muted">
          <p className="font-semibold text-pink-500 mb-0.5">예시 콘텐츠로 빠르게 테스트해 보세요</p>
          <p>단일 이미지 타입, 샘플 캡션과 해시태그가 자동으로 채워집니다.</p>
        </div>
        <button
          onClick={loadExample}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-500 text-white hover:bg-pink-600 transition-colors shrink-0"
        >
          예시 콘텐츠 불러오기
        </button>
      </div>

      {/* 업로드 타입 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text">업로드 타입</label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: 'image', label: '단일 이미지', icon: <ImageIcon size={14} /> },
            { value: 'carousel', label: '캐러셀 (여러 이미지)', icon: <ImageIcon size={14} /> },
            { value: 'reel', label: '릴스 (비디오)', icon: <Film size={14} /> },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all text-sm font-medium
                ${uploadType === opt.value
                  ? 'border-pink-500/50 bg-pink-500/10 text-pink-500'
                  : 'border-border bg-surface-light text-text-muted hover:border-pink-500/30'}`}
            >
              <input
                type="radio"
                name="uploadType"
                value={opt.value}
                checked={uploadType === opt.value}
                onChange={() => { setUploadType(opt.value); setImages([]); setVideoFile(null) }}
                className="hidden"
              />
              {opt.icon}
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 캡션 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <label className="text-sm font-semibold text-text">캡션</label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="캡션을 입력하세요. 해시태그(#태그)는 아래 해시태그 패널에서 별도 관리됩니다."
          rows={5}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-pink-500/40 transition-colors resize-y"
        />
        <div className="flex items-center justify-between">
          <p className={`text-xs ${strippedCaption.length > 2200 ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>
            {strippedCaption.length}/2200자
          </p>
          {caption !== strippedCaption && (
            <p className="text-[11px] text-text-muted">해시태그는 자동으로 분리됩니다</p>
          )}
        </div>
      </div>

      {/* 해시태그 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text">해시태그</label>
          <span className={`text-xs font-medium ${hashtags.length > 30 ? 'text-red-400' : 'text-text-muted'}`}>
            {hashtags.length}/30
          </span>
        </div>
        {hashtags.length > 30 && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle size={12} /> 해시태그가 30개를 초과했습니다.
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={hashtagInput}
            onChange={e => setHashtagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag() } }}
            placeholder="#태그 입력 후 Enter"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-pink-500/40 transition-colors"
          />
          <button
            onClick={addHashtag}
            disabled={!hashtagInput.trim()}
            className="px-4 py-2 bg-pink-500/10 text-pink-500 text-sm font-medium rounded-lg hover:bg-pink-500/20 border border-pink-500/30 disabled:opacity-50 transition-all flex items-center gap-1"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-500 text-xs font-medium border border-pink-500/30">
                #{t}
                <button onClick={() => removeHashtag(t)} className="hover:text-red-400 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 이미지 패널 (image / carousel) */}
      {uploadType !== 'reel' && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text flex items-center gap-2">
              <ImageIcon size={16} /> 이미지 ({images.length}/{maxImages})
            </label>
            {images.length > 0 && (
              <button
                onClick={() => { images.forEach(i => URL.revokeObjectURL(i.preview)); setImages([]) }}
                className="text-xs text-text-muted hover:text-red-400 transition-colors"
              >
                전체 삭제
              </button>
            )}
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${isDraggingImage ? 'border-pink-500 bg-pink-500/5' : 'border-border hover:border-pink-500/40'}`}
            onDragOver={e => { e.preventDefault(); setIsDraggingImage(true) }}
            onDragLeave={() => setIsDraggingImage(false)}
            onDrop={handleImageDrop}
            onClick={() => imageInputRef.current?.click()}
          >
            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple={uploadType === 'carousel'}
              onChange={e => handleImageFiles(e.target.files)}
            />
            <Upload size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text">이미지를 드래그하거나 <span className="text-pink-500 font-medium">클릭</span>하여 선택</p>
            <p className="text-xs text-text-muted mt-1">
              {uploadType === 'carousel' ? '최대 10장, 여러 파일 동시 선택 가능' : '1장만 선택 가능'}
            </p>
          </div>
          {images.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                  <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                    <p className="text-[10px] text-white truncate">{img.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 비디오 패널 (reel) */}
      {uploadType === 'reel' && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
          <label className="text-sm font-semibold text-text flex items-center gap-2">
            <Film size={16} /> 비디오 (MP4)
          </label>
          {!videoFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                ${isDraggingVideo ? 'border-pink-500 bg-pink-500/5' : 'border-border hover:border-pink-500/40'}`}
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
              <p className="text-sm text-text">비디오를 드래그하거나 <span className="text-pink-500 font-medium">클릭</span>하여 선택</p>
              <p className="text-xs text-text-muted mt-1">MP4 권장, 최대 90초</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-text-muted space-y-0.5">
                  <p className="font-medium text-text">{videoFile.name}</p>
                  {videoFile.duration !== null && (
                    <p className={videoFile.duration > 90 ? 'text-red-400 font-semibold' : ''}>
                      길이: {videoFile.duration}초
                      {videoFile.duration > 90 && ' — 90초 초과 (릴스 한도)'}
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
                ref={videoPreviewRef}
                src={videoFile.preview}
                controls
                className="w-full max-h-64 rounded-lg bg-black"
                onLoadedMetadata={handleVideoMetadata}
              />
            </div>
          )}
        </div>
      )}

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
              {result.mediaId && <p className="text-xs text-text-muted mt-1">Media ID: <span className="text-text font-mono">{result.mediaId}</span></p>}
              {result.permalink && (
                <a href={result.permalink} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-emerald-500 hover:underline mt-1 block break-all">
                  {result.permalink}
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
          className="w-full px-4 py-3.5 bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-semibold rounded-xl hover:from-pink-700 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20"
        >
          {uploading ? (
            <><Loader2 size={16} className="animate-spin" /> 업로드 중...</>
          ) : (
            <><Upload size={16} /> 인스타그램에 업로드 (Mock)</>
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
