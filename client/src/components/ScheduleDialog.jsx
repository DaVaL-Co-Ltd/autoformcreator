import { useState, useEffect } from 'react'
import { Calendar, Clock, X, Upload, Trash2 } from 'lucide-react'
import { create } from '../utils/scheduledUploads'
import { CHANNELS } from '../constants/channels'

const MINUTE_STEP = 10
const BLOG_MIN_LEAD_MINUTES = 10

function roundUpToMinuteStep(input, step = MINUTE_STEP) {
  const date = input instanceof Date ? new Date(input) : new Date(input)
  if (Number.isNaN(date.getTime())) return new Date()

  const roundedMinutes = Math.ceil(date.getMinutes() / step) * step
  date.setSeconds(0, 0)

  if (roundedMinutes >= 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0)
    return date
  }

  date.setMinutes(roundedMinutes, 0, 0)
  return date
}

function toLocalDatetimeValue(date) {
  const d = roundUpToMinuteStep(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toOffsetIsoString(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date)
  const pad = n => String(n).padStart(2, '0')
  const offsetMinutes = -d.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offsetHour = pad(Math.floor(absOffset / 60))
  const offsetMinute = pad(absOffset % 60)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${offsetHour}:${offsetMinute}`
}

function getMinimumScheduleDate(platform) {
  if (platform === 'blog') {
    return roundUpToMinuteStep(new Date(Date.now() + BLOG_MIN_LEAD_MINUTES * 60 * 1000))
  }
  return roundUpToMinuteStep(new Date())
}

function normalizeScheduledAtForPlatform(platform, datetimeValue) {
  const requested = new Date(datetimeValue)
  if (Number.isNaN(requested.getTime())) {
    return toOffsetIsoString(getMinimumScheduleDate(platform))
  }

  const rounded = roundUpToMinuteStep(requested)
  const minimum = getMinimumScheduleDate(platform)
  const effective = rounded < minimum ? minimum : rounded
  return toOffsetIsoString(effective)
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
      const initialDate = initialDatetime ? new Date(initialDatetime) : new Date(Date.now() + 60 * 60 * 1000)
      const minimumDate = getMinimumScheduleDate(defaultPlatform)
      setDatetime(toLocalDatetimeValue(initialDate < minimumDate ? minimumDate : initialDate))
      setImmediate(false)
      setSaved(false)
    }
  }, [open, defaultPlatform, initialDatetime])

  if (!open) return null

  const handleSubmit = () => {
    const scheduledAt = immediate
      ? new Date().toISOString()
      : normalizeScheduledAtForPlatform(platform, datetime)
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

  const minDatetime = toLocalDatetimeValue(getMinimumScheduleDate(platform))

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

        {/* Datetime picker (날짜 + 시 + 분 5분 단위) */}
        {!immediate && (() => {
          // datetime 문자열("YYYY-MM-DDTHH:mm") 파싱 (없으면 현재 시각 기준 5분 반올림)
          const parts = (() => {
            if (datetime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(datetime)) {
              const rounded = roundUpToMinuteStep(datetime)
              return {
                date: toLocalDatetimeValue(rounded).slice(0, 10),
                hour: String(rounded.getHours()).padStart(2, '0'),
                minute: String(rounded.getMinutes()).padStart(2, '0'),
              }
            }
            const now = roundUpToMinuteStep(new Date())
            const y = now.getFullYear()
            const mo = String(now.getMonth() + 1).padStart(2, '0')
            const da = String(now.getDate()).padStart(2, '0')
            return {
              date: `${y}-${mo}-${da}`,
              hour: String(now.getHours()).padStart(2, '0'),
              minute: String(now.getMinutes()).padStart(2, '0'),
            }
          })()
          const updateParts = (next) => {
            setDatetime(`${next.date}T${next.hour}:${next.minute}`)
          }
          const today = new Date().toISOString().slice(0, 10)
          return (
            <div className="mb-5">
              <label className="block text-sm font-medium text-text-muted mb-2">
                <Clock size={14} className="inline mr-1 -mt-0.5" />
                예약 시간
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={parts.date}
                  min={today}
                  onChange={e => updateParts({ ...parts, date: e.target.value })}
                  className="flex-1 px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
                />
                <select
                  value={parts.hour}
                  onChange={e => updateParts({ ...parts, hour: e.target.value })}
                  className="px-2 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
                >
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}시</option>
                  ))}
                </select>
                <select
                  value={parts.minute}
                  onChange={e => updateParts({ ...parts, minute: e.target.value })}
                  className="px-2 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
                >
                  {Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}분</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })()}

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
