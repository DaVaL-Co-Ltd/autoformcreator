import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'

function AnimatedBar({ label, value, index }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0
  const isPositive = value.includes('+')

  const delay = 40 + index * 20
  const progress = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14, mass: 0.8, stiffness: 80 } })
  const barProgress = Math.min(progress, 1)

  // Count up animation
  const displayValue = (numValue * barProgress).toFixed(1)

  // Fade + slide in
  const slideX = interpolate(progress, [0, 1], [-40, 0])
  const opacity = interpolate(Math.max(0, frame - delay), [0, 12], [0, 1], { extrapolateRight: 'clamp' })

  const barMaxWidth = 620
  const colors = [
    ['#6366f1', '#818cf8'],
    ['#8b5cf6', '#a78bfa'],
    ['#a855f7', '#c084fc'],
    ['#ec4899', '#f472b6'],
    ['#f59e0b', '#fbbf24'],
  ]
  const [colorStart, colorEnd] = colors[index % colors.length]

  return (
    <div style={{
      position: 'absolute',
      left: 100,
      right: 100,
      top: 780 + index * 220,
      opacity,
      transform: `translateX(${slideX}px)`,
    }}>
      {/* Label */}
      <div style={{
        color: '#e2e8f0',
        fontSize: 38,
        fontFamily: 'Pretendard, sans-serif',
        fontWeight: 600,
        marginBottom: 16,
        letterSpacing: -0.5,
      }}>
        {label}
      </div>
      {/* Bar container */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{
          width: barMaxWidth,
          height: 56,
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: 14,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Animated bar */}
          <div style={{
            width: `${(barProgress * numValue / 100) * 100}%`,
            maxWidth: '100%',
            height: '100%',
            background: `linear-gradient(90deg, ${colorStart}, ${colorEnd})`,
            borderRadius: 14,
            boxShadow: `0 0 20px ${colorStart}40`,
          }} />
          {/* Shine effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${(barProgress * numValue / 100) * 100}%`,
            maxWidth: '100%',
            height: '50%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
            borderRadius: '14px 14px 0 0',
          }} />
        </div>
        {/* Value */}
        <div style={{
          color: isPositive ? '#4ade80' : '#f87171',
          fontSize: 44,
          fontWeight: 800,
          fontFamily: 'Pretendard, sans-serif',
          minWidth: 160,
          textAlign: 'right',
          textShadow: `0 0 20px ${isPositive ? '#4ade8040' : '#f8717140'}`,
        }}>
          {isPositive ? '+' : ''}{displayValue}%
        </div>
      </div>
    </div>
  )
}

export function InfographicScene({ keyword, bullets }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Title spring animation
  const titleSpring = spring({ frame, fps, config: { damping: 15, mass: 0.6 } })
  const titleY = interpolate(titleSpring, [0, 1], [-80, 0])
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1])
  const titleScale = interpolate(titleSpring, [0, 1], [0.85, 1])

  // Divider animation
  const dividerDelay = 15
  const dividerProgress = spring({ frame: Math.max(0, frame - dividerDelay), fps, config: { damping: 20 } })
  const dividerWidth = interpolate(dividerProgress, [0, 1], [0, 300])

  // Parse bullets
  const items = (bullets || []).map(b => {
    const colonIdx = b.indexOf(':')
    if (colonIdx === -1) return { label: b, value: '0' }
    return { label: b.slice(0, colonIdx).trim(), value: b.slice(colonIdx + 1).trim() }
  })

  // Background pulse
  const pulse = interpolate(frame, [0, 120, 240], [0, 0.08, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #0a0a1a 0%, #111132 40%, #0d0d28 100%)',
      fontFamily: 'Pretendard, sans-serif',
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(99,102,241,${0.08 + pulse}) 0%, transparent 70%)`,
        top: 100, right: -150,
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(168,85,247,${0.06 + pulse}) 0%, transparent 70%)`,
        bottom: 300, left: -100,
      }} />

      {/* Grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Title area */}
      <div style={{
        position: 'absolute', top: 320, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: `translateY(${titleY}px) scale(${titleScale})`,
        opacity: titleOpacity,
      }}>
        {/* Badge */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
          padding: '24px 56px',
          borderRadius: 24,
          boxShadow: '0 8px 32px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}>
          <span style={{
            fontSize: 52, fontWeight: 800, color: '#fff',
            letterSpacing: -1.5, lineHeight: 1.2,
          }}>
            {keyword || '인포그래픽'}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{
        position: 'absolute', top: 480, left: '50%',
        transform: 'translateX(-50%)',
        width: dividerWidth, height: 3,
        background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)',
        borderRadius: 2,
      }} />

      {/* Subtitle */}
      <div style={{
        position: 'absolute', top: 520, left: 0, right: 0, textAlign: 'center',
        opacity: interpolate(Math.max(0, frame - 20), [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        <span style={{ fontSize: 30, color: '#94a3b8', fontWeight: 400, letterSpacing: 2 }}>
          DATA INSIGHT
        </span>
      </div>

      {/* Bar chart items */}
      {items.map((item, i) => (
        <AnimatedBar key={i} label={item.label} value={item.value} index={i} />
      ))}

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 250,
        background: 'linear-gradient(transparent, rgba(10,10,26,0.9))',
      }} />

      {/* Bottom watermark */}
      <div style={{
        position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center',
        opacity: interpolate(Math.max(0, frame - 60), [0, 20], [0, 0.4], { extrapolateRight: 'clamp' }),
      }}>
        <span style={{ fontSize: 24, color: '#475569', fontWeight: 500, letterSpacing: 3 }}>
          POWERED BY AI
        </span>
      </div>
    </AbsoluteFill>
  )
}
