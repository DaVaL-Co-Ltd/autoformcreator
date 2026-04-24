import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText, Settings, LogOut, FolderOpen, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../context/useAuth'

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  return (
    <>
      <header className="h-14 sm:h-16 bg-white border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate('/')}>
          <img src="/logo.svg" alt="logo" className="w-7 h-7 shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-text truncate">마이베스트</h2>
        </div>
        <nav className="flex items-center gap-1">
          <button
            onClick={() => navigate('/dashboard')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              location.pathname === '/' || location.pathname === '/dashboard'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-surface-light hover:text-text'
            }`}
          >
            <LayoutDashboard size={15} />
            <span className="hidden sm:inline">대시보드</span>
          </button>
          <button
            onClick={() => navigate('/contents')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              location.pathname.startsWith('/contents')
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-surface-light hover:text-text'
            }`}
          >
            <FolderOpen size={15} />
            <span className="hidden sm:inline">콘텐츠 관리</span>
          </button>
          <button
            onClick={() => navigate('/extraction')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              location.pathname.startsWith('/extraction')
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-surface-light hover:text-text'
            }`}
          >
            <FileText size={15} />
            <span className="hidden sm:inline">콘텐츠 생성</span>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              location.pathname === '/settings'
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:bg-surface-light hover:text-text'
            }`}
          >
            <Settings size={15} />
            <span className="hidden sm:inline">설정</span>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </nav>
      </header>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-3">
                <LogOut size={20} className="text-danger" />
              </div>
              <h3 className="text-sm font-semibold text-text">로그아웃하시겠습니까?</h3>
              <p className="text-xs text-text-muted mt-1">로그아웃하면 현재 세션이 종료됩니다.</p>
            </div>
            <div className="flex border-t border-border">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 text-sm font-medium text-text-muted hover:bg-surface-light transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false)
                  logout()
                }}
                className="flex-1 py-3 text-sm font-medium text-danger hover:bg-danger/5 transition-colors border-l border-border"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
