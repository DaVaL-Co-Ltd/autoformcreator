import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'

// Canvas를 이용한 텍스트 너비 측정 (서버 generateTitleOverlay와 동일 로직)
function splitTextByWidth(text, fontSize, maxWidth) {
  if (typeof document === 'undefined') return [text]
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `800 ${fontSize}px Pretendard, sans-serif`

  const lines = []
  let remaining = text
  while (remaining.length > 0) {
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining)
      break
    }
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

export function TitleScene({ keyword, design = 'gradient-box', palette }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const PAL = palette || { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24' }

  const fontSize = 64
  const padX = 48
  const padY = 32
  const maxWidth = 840 // 1080 - 120*2
  const baseX = 120
  const baseY = 220

  const lines = splitTextByWidth(keyword || '', fontSize, maxWidth)
  const lineHeight = fontSize * 1.5

  // Spring 애니메이션 (위에서 슬라이드 + 페이드)
  const enterSpring = spring({ frame, fps, config: { damping: 14, mass: 0.7, stiffness: 90 } })
  const containerY = interpolate(enterSpring, [0, 1], [-80, 0])
  const containerOpacity = interpolate(enterSpring, [0, 1], [0, 1])
  const containerScale = interpolate(enterSpring, [0, 1], [0.92, 1])

  // 언더라인 draw 애니메이션
  const underlineSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 18, stiffness: 70 } })

  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent', fontFamily: 'Pretendard, sans-serif' }}>
      <div style={{
        position: 'absolute',
        left: baseX,
        top: baseY - fontSize - padY + 10,
        transform: `translateY(${containerY}px) scale(${containerScale})`,
        transformOrigin: 'top left',
        opacity: containerOpacity,
      }}>
        <TitleContent
          lines={lines}
          design={design}
          palette={PAL}
          fontSize={fontSize}
          padX={padX}
          padY={padY}
          lineHeight={lineHeight}
          underlineProgress={underlineSpring}
          frame={frame}
          fps={fps}
        />
      </div>
    </AbsoluteFill>
  )
}

function TitleContent({ lines, design, palette, fontSize, padX, padY, lineHeight, underlineProgress, frame, fps }) {
  // 박스형 디자인은 상하 간격 축소
  const boxDesigns = ['gradient-box', 'accent-bar', 'ribbon', 'split-bar']
  const effectivePadY = boxDesigns.includes(design) ? 16 : padY
  const renderLines = (extraStyle = {}) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: `${effectivePadY}px ${padX}px` }}>
      {lines.map((line, i) => {
        const lineDelay = 4 + i * 6
        const lineSpring = spring({ frame: Math.max(0, frame - lineDelay), fps, config: { damping: 15, mass: 0.6 } })
        const lineOpacity = interpolate(lineSpring, [0, 1], [0, 1])
        const lineX = interpolate(lineSpring, [0, 1], [20, 0])
        return (
          <div key={i} style={{
            fontSize,
            fontWeight: 800,
            lineHeight: `${lineHeight}px`,
            color: '#FFFFFF',
            letterSpacing: -1,
            whiteSpace: 'nowrap',
            opacity: lineOpacity,
            transform: `translateX(${lineX}px)`,
            position: 'relative',
            alignSelf: 'flex-start',
            ...extraStyle,
          }}>
            {line}
            {design === 'underline' && (
              <div style={{
                position: 'absolute', left: 0, bottom: -4,
                height: 8, width: `${interpolate(underlineProgress, [0, 1], [0, 100])}%`,
                backgroundColor: palette.underline, borderRadius: 4,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )

  if (design === 'gradient-box') {
    return (
      <div style={{
        background: `linear-gradient(90deg, ${palette.bar}, ${palette.barEnd})`,
        borderRadius: 16,
        boxShadow: `0 8px 32px ${palette.bar}40`,
      }}>
        {renderLines()}
      </div>
    )
  }

  if (design === 'accent-bar') {
    return (
      <div style={{
        backgroundColor: palette.bar + 'E0',
        borderRadius: 16,
        boxShadow: `0 8px 32px ${palette.bar}40`,
      }}>
        {renderLines()}
      </div>
    )
  }

  if (design === 'underline') {
    return renderLines({
      textShadow: '-2px -2px 0 rgba(0,0,0,0.4), 2px -2px 0 rgba(0,0,0,0.4), -2px 2px 0 rgba(0,0,0,0.4), 2px 2px 0 rgba(0,0,0,0.4)',
    })
  }

  if (design === 'split-bar') {
    const barHeight = interpolate(underlineProgress, [0, 1], [0, 100])
    return (
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{
          width: 12,
          background: `linear-gradient(180deg, ${palette.bar}, ${palette.barEnd})`,
          borderRadius: 6,
          marginRight: 20,
          alignSelf: 'center',
          height: `${barHeight}%`,
          minHeight: 80,
          boxShadow: `0 0 20px ${palette.bar}80`,
        }} />
        <div style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 16,
          backdropFilter: 'blur(8px)',
        }}>
          {renderLines()}
        </div>
      </div>
    )
  }

  if (design === 'ribbon') {
    return (
      <div style={{ position: 'relative' }}>
        {/* 리본 꼬리 (좌) */}
        <div style={{
          position: 'absolute', left: -24, top: '50%',
          transform: 'translateY(-50%)',
          width: 0, height: 0,
          borderTop: '40px solid transparent',
          borderBottom: '40px solid transparent',
          borderRight: `24px solid ${palette.barEnd}`,
          filter: 'brightness(0.7)',
        }} />
        {/* 리본 꼬리 (우) */}
        <div style={{
          position: 'absolute', right: -24, top: '50%',
          transform: 'translateY(-50%)',
          width: 0, height: 0,
          borderTop: '40px solid transparent',
          borderBottom: '40px solid transparent',
          borderLeft: `24px solid ${palette.bar}`,
          filter: 'brightness(0.7)',
        }} />
        <div style={{
          background: `linear-gradient(90deg, ${palette.bar}, ${palette.barEnd})`,
          boxShadow: `0 8px 32px ${palette.bar}50`,
        }}>
          {renderLines()}
        </div>
      </div>
    )
  }

  if (design === 'double-line') {
    return (
      <div style={{ position: 'relative', padding: '16px 0' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: `${interpolate(underlineProgress, [0, 1], [0, 100])}%`,
          height: 4, borderRadius: 2,
          background: `linear-gradient(90deg, ${palette.bar}, ${palette.barEnd})`,
        }} />
        {renderLines({ textShadow: `0 2px 12px rgba(0,0,0,0.6)` })}
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: `${interpolate(underlineProgress, [0, 1], [0, 100])}%`,
          height: 4, borderRadius: 2,
          background: `linear-gradient(90deg, ${palette.barEnd}, ${palette.bar})`,
        }} />
      </div>
    )
  }

  if (design === 'highlight-marker') {
    // 줄별로 각각 마커 렌더 (각 줄의 수직 중앙에 위치)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', padding: `${effectivePadY}px ${padX}px`, gap: 4 }}>
        {lines.map((line, i) => {
          const lineDelay = 4 + i * 6
          const lineSpring = spring({ frame: Math.max(0, frame - lineDelay), fps, config: { damping: 15, mass: 0.6 } })
          const lineOpacity = interpolate(lineSpring, [0, 1], [0, 1])
          const lineX = interpolate(lineSpring, [0, 1], [20, 0])
          const markerDelay = 8 + i * 6
          const markerSpring = spring({ frame: Math.max(0, frame - markerDelay), fps, config: { damping: 18, stiffness: 70 } })
          const markerScale = interpolate(markerSpring, [0, 1], [0, 1])
          return (
            <div key={i} style={{
              position: 'relative',
              alignSelf: 'flex-start',
              opacity: lineOpacity,
              transform: `translateX(${lineX}px)`,
              height: lineHeight,
              display: 'flex',
              alignItems: 'center',
            }}>
              {/* 하이라이트 마커: 텍스트 수직 중앙에 딱 맞게 */}
              <div style={{
                position: 'absolute',
                left: -8,
                right: -8,
                top: '50%',
                height: fontSize * 0.72,
                marginTop: -fontSize * 0.36,
                background: palette.underline,
                opacity: 0.4,
                borderRadius: 4,
                transform: `skewX(-8deg) scaleX(${markerScale})`,
                transformOrigin: 'left center',
              }} />
              <span style={{
                fontSize,
                fontWeight: 800,
                lineHeight: 1,
                color: '#FFFFFF',
                letterSpacing: -1,
                whiteSpace: 'nowrap',
                position: 'relative',
                zIndex: 1,
                textShadow: '-2px -2px 0 rgba(0,0,0,0.5), 2px -2px 0 rgba(0,0,0,0.5), -2px 2px 0 rgba(0,0,0,0.5), 2px 2px 0 rgba(0,0,0,0.5)',
              }}>
                {line}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // fallback
  return renderLines()
}
