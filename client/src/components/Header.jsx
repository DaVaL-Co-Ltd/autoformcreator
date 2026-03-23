import { useLocation } from 'react-router-dom'

const pageTitles = {
  '/': '대시보드',
  '/extraction': '콘텐츠 추출',
  '/content': '콘텐츠 관리',
  '/settings': '설정',
}

const pageDescriptions = {
  '/': '업로드된 자료와 콘텐츠 현황을 한눈에 확인하세요.',
  '/extraction': 'PDF를 분석하고 5개 채널 콘텐츠를 자동 생성하세요.',
  '/content': '배포된 콘텐츠를 채널별로 확인하세요.',
  '/settings': '플랫폼 연동, 계정 정보를 관리하세요.',
}

export default function Header() {
  const location = useLocation()
  const path = Object.keys(pageTitles).find(p =>
    p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
  ) || '/'

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center px-6 shrink-0">
      <div>
        <h2 className="text-lg font-semibold text-text">{pageTitles[path]}</h2>
        <p className="text-xs text-text-muted">{pageDescriptions[path]}</p>
      </div>
    </header>
  )
}
