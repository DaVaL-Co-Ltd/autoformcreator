import { useState } from 'react'
import { AlertCircle, Check, Copy, X } from 'lucide-react'

export default function ErrorDialog({ title = '오류 발생', message, onClose }) {
  const [copied, setCopied] = useState(false)

  if (!message) {
    return null
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(message))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.error('[ErrorDialog] copy failed:', error)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-danger/30 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-danger/20 bg-danger/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0 text-danger" />
            <div>
              <h3 className="text-sm font-semibold text-danger">{title}</h3>
              <p className="text-xs text-text-muted">텍스트를 그대로 복사할 수 있습니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/60 hover:text-text"
            aria-label="오류 창 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-border bg-surface-light/70 p-4">
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-text">{String(message)}</pre>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <div className="text-xs text-text-muted">같은 내용이 개발자 도구의 `console.error`에도 기록됩니다.</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-light"
            >
              {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
              {copied ? '복사됨' : '복사'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
