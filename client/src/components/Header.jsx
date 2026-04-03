import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const pageTitles = {
  '/': '콘텐츠 추출',
  '/extraction': '콘텐츠 추출',
  '/settings': '설정',
}

const pageDescriptions = {
  '/': 'PDF를 분석하고 5개 채널 콘텐츠를 자동 생성하세요.',
  '/extraction': 'PDF를 분석하고 5개 채널 콘텐츠를 자동 생성하세요.',
  '/settings': '플랫폼 연동, 계정 정보를 관리하세요.',
}

export default function Header({ onMenuClick }) {
  const location = useLocation()
  const path = Object.keys(pageTitles).find(p =>
    p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
  ) || '/'

  return (
    <header className="h-14 sm:h-16 bg-surface border-b border-border flex items-center px-3 sm:px-6 shrink-0 gap-3">
      <button onClick={onMenuClick} className="p-2 rounded-lg text-text-muted hover:bg-surface-light hover:text-text transition-colors lg:hidden">
        <Menu size={20} />
      </button>
      <div className="min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-text truncate">{pageTitles[path]}</h2>
        <p className="text-xs text-text-muted truncate hidden sm:block">{pageDescriptions[path]}</p>
      </div>
    </header>
  )
}
