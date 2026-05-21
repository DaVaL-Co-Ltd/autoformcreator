import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  FileText,
  Film,
  FolderOpen,
  Image,
  Loader2,
  Mail,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { deleteExtractionChannel, getExtractionById, getExtractions, updateUploadStatus } from '../services/storage'
import ScheduleDialog from '../components/ScheduleDialog'
import { create as createScheduledUpload, getAll as getAllScheduledUploads, remove as removeScheduledUpload } from '../utils/scheduledUploads'
import { buildInstagramScheduledContent, buildInstagramScheduledUploadContent } from '../utils/scheduledPayloads'
import {
  SHORTS_PLATFORMS,
  aggregateShortsStatus,
  buildShortsUploadStatus,
  deriveShortsPlatforms,
  shortsPlatformFromSchedule,
  shortsSchedulePlatform,
} from '../utils/shortsUploadStatus'

const channelConfig = {
  all: { label: '전체', icon: FileText, color: 'text-text', bg: 'bg-surface-light' },
  blog: { label: '네이버 블로그', icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  newsletter: { label: '뉴스레터', icon: Mail, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  instagram: { label: '인스타그램', icon: Image, color: 'text-pink-400', bg: 'bg-pink-400/10' },
  shorts: { label: '유튜브 쇼츠/릴스', icon: Film, color: 'text-red-500', bg: 'bg-red-500/10' },
}

const _uploadStatusConfig = {
  all: { label: '전체' },
  not_uploaded: { label: '미업로드', icon: Upload },
  scheduled: { label: '예약 완료', icon: Calendar },
  uploaded: { label: '업로드 완료', icon: CheckCircle },
}

function toContentItems(extractions, scheduledMap = new Map()) {
  return extractions.flatMap(ext =>
    ext.channels.map(ch => {
      const uploadInfo = ext.uploadStatus?.[ch.channel] || { status: 'not_uploaded' }
      const nativeSchedule = Boolean(uploadInfo.nativeSchedule)
      const scheduledMeta = scheduledMap.get(`${ext.id}:${ch.channel}`) || null

      // 숏폼은 인스타그램/유튜브 상태를 따로 추적한다.
      const isShorts = ch.channel === 'shorts'
      const shortsPlatforms = isShorts ? deriveShortsPlatforms(uploadInfo) : null
      const shortsScheduledRows = isShorts
        ? {
          instagram: scheduledMap.get(`${ext.id}:shorts_instagram`) || null,
          youtube: scheduledMap.get(`${ext.id}:shorts_youtube`) || null,
        }
        : null

      return {
        extractionId: ext.id,
        channel: ch.channel,
        title: ch.title,
        source: ext.fileName,
        date: new Date(ext.createdAt).toLocaleDateString('ko-KR'),
        time: new Date(ext.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        cards: ch.channel === 'instagram' ? ext.data?.instagramContent?.cards?.length : null,
        data: ext.data,
        nativeSchedule,
        uploadStatus: isShorts ? aggregateShortsStatus(shortsPlatforms) : uploadInfo.status,
        uploadStatusMap: ext.uploadStatus || {},
        shortsPlatforms,
        shortsScheduledRows,
        scheduledAt: uploadInfo.scheduledAt || null,
        uploadedAt: uploadInfo.uploadedAt || null,
        scheduledId: scheduledMeta?.id || null,
        scheduledContent: scheduledMeta?.content || null,
        uploadTargets: uploadInfo.uploadTargets || scheduledMeta?.content?.uploadTargets || null,
      }
    })
  )
}

function matchesFilters(item, activeChannel, activeStatus, searchQuery) {
  if (activeChannel !== 'all' && item.channel !== activeChannel) return false
  const isNativeSchedule = Boolean(item.nativeSchedule && item.scheduledAt)
  if (activeStatus === 'scheduled' && !(item.uploadStatus === 'scheduled' || isNativeSchedule)) return false
  if (activeStatus === 'uploaded' && !(item.uploadStatus === 'uploaded' && !isNativeSchedule)) return false
  if (!['all', 'scheduled', 'uploaded'].includes(activeStatus) && item.uploadStatus !== activeStatus) return false
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    if (!item.title?.toLowerCase().includes(query) && !item.source?.toLowerCase().includes(query)) return false
  }
  return true
}

// 상세보기 왕복 시 목록 상태(필터·페이지·검색·데이터·스크롤)를 그대로 복원하기 위한 모듈 레벨 스냅샷.
let pageStateSnapshot = null

export default function ContentPage() {
  const navigate = useNavigate()
  // 첫 렌더 시점의 스냅샷을 고정 캡처한다.
  const snap = useRef(pageStateSnapshot).current

  const [activeChannel, setActiveChannel] = useState(snap?.activeChannel ?? 'all')
  const [activeStatus, setActiveStatus] = useState(snap?.activeStatus ?? 'all')
  const [contents, setContents] = useState(snap?.contents ?? [])
  const [hasNextPage, setHasNextPage] = useState(snap?.hasNextPage ?? false)
  const [totalPages, setTotalPages] = useState(snap?.totalPages ?? 1)
  const [aggregateCounts, setAggregateCounts] = useState(snap?.aggregateCounts ?? {
    all: 0,
    not_uploaded: 0,
    scheduled: 0,
    uploaded: 0,
  })
  const [initialLoading, setInitialLoading] = useState(!snap)
  const [listLoading, setListLoading] = useState(false)
  const hasLoadedOnceRef = useRef(Boolean(snap))
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [editScheduleTarget, setEditScheduleTarget] = useState(null)
  const [uploadingIds, setUploadingIds] = useState(new Set())
  const [pageSize, setPageSize] = useState(snap?.pageSize ?? 10)
  const [currentPage, setCurrentPage] = useState(snap?.currentPage ?? 1)
  const [searchQuery, setSearchQuery] = useState(snap?.searchQuery ?? '')

  const refreshContents = useCallback(async (
    showSpinner = false,
    page = currentPage,
    size = pageSize,
    channel = activeChannel,
    status = activeStatus,
    query = searchQuery,
  ) => {
    if (showSpinner) {
      if (hasLoadedOnceRef.current) {
        setListLoading(true)
      } else {
        setInitialLoading(true)
      }
    }

    try {
      const [scheduledRows, extractionResult] = await Promise.all([
        getAllScheduledUploads(),
        getExtractions(),
      ])
      const scheduledMap = new Map(
        scheduledRows
          .filter((row) => row.status === 'pending')
          .map((row) => [`${row.extractionId}:${row.platform}`, row]),
      )

      const allItems = toContentItems(extractionResult.items || [], scheduledMap)
      const filtered = allItems.filter(item => matchesFilters(item, channel, status, query))
      const totalMatched = filtered.length
      const startIndex = (page - 1) * size
      const pageItems = filtered.slice(startIndex, startIndex + size)
      const resolvedTotalPages = Math.max(1, Math.ceil(totalMatched / size))

      const serverStats = extractionResult.aggregateCounts?.[channel] || null
      const nextCounts = (serverStats && !query)
        ? {
          all: serverStats.all,
          not_uploaded: serverStats.not_uploaded,
          scheduled: serverStats.scheduled,
          uploaded: serverStats.uploaded,
        }
        : (() => {
          const counted = allItems.filter(item => matchesFilters(item, channel, 'all', query))
          const counts = { all: 0, not_uploaded: 0, scheduled: 0, uploaded: 0 }
          counted.forEach((item) => {
            counts.all += 1
            if (item.channel === 'newsletter') return
            if (item.uploadStatus === 'scheduled' || item.nativeSchedule) {
              counts.scheduled += 1
              return
            }
            if (item.uploadStatus === 'uploaded') {
              counts.uploaded += 1
              return
            }
            if (item.uploadStatus === 'not_uploaded') {
              counts.not_uploaded += 1
            }
          })
          return counts
        })()

      if (page > 1 && pageItems.length === 0) {
        setCurrentPage(page - 1)
        return
      }

      setContents(pageItems)
      setTotalPages(resolvedTotalPages)
      setAggregateCounts(nextCounts)
      setHasNextPage(page < resolvedTotalPages)
    } finally {
      if (showSpinner) {
        if (hasLoadedOnceRef.current) {
          setListLoading(false)
        } else {
          setInitialLoading(false)
          hasLoadedOnceRef.current = true
        }
      }
    }
  }, [activeChannel, activeStatus, currentPage, pageSize, searchQuery])

  const firstMountRef = useRef(true)
  useEffect(() => {
    const isFirst = firstMountRef.current
    firstMountRef.current = false
    // 스냅샷이 복원된 첫 마운트는 스피너 없이 백그라운드로만 갱신한다.
    refreshContents(!(isFirst && snap), currentPage, pageSize, activeChannel, activeStatus, searchQuery)
  }, [activeChannel, activeStatus, currentPage, pageSize, refreshContents, searchQuery, snap])

  // 목록 상태가 바뀔 때마다 스냅샷을 갱신해, 상세보기에서 돌아왔을 때 그대로 복원되게 한다.
  useEffect(() => {
    pageStateSnapshot = {
      activeChannel, activeStatus, contents, hasNextPage, totalPages,
      aggregateCounts, currentPage, pageSize, searchQuery,
      scrollY: pageStateSnapshot?.scrollY || 0,
    }
  }, [activeChannel, activeStatus, contents, hasNextPage, totalPages, aggregateCounts, currentPage, pageSize, searchQuery])

  // 스냅샷이 있으면(상세보기에서 복귀) 이전 스크롤 위치를 복원한다.
  useLayoutEffect(() => {
    if (snap?.scrollY) window.scrollTo(0, snap.scrollY)
  }, [snap])

  const paginationGroupStart = Math.floor((currentPage - 1) / 10) * 10 + 1
  const paginationGroupEnd = Math.min(paginationGroupStart + 9, totalPages)
  const paginationPages = Array.from(
    { length: paginationGroupEnd - paginationGroupStart + 1 },
    (_, idx) => paginationGroupStart + idx,
  )
  const statusCounts = aggregateCounts

  const handleView = (item) => {
    // 상세보기로 떠나기 직전 스크롤 위치를 스냅샷에 기록 → 복귀 시 그대로 복원.
    if (pageStateSnapshot) pageStateSnapshot.scrollY = window.scrollY
    navigate('/contents/view', {
      state: {
        ...item.data,
        activeChannel: item.channel,
        extractionId: item.extractionId,
        uploadStatus: item.uploadStatusMap || {},
        fromContents: true,
      }
    })
  }

  const handleUpload = async (item, options = {}) => {
    // 숏폼은 인스타그램/유튜브를 따로 업로드한다(options.platform).
    const shortsPlatform = item.channel === 'shorts' ? options.platform || null : null
    const key = shortsPlatform
      ? `${item.extractionId}-shorts-${shortsPlatform}`
      : `${item.extractionId}-${item.channel}`
    setUploadingIds(prev => new Set(prev).add(key))

    try {
      const { uploadToPlatform } = await import('../services/platformUploaders')

      if (shortsPlatform) {
        const targets = {
          instagram: shortsPlatform === 'instagram',
          youtube: shortsPlatform === 'youtube',
        }
        const result = await uploadToPlatform('shorts', item.extractionId, {
          targets,
          uploadOrder: [shortsPlatform],
        })
        const platformResult = result?.results?.[shortsPlatform]
        if (!platformResult) {
          throw new Error(result?.failures?.join(' / ') || '업로드에 실패했습니다.')
        }
        // 다른 플랫폼 상태를 보존한 채 이 플랫폼만 업로드 완료로 갱신한다.
        // 다른 플랫폼 업로드와 동시에 진행될 수 있으므로 최신 상태를 다시 읽어 병합한다.
        const fresh = await getExtractionById(item.extractionId).catch(() => null)
        const currentShorts = fresh?.uploadStatus?.shorts || item.uploadStatusMap?.shorts
        const merged = buildShortsUploadStatus(currentShorts, {
          [shortsPlatform]: {
            status: 'uploaded',
            uploadedAt: new Date().toISOString(),
            uploadedUrl: platformResult.url || null,
          },
        })
        await updateUploadStatus(item.extractionId, 'shorts', merged)
        await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
      } else {
        const result = await uploadToPlatform(item.channel, item.extractionId, options)

        const nextUploadInfo = {
          status: result?.failures?.length ? 'partial_failed' : 'uploaded',
          uploadedAt: new Date().toISOString(),
          uploadedUrl: result?.url || null,
        }
        if (result?.uploadedUrls) {
          nextUploadInfo.uploadedUrls = result.uploadedUrls
        }

        if (item.channel === 'blog') {
          nextUploadInfo.nativeSchedule = Boolean(result?.scheduled || options.scheduledAtOverride || item.nativeSchedule)
          nextUploadInfo.scheduledAt = result?.scheduledAt || options.scheduledAtOverride || item.scheduledAt || null
        }

        await updateUploadStatus(item.extractionId, item.channel, nextUploadInfo)

        await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
      }
    } catch (err) {
      alert(`업로드 실패: ${err.message}`)
    }

    setUploadingIds(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const handleScheduleSave = async (extractionId, channel, info, scheduledContent = null, scheduledId = null) => {
    // 숏폼 플랫폼별 예약 (channel = 'shorts_instagram' | 'shorts_youtube')
    const shortsPlatformKey = shortsPlatformFromSchedule(channel)
    if (shortsPlatformKey && info.scheduledAt) {
      const target = scheduleTarget || editScheduleTarget
      await createScheduledUpload({
        platform: channel,
        content: { title: target?.title || '' },
        scheduledAt: new Date(info.scheduledAt).toISOString(),
        extractionId,
        scheduledId,
      })
      const merged = buildShortsUploadStatus(target?.uploadStatusMap?.shorts, {
        [shortsPlatformKey]: { status: 'scheduled', scheduledAt: info.scheduledAt },
      })
      await updateUploadStatus(extractionId, 'shorts', merged)
      await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
      return
    }

    if (channel === 'blog' && info.scheduledAt) {
      await updateUploadStatus(extractionId, channel, info)
      const target = scheduleTarget || editScheduleTarget
      await handleUpload({
        ...target,
        channel,
        extractionId,
        nativeSchedule: true,
        scheduledAt: info.scheduledAt,
      }, {
        scheduledAtOverride: info.scheduledAt,
      })
      return
    }

    if (channel === 'shorts' && info.scheduledAt) {
      const target = scheduleTarget || editScheduleTarget
      const selectedTargets = info.uploadTargets || { instagram: true, youtube: true }
      await createScheduledUpload({
        platform: channel,
        content: {
          title: target?.title || '',
          uploadTargets: selectedTargets,
        },
        scheduledAt: new Date(info.scheduledAt).toISOString(),
        extractionId,
        scheduledId,
      })
      await updateUploadStatus(extractionId, channel, {
        ...info,
        status: 'scheduled',
        nativeSchedule: false,
        uploadTargets: selectedTargets,
      })
      await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
      return
    }

    if (channel !== 'blog' && info.status === 'scheduled' && info.scheduledAt) {
      const target = scheduleTarget || editScheduleTarget
      const instagramScheduledContent = channel === 'instagram'
        ? await buildInstagramScheduledUploadContent(target?.data)
        : null
      await createScheduledUpload({
        platform: channel,
        content: instagramScheduledContent || scheduledContent || (channel === 'instagram'
          ? buildInstagramScheduledContent(target?.data)
          : { title: target?.title || '' }),
        scheduledAt: new Date(info.scheduledAt).toISOString(),
        extractionId,
        scheduledId,
      })
    }

    await updateUploadStatus(extractionId, channel, info)

    await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
  }

  const handleCancelSchedule = async (item) => {
    // 숏폼 플랫폼별 예약 해제
    if (item.shortsPlatform) {
      const schedRow = item.shortsScheduledRows?.[item.shortsPlatform]
      if (schedRow?.id) {
        await removeScheduledUpload(schedRow.id)
      }
      const merged = buildShortsUploadStatus(item.uploadStatusMap?.shorts, {
        [item.shortsPlatform]: { status: 'not_uploaded', scheduledAt: null, scheduledId: null },
      })
      await updateUploadStatus(item.extractionId, 'shorts', merged)
      await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
      return
    }

    if (item.scheduledId) {
      await removeScheduledUpload(item.scheduledId)
    }

    if (item.channel === 'blog') {
      const nextStatus = item.uploadStatus === 'uploaded' ? 'uploaded' : 'not_uploaded'
      await updateUploadStatus(item.extractionId, item.channel, {
        nativeSchedule: false,
        scheduledAt: null,
        status: nextStatus,
      })
    } else {
      await updateUploadStatus(item.extractionId, item.channel, { status: 'not_uploaded' })
    }
    await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteExtractionChannel(deleteTarget.extractionId, deleteTarget.channel)
    await refreshContents(true, currentPage, pageSize, activeChannel, activeStatus, searchQuery)
    setDeleteTarget(null)
  }

  const formatScheduledDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  const beginFilterRefresh = () => {
    if (hasLoadedOnceRef.current) {
      setListLoading(true)
    }
  }

  const handleResetFilters = () => {
    const changed = activeStatus !== 'all' || activeChannel !== 'all' || searchQuery !== '' || currentPage !== 1
    if (!changed) return
    beginFilterRefresh()
    setActiveStatus('all')
    setActiveChannel('all')
    setSearchQuery('')
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (nextStatus) => {
    const resolvedStatus = activeStatus === nextStatus ? 'all' : nextStatus
    if (resolvedStatus === activeStatus && currentPage === 1) return
    beginFilterRefresh()
    setActiveStatus(resolvedStatus)
    setCurrentPage(1)
  }

  const handleChannelFilterChange = (nextChannel) => {
    if (nextChannel === activeChannel && currentPage === 1) return
    beginFilterRefresh()
    setActiveChannel(nextChannel)
    setCurrentPage(1)
  }

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-text-muted">콘텐츠 목록을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <FolderOpen size={22} className="text-primary-light" />
          콘텐츠 관리
        </h1>
        <button
          onClick={() => navigate('/extraction')}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-colors"
        >
          <Sparkles size={14} />
          새 콘텐츠 생성
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            key: 'all',
            icon: FileText,
            bg: 'bg-primary/10',
            color: 'text-primary-light',
            label: '전체',
            onClick: handleResetFilters,
          },
          { key: 'not_uploaded', icon: Upload, bg: 'bg-surface-light', color: 'text-text-muted', label: '미업로드' },
          { key: 'scheduled', icon: Calendar, bg: 'bg-info/10', color: 'text-info', label: '예약 완료' },
          { key: 'uploaded', icon: CheckCircle, bg: 'bg-success/10', color: 'text-success', label: '업로드 완료' },
        ].map((statusItem) => {
          const StatusIcon = statusItem.icon

          return (
          <button
            key={statusItem.key}
            onClick={statusItem.onClick || (() => handleStatusFilterChange(statusItem.key))}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              activeStatus === statusItem.key || (statusItem.key === 'all' && activeStatus === 'all' && activeChannel === 'all')
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-surface hover:border-primary/20'
            }`}
          >
            <div className={`p-2 rounded-lg ${statusItem.bg}`}>
              <StatusIcon size={16} className={statusItem.color} />
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-text">{statusCounts[statusItem.key]}</p>
              <p className="text-[11px] text-text-muted">{statusItem.label}</p>
            </div>
          </button>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1.5 overflow-x-auto shrink-0">
          {Object.entries(channelConfig).map(([key, channelItem]) => {
            const ChannelFilterIcon = channelItem.icon

            return (
            <button
              key={key}
              onClick={() => handleChannelFilterChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeChannel === key
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-text-muted hover:text-text hover:bg-surface-light'
              }`}
            >
              <ChannelFilterIcon size={14} />
              {channelItem.label}
            </button>
            )
          })}
        </div>

        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="검색.."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border bg-surface text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        <select
          value={pageSize}
          onChange={e => {
            setPageSize(Number(e.target.value))
            setCurrentPage(1)
          }}
          className="px-3 py-2.5 bg-surface border border-border rounded-xl text-xs text-text focus:outline-none focus:border-primary/40 transition-colors shrink-0"
        >
          <option value={10}>10개씩</option>
          <option value={30}>30개씩</option>
          <option value={50}>50개씩</option>
        </select>
      </div>

      <div className="relative min-h-[20rem]">
        {listLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-surface/75 backdrop-blur-[1px]">
            <Loader2 size={28} className="text-primary animate-spin" />
            <p className="text-sm text-text-muted">콘텐츠 목록을 불러오는 중...</p>
          </div>
        )}

      {contents.length > 0 ? (
        <div className={`space-y-2 transition-opacity ${listLoading ? 'opacity-50' : 'opacity-100'}`}>
          {contents.map((item, idx) => {
            const channel = channelConfig[item.channel] || channelConfig.all
            const ChannelIcon = channel.icon
            const isUploading = uploadingIds.has(`${item.extractionId}-${item.channel}`)
            const isNativeSchedule = item.nativeSchedule && Boolean(item.scheduledAt)

            return (
              <div
                key={`${item.extractionId}-${item.channel}-${idx}`}
                className="bg-surface rounded-xl border border-border hover:border-primary/20 transition-all"
              >
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-12 h-12 shrink-0 rounded-lg ${channel.bg} flex items-center justify-center`}>
                    <ChannelIcon size={20} className={channel.color} />
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleView(item)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-semibold ${channel.color}`}>{channel.label}</span>
                      {item.cards ? <span className="text-[11px] text-text-muted">{item.cards}장</span> : null}
                    </div>
                    <h4 className="text-sm font-medium text-text truncate hover:text-primary-light transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-text-muted shrink-0">{item.date} {item.time}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.channel === 'newsletter' && (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted bg-surface-light border border-border">
                        <Mail size={13} />
                        콘텐츠만 생성
                      </div>
                    )}

                    {item.channel !== 'newsletter' && item.channel !== 'shorts' && item.uploadStatus === 'not_uploaded' && (
                      <>
                        <button
                          onClick={() => setScheduleTarget(item)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-info hover:bg-info/10 transition-colors border border-info/30"
                        >
                          <Calendar size={13} />
                          {isNativeSchedule ? '예약 상세' : '예약'}
                          {isNativeSchedule ? (
                            <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.scheduledAt)}</span>
                          ) : null}
                        </button>
                        <button
                          onClick={() => handleUpload(item)}
                          disabled={isUploading}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            isUploading
                              ? 'bg-primary/50 text-white cursor-wait'
                              : 'bg-primary text-white hover:bg-primary-dark'
                          }`}
                        >
                          {isUploading ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              업로드 중...
                            </>
                          ) : (
                            <>
                              <Upload size={13} />
                              즉시 업로드
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {item.channel !== 'newsletter' && item.channel !== 'shorts' && item.uploadStatus === 'scheduled' && (
                      <button
                        onClick={() => setEditScheduleTarget(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-info bg-info/5 border border-info/20 hover:bg-info/10 transition-colors"
                      >
                        <Calendar size={13} />
                        예약 완료
                        {item.scheduledAt ? (
                          <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.scheduledAt)}</span>
                        ) : null}
                      </button>
                    )}

                    {item.channel !== 'newsletter' && item.channel !== 'shorts' && item.uploadStatus === 'uploaded' && (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-success bg-success/5 border border-success/20">
                        <CheckCircle size={13} />
                        {isNativeSchedule ? '예약 등록 완료' : '업로드 완료'}
                        {isNativeSchedule ? (
                          <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.scheduledAt)}</span>
                        ) : item.uploadedAt ? (
                          <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(item.uploadedAt)}</span>
                        ) : null}
                      </div>
                    )}

                    <button
                      onClick={() => setDeleteTarget({ extractionId: item.extractionId, channel: item.channel, title: item.title })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors border border-border hover:border-danger/30"
                    >
                      <Trash2 size={13} />
                      삭제
                    </button>
                  </div>
                </div>

                {item.channel === 'shorts' && item.shortsPlatforms && (
                  <div className="border-t border-border px-3 py-2.5 space-y-2">
                    {SHORTS_PLATFORMS.map((p) => {
                      const pmeta = item.shortsPlatforms[p.key]
                      const pUploading = uploadingIds.has(`${item.extractionId}-shorts-${p.key}`)
                      return (
                        <div key={p.key} className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-text-muted shrink-0">{p.label}</span>
                          <div className="flex items-center gap-2">
                            {pmeta.status === 'uploaded' && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-success bg-success/5 border border-success/20">
                                <CheckCircle size={13} />
                                업로드 완료
                                {pmeta.uploadedAt ? (
                                  <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(pmeta.uploadedAt)}</span>
                                ) : null}
                              </div>
                            )}
                            {pmeta.status === 'scheduled' && (
                              <button
                                onClick={() => setEditScheduleTarget({ ...item, shortsPlatform: p.key, scheduledAt: pmeta.scheduledAt })}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-info bg-info/5 border border-info/20 hover:bg-info/10 transition-colors"
                              >
                                <Calendar size={13} />
                                예약 완료
                                {pmeta.scheduledAt ? (
                                  <span className="text-[10px] opacity-60 ml-1">{formatScheduledDate(pmeta.scheduledAt)}</span>
                                ) : null}
                              </button>
                            )}
                            {pmeta.status === 'not_uploaded' && (
                              <>
                                <button
                                  onClick={() => setScheduleTarget({ ...item, shortsPlatform: p.key })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-info hover:bg-info/10 transition-colors border border-info/30"
                                >
                                  <Calendar size={13} />
                                  예약
                                </button>
                                <button
                                  onClick={() => handleUpload(item, { platform: p.key })}
                                  disabled={pUploading}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    pUploading
                                      ? 'bg-primary/50 text-white cursor-wait'
                                      : 'bg-primary text-white hover:bg-primary-dark'
                                  }`}
                                >
                                  {pUploading ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                      업로드 중...
                                    </>
                                  ) : (
                                    <>
                                      <Upload size={13} />
                                      즉시 업로드
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {(currentPage > 1 || hasNextPage) && (
            <div className="flex items-center justify-center gap-2 pt-4 flex-wrap">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                이전
              </button>
              {paginationPages.map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    page === currentPage
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text-muted hover:bg-surface-light'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!hasNextPage}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:bg-surface-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                다음
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center h-80 text-center bg-surface rounded-xl border border-border transition-opacity ${listLoading ? 'opacity-50' : 'opacity-100'}`}>
          <Sparkles size={40} className="text-text-muted/30 mb-4" />
          <p className="text-text-muted mb-2">
            {searchQuery || activeChannel !== 'all' || activeStatus !== 'all'
              ? '조건에 맞는 콘텐츠가 없습니다.'
              : '아직 생성된 콘텐츠가 없습니다.'}
          </p>
          <p className="text-xs text-text-muted mb-4">
            콘텐츠 추출에서 PDF를 분석하면 자동으로 저장됩니다.
          </p>
          <button
            onClick={() => navigate('/extraction')}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            콘텐츠 추출하기
          </button>
        </div>
      )}
      </div>

      <ScheduleDialog
        open={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        defaultPlatform={scheduleTarget?.shortsPlatform
          ? shortsSchedulePlatform(scheduleTarget.shortsPlatform)
          : scheduleTarget?.channel}
        lockPlatform={true}
        content={scheduleTarget?.shortsPlatform
          ? { title: scheduleTarget?.title }
          : scheduleTarget?.channel === 'instagram'
            ? buildInstagramScheduledContent(scheduleTarget?.data)
            : {
              title: scheduleTarget?.title,
              uploadTargets: scheduleTarget?.channel === 'shorts' ? scheduleTarget?.uploadTargets : undefined,
            }}
        onSave={async ({ scheduledAt, uploadTargets }) => {
          if (!scheduleTarget) return
          if (scheduleTarget.shortsPlatform) {
            await handleScheduleSave(
              scheduleTarget.extractionId,
              shortsSchedulePlatform(scheduleTarget.shortsPlatform),
              { scheduledAt },
              null,
              scheduleTarget.shortsScheduledRows?.[scheduleTarget.shortsPlatform]?.id || null,
            )
            return
          }
          const nextInfo = scheduleTarget.channel === 'blog'
            ? { status: scheduleTarget.uploadStatus === 'uploaded' ? 'uploaded' : 'not_uploaded', scheduledAt, nativeSchedule: true }
            : scheduleTarget.channel === 'shorts'
              ? { status: 'scheduled', scheduledAt, nativeSchedule: false, uploadTargets }
              : { status: 'scheduled', scheduledAt }
          await handleScheduleSave(scheduleTarget.extractionId, scheduleTarget.channel, {
            ...nextInfo,
          }, scheduleTarget.channel === 'instagram' ? buildInstagramScheduledContent(scheduleTarget.data) : null, scheduleTarget.scheduledId)
        }}
      />

      <ScheduleDialog
        open={!!editScheduleTarget}
        mode="edit"
        onClose={() => setEditScheduleTarget(null)}
        defaultPlatform={editScheduleTarget?.shortsPlatform
          ? shortsSchedulePlatform(editScheduleTarget.shortsPlatform)
          : editScheduleTarget?.channel}
        lockPlatform={true}
        content={editScheduleTarget?.shortsPlatform
          ? { title: editScheduleTarget?.title }
          : editScheduleTarget?.channel === 'instagram'
            ? buildInstagramScheduledContent(editScheduleTarget?.data)
            : {
              title: editScheduleTarget?.title,
              uploadTargets: editScheduleTarget?.channel === 'shorts' ? editScheduleTarget?.uploadTargets : undefined,
            }}
        initialDatetime={editScheduleTarget?.scheduledAt}
        onSave={async ({ scheduledAt, uploadTargets }) => {
          if (!editScheduleTarget) return
          if (editScheduleTarget.shortsPlatform) {
            await handleScheduleSave(
              editScheduleTarget.extractionId,
              shortsSchedulePlatform(editScheduleTarget.shortsPlatform),
              { scheduledAt },
              null,
              editScheduleTarget.shortsScheduledRows?.[editScheduleTarget.shortsPlatform]?.id || null,
            )
            return
          }
          const nextInfo = editScheduleTarget.channel === 'blog'
            ? { status: editScheduleTarget.uploadStatus === 'uploaded' ? 'uploaded' : 'not_uploaded', scheduledAt, nativeSchedule: true }
            : editScheduleTarget.channel === 'shorts'
              ? { status: 'scheduled', scheduledAt, nativeSchedule: false, uploadTargets }
              : { status: 'scheduled', scheduledAt }
          await handleScheduleSave(editScheduleTarget.extractionId, editScheduleTarget.channel, {
            ...nextInfo,
          }, editScheduleTarget.channel === 'instagram' ? buildInstagramScheduledContent(editScheduleTarget.data) : null, editScheduleTarget.scheduledId)
        }}
        onDelete={() => {
          if (!editScheduleTarget) return
          handleCancelSchedule(editScheduleTarget)
        }}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6">
            <button
              onClick={() => setDeleteTarget(null)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors"
            >
              <X size={16} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <h3 className="text-base font-semibold text-text mb-1">콘텐츠 삭제</h3>
              <p className="text-sm text-text-muted mb-1">이 콘텐츠를 삭제하시겠습니까?</p>
              <p className="text-xs text-text-muted mb-2 line-clamp-2 max-w-64">"{deleteTarget.title}"</p>
              <p className="text-[11px] text-warning mb-6">
                이미 업로드한 콘텐츠는 해당 플랫폼에서 삭제되지 않습니다.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-surface-light transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
