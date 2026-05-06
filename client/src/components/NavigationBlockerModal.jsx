import { useBlocker } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function NavigationBlockerModal({ when }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when && currentLocation.pathname !== nextLocation.pathname
  )

  if (blocker.state !== 'blocked') return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => blocker.reset()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={20} className="text-danger" />
          </div>
          <h3 className="text-sm font-semibold text-text">작업이 진행 중입니다</h3>
          <p className="text-xs text-text-muted mt-1">페이지를 떠나면 진행 상황이 사라집니다.</p>
        </div>
        <div className="flex border-t border-border">
          <button
            onClick={() => blocker.reset()}
            className="flex-1 py-3 text-sm font-medium text-text-muted hover:bg-surface-light transition-colors"
          >
            계속 작업
          </button>
          <button
            onClick={() => blocker.proceed()}
            className="flex-1 py-3 text-sm font-medium text-danger hover:bg-danger/5 transition-colors border-l border-border"
          >
            나가기
          </button>
        </div>
      </div>
    </div>
  )
}
