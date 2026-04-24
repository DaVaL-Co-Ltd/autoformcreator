import { useState, useEffect, useCallback } from 'react'
import {
  Calendar, Clock, Upload, CheckCircle, XCircle, AlertTriangle,
  Trash2, RefreshCw, Loader2
} from 'lucide-react'
import { getAll, update, remove } from '../utils/scheduledUploads'
import { getChannel } from '../constants/channels'

// Build PLATFORM_CONFIG from CHANNELS for fast lookup
const buildPlatformConfig = (key) => {
  const ch = getChannel(key)
  if (!ch) return { label: key, icon: null, color: 'text-text-muted', bg: 'bg-surface-light', border: 'border-border' }
  return { label: ch.label, icon: ch.Icon, color: ch.color, bg: ch.bg, border: ch.border }
}

const STATUS_CONFIG = {
  pending: {
    label: '대기중',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: Clock,
  },
  uploading: {
    label: '업로드중',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    icon: Loader2,
  },
  completed: {
    label: '완료',
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: CheckCircle,
  },
  failed: {
    label: '실패',
    color: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/30',
    icon: XCircle,
  },
}

const STATUS_ORDER = ['uploading', 'pending', 'failed', 'completed']

function formatKoreanDate(isoString) {
  const d = new Date(isoString)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${year}년 ${month}월 ${day}일 ${hours}:${mins}`
}

function UploadCard({ item, onRefresh }) {
  const platform = buildPlatformConfig(item.platform)
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending
  const PlatformIcon = platform.icon
  const StatusIcon = status.icon

  const handleCancel = async () => {
    await remove(item.id).catch(err => console.error(err))
    onRefresh()
  }

  const handleImmediateUpload = async () => {
    await update(item.id, { scheduledAt: new Date().toISOString() }).catch(err => console.error(err))
    onRefresh()
  }

  const handleRetry = async () => {
    await update(item.id, { status: 'pending', error: null, scheduledAt: new Date().toISOString() }).catch(err => console.error(err))
    onRefresh()
  }

  const handleDelete = async () => {
    await remove(item.id).catch(err => console.error(err))
    onRefresh()
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      {/* Top row: platform + status */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${platform.bg} ${platform.color} ${platform.border}`}>
          <PlatformIcon size={13} />
          {platform.label}
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border}`}>
          <StatusIcon size={13} className={item.status === 'uploading' ? 'animate-spin' : ''} />
          {status.label}
        </div>
      </div>

      {/* Content title */}
      <div>
        <p className="text-sm font-medium text-text truncate">
          {item.content?.title || '(제목 없음)'}
        </p>
        {item.error && (
          <p className="text-xs text-danger mt-1 flex items-center gap-1">
            <AlertTriangle size={11} />
            {item.error}
          </p>
        )}
      </div>

      {/* Scheduled time */}
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Calendar size={12} />
        <span>예약: {formatKoreanDate(item.scheduledAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        {item.status === 'pending' && (
          <>
            <button
              onClick={handleImmediateUpload}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 rounded-lg border border-primary/30 transition-colors"
            >
              <Upload size={12} />
              즉시 업로드
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-muted hover:text-danger bg-surface-light hover:bg-danger/10 rounded-lg border border-border hover:border-danger/30 transition-colors"
            >
              <XCircle size={12} />
              취소
            </button>
          </>
        )}
        {item.status === 'failed' && (
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-warning bg-warning/10 hover:bg-warning/20 rounded-lg border border-warning/30 transition-colors"
          >
            <RefreshCw size={12} />
            다시 시도
          </button>
        )}
        {(item.status === 'completed' || item.status === 'failed') && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-muted hover:text-danger bg-surface-light hover:bg-danger/10 rounded-lg border border-border hover:border-danger/30 transition-colors ml-auto"
          >
            <Trash2 size={12} />
            삭제
          </button>
        )}
      </div>
    </div>
  )
}

export default function ScheduledUploadsPage() {
  const [items, setItems] = useState([])

  const refresh = useCallback(async () => {
    const data = await getAll()
    setItems(data)
  }, [])

  useEffect(() => {
    let active = true

    const refreshWithinEffect = async () => {
      const data = await getAll()
      if (active) {
        setItems(data)
      }
    }

    refreshWithinEffect()
    const interval = setInterval(refreshWithinEffect, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [refresh])

  const grouped = STATUS_ORDER.reduce((acc, status) => {
    const filtered = items.filter(item => item.status === status)
    if (filtered.length > 0) acc[status] = filtered
    return acc
  }, {})

  const hasItems = items.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <Calendar size={20} className="text-primary" />
            예약 업로드
          </h1>
          <p className="text-sm text-text-muted mt-1">예약된 업로드를 관리합니다</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted hover:text-text bg-surface border border-border hover:border-primary/40 rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      {/* Empty state */}
      {!hasItems && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-light border border-border flex items-center justify-center mb-4">
            <Calendar size={24} className="text-text-muted" />
          </div>
          <p className="text-text font-medium mb-1">예약된 업로드가 없습니다</p>
          <p className="text-sm text-text-muted">콘텐츠 결과 페이지에서 예약 업로드를 등록해 보세요</p>
        </div>
      )}

      {/* Grouped cards */}
      {Object.entries(grouped).map(([status, statusItems]) => {
        const config = STATUS_CONFIG[status]
        const GroupIcon = config.icon
        return (
          <div key={status} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <GroupIcon size={15} className={`${config.color} ${status === 'uploading' ? 'animate-spin' : ''}`} />
              <h2 className={`text-sm font-semibold ${config.color}`}>{config.label}</h2>
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full font-medium ${config.bg} ${config.color} border ${config.border}`}>
                {statusItems.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {statusItems.map(item => (
                <UploadCard key={item.id} item={item} onRefresh={refresh} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
