import { useState, useRef, useEffect } from 'react'

const SAMPLE_TEXT = '글로벌 AI 시장 184조 원 돌파'
const W = 1080, H = 1920

const palettes = [
  { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24' },
  { bar: '#10B981', barEnd: '#06B6D4', underline: '#F97316' },
  { bar: '#8B5CF6', barEnd: '#EC4899', underline: '#34D399' },
]

function wrapText(ctx, text, maxWidth) {
  const lines = []
  let remaining = text
  while (remaining.length > 0) {
    let width = ctx.measureText(remaining).width
    if (width <= maxWidth) { lines.push(remaining); break }
    let cut = remaining.length
    for (let i = remaining.length - 1; i >= 1; i--) {
      if (ctx.measureText(remaining.slice(0, i)).width <= maxWidth) {
        let bestCut = i
        for (let j = i; j >= Math.floor(i * 0.5); j--) {
          if (/[\s,.:!?·\-]/.test(remaining[j])) { bestCut = j + 1; break }
        }
        cut = bestCut
        break
      }
    }
    lines.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return lines
}

function drawTitle(ctx, text, design, palette) {
  const fontSize = 64
  const x = 120
  const baseY = 220
  const padX = 48
  const padY = 32
  const lineHeight = fontSize * 1.5
  const maxWidth = W - x * 2

  ctx.font = `${fontSize}px Pretendard, Malgun Gothic, sans-serif`
  ctx.textAlign = 'left'
  const lines = wrapText(ctx, text, maxWidth)
  const totalH = lines.length * lineHeight
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width))

  if (design === 'gradient-box') {
    const grad = ctx.createLinearGradient(x - padX, 0, x + maxLineWidth + padX, 0)
    grad.addColorStop(0, palette.bar)
    grad.addColorStop(1, palette.barEnd)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
  } else if (design === 'accent-bar') {
    ctx.fillStyle = palette.bar + 'E0'
    ctx.beginPath()
    ctx.roundRect(x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
  } else if (design === 'underline') {
    lines.forEach((line, i) => {
      const ly = baseY + i * lineHeight
      const lw = ctx.measureText(line).width
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(line, x, ly)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(line, x, ly)
      ctx.fillStyle = palette.underline
      ctx.beginPath()
      ctx.roundRect(x, ly + 12, lw, 8, 4)
      ctx.fill()
    })
  }
}

const titleStyles = [
  { id: 'gradient-box', label: '그라데이션 박스', desc: '보라→파랑 그라데이션 배경 + 흰 글자' },
  { id: 'underline', label: '밑줄 강조', desc: '흰 글자 + 컬러 밑줄' },
  { id: 'accent-bar', label: '악센트 바', desc: '컬러 배경 바 + 흰 글자' },
]

export default function TitlePreviewPage() {
  const [customText, setCustomText] = useState(SAMPLE_TEXT)
  const canvasRefs = useRef({})

  useEffect(() => {
    titleStyles.forEach((style, i) => {
      const canvas = canvasRefs.current[style.id]
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#0f172a')
      grad.addColorStop(0.5, '#1e293b')
      grad.addColorStop(1, '#0f172a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, 280, 0, Math.PI * 2)
      ctx.fill()
      drawTitle(ctx, customText, style.id, palettes[i % palettes.length])
    })
  }, [customText])

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">타이틀 디자인 시안</h1>
      <p className="text-sm text-text-muted">왼쪽 상단 타이틀 3가지 스타일. 씬별로 랜덤 적용됩니다. Pretendard 64px.</p>

      <div className="bg-surface rounded-xl border border-border p-5">
        <label className="text-xs font-semibold text-text-muted block mb-1">미리보기 텍스트</label>
        <input
          type="text"
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary/30"
          style={{ fontFamily: 'Pretendard, sans-serif' }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {titleStyles.map((style) => (
          <div key={style.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            <canvas
              ref={el => { canvasRefs.current[style.id] = el }}
              width={W}
              height={H}
              className="w-full"
              style={{ aspectRatio: '9/16' }}
            />
            <div className="p-3">
              <p className="text-sm font-semibold text-text">{style.label}</p>
              <p className="text-xs text-text-muted">{style.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
