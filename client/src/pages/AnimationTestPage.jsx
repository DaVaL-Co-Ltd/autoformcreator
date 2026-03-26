import { Navigate } from 'react-router-dom'

// 테스트 페이지 → 콘텐츠 추출로 리다이렉트
export default function AnimationTestPage() {
  return <Navigate to="/extraction" replace />
}
