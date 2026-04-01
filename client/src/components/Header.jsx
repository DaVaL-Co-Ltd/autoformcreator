import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const pageTitles = {
  '/': '대시보드',
  '/extraction': '콘텐츠 추출',
  '/content': '콘텐츠 관리',
  '/shorts/test': '숏폼 테스트',
  '/shorts/lite': '숏폼 Lite',
  '/subtitle': '자막 추가',
  '/settings': '설정',
}

const pageDescriptions = {
  '/': '업로드된 자료와 콘텐츠 현황을 한눈에 확인하세요.',
  '/extraction': 'PDF를 분석하고 5개 채널 콘텐츠를 자동 생성하세요.',
  '/content': '배포된 콘텐츠를 채널별로 확인하세요.',
  '/shorts/test': '숏폼 영상 파이프라인을 테스트하세요.',
  '/shorts/lite': 'Creatomate만으로 빠르고 저렴하게 숏폼을 제작하세요.',
  '/subtitle': '기존 영상에 모션 자막을 입혀 MP4로 출력합니다.',
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
