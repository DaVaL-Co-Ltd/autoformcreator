import { useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle, Clock, Loader2, X, Upload, Trash2 } from 'lucide-react'
import { create } from '../utils/scheduledUploads'
import { CHANNELS } from '../constants/channels'
import { fetchPlatformAccounts } from '../services/platformSessions'

const MINUTE_STEP = 10
const BLOG_MIN_LEAD_MINUTES = 10

// 분 select 의 고정 선택지 (00·10·20·…·50)
const MINUTE_OPTIONS = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'))

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
    items: ['평일 오전 11시~오후 1시', '평일 오후 5시~8시', '주말 오후 8시~밤 12시'],
  },
  shorts_instagram: {
    title: '인스타그램 릴스 추천 시간',
    items: ['평일 오전 11시~오후 1시', '평일 오후 5시~8시', '주말 오후 8시~밤 12시'],
  },
  shorts_youtube: {
    title: '유튜브 쇼츠 추천 시간',
    items: ['평일 오전 11시~오후 1시', '평일 오후 5시~8시', '주말 오후 8시~밤 12시'],
  },
}

// CHANNELS 에 없는 숏폼 플랫폼별 예약 키의 표시 라벨
const SUB_PLATFORM_LABELS = {
  shorts_instagram: '인스타그램 릴스',
  shorts_youtube: '유튜브 쇼츠',
}

const ACCOUNT_PLATFORM_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
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

  // 기본 시간(지금부터 1시간 뒤)도 분 select 선택지에 맞춰 10분 단위로 올림한다.
  // 올림하지 않으면 datetime 상태(예: 15:23)와 드롭다운 표시(옵션에 없어 빈칸/00분)가
  // 어긋나, 사용자가 본 시간과 실제 저장 시간이 달라진다.
  return roundUpToMinuteStep(new Date(Date.now() + 60 * 60 * 1000))
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
  const [accountOptions, setAccountOptions] = useState({})
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => ({
    instagram: content?.accountIdsByPlatform?.instagram || [],
    youtube: content?.accountIdsByPlatform?.youtube || [],
  }))
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')

  const showsNativeScheduleNotice = platform === 'blog'
  const scheduleRecommendation = PLATFORM_SCHEDULE_RECOMMENDATIONS[platform]
  const accountPlatforms = useMemo(() => {
    if (platform === 'instagram' || platform === 'shorts_instagram') return ['instagram']
    if (platform === 'shorts_youtube') return ['youtube']
    if (platform === 'shorts') {
      return [
        shortsTargets.instagram ? 'instagram' : null,
        shortsTargets.youtube ? 'youtube' : null,
      ].filter(Boolean)
    }
    return []
  }, [platform, shortsTargets.instagram, shortsTargets.youtube])

  useEffect(() => {
    if (!accountPlatforms.length) return undefined

    let active = true
    ;(async () => {
      setAccountLoading(true)
      setAccountError('')
      try {
        const entries = await Promise.all(
          accountPlatforms.map(async (accountPlatform) => [
            accountPlatform,
            await fetchPlatformAccounts(accountPlatform),
          ]),
        )
        if (!active) return

        const nextOptions = Object.fromEntries(entries)
        setAccountOptions((previous) => ({ ...previous, ...nextOptions }))
        setSelectedAccountIds((previous) => {
          const next = { ...previous }
          entries.forEach(([accountPlatform, accounts]) => {
            const savedIds = content?.accountIdsByPlatform?.[accountPlatform]
            const singlePlatformSavedIds = content?.accountIds && accountPlatforms.length === 1
              ? content.accountIds
              : null
            const preferredIds = Array.isArray(savedIds)
              ? savedIds
              : Array.isArray(singlePlatformSavedIds)
                ? singlePlatformSavedIds
                : null
            next[accountPlatform] = preferredIds || previous[accountPlatform] || accounts.map((account) => account.id)
          })
          return next
        })
      } catch (error) {
        if (active) setAccountError(error.message)
      } finally {
        if (active) setAccountLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [accountPlatforms, content])

  const toggleAccount = (accountPlatform, accountId) => {
    setSelectedAccountIds((previous) => {
      const current = previous[accountPlatform] || []
      return {
        ...previous,
        [accountPlatform]: current.includes(accountId)
          ? current.filter((id) => id !== accountId)
          : [...current, accountId],
      }
    })
  }

  const toggleAllAccounts = (accountPlatform) => {
    const accounts = accountOptions[accountPlatform] || []
    const current = selectedAccountIds[accountPlatform] || []
    const allSelected = accounts.length > 0 && current.length === accounts.length
    setSelectedAccountIds((previous) => ({
      ...previous,
      [accountPlatform]: allSelected ? [] : accounts.map((account) => account.id),
    }))
  }

  const handleSubmit = async () => {
    const scheduledAt = normalizeScheduledAtForPlatform(platform, datetime)
    if (platform === 'shorts' && !shortsTargets.instagram && !shortsTargets.youtube) {
      alert('예약 업로드할 플랫폼을 하나 이상 선택해주세요.')
      return
    }
    for (const accountPlatform of accountPlatforms) {
      const accounts = accountOptions[accountPlatform] || []
      const selected = selectedAccountIds[accountPlatform] || []
      if (accounts.length === 0) {
        alert(`${ACCOUNT_PLATFORM_LABELS[accountPlatform]} 연결 계정을 먼저 추가해주세요.`)
        return
      }
      if (selected.length === 0) {
        alert(`${ACCOUNT_PLATFORM_LABELS[accountPlatform]} 예약 업로드 계정을 하나 이상 선택해주세요.`)
        return
      }
    }

    const accountIdsByPlatform = accountPlatforms.reduce((accumulator, accountPlatform) => {
      accumulator[accountPlatform] = selectedAccountIds[accountPlatform] || []
      return accumulator
    }, {})
    const accountIds = accountPlatforms.length === 1 ? accountIdsByPlatform[accountPlatforms[0]] : []

    try {
      setSaving(true)
      if (onSave) {
        await Promise.resolve(onSave({
          platform,
          scheduledAt,
          content,
          uploadTargets: platform === 'shorts' ? shortsTargets : null,
          accountIds,
          accountIdsByPlatform,
        }))
      } else {
        await create({ platform, content, scheduledAt, accountIds, accountIdsByPlatform })
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

  // 기존 예약 시간이 10분 단위가 아니면(레거시·네이티브 예약) 그 분도 선택지에 포함해
  // 드롭다운이 실제 저장된 분과 다른 값을 보여주지 않게 한다.
  const minuteChoices = MINUTE_OPTIONS.includes(parts.minute)
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, parts.minute].sort((a, b) => Number(a) - Number(b))

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
            {lockPlatform && !CHANNELS.some((c) => c.key === platform) ? (
              // CHANNELS 에 없는 숏폼 플랫폼별 예약 키(shorts_instagram/shorts_youtube)
              <span className="px-3 py-1.5 rounded-full text-sm font-medium border bg-primary/10 text-primary-light border-primary/30 cursor-default">
                {SUB_PLATFORM_LABELS[platform] || platform}
              </span>
            ) : (
              (lockPlatform ? CHANNELS.filter((c) => c.key === platform) : CHANNELS).map((p) => (
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
              ))
            )}
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

        {accountPlatforms.length > 0 && (
          <div className="mb-5 space-y-3">
            <label className="block text-sm font-medium text-text-muted">예약 업로드 계정</label>
            {accountLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-light py-4 text-sm text-text-muted">
                <Loader2 size={15} className="animate-spin" />
                계정 목록을 불러오는 중...
              </div>
            ) : accountError ? (
              <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {accountError}
              </div>
            ) : (
              accountPlatforms.map((accountPlatform) => {
                const accounts = accountOptions[accountPlatform] || []
                const selectedIds = selectedAccountIds[accountPlatform] || []
                const allSelected = accounts.length > 0 && selectedIds.length === accounts.length

                return (
                  <div key={accountPlatform} className="rounded-lg border border-border bg-surface-light p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text">{ACCOUNT_PLATFORM_LABELS[accountPlatform]}</span>
                      {accounts.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleAllAccounts(accountPlatform)}
                          className="text-xs font-medium text-primary hover:text-primary-dark"
                        >
                          {allSelected ? '전체 해제' : '전체 선택'}
                        </button>
                      )}
                    </div>
                    {accounts.length === 0 ? (
                      <p className="text-xs leading-5 text-text-muted">연결된 계정이 없습니다. 설정에서 계정을 먼저 추가해주세요.</p>
                    ) : (
                      <div className="space-y-2">
                        {accounts.map((account) => {
                          const selected = selectedIds.includes(account.id)
                          return (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => toggleAccount(accountPlatform, account.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                selected
                                  ? 'border-primary/30 bg-primary/5'
                                  : 'border-border bg-white hover:border-primary/30'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-text">
                                  {account.displayName || account.username || account.id}
                                </div>
                                <div className="truncate text-[11px] text-text-muted">
                                  {account.providerAccountId || account.id}
                                </div>
                              </div>
                              <span className={`h-5 w-5 rounded-md border ${selected ? 'border-primary bg-primary' : 'border-border bg-white'}`}>
                                {selected ? <CheckCircle size={18} className="text-white" /> : null}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
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
              {minuteChoices.map((minute) => (
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

  const dialogKey = `${mode}:${defaultPlatform}:${initialDatetime || 'new'}:${content?.title || ''}:${JSON.stringify(content?.uploadTargets || {})}:${JSON.stringify(content?.accountIdsByPlatform || {})}:${JSON.stringify(content?.accountIds || [])}`

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
