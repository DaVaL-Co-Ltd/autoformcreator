import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, X } from 'lucide-react'
import { fetchPlatformAccounts } from '../services/platformSessions'

export default function AccountUploadDialog({ open, platform, title, onClose, onConfirm }) {
  const [accounts, setAccounts] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !platform) return undefined
    let active = true
    ;(async () => {
      await Promise.resolve()
      if (!active) return
      setLoading(true)
      setError('')
      try {
        const items = await fetchPlatformAccounts(platform)
        if (!active) return
        setAccounts(items)
        setSelectedIds(items.map((account) => account.id))
      } catch (err) {
        if (!active) return
        setError(err.message)
        setAccounts([])
        setSelectedIds([])
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [open, platform])

  if (!open) return null

  const allSelected = accounts.length > 0 && selectedIds.length === accounts.length
  const platformLabel = platform === 'instagram' ? '인스타그램' : '유튜브'

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : accounts.map((account) => account.id))
  }

  const toggleOne = (accountId) => {
    setSelectedIds((prev) => (
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    ))
  }

  const submit = () => {
    if (!selectedIds.length) {
      alert('업로드할 계정을 하나 이상 선택해주세요.')
      return
    }
    onConfirm(selectedIds)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl mx-4">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-semibold text-text">{platformLabel} 계정 선택</h3>
            <p className="mt-1 text-sm text-text-muted line-clamp-2">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:bg-surface-light hover:text-text">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-light py-8 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin" />
            계정 목록을 불러오는 중...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-4 text-sm leading-6 text-text-muted">
            연결된 {platformLabel} 계정이 없습니다. 설정의 플랫폼 연동 상태에서 계정을 먼저 추가해주세요.
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={toggleAll}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                allSelected ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-light hover:border-primary/30'
              }`}
            >
              <span className="text-sm font-semibold text-text">전체 선택</span>
              <span className={`h-5 w-5 rounded-md border ${allSelected ? 'border-primary bg-primary' : 'border-border bg-white'}`}>
                {allSelected ? <CheckCircle size={18} className="text-white" /> : null}
              </span>
            </button>
            {accounts.map((account) => {
              const selected = selectedIds.includes(account.id)
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => toggleOne(account.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-light hover:border-primary/30'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-text">{account.displayName || account.username || account.id}</div>
                    <div className="mt-0.5 text-xs text-text-muted">{account.providerAccountId || account.id}</div>
                  </div>
                  <span className={`h-5 w-5 rounded-md border ${selected ? 'border-primary bg-primary' : 'border-border bg-white'}`}>
                    {selected ? <CheckCircle size={18} className="text-white" /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-light"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || accounts.length === 0}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
          >
            선택 계정 업로드
          </button>
        </div>
      </div>
    </div>
  )
}
