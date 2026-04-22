import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Instagram,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  X,
  Plus,
  Image as ImageIcon,
  Film,
  AlertTriangle,
} from 'lucide-react'
import { validateInstagram } from '../utils/platformValidator'
import { formatInstagramRequest } from '../utils/platformFormatter'
import { getApiErrorMessage, readApiResponse } from '../utils/apiResponse'
import { get } from '../utils/platformConnections'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const EXAMPLE_CAPTION =
  '신규 캠페인용 인스타그램 테스트 게시물입니다.\n\n' +
  '이미지와 캡션, 해시태그 조합이 실제 업로드 요청으로 어떻게 전송되는지 점검할 수 있습니다.'
const EXAMPLE_HASHTAGS = ['테스트', '인스타그램', '업로드', '콘텐츠', '자동화']

export default function InstagramUploadTestPage() {
  const [uploadType, setUploadType] = useState('image')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState([])
  const [hashtagInput, setHashtagInput] = useState('')
  const [images, setImages] = useState([])
  const [videoFile, setVideoFile] = useState(null)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [isDraggingVideo, setIsDraggingVideo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [sentBody, setSentBody] = useState(null)
  const [connection, setConnection] = useState({ connected: false, account: null })

  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)

  useEffect(() => {
    setConnection(get('instagram'))
  }, [])

  useEffect(() => {
    return () => {
      images.forEach((image) => URL.revokeObjectURL(image.preview))
      if (videoFile?.preview) {
        URL.revokeObjectURL(videoFile.preview)
      }
    }
  }, [images, videoFile])

  const strippedCaption = caption.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim()
  const validationContent = {
    caption: strippedCaption,
    hashtags,
    imageUrls: uploadType !== 'reel' ? images.map((image) => image.preview) : [],
    videoSeconds: uploadType === 'reel' && videoFile ? videoFile.duration : undefined,
    isReel: uploadType === 'reel',
  }
  const validation = validateInstagram(validationContent)
  const maxImages = uploadType === 'carousel' ? 10 : 1

  const addHashtag = () => {
    const next = hashtagInput.trim().replace(/^#/, '')
    if (next && !hashtags.includes(next)) {
      setHashtags((prev) => [...prev, next])
    }
    setHashtagInput('')
  }

  const removeHashtag = (tag) => {
    setHashtags((prev) => prev.filter((item) => item !== tag))
  }

  const clearImages = () => {
    images.forEach((image) => URL.revokeObjectURL(image.preview))
    setImages([])
  }

  const clearVideo = () => {
    if (videoFile?.preview) {
      URL.revokeObjectURL(videoFile.preview)
    }
    setVideoFile(null)
  }

  const handleImageFiles = (files) => {
    const picked = Array.from(files || []).filter((file) => file.type.startsWith('image/'))
    const nextImages = picked.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }))

    setImages((prev) => {
      const merged = [...prev, ...nextImages].slice(0, maxImages)
      const dropped = [...prev, ...nextImages].slice(maxImages)
      dropped.forEach((image) => URL.revokeObjectURL(image.preview))
      return merged
    })
  }

  const removeImage = (index) => {
    setImages((prev) => {
      const target = prev[index]
      if (target?.preview) {
        URL.revokeObjectURL(target.preview)
      }
      return prev.filter((_, currentIndex) => currentIndex !== index)
    })
  }

  const handleVideoFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('video/')) {
        return
      }

      if (videoFile?.preview) {
        URL.revokeObjectURL(videoFile.preview)
      }

      setVideoFile({
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
        duration: null,
      })
    },
    [videoFile]
  )

  const handleVideoMetadata = (event) => {
    const duration = Math.round(event.target.duration || 0)
    setVideoFile((prev) => (prev ? { ...prev, duration } : null))
  }

  const handleImageDrop = (event) => {
    event.preventDefault()
    setIsDraggingImage(false)
    handleImageFiles(event.dataTransfer.files)
  }

  const handleVideoDrop = (event) => {
    event.preventDefault()
    setIsDraggingVideo(false)
    const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith('video/'))
    if (file) {
      handleVideoFile(file)
    }
  }

  const changeUploadType = (nextType) => {
    setUploadType(nextType)
    setError(null)
    setResult(null)
    setSentBody(null)
    clearImages()
    clearVideo()
  }

  const loadExample = () => {
    setUploadType('image')
    clearImages()
    clearVideo()
    setCaption(EXAMPLE_CAPTION)
    setHashtags(EXAMPLE_HASHTAGS)
    setError(null)
    setResult(null)
    setSentBody(null)
  }

  const upload = async () => {
    setUploading(true)
    setError(null)
    setResult(null)
    setSentBody(null)

    try {
      if (uploadType === 'reel') {
        throw new Error('현재 테스트 페이지는 이미지/캐러셀 업로드만 지원합니다. 릴 업로드는 아직 연결되지 않았습니다.')
      }

      const imageUrls = images.map((image) => image.preview)
      const instagramContent = {
        caption: strippedCaption,
        hashtags,
      }
      const body = formatInstagramRequest(instagramContent, imageUrls)
      setSentBody(body)

      const response = await fetch(`${API_BASE}/api/instagram/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-secret': import.meta.env.VITE_API_SECRET || '',
        },
        body: JSON.stringify(body),
      })

      const data = await readApiResponse(response)
      if (!data.success) {
        throw new Error(getApiErrorMessage(data, `인스타그램 업로드 실패 (${response.status})`))
      }

      setResult(data)
    } catch (uploadError) {
      console.error('[InstagramUploadTestPage] upload failed:', uploadError)
      setError(uploadError.message)
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    clearImages()
    clearVideo()
    setCaption('')
    setHashtags([])
    setHashtagInput('')
    setUploadType('image')
    setResult(null)
    setError(null)
    setSentBody(null)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Instagram size={24} className="text-pink-500" />
        <h1 className="text-2xl font-bold text-text">인스타그램 업로드 테스트</h1>
        {connection.connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {connection.account || '연결됨'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            계정 미연결
            <a href="/settings" className="underline hover:text-red-300">
              설정에서 연결
            </a>
          </span>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-pink-400" />
        <div className="space-y-1 text-xs text-text-muted">
          <p className="font-semibold text-pink-500">테스트 페이지 안내</p>
          <p>이미지 또는 캐러셀 업로드 요청 바디와 응답을 바로 확인할 수 있습니다.</p>
          <p>현재 서버는 릴 업로드를 처리하지 않으므로, 이 페이지에서도 릴 전송은 막아두었습니다.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
        <div className="space-y-1 text-xs text-text-muted">
          <p className="font-semibold text-pink-500">예시 데이터</p>
          <p>빠르게 테스트하려면 예시 데이터를 불러와서 바로 요청을 보내면 됩니다.</p>
        </div>
        <button
          onClick={loadExample}
          className="shrink-0 rounded-lg bg-pink-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pink-600"
        >
          예시 불러오기
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <label className="text-sm font-semibold text-text">업로드 유형</label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: 'image', label: '단일 이미지', icon: <ImageIcon size={14} /> },
            { value: 'carousel', label: '캐러셀', icon: <ImageIcon size={14} /> },
            { value: 'reel', label: '릴', icon: <Film size={14} /> },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                uploadType === option.value
                  ? 'border-pink-500/50 bg-pink-500/10 text-pink-500'
                  : 'border-border bg-surface-light text-text-muted hover:border-pink-500/30'
              }`}
            >
              <input
                type="radio"
                name="uploadType"
                value={option.value}
                checked={uploadType === option.value}
                onChange={() => changeUploadType(option.value)}
                className="hidden"
              />
              {option.icon}
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-surface p-5">
        <label className="text-sm font-semibold text-text">캡션</label>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="캡션을 입력하세요. 해시태그는 아래 입력란에 별도로 추가하면 됩니다."
          rows={5}
          className="w-full resize-y rounded-lg border border-border bg-surface-light px-3 py-2.5 text-sm text-text placeholder:text-text-muted/50 focus:border-pink-500/40 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <p className={`text-xs ${strippedCaption.length > 2200 ? 'font-semibold text-red-400' : 'text-text-muted'}`}>
            {strippedCaption.length}/2200자
          </p>
          {caption !== strippedCaption && (
            <p className="text-[11px] text-text-muted">캡션 안의 해시태그는 업로드 전에 자동으로 제외됩니다.</p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text">해시태그</label>
          <span className={`text-xs font-medium ${hashtags.length > 30 ? 'text-red-400' : 'text-text-muted'}`}>
            {hashtags.length}/30
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={hashtagInput}
            onChange={(event) => setHashtagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addHashtag()
              }
            }}
            placeholder="# 없이 입력 후 Enter"
            className="flex-1 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-text placeholder:text-text-muted/50 focus:border-pink-500/40 focus:outline-none"
          />
          <button
            onClick={addHashtag}
            disabled={!hashtagInput.trim()}
            className="flex items-center gap-1 rounded-lg border border-pink-500/30 bg-pink-500/10 px-4 py-2 text-sm font-medium text-pink-500 transition-all hover:bg-pink-500/20 disabled:opacity-50"
          >
            <Plus size={14} />
            추가
          </button>
        </div>

        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-1 text-xs font-medium text-pink-500"
              >
                #{tag}
                <button onClick={() => removeHashtag(tag)} className="transition-colors hover:text-red-400">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {uploadType !== 'reel' && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-text">
              <ImageIcon size={16} />
              이미지 ({images.length}/{maxImages})
            </label>
            {images.length > 0 && (
              <button onClick={clearImages} className="text-xs text-text-muted transition-colors hover:text-red-400">
                전체 삭제
              </button>
            )}
          </div>

          <div
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDraggingImage ? 'border-pink-500 bg-pink-500/5' : 'border-border hover:border-pink-500/40'
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDraggingImage(true)
            }}
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
              onChange={(event) => handleImageFiles(event.target.files)}
            />
            <Upload size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text">
              이미지를 끌어다 놓거나 <span className="font-medium text-pink-500">클릭해서 선택</span>하세요.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {uploadType === 'carousel' ? '최대 10장까지 업로드할 수 있습니다.' : '한 장만 선택할 수 있습니다.'}
            </p>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {images.map((image, index) => (
                <div key={`${image.name}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                  <img src={image.preview} alt={image.name} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                    <p className="truncate text-[10px] text-white">{image.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {uploadType === 'reel' && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-text">
            <Film size={16} />
            릴 영상 (참고용)
          </label>

          {!videoFile ? (
            <div
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                isDraggingVideo ? 'border-pink-500 bg-pink-500/5' : 'border-border hover:border-pink-500/40'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDraggingVideo(true)
              }}
              onDragLeave={() => setIsDraggingVideo(false)}
              onDrop={handleVideoDrop}
              onClick={() => videoInputRef.current?.click()}
            >
              <input
                ref={videoInputRef}
                type="file"
                className="hidden"
                accept="video/mp4,video/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    handleVideoFile(file)
                  }
                }}
              />
              <Film size={24} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text">릴 업로드 UI 확인용으로 영상을 선택할 수 있습니다.</p>
              <p className="mt-1 text-xs text-text-muted">현재 서버 전송은 지원하지 않으며, 파일 선택과 길이 점검만 가능합니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-xs text-text-muted">
                  <p className="font-medium text-text">{videoFile.name}</p>
                  {videoFile.duration !== null && (
                    <p className={videoFile.duration > 90 ? 'font-semibold text-red-400' : ''}>
                      길이: {videoFile.duration}초
                      {videoFile.duration > 90 && ' (릴 권장 길이 초과)'}
                    </p>
                  )}
                </div>
                <button
                  onClick={clearVideo}
                  className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-red-400"
                >
                  <X size={13} />
                  제거
                </button>
              </div>
              <video
                src={videoFile.preview}
                controls
                className="max-h-64 w-full rounded-lg bg-black"
                onLoadedMetadata={handleVideoMetadata}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text">검증 결과</label>
          <span className="text-xs text-text-muted">
            {validation.warnings.length > 0 && <span className="mr-2 text-yellow-500">경고 {validation.warnings.length}개</span>}
            {validation.errors.length > 0 && <span className="text-red-400">오류 {validation.errors.length}개</span>}
            {validation.valid && validation.warnings.length === 0 && <span className="text-emerald-500">검증 통과</span>}
          </span>
        </div>

        {validation.errors.length === 0 && validation.warnings.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-500">
            <CheckCircle size={13} />
            현재 입력값은 제한 조건을 통과했습니다.
          </p>
        )}

        {validation.errors.map((item, index) => (
          <div
            key={`error-${index}`}
            className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400"
          >
            <XCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              [{item.field}] {item.message}
            </span>
          </div>
        ))}

        {validation.warnings.map((item, index) => (
          <div
            key={`warning-${index}`}
            className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-500"
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              [{item.field}] {item.message}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <p className="whitespace-pre-wrap text-sm text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text">업로드 완료</p>
              <p className="mt-0.5 text-xs text-text-muted">응답 데이터를 그대로 표시합니다.</p>
              {result.mediaId && (
                <p className="mt-1 text-xs text-text-muted">
                  Media ID: <span className="font-mono text-text">{result.mediaId}</span>
                </p>
              )}
              {result.permalink && (
                <a
                  href={result.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-xs text-emerald-500 hover:underline"
                >
                  {result.permalink}
                </a>
              )}
            </div>
            <button
              onClick={reset}
              className="shrink-0 rounded-lg border border-border bg-surface-light px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:bg-surface"
            >
              초기화
            </button>
          </div>
        </div>
      )}

      {(sentBody || result) && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <label className="text-sm font-semibold text-text">요청 / 응답 데이터</label>

          {sentBody && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-muted">요청 바디</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-light p-3 font-mono text-xs text-text">
                {JSON.stringify(sentBody, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-muted">응답 데이터</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-light p-3 font-mono text-xs text-text">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-0 bg-background py-2">
        <button
          onClick={upload}
          disabled={uploading || !validation.valid}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition-all hover:from-pink-700 hover:to-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 업로드 중...
            </>
          ) : (
            <>
              <Upload size={16} /> 인스타그램 업로드 테스트
            </>
          )}
        </button>

        {!connection.connected && (
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-text-muted">
            <AlertTriangle size={11} />
            계정 연결 없이도 요청 형식 테스트는 가능하지만, 실제 업로드는 서버 설정 상태에 따라 실패할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}
