import { useLayoutEffect, useRef, useState } from 'react'
import { IMAGE_TEXT_WRAP_STYLE, getBlogImageFontPreset } from '../utils/contentImageOverlay'

const fallbackGradient = 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #fdf2f8 100%)'

const cardShadow = {
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)',
}

const renderBalancedLines = (text, maxLineLength) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return null

  const textLength = (start, end) => words.slice(start, end).join(' ').length
  const findBestLines = (lineCount) => {
    if (words.length < lineCount) return null

    const totalLength = words.join(' ').length
    const idealLength = totalLength / lineCount
    let best = null

    const solve = (start, remainingLines, lines, score) => {
      const wordsLeft = words.length - start
      if (wordsLeft < remainingLines) return

      if (remainingLines === 1) {
        const length = textLength(start, words.length)
        if (length > maxLineLength) return

        const candidate = {
          lines: [...lines, words.slice(start).join(' ')],
          score: score + Math.abs(length - idealLength),
        }
        if (!best || candidate.score < best.score) best = candidate
        return
      }

      const maxEnd = words.length - remainingLines + 1
      for (let end = start + 1; end <= maxEnd; end += 1) {
        const length = textLength(start, end)
        if (length > maxLineLength) break

        solve(
          end,
          remainingLines - 1,
          [...lines, words.slice(start, end).join(' ')],
          score + Math.abs(length - idealLength),
        )
      }
    }

    solve(0, lineCount, [], 0)
    return best?.lines || null
  }

  const lines = findBestLines(1) || findBestLines(2) || findBestLines(3) || words

  return lines.map((line, index) => (
    <span key={`${line}-${index}`} className="block">
      {line}
    </span>
  ))
}

const renderCardHeading = (text, fontSize, fontPreset = 'pretendard', textColor = 'inherit', withShadow = false) => {
  const clean = String(text || '').replace(/[\s,.:;!?/\\]+$/g, '').trim()
  if (!clean) return null

  const size = Math.min(Math.max(fontSize, 5), 28)
  const font = getBlogImageFontPreset(fontPreset)
  return (
    <p
      className="leading-tight"
      style={{
        fontSize: `${size}px`,
        wordBreak: 'keep-all',
        overflowWrap: 'break-word',
        fontFamily: font.family,
        fontWeight: font.weight,
        color: textColor,
        textShadow: withShadow ? '0 3px 14px rgba(15, 23, 42, 0.38)' : 'none',
      }}
    >
      {renderBalancedLines(clean, Math.max(4, Math.floor(180 / size)))}
    </p>
  )
}

const normalizeCardLayout = (style) => {
  if (style === 'center-card' || style === 'center-focus') return 'center-card'
  if (style && typeof style === 'object') return style.layout || style.cardStyle || 'background-text'
  return 'background-text'
}

function ImageLayer({ src, alt }) {
  if (!src) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: fallbackGradient }}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt || ''}
      className="absolute inset-0 h-full w-full object-cover"
      crossOrigin="anonymous"
    />
  )
}

function ConceptDigestCircleOverlay({ headline, fontPreset }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState(500)
  const cleanHeadline = String(headline || '').replace(/[\s,.:;!?/\\]+$/g, '').trim()

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined

    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) setSize(width)
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (!cleanHeadline) return null
  const font = getBlogImageFontPreset(fontPreset)
  const circleSize = size * 0.66
  const padding = size * 0.06
  const fontSize = size * 0.07
  const shadowBlur = size * 0.06
  const shadowOffsetY = size * 0.012

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div
        className="flex items-center justify-center text-center"
        style={{
          width: `${circleSize}px`,
          height: `${circleSize}px`,
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          boxShadow: `0 ${shadowOffsetY}px ${shadowBlur}px rgba(15, 23, 42, 0.08)`,
          paddingLeft: `${padding}px`,
          paddingRight: `${padding}px`,
          fontFamily: font.family,
          fontWeight: font.weight,
          color: '#111827',
        }}
      >
        <p
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.15,
            margin: 0,
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
            textWrap: 'balance',
          }}
        >
          {cleanHeadline}
        </p>
      </div>
    </div>
  )
}

const getPosterTitleSize = (isThumb, fontPreset) => {
  if (fontPreset === 'knowledge') {
    return isThumb ? 12 : 40
  }

  return isThumb ? 10 : 34
}

export function BlogImageArtwork({
  innerRef,
  src,
  alt,
  headline,
  description,
  accentColor = '#6366f1',
  showTextOverlay = true,
  variant = 'circle',
  fontPreset = 'pretendard',
  mode = 'result',
  containerClassName = '',
}) {
  const isThumb = mode === 'thumb'
  const isPlain = variant === 'plain'
  const isPosterTitle = variant === 'poster-title'
  const isCircleTextOnly = variant === 'circle-text-only'
  const baseClassName = isThumb
    ? 'relative h-full w-full overflow-hidden bg-surface-light'
    : 'relative aspect-square overflow-hidden bg-surface-light'

  return (
    <div
      ref={innerRef}
      className={`${baseClassName} ${containerClassName}`}
      style={!isThumb ? cardShadow : undefined}
    >
      <ImageLayer src={src} alt={alt} />
      {showTextOverlay && isPosterTitle && (
        <>
          <div className={`absolute inset-0 ${isThumb ? 'bg-black/6' : 'bg-black/8'}`} />
          <div className={`absolute inset-0 flex items-center justify-center ${isThumb ? 'p-3' : 'p-8'}`}>
            <div className={`${isThumb ? 'max-w-[76%]' : 'max-w-[68%]'} text-center`}>
              {renderCardHeading(headline, getPosterTitleSize(isThumb, fontPreset), fontPreset, '#111827', false)}
            </div>
          </div>
        </>
      )}
      {showTextOverlay && isCircleTextOnly && (
        <ConceptDigestCircleOverlay
          headline={headline}
          fontPreset={fontPreset}
        />
      )}
      {showTextOverlay && isPlain && (
        <>
          <div className={`absolute inset-0 bg-gradient-to-t ${isThumb ? 'from-black/28 via-transparent to-transparent' : 'from-black/34 via-black/10 to-transparent'}`} />
          <div className={`absolute inset-x-0 bottom-0 ${isThumb ? 'p-2' : 'p-5'}`}>
            <div className={`${isThumb ? 'rounded-xl px-2.5 py-2' : 'rounded-[24px] px-5 py-4'} bg-white/92 border border-white/85 shadow-sm`}>
              {renderCardHeading(headline, isThumb ? 7 : 22, fontPreset, '#1f2937')}
              {description && (
                <p
                  className={`${isThumb ? 'mt-1 text-[5px] leading-tight' : 'mt-2 text-[13px] leading-relaxed'} font-semibold text-gray-600`}
                  style={IMAGE_TEXT_WRAP_STYLE}
                >
                  {renderBalancedLines(description, isThumb ? 18 : 22)}
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {showTextOverlay && !isPlain && !isPosterTitle && !isCircleTextOnly && (
        <>
          <div className={`absolute inset-0 ${isThumb ? 'bg-black/8' : 'bg-black/10'}`} />
          <div className={`absolute inset-0 flex items-center justify-center ${isThumb ? 'p-2' : 'p-6'}`}>
            <div className={`${isThumb ? 'w-[78%] px-2 py-2 shadow' : 'w-[68%] max-w-[420px] px-6 py-6 shadow-xl'} aspect-square rounded-full bg-white/[0.94] flex flex-col items-center justify-center text-center`}>
              {renderCardHeading(headline, isThumb ? 9 : (description ? 26 : 38), fontPreset, '#1f2937')}
              {description && (
                <p
                  className={`${isThumb ? 'mt-1 text-[5px] leading-tight' : 'mt-3 text-[13px] leading-relaxed'} text-gray-600 font-semibold`}
                  style={IMAGE_TEXT_WRAP_STYLE}
                >
                  {renderBalancedLines(description, isThumb ? 14 : 14)}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function InstagramImageArtwork({
  innerRef,
  imageUrl,
  alt,
  cardNumber,
  cardTitle,
  descriptionLines = [],
  kicker,
  cardStyle = 'background-text',
  mode = 'result',
  containerClassName = '',
}) {
  const layout = normalizeCardLayout(cardStyle)
  const isCenterCard = layout === 'center-card'
  const isThumb = mode === 'thumb'
  const visibleDescriptions = descriptionLines.filter(Boolean)

  return (
    <div
      ref={innerRef}
      className={`${isThumb ? 'relative h-full w-full' : 'relative aspect-square w-full'} overflow-hidden bg-surface-light ${containerClassName}`}
      style={!isThumb ? cardShadow : undefined}
    >
      <ImageLayer src={imageUrl} alt={alt} />
      <div className={`absolute inset-0 ${isCenterCard ? 'bg-black/14' : 'bg-black/10'}`} />
      {isCenterCard ? (
        <div className={`absolute inset-0 ${isThumb ? 'p-2' : 'p-[7%]'} flex items-center justify-center`}>
          <div className={`${isThumb ? 'w-[84%] rounded-[18px] px-3 py-3.5' : 'w-[78%] rounded-[30px] px-[7.5%] py-[8.5%]'} bg-white/82 backdrop-blur-sm border border-white/70 shadow-sm text-center`}>
            <div className={`inline-flex items-center rounded-full bg-primary/10 text-primary-dark ${isThumb ? 'px-2 py-0.5 mb-2 text-[9px] font-bold' : 'px-3 py-1 mb-4 text-xs font-extrabold tracking-[0.18em]'}`}>
              CARD {cardNumber}
            </div>
            <p
              className={`${isThumb ? 'text-[9px]' : 'text-[clamp(16px,2.2vw,24px)]'} font-black text-gray-800 leading-tight`}
              style={IMAGE_TEXT_WRAP_STYLE}
            >
              {renderBalancedLines(cardTitle, isThumb ? 14 : 18)}
            </p>
            {visibleDescriptions.length > 0 && (
              <div className={`${isThumb ? 'mt-1.5 space-y-1' : 'mt-3 space-y-1.5'}`}>
                {visibleDescriptions.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={`${isThumb ? 'text-[6px]' : 'text-[clamp(10px,1.2vw,13px)]'} font-semibold text-gray-600 leading-tight`}
                    style={IMAGE_TEXT_WRAP_STYLE}
                  >
                    {renderBalancedLines(line, isThumb ? 18 : 22)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`absolute inset-0 ${isThumb ? 'p-2' : 'p-[7%]'} flex flex-col justify-between`}>
          <div className={`self-start rounded-full bg-black/65 text-white font-bold ${isThumb ? 'px-1.5 py-0.5 text-[10px]' : 'px-3 py-1.5 text-[clamp(11px,1.2vw,14px)]'}`}>
            {cardNumber}
          </div>
          {kicker && (
            <div className={`${isThumb ? 'text-[6px]' : 'text-[clamp(10px,1.1vw,12px)]'} self-end rounded-full bg-white/80 px-2 py-1 font-bold text-gray-700`}>
              {kicker}
            </div>
          )}
          <div className={`${isThumb ? 'rounded-lg px-2.5 py-2' : 'rounded-[24px] px-[5.5%] py-[5.2%]'} bg-white/88 shadow-sm`}>
            <p
              className={`${isThumb ? 'text-[8px]' : 'text-[clamp(15px,2vw,22px)]'} font-black text-gray-800 leading-tight`}
              style={IMAGE_TEXT_WRAP_STYLE}
            >
              {renderBalancedLines(cardTitle, isThumb ? 14 : 18)}
            </p>
            {visibleDescriptions.length > 0 && (
              <div className={`${isThumb ? 'mt-1 space-y-1' : 'mt-2 space-y-1.5'}`}>
                {visibleDescriptions.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={`${isThumb ? 'text-[6px]' : 'text-[clamp(10px,1.1vw,12px)]'} font-semibold text-gray-600 leading-tight`}
                    style={IMAGE_TEXT_WRAP_STYLE}
                  >
                    {renderBalancedLines(line, isThumb ? 18 : 22)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
