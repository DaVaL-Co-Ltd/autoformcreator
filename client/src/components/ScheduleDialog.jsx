import { useState } from 'react'
import { Calendar, Clock, X, Upload, Trash2 } from 'lucide-react'
import { create } from '../utils/scheduledUploads'
import { CHANNELS } from '../constants/channels'

const MINUTE_STEP = 10
const BLOG_MIN_LEAD_MINUTES = 10

const PLATFORM_SCHEDULE_RECOMMENDATIONS = {
  blog: {
    title: '네이버 블로그 추천 시간',
    items: ['평일 기준', '오전 7시~9시', '오후 12시~1시', '오후 7시~9시'],
  },
  instagram: {
    title: '인스타그램 추천 시간',
    items: ['화~목요일', '오전 7시~10시', '오후 12시~1시', '오후 7시~10시'],
  },
  shorts: {
    title: '유튜브 쇼츠/인스타그램 릴스 추천 시간',
    items: ['평일 기준', '오후 12시~3시', '오후 7시~10시'],
  },
}

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
  const d = date instanceof Date ? new Date(date) : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toOffsetIsoString(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
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

function getDefaultScheduleDate(initialDatetime, platform = 'blog') {
  if (initialDatetime) {
    const initialDate = new Date(initialDatetime)
    return Number.isNaN(initialDate.getTime()) ? getMinimumScheduleDate(platform) : initialDate
  }

  return new Date(Date.now() + 60 * 60 * 1000)
}

function normalizeScheduledAtForPlatform(platform, datetimeValue) {
  const requested = new Date(datetimeValue)
  if (Number.isNaN(requested.getTime())) {
    return toOffsetIsoString(getMinimumScheduleDate(platform))
  }

  return toOffsetIsoString(requested)
}

function ScheduleDialogBody({
  onClose,
  defaultPlatform,
  content,
  onSave,
  lockPlatform,
  initialDatetime,
  onDelete,
  mode,
}) {
  const [platform, setPlatform] = useState(defaultPlatform)
  const [shortsTargets, setShortsTargets] = useState(() => {
    const initialTargets = content?.uploadTargets
    if (!initialTargets || typeof initialTargets !== 'object') {
      return { instagram: true, youtube: true }
    }
    return {
      instagram: Boolean(initialTargets.instagram),
      youtube: Boolean(initialTargets.youtube),
    }
  })
  const [datetime, setDatetime] = useState(() => toLocalDatetimeValue(getDefaultScheduleDate(initialDatetime, defaultPlatform)))
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const showsNativeScheduleNotice = platform === 'blog'
  const scheduleRecommendation = PLATFORM_SCHEDULE_RECOMMENDATIONS[platform]

  const handleSubmit = async () => {
    const scheduledAt = normalizeScheduledAtForPlatform(platform, datetime)
    if (platform === 'shorts' && !shortsTargets.instagram && !shortsTargets.youtube) {
      alert('예약 업로드할 플랫폼을 하나 이상 선택해주세요.')
      return
    }
    try {
      setSaving(true)
      if (onSave) {
        await Promise.resolve(onSave({
          platform,
          scheduledAt,
          content,
          uploadTargets: platform === 'shorts' ? shortsTargets : null,
        }))
      } else {
        await create({ platform, content, scheduledAt })
      }
    } catch (error) {
      alert(error?.message || '예약 저장에 실패했습니다.')
      setSaving(false)
      return
    }

    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setSaving(false)
      onClose()
    }, 800)
  }

  const parts = (() => {
    if (datetime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(datetime)) {
      const selected = new Date(datetime)
      return {
        date: toLocalDatetimeValue(selected).slice(0, 10),
        hour: String(selected.getHours()).padStart(2, '0'),
        minute: String(selected.getMinutes()).padStart(2, '0'),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-text">{mode === 'edit' ? '예약 상세' : '예약 업로드 등록'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted mb-2">플랫폼</label>
          <div className="flex gap-2 flex-wrap">
            {(lockPlatform ? CHANNELS.filter((c) => c.key === platform) : CHANNELS).map((p) => (
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

        {platform === 'shorts' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-muted mb-2">업로드 플랫폼</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'instagram', label: '인스타그램 릴스' },
                { key: 'youtube', label: '유튜브 쇼츠' },
              ].map((target) => {
                const selected = shortsTargets[target.key]
                return (
                  <button
                    key={target.key}
                    type="button"
                    onClick={() => setShortsTargets((prev) => ({ ...prev, [target.key]: !prev[target.key] }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-primary/10 text-primary-light border-primary/30'
                        : 'bg-surface-light text-text-muted border-border hover:border-primary/40'
                    }`}
                  >
                    {target.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
              onChange={(e) => updateParts({ ...parts, date: e.target.value })}
              className="flex-1 px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
            />
            <select
              value={parts.hour}
              onChange={(e) => updateParts({ ...parts, hour: e.target.value })}
              className="px-2 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((hour) => (
                <option key={hour} value={hour}>{hour}시</option>
              ))}
            </select>
            <select
              value={parts.minute}
              onChange={(e) => updateParts({ ...parts, minute: e.target.value })}
              className="px-2 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-colors"
            >
              {Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0')).map((minute) => (
                <option key={minute} value={minute}>{minute}분</option>
              ))}
            </select>
          </div>
        </div>

        {scheduleRecommendation && (
          <div className="mb-5 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-text">{scheduleRecommendation.title}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {scheduleRecommendation.items.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-surface px-2 py-1 text-xs font-medium text-text-muted border border-border"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {content?.title && (
          <div className="mb-5 px-3 py-2 bg-surface-light rounded-lg border border-border">
            <p className="text-xs text-text-muted mb-0.5">콘텐츠</p>
            <p className="text-sm text-text font-medium truncate">{content.title}</p>
          </div>
        )}

        {showsNativeScheduleNotice && (
          <div className="mb-5 rounded-lg border border-info/20 bg-info/5 px-3 py-2.5">
            <p className="text-xs font-semibold leading-5 text-text">
              예약 시간 변경은 등록 후 이 서비스에서 <span className="text-danger">불가</span>합니다.
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
              예약 시간을 바꾸려면 해당 플랫폼 내에서 직접 수정해주세요.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {mode === 'edit' && onDelete && (
            <button
              onClick={() => {
                onDelete()
                onClose()
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={14} /> 예약 해제
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={saved || saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {saved ? (
              <>{mode === 'edit' ? '변경 완료!' : '등록 완료!'}</>
            ) : saving ? (
              <>저장 중...</>
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

export default function ScheduleDialog({
  open,
  onClose,
  defaultPlatform = 'blog',
  content = {},
  onSave,
  lockPlatform = false,
  initialDatetime,
  onDelete,
  mode = 'create',
}) {
  if (!open) return null

  const dialogKey = `${mode}:${defaultPlatform}:${initialDatetime || 'new'}:${content?.title || ''}:${JSON.stringify(content?.uploadTargets || {})}`

  return (
    <ScheduleDialogBody
      key={dialogKey}
      onClose={onClose}
      defaultPlatform={defaultPlatform}
      content={content}
      onSave={onSave}
      lockPlatform={lockPlatform}
      initialDatetime={initialDatetime}
      onDelete={onDelete}
      mode={mode}
    />
  )
}
