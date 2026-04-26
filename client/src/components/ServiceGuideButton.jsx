import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenText,
  Download,
  KeyRound,
  Link2,
  Upload,
  X,
} from 'lucide-react'

function GuideSection({ icon, title, description, buttonLabel, onClick }) {
  const Icon = icon

  return (
    <div className="rounded-2xl border border-border bg-surface-light p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <div className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
            {description}
          </div>
          <button
            onClick={onClick}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-white px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white"
          >
            {buttonLabel}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ServiceGuideButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const sections = [
    {
      key: 'blog',
      title: '블로그 업로드',
      icon: Download,
      buttonLabel: '서버 설치 페이지로 이동',
      onClick: () => navigate('/settings?section=desktop-helper'),
      description: (
        <>
          <p>
            네이버 블로그 업로드를 사용하려면{' '}
            <strong className="text-text">블로그 업로드 도우미 파일을 먼저 설치</strong>
            해야 합니다.
          </p>
          <p>
            설치 후에는{' '}
            <strong className="text-text">도우미 프로그램이 실행 중이어야</strong>{' '}
            블로그 업로드가 정상 동작합니다.
          </p>
        </>
      ),
    },
    {
      key: 'schedule',
      title: '예약 업로드',
      icon: Upload,
      buttonLabel: '콘텐츠 관리로 이동',
      onClick: () => navigate('/contents'),
      description: (
        <>
          <p>
            <strong className="text-text">블로그와 유튜브는</strong> 예약 업로드를 등록한 뒤
            이 홈페이지에서 예약 시간을 다시 수정할 수 없습니다.
          </p>
          <p>
            블로그와 유튜브 예약 시간을 변경하려면{' '}
            <strong className="text-text">해당 플랫폼 업로드 페이지에서 직접 수정</strong>
            해야 합니다.
          </p>
          <p>
            <strong className="text-text">인스타그램은</strong> 이 홈페이지에서 예약 변경이
            가능합니다.
          </p>
          <p>
            예약 업로드는 외부 플랫폼 및 스케줄 실행 환경 영향으로{' '}
            <strong className="text-text">설정한 시간과 실제 업로드 시간 사이에 약간의 차이</strong>
            가 발생할 수 있습니다.
          </p>
          <p>
            예약 업로드 상태는 결과보다{' '}
            <strong className="text-text">콘텐츠 관리에서 다시 확인</strong>
            하는 것이 가장 정확합니다.
          </p>
        </>
      ),
    },
    {
      key: 'account',
      title: '계정 및 보안',
      icon: KeyRound,
      buttonLabel: '비밀번호 설정 화면으로 이동',
      onClick: () => navigate('/settings?section=account'),
      description: (
        <>
          <p>
            비밀번호 변경은 <strong className="text-text">설정 페이지에서만</strong> 할 수
            있습니다.
          </p>
          <p>
            계정 보안을 위해 비밀번호를 바꾼 뒤에는{' '}
            <strong className="text-text">다시 로그인</strong>해야 할 수 있습니다.
          </p>
        </>
      ),
    },
    {
      key: 'extra',
      title: '추가 안내',
      icon: Link2,
      buttonLabel: '플랫폼 연동 설정으로 이동',
      onClick: () => navigate('/settings?section=platforms'),
      description: (
        <>
          <p>
            플랫폼 연동 세션이나 토큰이 만료되면{' '}
            <strong className="text-text">업로드가 실패할 수 있으므로 다시 연결</strong>
            해야 합니다.
          </p>
          <p>
            인스타그램, 유튜브, 숏폼 생성 기능은{' '}
            <strong className="text-text">각 플랫폼 정책과 API 권한</strong>의 영향을 받을 수
            있습니다.
          </p>
          <p>
            문제가 생기면 <strong className="text-text">플랫폼 연동 상태를 먼저 확인</strong>
            하는 것이 가장 빠릅니다.
          </p>
        </>
      ),
    },
  ]

  const handleMove = (action) => {
    setOpen(false)
    action()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 origin-right items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-200 hover:w-[128px] hover:bg-primary-dark hover:px-3.5"
        aria-label="서비스 안내"
      >
        <span className="flex w-full items-center justify-center">
          <BookOpenText size={18} className="shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:max-w-[80px] group-hover:opacity-100">
            서비스 안내
          </span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <BookOpenText size={14} />
                  사용 전 확인
                </div>
                <h2 className="mt-3 text-xl font-semibold text-text">서비스 안내</h2>
                <p className="mt-1 text-sm text-text-muted">
                  업로드, 예약, 계정 설정 전에 꼭 알아두어야 하는 내용을 정리했습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-text-muted transition-colors hover:bg-surface-light hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 pb-16 pt-6">
              <div className="grid gap-4 lg:grid-cols-2">
                {sections.map((section) => (
                  <GuideSection
                    key={section.key}
                    icon={section.icon}
                    title={section.title}
                    description={section.description}
                    buttonLabel={section.buttonLabel}
                    onClick={() => handleMove(section.onClick)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
