import { NavLink, useLocation } from 'react-router-dom'
import { Sparkles, Settings, LogOut, X, ChevronRight, Beaker } from 'lucide-react'
import { useAuth } from '../context/useAuth'

const navItems = [
  { to: '/extraction', icon: Sparkles, label: '콘텐츠 추출', description: 'AI 자동 생성' },
  { to: '/prompt-lab/knowledge-cards', icon: Beaker, label: '지식 카드 테스트', description: '카드뉴스 실험실' },
  { to: '/settings', icon: Settings, label: '설정', description: '플랫폼 연동 관리' },
]

export default function Sidebar({ onClose }) {
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <aside className="w-64 h-full bg-sidebar flex flex-col shrink-0 shadow-xl">
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/25">
            <img src="/logo.svg" alt="마이베스트" className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">마이베스트</h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="mx-4 border-t border-white/[0.06]" />

      <nav className="flex-1 px-3 py-4 space-y-1 sidebar-scroll overflow-y-auto">
        <p className="px-3 mb-2 text-[11px] font-semibold text-sidebar-text/50 uppercase tracking-wider">Menu</p>
        {navItems.map((item) => {
          const { icon: Icon, label, description } = item
          const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary/15 text-white'
                  : 'text-sidebar-text hover:text-white hover:bg-sidebar-hover'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-primary/30'
                    : 'bg-sidebar-hover text-sidebar-text group-hover:text-white'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">{label}</span>
                <span className={`block text-[10px] truncate ${isActive ? 'text-primary-light' : 'text-sidebar-text/50'}`}>
                  {description}
                </span>
              </div>
              {isActive && <ChevronRight size={14} className="text-primary-light shrink-0" />}
            </NavLink>
          )
        })}
      </nav>

      <div className="mx-4 border-t border-white/[0.06]" />

      <div className="px-3 py-3">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-sidebar-text hover:text-red-400 hover:bg-red-500/10"
        >
          <div className="p-1.5 rounded-lg bg-sidebar-hover">
            <LogOut size={16} strokeWidth={1.8} />
          </div>
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
