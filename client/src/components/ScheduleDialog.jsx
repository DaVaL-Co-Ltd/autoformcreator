import { useState, useEffect } from 'react'
import { Calendar, Clock, X, Upload, Trash2 } from 'lucide-react'
import { create } from '../utils/scheduledUploads'
import { CHANNELS } from '../constants/channels'

function toLocalDatetimeValue(date) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ScheduleDialog({ open, onClose, defaultPlatform = 'blog', content = {}, onSave, lockPlatform = false, initialDatetime, onDelete, mode = 'create' }) {
  const defaultDt = toLocalDatetimeValue(initialDatetime ? new Date(initialDatetime) : new Date(Date.now() + 60 * 60 * 1000))
  const [platform, setPlatform] = useState(defaultPlatform)
  const [datetime, setDatetime] = useState(defaultDt)
  const [immediate, setImmediate] = useState(false)
  const [saved, setSaved] = useState(false)

  // defaultPlatform이 변할 때 상태 동기화
  useEffect(() => {
    if (open) {
      setPlatform(defaultPlatform)
      setDatetime(toLocalDatetimeValue(initialDatetime ? new Date(initialDatetime) : new Date(Date.now() + 60 * 60 * 1000)))
      setImmediate(false)
      setSaved(false)
    }
  }, [open, defaultPlatform, initialDatetime])

  if (!open) return null

  const handleSubmit = () => {
    const scheduledAt = immediate
      ? new Date().toISOString()
      : new Date(datetime).toISOString()
    if (onSave) {
      onSave({ platform, scheduledAt, content, immediate })
    } else {
      create({ platform, content, scheduledAt })
    }
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  const minDatetime = toLocalDatetimeValue(new Date())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-text">{mode === 'edit' ? '예약 상세' : '예약 업로드 등록'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Platform selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted mb-2">플랫폼</label>
          <div className="flex gap-2 flex-wrap">
            {(lockPlatform ? CHANNELS.filter(c => c.key === platform) : CHANNELS).map(p => (
              <button
                key={p.key}
                onClick={() => !lockPlatform && setPlatform(p.key)}
                disabled={lockPlatform}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  platform === p.key
                    ? `${p.bg} ${p.color} ${p.border}`
                    : 'bg-surface-light text-text-muted border-border hover:border-primary/40'
                } ${lockPlatform ? 'cursor-default' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Immediate toggle (편집 모드에서는 숨김) */}
        {mode !== 'edit' && (
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => setImmediate(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${immediate ? 'bg-primary' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${immediate ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-text-muted group-hover:text-text transition-colors">즉시 업로드</span>
            </label>
          </div>
        )}

        {/* Datetime picker */}
        {!immediate && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-text-muted mb-2">
              <Clock size={14} className="inline mr-1 -mt-0.5" />
              예약 시간
            </label>
            <input
              type="datetime-local"
              value={datetime}
              min={minDatetime}
              onChange={e => setDatetime(e.target.value)}
              className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        )}

        {/* Content preview */}
        {content?.title && (
          <div className="mb-5 px-3 py-2 bg-surface-light rounded-lg border border-border">
            <p className="text-xs text-text-muted mb-0.5">콘텐츠</p>
            <p className="text-sm text-text font-medium truncate">{content.title}</p>
          </div>
        )}

        {/* Submit + (edit 모드에서) 예약 삭제 */}
        <div className="flex items-center gap-2">
          {mode === 'edit' && onDelete && (
            <button
              onClick={() => { onDelete(); onClose() }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={14} /> 예약 삭제
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={saved}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {saved ? (
              <>{mode === 'edit' ? '저장 완료!' : '등록 완료!'}</>
            ) : (
              <>
                <Upload size={15} />
                {mode === 'edit' ? '시간 수정' : '예약 등록'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
