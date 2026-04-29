import { IMAGE_TEXT_WRAP_STYLE } from '../utils/contentImageOverlay'

const fallbackGradient = 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #fdf2f8 100%)'

const cardShadow = {
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)',
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
  containerClassName = '',
}) {
  return (
    <div
      ref={innerRef}
      className={`relative aspect-[16/9] overflow-hidden bg-slate-100 ${containerClassName}`}
      style={cardShadow}
    >
      <ImageLayer src={src} alt={alt} />
      {showTextOverlay && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-950/72 via-slate-950/18 to-transparent p-6">
          <div className="max-w-[82%]">
            <div
              className="mb-3 h-1.5 w-14 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            {headline && (
              <h4 className="text-2xl font-black leading-tight text-white drop-shadow-sm">
                {headline}
              </h4>
            )}
            {description && (
              <p className="mt-2 text-sm font-semibold leading-6 text-white/88">
                {description}
              </p>
            )}
          </div>
        </div>
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
  points = [],
  kicker,
  cardStyle = {},
}) {
  const accentColor = cardStyle.accentColor || '#ec4899'
  const backgroundColor = cardStyle.backgroundColor || '#fff7fb'
  const textColor = cardStyle.textColor || '#111827'
  const visiblePoints = points.filter(Boolean)
  const visibleDescriptions = descriptionLines.filter(Boolean)

  return (
    <div
      ref={innerRef}
      className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/70"
      style={{ ...cardShadow, backgroundColor }}
    >
      <ImageLayer src={imageUrl} alt={alt} />
      <div className="absolute inset-0 bg-white/72 backdrop-blur-[1px]" />
      <div className="absolute inset-0 flex flex-col justify-between p-7">
        <div className="flex items-center justify-between gap-3">
          <span
            className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide text-white"
            style={{ backgroundColor: accentColor }}
          >
            {String(cardNumber || '').padStart(2, '0')}
          </span>
          {kicker && (
            <span
              className="text-right text-xs font-bold leading-tight"
              style={{ color: accentColor, ...IMAGE_TEXT_WRAP_STYLE }}
            >
              {kicker}
            </span>
          )}
        </div>

        <div>
          <h4
            className="text-3xl font-black leading-tight"
            style={{ color: textColor, ...IMAGE_TEXT_WRAP_STYLE }}
          >
            {cardTitle}
          </h4>
          {visibleDescriptions.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {visibleDescriptions.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm font-semibold leading-6 text-slate-700">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        {visiblePoints.length > 0 && (
          <div className="space-y-2">
            {visiblePoints.map((point, index) => (
              <div key={`${point}-${index}`} className="flex items-start gap-2 rounded-xl bg-white/72 px-3 py-2">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-sm font-bold leading-5 text-slate-800">{point}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
