import { useState, useRef, useEffect } from 'react'
import {
  Upload, Loader2, CheckCircle, XCircle, X, Plus, Image as ImageIcon,
  ExternalLink, Eye, EyeOff, RefreshCw, Film, AlertTriangle,
} from 'lucide-react'

const UPLOAD_SERVER = 'http://localhost:3000'

export default function NaverBlogUploadTestPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [photos, setPhotos] = useState([])
  const [showBrowser, setShowBrowser] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [serverStatus, setServerStatus] = useState('checking') // checking | online | offline
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetch(`${UPLOAD_SERVER}/`, { method: 'GET' })
      .then(r => setServerStatus(r.ok ? 'online' : 'offline'))
      .catch(() => setServerStatus('offline'))
  }, [])

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  const removeTag = (t) => setTags(tags.filter(x => x !== t))

  const handleFiles = (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const newPhotos = imgs.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
    }))
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 20))
  }

  const removePhoto = (idx) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const upload = async () => {
    if (!title.trim() || !content.trim()) {
      setError('제목과 본문을 입력해주세요.')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('content', content)
      formData.append('tags', JSON.stringify(tags))
      formData.append('showBrowser', showBrowser ? 'true' : 'false')
      photos.forEach(p => formData.append('photos', p.file))

      const res = await fetch(`${UPLOAD_SERVER}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.success) {
        setResult({ url: data.url })
      } else {
        setError(data.error || '업로드 실패')
      }
    } catch (err) {
      setError(`업로드 서버 연결 실패: ${err.message}`)
    }
    setUploading(false)
  }

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    setTitle('')
    setContent('')
    setTags([])
    setTagInput('')
    setPhotos([])
    setResult(null)
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-text">네이버 블로그 업로드 테스트</h1>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500">RPA (Playwright)</span>
      </div>

      {/* 서버 상태 */}
      <div className={`rounded-xl border p-4 ${
        serverStatus === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' :
        serverStatus === 'offline' ? 'bg-red-500/5 border-red-500/20' :
        'bg-surface border-border'
      }`}>
        <div className="flex items-start gap-3">
          {serverStatus === 'checking' && <Loader2 size={18} className="text-text-muted animate-spin mt-0.5" />}
          {serverStatus === 'online' && <CheckCircle size={18} className="text-emerald-500 mt-0.5" />}
          {serverStatus === 'offline' && <XCircle size={18} className="text-red-400 mt-0.5" />}
          <div className="flex-1">
            <p className="text-sm font-medium text-text">
              업로드 서버 ({UPLOAD_SERVER}): {' '}
              {serverStatus === 'checking' && '연결 확인 중...'}
              {serverStatus === 'online' && '정상'}
              {serverStatus === 'offline' && '오프라인'}
            </p>
            {serverStatus === 'offline' && (
              <div className="text-xs text-text-muted mt-1 space-y-0.5">
                <p>C:\daval\upload_blog 폴더에서 다음 명령어로 서버를 실행하세요:</p>
                <code className="block bg-surface-light px-2 py-1 rounded mt-1 font-mono text-text">cd C:\daval\upload_blog && npm start</code>
                <p className="mt-1.5">최초 1회는 네이버 로그인이 필요합니다: <code className="bg-surface-light px-1.5 py-0.5 rounded font-mono">npm run login</code></p>
              </div>
            )}
          </div>
          <button
            onClick={() => { setServerStatus('checking'); fetch(`${UPLOAD_SERVER}/`).then(r => setServerStatus(r.ok ? 'online' : 'offline')).catch(() => setServerStatus('offline')) }}
            className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors"
            title="다시 확인"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 예시 본문 불러오기 */}
      <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-text-muted">
          <p className="font-semibold text-emerald-500 mb-0.5">📝 순차 배치 테스트</p>
          <p>본문에 <code className="bg-surface-light px-1 py-0.5 rounded text-[11px]">[IMG:1]</code>, <code className="bg-surface-light px-1 py-0.5 rounded text-[11px]">[IMG:2]</code> ... 마커를 넣으면 그 위치에 해당 번호 이미지가 삽입됩니다.</p>
        </div>
        <button
          onClick={() => {
            setTitle('[테스트] 순차 배치 블로그 업로드 예시')
            setContent(`안녕하세요, 여러분! 오늘은 가을에 딱 어울리는 여행지를 소개해드리려 해요.

첫 번째로 소개할 곳은 바로 이곳입니다.

[IMG:1]

한적하고 조용한 분위기 덕분에 힐링이 필요한 분들께 특히 추천드려요. 산책하기에도 좋고, 사진 찍기에도 정말 좋은 장소랍니다.

이어서 두 번째 장소를 볼까요?

[IMG:2]

여기는 계절감이 정말 잘 느껴지는 곳인데요, 특히 오후 햇살이 들어올 때가 가장 아름다워요. 따뜻한 커피 한 잔과 함께 여유를 즐겨보세요.

마지막 스팟은 바로 이곳입니다.

[IMG:3]

가족, 연인, 친구 누구와 와도 좋은 공간이에요. 각자의 인생샷을 남겨보시길 바라요!

오늘 소개한 세 곳, 여러분의 취향에 맞는 곳이 있었길 바라요. 방문하신 후기도 댓글로 공유해주시면 감사하겠습니다 :)`)
            setTags(['여행', '가을여행', '힐링스팟', '국내여행'])
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shrink-0"
        >
          예시 본문 불러오기
        </button>
      </div>

      {/* 제목 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <label className="text-sm font-semibold text-text">제목</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="블로그 글 제목을 입력하세요"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-emerald-500/40 transition-colors"
        />
      </div>

      {/* 본문 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
        <label className="text-sm font-semibold text-text">본문</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={`블로그 글 내용을 입력하세요.\n\n[IMG:1]처럼 마커를 넣으면 그 위치에 1번 이미지가 삽입됩니다.`}
          rows={12}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-emerald-500/40 transition-colors resize-y font-mono"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">{content.length}자</p>
          <p className="text-[11px] text-text-muted">
            이미지 마커: <span className="text-emerald-600 font-semibold">{(content.match(/\[IMG:\d+\]/g) || []).length}개</span>
          </p>
        </div>
      </div>

      {/* 이미지 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text flex items-center gap-2">
            <ImageIcon size={16} /> 이미지 ({photos.length}/20)
          </label>
          {photos.length > 0 && (
            <button
              onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.preview)); setPhotos([]) }}
              className="text-xs text-text-muted hover:text-danger transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
            ${isDragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:border-emerald-500/40'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            multiple
            onChange={e => handleFiles(e.target.files)}
          />
          <Upload size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm text-text">이미지를 드래그하거나 <span className="text-emerald-500 font-medium">클릭</span>하여 선택</p>
          <p className="text-xs text-text-muted mt-1">최대 20장, 여러 파일 동시 선택 가능</p>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p.preview} alt={p.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                  <p className="text-[10px] text-white truncate">{p.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 태그 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text">태그</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="태그 입력 후 Enter"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface-light text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
          <button
            onClick={addTag}
            disabled={!tagInput.trim()}
            className="px-4 py-2 bg-emerald-500/10 text-emerald-500 text-sm font-medium rounded-lg hover:bg-emerald-500/20 border border-emerald-500/30 disabled:opacity-50 transition-all flex items-center gap-1"
          >
            <Plus size={14} /> 추가
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium border border-emerald-500/30">
                #{t}
                <button onClick={() => removeTag(t)} className="hover:text-danger transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 옵션 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <label className="text-sm font-semibold text-text">실행 옵션</label>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-light transition-colors">
          <input
            type="checkbox"
            checked={showBrowser}
            onChange={e => setShowBrowser(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          <div className="flex-1">
            <p className="text-sm text-text flex items-center gap-1.5">
              {showBrowser ? <Eye size={14} /> : <EyeOff size={14} />}
              브라우저 창 표시 (showBrowser)
            </p>
            <p className="text-xs text-text-muted mt-0.5">체크 시 자동화 과정을 직접 볼 수 있습니다. 체크 해제 시 headless 모드로 실행됩니다.</p>
          </div>
        </label>
      </div>

      {/* 에러 / 결과 */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">업로드 성공!</p>
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 mt-1 text-xs text-emerald-500 hover:underline font-medium break-all"
              >
                {result.url} <ExternalLink size={11} className="shrink-0" />
              </a>
            )}
          </div>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-light hover:bg-surface text-text-muted border border-border transition-all"
          >
            새 글 작성
          </button>
        </div>
      )}

      {/* 업로드 버튼 */}
      <div className="sticky bottom-0 bg-background py-2">
        <button
          onClick={upload}
          disabled={uploading || serverStatus !== 'online' || !title.trim() || !content.trim()}
          className="w-full px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          {uploading ? (
            <><Loader2 size={16} className="animate-spin" /> 업로드 중... (최대 1~2분 소요)</>
          ) : (
            <><Upload size={16} /> 네이버 블로그에 업로드</>
          )}
        </button>
        {serverStatus !== 'online' && (
          <p className="text-xs text-center text-text-muted mt-2 flex items-center justify-center gap-1">
            <AlertTriangle size={11} /> 업로드 서버가 실행 중이어야 합니다
          </p>
        )}
      </div>
    </div>
  )
}
