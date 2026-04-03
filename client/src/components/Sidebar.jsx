import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, Sparkles, LogOut, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/extraction', icon: Sparkles, label: '콘텐츠 추출' },
  { to: '/settings', icon: Settings, label: '설정' },
  { type: 'logout', icon: LogOut, label: '로그아웃' },
]

export default function Sidebar({ onClose }) {
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <aside className="w-64 h-full bg-surface border-r border-border flex flex-col shrink-0">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="MyBest" className="w-9 h-9 rounded-lg" />
          <div>
            <h1 className="text-xl font-bold text-text tracking-tight">
              <span className="text-primary">My</span>Best
            </h1>
            <p className="text-xs text-text-muted">AI Video Automation</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-text-muted hover:bg-surface-light transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const { icon: Icon, label } = item

          if (item.type === 'logout') {
            return (
              <button
                key="logout"
                onClick={logout}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 w-full text-text-muted hover:text-danger hover:bg-danger/10 border border-transparent"
              >
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </button>
            )
          }

          const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
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
    </aside>
  )
}
