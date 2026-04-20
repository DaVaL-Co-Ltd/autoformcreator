// 서버(Render) + GitHub Actions가 예약 업로드를 처리하므로
// 브라우저 기반 폴링은 더 이상 필요하지 않음.
// 기존 코드 호환성을 위해 no-op 훅 유지.
export function useScheduledUploader() {
  // no-op
}
