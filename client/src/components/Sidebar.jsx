import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, Sparkles, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/extraction', icon: Sparkles, label: '콘텐츠 추출' },
  { to: '/content', icon: FileText, label: '콘텐츠 관리' },
  { to: '/settings', icon: Settings, label: '설정' },
]

export default function Sidebar() {
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="MyBest" className="w-9 h-9 rounded-lg" />
          <div>
            <h1 className="text-xl font-bold text-text tracking-tight">
              <span className="text-primary">My</span>Best
            </h1>
            <p className="text-xs text-text-muted">AI Video Automation</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-primary/15 text-primary-light border border-primary/30'
                  : 'text-text-muted hover:text-text hover:bg-surface-light border border-transparent'
                }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {user?.name?.[0] || 'U'}
            </div>
            <div>
              <p className="text-sm font-medium text-text">{user?.name || '사용자'}</p>
              <p className="text-xs text-text-muted">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
