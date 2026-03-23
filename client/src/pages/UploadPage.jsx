import { FileText, File, CheckCircle, Loader2, Trash2, Eye } from 'lucide-react'

const uploadedFiles = [
  { id: 1, name: '2026 수시 경쟁률 분석.pdf', size: '2.4 MB', date: '2026-03-18', status: 'analyzed', pages: 42 },
  { id: 2, name: '2025 정시 배치표 데이터.xlsx', size: '1.8 MB', date: '2026-03-17', status: 'generating', pages: null },
  { id: 3, name: '주요대학 학과별 커트라인.pdf', size: '5.1 MB', date: '2026-03-16', status: 'analyzed', pages: 78 },
  { id: 4, name: '2026 논술 일정 정리.pdf', size: '0.8 MB', date: '2026-03-15', status: 'uploaded', pages: 12 },
  { id: 5, name: '2026 학생부종합 가이드.pdf', size: '3.2 MB', date: '2026-03-14', status: 'analyzed', pages: 56 },
]

const statusConfig = {
  uploaded: { label: '업로드됨', color: 'text-text-muted bg-surface-light', icon: File },
  analyzing: { label: 'AI 분석중', color: 'text-primary-light bg-primary/10', icon: Loader2 },
  analyzed: { label: '분석 완료', color: 'text-success bg-success/10', icon: CheckCircle },
  generating: { label: '콘텐츠 생성중', color: 'text-warning bg-warning/10', icon: Loader2 },
}

export default function UploadPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      {/* File List */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-text">업로드 자료</h3>
          <span className="text-sm text-text-muted">{uploadedFiles.length}개 파일</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">파일명</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">크기</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">업로드일</th>
              <th className="text-left text-xs font-medium text-text-muted px-5 py-3">상태</th>
              <th className="text-right text-xs font-medium text-text-muted px-5 py-3">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {uploadedFiles.map(file => {
              const status = statusConfig[file.status]
              const StatusIcon = status.icon
              return (
                <tr key={file.id} className="hover:bg-surface-light/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-surface-light rounded-lg">
                        <FileText size={16} className="text-text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text">{file.name}</p>
                        {file.pages && <p className="text-xs text-text-muted">{file.pages}페이지</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-text-muted">{file.size}</td>
                  <td className="px-5 py-4 text-sm text-text-muted">{file.date}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>
                      <StatusIcon size={12} className={file.status === 'analyzing' || file.status === 'generating' ? 'animate-spin' : ''} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 rounded-lg hover:bg-surface-light transition-colors text-text-muted hover:text-text">
                        <Eye size={15} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-surface-light transition-colors text-text-muted hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
