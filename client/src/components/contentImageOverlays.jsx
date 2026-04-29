import { IMAGE_TEXT_WRAP_STYLE } from '../utils/contentImageOverlay'

const fallbackGradient = 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #fdf2f8 100%)'

const cardShadow = {
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)',
}

const renderBalancedLines = (text, maxLineLength) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return null

  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLineLength && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)

  return lines.map((line, index) => (
    <span key={`${line}-${index}`} className="block">
      {line}
    </span>
  ))
}

const renderCardHeading = (text, fontSize) => {
  const clean = String(text || '').replace(/[\s,.:;!?/\\]+$/g, '').trim()
  if (!clean) return null

  const size = Math.min(Math.max(fontSize, 5), 28)
  return (
    <p
      className="font-black text-gray-800 leading-tight"
      style={{
        fontSize: `${size}px`,
        wordBreak: 'keep-all',
        overflowWrap: 'break-word',
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

export function BlogImageArtwork({
  innerRef,
  src,
  alt,
  headline,
  description,
  accentColor = '#6366f1',
  showTextOverlay = true,
  variant = 'circle',
  mode = 'result',
  containerClassName = '',
}) {
  const isThumb = mode === 'thumb'
  const isPlain = variant === 'plain'
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
      {showTextOverlay && isPlain && (
        <>
          <div className={`absolute inset-0 bg-gradient-to-t ${isThumb ? 'from-black/28 via-transparent to-transparent' : 'from-black/34 via-black/10 to-transparent'}`} />
          <div className={`absolute inset-x-0 bottom-0 ${isThumb ? 'p-2' : 'p-5'}`}>
            <div className={`${isThumb ? 'rounded-xl px-2.5 py-2' : 'rounded-[24px] px-5 py-4'} bg-white/92 border border-white/85 shadow-sm`}>
              {renderCardHeading(headline, isThumb ? 7 : 22)}
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
      {showTextOverlay && !isPlain && (
        <>
          <div className={`absolute inset-0 ${isThumb ? 'bg-black/8' : 'bg-black/10'}`} />
          <div className={`absolute inset-0 flex items-center justify-center ${isThumb ? 'p-2' : 'p-6'}`}>
            <div className={`${isThumb ? 'w-[72%] px-2 py-2 shadow' : 'w-[52%] max-w-[320px] px-5 py-5 shadow-xl'} aspect-square rounded-full bg-white/[0.94] flex flex-col items-center justify-center text-center`}>
              {renderCardHeading(headline, isThumb ? 7 : 24)}
              <div
                className={`${isThumb ? 'w-4 h-0.5 mt-1 mb-1' : 'w-12 h-1 mt-3 mb-3'} rounded-full`}
                style={{ background: accentColor }}
              />
              {description && (
                <p
                  className={`${isThumb ? 'text-[5px] leading-tight' : 'text-[13px] leading-relaxed'} text-gray-600 font-semibold`}
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
          <div className={`${isThumb ? 'w-[78%] rounded-[18px] px-3 py-3' : 'w-[70%] rounded-[30px] px-[7%] py-[8%]'} bg-white/82 backdrop-blur-sm border border-white/70 shadow-sm text-center`}>
            <div className={`inline-flex items-center rounded-full bg-primary/10 text-primary-dark ${isThumb ? 'px-2 py-0.5 mb-2 text-[9px] font-bold' : 'px-3 py-1 mb-4 text-xs font-extrabold tracking-[0.18em]'}`}>
              CARD {cardNumber}
            </div>
            <p className={`${isThumb ? 'text-[9px]' : 'text-[clamp(16px,2.2vw,24px)]'} font-black text-gray-800 leading-tight`}>
              {cardTitle}
            </p>
            {visibleDescriptions.length > 0 && (
              <div className={`${isThumb ? 'mt-1.5 space-y-1' : 'mt-3 space-y-1.5'}`}>
                {visibleDescriptions.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={`${isThumb ? 'text-[6px]' : 'text-[clamp(10px,1.2vw,13px)]'} font-semibold text-gray-600 leading-tight`}
                  >
                    {line}
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
          <div className={`${isThumb ? 'rounded-lg px-2 py-1.5' : 'rounded-[24px] px-[5%] py-[4.5%]'} bg-white/88 shadow-sm`}>
            <p className={`${isThumb ? 'text-[8px]' : 'text-[clamp(15px,2vw,22px)]'} font-black text-gray-800 leading-tight`}>
              {cardTitle}
            </p>
            {visibleDescriptions.length > 0 && (
              <div className={`${isThumb ? 'mt-1 space-y-1' : 'mt-2 space-y-1.5'}`}>
                {visibleDescriptions.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={`${isThumb ? 'text-[6px]' : 'text-[clamp(10px,1.1vw,12px)]'} font-semibold text-gray-600 leading-tight`}
                  >
                    {line}
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
