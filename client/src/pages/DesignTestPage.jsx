import { useState } from 'react'
import { Expand, Sparkles, XCircle } from 'lucide-react'

const designSections = [
  {
    key: 'reference',
    label: '레퍼런스',
    title: '참고 레이아웃',
    description: '다운로드 폴더의 reference 카드처럼 가운데 텍스트 안전 영역이 또렷한 기준 시안입니다.',
    items: [
      {
        key: 'reference-card',
        title: '기준 카드',
        description: '가운데 큰 텍스트 영역과 상하 여백 구성을 확인하는 기준 시안입니다.',
        image: '/design-test/reference-card.webp',
        overlay: {
          quote: '“',
          title: '학습 집중도를 높이는\n디지털 수업 설계',
          body: '학생 참여가 높은 수업 구조는\n명확한 목표와 즉각적 피드백에서 시작됩니다.',
          footer: 'MYBEST EDUCATION',
        },
      },
    ],
  },
  {
    key: 'photo-layout',
    label: '사진형 3안',
    title: '실사 배경 + 가운데 텍스트 영역',
    description: '실제 사람/사물이 보이는 배경 위에 가운데 텍스트 안전 영역이 있는 카드형 시안입니다.',
    items: [
      {
        key: 'photo-layout-1',
        title: '스터디 데스크형',
        description: '책상과 학습 도구가 보이는 사진 위에 넓은 중앙 텍스트 박스를 둔 구성입니다.',
        image: '/design-test/photo-layout-1.svg',
        overlay: {
          layout: 'bottom-panel',
          title: '학생 참여를 높이는\n학습 환경 설계',
          body: '실제 학습 사진을 배경으로 두고,\n가운데 카드 안에 핵심 문장을 배치하는 방식입니다.',
          footer: '집중형 카드 레이아웃',
        },
      },
      {
        key: 'photo-layout-2',
        title: '교실 현장형',
        description: '교실/수업 장면이 뒤에 보이면서 가운데 카드 영역이 분명한 구성입니다.',
        image: '/design-test/photo-layout-2.svg',
        overlay: {
          layout: 'bottom-panel',
          title: 'AI와 함께 바뀌는\n교실 수업 방식',
          body: '현장감 있는 배경을 살리면서도,\n텍스트는 카드 안에서 또렷하게 읽히도록 설계합니다.',
          footer: '수업 현장형 카드',
        },
      },
      {
        key: 'photo-layout-3',
        title: '도서관 집중형',
        description: '도서관 배경과 따뜻한 톤을 쓰고 중앙 텍스트 영역을 더 크게 준 구성입니다.',
        image: '/design-test/photo-layout-3.svg',
        overlay: {
          layout: 'bottom-panel',
          title: '학습 몰입도를 만드는\n콘텐츠 구조',
          body: '긴 설명보다 핵심 문장을 2~3줄로 압축해,\n배경 사진과 함께 리듬감 있게 보여주는 방식입니다.',
          footer: '집중 유도형 카드',
        },
      },
    ],
  },
  {
    key: 'center-card',
    label: '카드형 3안',
    title: '중앙 카드 강조 레이아웃',
    description: '배경 프레임과 중앙 카드가 명확히 분리된 포스터형 시안입니다.',
    items: [
      {
        key: 'center-card-1',
        title: '블루 프레임형',
        description: '다운로드 폴더 카드와 비슷한 비율의 중심 카드형 시안입니다.',
        image: '/design-test/center-card-1.svg',
        overlay: {
          quote: '“',
          title: '미래 교육은\n콘텐츠 설계에서 시작됩니다',
          body: '핵심 메시지를 넓은 흰색 카드 안에 두고,\n배경은 프레임처럼만 보이게 처리하는 방식입니다.',
          footer: '카드형 포스터 레이아웃',
        },
      },
      {
        key: 'center-card-2',
        title: '세이지 톤형',
        description: '부드러운 녹색 프레임과 크림색 중앙 카드 영역을 쓴 시안입니다.',
        image: '/design-test/center-card-2.svg',
        overlay: {
          quote: '“',
          title: '학생이 오래 머무는 콘텐츠는\n시선 동선이 다릅니다',
          body: '부드러운 톤의 카드 위에\n핵심 메시지와 보조 설명을 안정적으로 배치합니다.',
          footer: '부드러운 브랜드 톤',
        },
      },
      {
        key: 'center-card-3',
        title: '딥 네이비형',
        description: '강한 배경 대비와 큰 중앙 카드 영역으로 집중도를 높인 시안입니다.',
        image: '/design-test/center-card-3.svg',
        overlay: {
          quote: '“',
          title: '중앙 집중형 메시지 배치는\n전달력을 높입니다',
          body: '배경 대비를 크게 주고,\n메시지는 큰 카드 안에서 한 번에 읽히도록 만듭니다.',
          footer: '강한 대비형 카드',
        },
      },
    ],
  },
]

function renderOverlay(example, large = false) {
  if (!example.overlay) return null

  if (example.overlay.layout === 'bottom-panel') {
    const panelClasses = large
      ? 'absolute inset-x-[10%] bottom-[12%] rounded-[26px] bg-white/88 backdrop-blur-sm px-9 py-8'
      : 'absolute inset-x-[10%] bottom-[10%] rounded-[18px] bg-white/88 backdrop-blur-sm px-5 py-5'
    const titleClasses = large
      ? 'text-[30px] leading-[1.2] font-bold tracking-[-0.03em] text-slate-900 whitespace-pre-line'
      : 'text-[17px] leading-[1.22] font-bold tracking-[-0.03em] text-slate-900 whitespace-pre-line'
    const bodyClasses = large
      ? 'text-[17px] leading-[1.65] text-slate-600 whitespace-pre-line'
      : 'text-[10px] leading-[1.55] text-slate-600 whitespace-pre-line'
    const footerClasses = large
      ? 'text-[12px] font-semibold tracking-[0.12em] text-slate-500 uppercase'
      : 'text-[8px] font-semibold tracking-[0.12em] text-slate-500 uppercase'

    return (
      <div className={panelClasses}>
        <div className="space-y-3">
          <div className={titleClasses}>{example.overlay.title}</div>
          <div className={bodyClasses}>{example.overlay.body}</div>
          {example.overlay.footer ? <div className={footerClasses}>{example.overlay.footer}</div> : null}
        </div>
      </div>
    )
  }

  const cardClasses = large
    ? 'absolute inset-x-[14%] top-[25%] bottom-[19%] rounded-[28px] bg-white/88 backdrop-blur-sm px-10 py-10'
    : 'absolute inset-x-[14%] top-[25%] bottom-[19%] rounded-[18px] bg-white/88 backdrop-blur-sm px-6 py-6'
  const quoteClasses = large
    ? 'text-[40px] leading-none font-bold text-slate-400'
    : 'text-[28px] leading-none font-bold text-slate-400'
  const titleClasses = large
    ? 'text-[34px] leading-[1.22] font-bold tracking-[-0.03em] text-slate-900 whitespace-pre-line'
    : 'text-[18px] leading-[1.28] font-bold tracking-[-0.03em] text-slate-900 whitespace-pre-line'
  const bodyClasses = large
    ? 'text-[18px] leading-[1.7] text-slate-600 whitespace-pre-line'
    : 'text-[11px] leading-[1.6] text-slate-600 whitespace-pre-line'
  const footerClasses = large
    ? 'text-[13px] font-semibold tracking-[0.14em] text-slate-500 uppercase'
    : 'text-[9px] font-semibold tracking-[0.12em] text-slate-500 uppercase'

  return (
    <div className={cardClasses}>
      <div className="h-full flex flex-col">
        {example.overlay.quote ? <div className={quoteClasses}>{example.overlay.quote}</div> : null}
        <div className="flex-1 flex flex-col justify-center gap-4">
          <div className={titleClasses}>{example.overlay.title}</div>
          <div className={bodyClasses}>{example.overlay.body}</div>
        </div>
        {example.overlay.footer ? <div className={footerClasses}>{example.overlay.footer}</div> : null}
      </div>
    </div>
  )
}

export default function DesignTestPage() {
  const [previewImage, setPreviewImage] = useState(null)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="bg-surface rounded-2xl border border-border p-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Sparkles size={12} />
            시안 테스트
          </div>
          <h1 className="text-2xl font-bold text-text">가운데 텍스트 영역 시안 비교</h1>
          <p className="text-sm text-text-muted leading-6 max-w-4xl">
            인스타 카드와 블로그 카드에 적용할 수 있는 가운데 텍스트 안전 영역 시안을 모아둔 테스트
            페이지입니다. 각 카드를 클릭하면 크게 볼 수 있고, 사진형 3안과 카드형 3안을 나란히
            비교할 수 있습니다.
          </p>
        </div>
      </div>

      {designSections.map((section) => (
        <section key={section.key} className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full bg-surface-light text-text-secondary text-xs font-semibold border border-border">
              {section.label}
            </div>
            <h2 className="text-xl font-bold text-text">{section.title}</h2>
            <p className="text-sm text-text-muted leading-6">{section.description}</p>
          </div>

          <div className={`grid gap-5 ${section.items.length === 1 ? 'lg:grid-cols-1 max-w-sm' : 'lg:grid-cols-3'}`}>
            {section.items.map((example) => (
              <button
                key={example.key}
                type="button"
                onClick={() => setPreviewImage(example)}
                className="group text-left bg-surface rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-all"
              >
                <div className="relative aspect-[4/5] bg-surface-light">
                  <img src={example.image} alt={example.title} className="w-full h-full object-cover" loading="lazy" />
                  {renderOverlay(example)}
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 text-white px-2.5 py-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <Expand size={11} />
                    크게 보기
                  </div>
                </div>
                <div className="p-4 space-y-1.5">
                  <h3 className="text-base font-semibold text-text">{example.title}</h3>
                  <p className="text-sm text-text-muted leading-6">{example.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[92vw] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <div className="relative max-w-full max-h-[86vh]">
              <img
                src={previewImage.image}
                alt={previewImage.title}
                className="max-w-full max-h-[86vh] rounded-2xl shadow-2xl object-contain"
              />
              {renderOverlay(previewImage, true)}
            </div>
            <div className="absolute -top-12 left-0 right-0 flex items-center justify-between">
              <span className="text-sm text-white font-medium">{previewImage.title}</span>
              <button onClick={() => setPreviewImage(null)} className="text-white/70 hover:text-white transition-colors">
                <XCircle size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
