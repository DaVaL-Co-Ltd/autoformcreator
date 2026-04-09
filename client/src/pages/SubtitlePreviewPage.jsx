import { useState, useRef, useEffect } from 'react'

const SAMPLE_TEXT = '안녕하세요. AI 시장을 분석합니다.'
const CANVAS_W = 1080
const CANVAS_H = 1920
const FONT_SIZE = 36

const styles = [
  {
    id: 'classic',
    label: 'Classic',
    desc: '흰 글자 + 검정 반투명 박스',
    render: (ctx, text) => {
      ctx.font = `${FONT_SIZE}px "Pretendard", "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'
      const x = CANVAS_W / 2
      const y = CANVAS_H - 200
      const metrics = ctx.measureText(text)
      const tw = metrics.width
      const pad = 30
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.beginPath()
      ctx.roundRect(x - tw / 2 - pad, y - FONT_SIZE - pad / 2, tw + pad * 2, FONT_SIZE + pad, 12)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, x, y)
    },
  },
  {
    id: 'classic2',
    label: 'Classic 2',
    desc: '흰 글자 + 외곽선 (배경 없음)',
    render: (ctx, text) => {
      ctx.font = `${FONT_SIZE}px "Pretendard", "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'
      const x = CANVAS_W / 2
      const y = CANVAS_H - 200
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = FONT_SIZE * 0.1
      ctx.lineJoin = 'round'
      ctx.strokeText(text, x, y)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, x, y)
    },
  },
]

export default function SubtitlePreviewPage() {
  const [customText, setCustomText] = useState(SAMPLE_TEXT)
  const canvasRefs = useRef({})

  useEffect(() => {
    styles.forEach((style) => {
      const canvas = canvasRefs.current[style.id]
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
      gradient.addColorStop(0, '#1a1a2e')
      gradient.addColorStop(0.5, '#16213e')
      gradient.addColorStop(1, '#0f3460')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.beginPath()
      ctx.arc(CANVAS_W / 2, CANVAS_H / 2 - 100, 200, 0, Math.PI * 2)
      ctx.fill()
      style.render(ctx, customText)
    })
  }, [customText])

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">자막 스타일 시안</h1>
      <p className="text-sm text-text-muted">FFmpeg 번인 결과와 유사하게 Canvas로 렌더링합니다. 1080x1920 (9:16) 기준, 맑은 고딕 {FONT_SIZE}px.</p>

      <div className="bg-surface rounded-xl border border-border p-5">
        <label className="text-xs font-semibold text-text-muted block mb-1">미리보기 텍스트</label>
        <input
          type="text"
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary/30"
          style={{ fontFamily: '"Pretendard", "Malgun Gothic", sans-serif' }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {styles.map((style) => (
          <div key={style.id} className="bg-surface rounded-xl border border-border overflow-hidden">
            <canvas
              ref={el => { canvasRefs.current[style.id] = el }}
              width={CANVAS_W}
              height={CANVAS_H}
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
