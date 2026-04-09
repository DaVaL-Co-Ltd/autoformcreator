import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText, Settings, LogOut, FolderOpen, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const pageTitles = {
  '/': '콘텐츠 추출',
  '/extraction': '콘텐츠 추출',
  '/settings': '설정',
}

const pageDescriptions = {
  '/': '문서를 분석하고 4개 채널 콘텐츠를 자동 생성하세요.',
  '/extraction': '문서를 분석하고 4개 채널 콘텐츠를 자동 생성하세요.',
  '/settings': '플랫폼 연동, 계정 정보를 관리하세요.',
}

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const path = Object.keys(pageTitles).find(p =>
    p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
  ) || '/'

  return (
    <>
      <header className="h-14 sm:h-16 bg-white border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate('/')}>
          <img src="/logo.svg" alt="마이베스트" className="w-7 h-7 shrink-0" />
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
              location.pathname === '/contents'
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
            <span className="hidden sm:inline">콘텐츠 추출</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-3">
                <LogOut size={20} className="text-danger" />
              </div>
              <h3 className="text-sm font-semibold text-text">로그아웃 하시겠어요?</h3>
              <p className="text-xs text-text-muted mt-1">현재 세션이 종료됩니다.</p>
            </div>
            <div className="flex border-t border-border">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 text-sm font-medium text-text-muted hover:bg-surface-light transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); logout() }}
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
