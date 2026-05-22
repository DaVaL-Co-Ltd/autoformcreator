// 사진 아바타 생성 테스트 페이지.
// 인물 사진(PNG·JPG)을 업로드 → HeyGen 사진 아바타를 만들고 talking_photo_id 를 받는다.
// 흐름: /api/heygen/upload-asset → /api/heygen/avatar-group/create → /api/heygen/avatar-status 폴링.
// 생성된 ID 는 client/src/utils/heygenAvatars.js 의 HEYGEN_AVATARS 에 추가하면 새 아바타로 쓸 수 있다.
import { useState, useRef } from 'react'
import { Loader2, Upload, CheckCircle2, Copy, AlertCircle } from 'lucide-react'
import { readApiResponse, getApiErrorMessage } from '../utils/apiResponse.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.headers || {}) } })
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// 파일 → base64 (data URL 접두사 제거)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result || '')
      const comma = res.indexOf(',')
      resolve(comma >= 0 ? res.slice(comma + 1) : res)
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

export default function PhotoAvatarPage() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [avatarName, setAvatarName] = useState('')
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null) // { groupId, previewImageUrl, name }
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const fileInputRef = useRef(null)

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!/^image\/(png|jpe?g)$/.test(f.type)) {
      setError('PNG 또는 JPG 이미지만 업로드할 수 있습니다.')
      return
    }
    setError('')
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setResult(null)
    setStatus('idle')
  }

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1500)
  }

  const createAvatar = async () => {
    if (!file) { setError('사진 파일을 먼저 선택해주세요.'); return }
    setStatus('running')
    setError('')
    setResult(null)
    try {
      // 1) 이미지 → base64
      setProgress('이미지 읽는 중...')
      const base64 = await fileToBase64(file)

      // 2) HeyGen asset 업로드 → image_key
      setProgress('HeyGen에 이미지 업로드 중...')
      const uploadRes = await apiFetch('/api/heygen/upload-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type }),
      })
      const uploadData = await readApiResponse(uploadRes)
      if (!uploadRes.ok) throw new Error(getApiErrorMessage(uploadData, `이미지 업로드 실패 (${uploadRes.status})`))
      const imageKey = uploadData.data?.image_key
      if (!imageKey) throw new Error('image_key를 받지 못했습니다.')

      // 3) photo avatar group 생성 → group_id (= talking_photo_id)
      setProgress('사진 아바타 등록 중...')
      const name = avatarName.trim() || `photo_avatar_${Date.now()}`
      const groupRes = await apiFetch('/api/heygen/avatar-group/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image_key: imageKey }),
      })
      const groupData = await readApiResponse(groupRes)
      if (!groupRes.ok) throw new Error(getApiErrorMessage(groupData, `아바타 등록 실패 (${groupRes.status})`))
      const groupId = groupData.data?.group_id
      if (!groupId) throw new Error('group_id를 받지 못했습니다.')

      // 4) 준비 상태 폴링 (5초 간격, 최대 3분)
      let ready = false
      let previewImageUrl = null
      for (let i = 0; i < 36; i++) {
        setProgress(`아바타 학습·준비 대기 중... (${i * 5}초)`)
        const stRes = await apiFetch(`/api/heygen/avatar-status/${groupId}`)
        const stData = await readApiResponse(stRes)
        if (stRes.ok && stData.ready) {
          ready = true
          previewImageUrl = stData.data?.preview_image_url || null
          break
        }
        await delay(5000)
      }
      if (!ready) {
        throw new Error('아바타 준비가 3분 내에 끝나지 않았습니다. 잠시 후 HeyGen에서 상태를 확인해주세요. (group_id: ' + groupId + ')')
      }

      setResult({ groupId, previewImageUrl, name })
      setStatus('done')
      setProgress('')
    } catch (err) {
      setError(err.message)
      setStatus('error')
      setProgress('')
    }
  }

  const running = status === 'running'
  const snippet = result
    ? `  새_아바타_키: {
    id: '새_아바타_키',
    name: '${result.name}',
    kind: 'Person Avatar',
    avatarId: '${result.groupId}',
    defaultVoiceId: '여기에_HeyGen_voice_id',
  },`
    : ''

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">
          사진 아바타 생성 <span className="text-text-muted text-sm font-normal">(테스트)</span>
        </h1>
        <p className="text-sm text-text-muted mt-1 leading-6">
          인물 사진(PNG·JPG)을 업로드해 HeyGen 사진 아바타를 만듭니다.
          생성된 talking_photo_id를 <code className="text-xs bg-surface-light px-1 py-0.5 rounded">heygenAvatars.js</code>에 추가하면 새 아바타로 쓸 수 있습니다.
        </p>
      </div>

      {/* 사진 선택 */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4">
        <label className="block text-sm font-medium text-text mb-2">인물 사진</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={onPickFile}
          className="hidden"
        />
        {previewUrl ? (
          <div className="flex items-start gap-4">
            <img src={previewUrl} alt="미리보기" className="w-32 h-auto rounded-xl border border-border" />
            <div className="flex-1">
              <p className="text-sm text-text mb-2 break-all">{file?.name}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
                className="px-3 py-1.5 rounded-lg text-sm border border-border text-text-muted hover:bg-surface-light transition-all disabled:opacity-50"
              >
                다른 사진 선택
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-2 text-text-muted hover:border-primary hover:text-primary transition-all"
          >
            <Upload size={24} />
            <span className="text-sm">클릭해서 사진 선택 (PNG · JPG)</span>
          </button>
        )}
        <p className="text-xs text-text-muted mt-3 leading-5">
          정면을 보고 얼굴·입이 잘 보이는 인물 사진을 권장합니다. 9:16 세로 구도면 쇼츠 프레이밍에 유리합니다.
        </p>
      </div>

      {/* 아바타 이름 */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4">
        <label className="block text-sm font-medium text-text mb-2">
          아바타 이름 <span className="text-text-muted font-normal">(선택 — HeyGen에 등록될 이름)</span>
        </label>
        <input
          type="text"
          value={avatarName}
          onChange={(e) => setAvatarName(e.target.value)}
          disabled={running}
          placeholder="예: 새 선생님"
          className="w-full px-3 py-2 rounded-xl border border-border text-sm text-text focus:outline-none focus:border-primary disabled:opacity-50"
        />
      </div>

      {/* 생성 버튼 */}
      <button
        type="button"
        onClick={createAvatar}
        disabled={!file || running}
        className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {progress || '생성 중...'}
          </span>
        ) : (
          '사진 아바타 생성'
        )}
      </button>

      {/* 에러 */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* 결과 */}
      {status === 'done' && result && (
        <div className="mt-4 bg-white border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 text-green-600 mb-4">
            <CheckCircle2 size={18} />
            <span className="font-medium">사진 아바타 생성 완료</span>
          </div>

          {result.previewImageUrl && (
            <img
              src={result.previewImageUrl}
              alt="생성된 아바타"
              className="w-32 h-auto rounded-xl border border-border mb-4"
            />
          )}

          <div className="text-sm font-medium text-text mb-1">talking_photo_id</div>
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 bg-surface-light rounded-lg px-3 py-2 text-xs text-text break-all">
              {result.groupId}
            </code>
            <button
              type="button"
              onClick={() => copy(result.groupId, 'id')}
              className="px-2.5 py-2 rounded-lg border border-border text-text-muted hover:bg-surface-light transition-all shrink-0"
              title="복사"
            >
              {copied === 'id' ? <CheckCircle2 size={14} className="text-green-600" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="text-sm font-medium text-text mb-1">heygenAvatars.js 추가 코드</div>
          <p className="text-xs text-text-muted mb-2 leading-5">
            아래 코드를 <code className="bg-surface-light px-1 rounded">HEYGEN_AVATARS</code> 객체에 추가하세요.
            <code className="bg-surface-light px-1 rounded">새_아바타_키</code>는 영문 키로,
            <code className="bg-surface-light px-1 rounded">defaultVoiceId</code>는 원하는 HeyGen voice_id로 채워야 합니다.
          </p>
          <pre className="bg-surface-light rounded-lg p-3 text-xs text-text overflow-x-auto whitespace-pre">
{snippet}
          </pre>
          <button
            type="button"
            onClick={() => copy(snippet, 'snippet')}
            className="mt-2 px-3 py-1.5 rounded-lg text-sm border border-border text-text-muted hover:bg-surface-light transition-all"
          >
            {copied === 'snippet' ? '복사됨' : '코드 복사'}
          </button>
        </div>
      )}
    </div>
  )
}
