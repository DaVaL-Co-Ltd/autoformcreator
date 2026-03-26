import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileText, Image, Mail, Film, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Hash, Clock, ChevronLeft, ChevronRight, ExternalLink
} from 'lucide-react'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { marked } from 'marked'
import { saveExtraction, getExtractions, loadImages, loadShortsMedia } from '../services/storage'

const menuItems = [
  { id: 'blog', label: '블로그', icon: FileText, color: 'text-primary-light', bg: 'bg-primary/10' },
  { id: 'instagram', label: '인스타그램', icon: Image, color: 'text-pink-400', bg: 'bg-pink-400/10' },
  { id: 'newsletter', label: '뉴스레터', icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  { id: 'shorts', label: '숏폼', icon: Film, color: 'text-amber-400', bg: 'bg-amber-400/10' },
]

export default function ExtractionResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state || {}
  const dataMap = { blog: state.blogContent, instagram: state.instagramContent, newsletter: state.newsletterContent, shorts: state.shortsScript }
  const firstAvailable = state.activeChannel && dataMap[state.activeChannel] ? state.activeChannel : menuItems.find(m => dataMap[m.id])?.id || 'blog'
  const [activeMenu, setActiveMenu] = useState(firstAvailable)
  const [copied, setCopied] = useState(false)
  const [instaSlide, setInstaSlide] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const blogImagesRef = useRef([])
  const instaCardsRef = useRef([])
  const [blogPngUrls, setBlogPngUrls] = useState([])
  const [instaPngUrls, setInstaPngUrls] = useState([])

  const downloadAllImages = async (type) => {
    setDownloading(true)
    try {
      const captureElement = async (el, filename) => {
        const dataUrl = await domToPng(el, {
          scale: 2,
          quality: 1,
          fetchOptions: { mode: 'cors' },
        })
        const link = document.createElement('a')
        link.download = filename
        link.href = dataUrl
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      if (type === 'blog') {
        if (blogPngUrls.length > 0) {
          // 캐시된 PNG 사용
          for (let idx = 0; idx < blogPngUrls.length; idx++) {
            if (!blogPngUrls[idx]) continue
            const link = document.createElement('a')
            link.download = `블로그_${idx + 1}.png`
            link.href = blogPngUrls[idx]
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            await new Promise(r => setTimeout(r, 300))
          }
        } else {
          for (let idx = 0; idx < blogImagesRef.current.length; idx++) {
            const el = blogImagesRef.current[idx]
            if (!el) continue
            await captureElement(el, `블로그_${idx + 1}.png`)
            await new Promise(r => setTimeout(r, 500))
          }
        }
      } else {
        // 인스타: 각 카드를 순서대로 캡처
        const cards = instagramContent?.cards || []
        const prevSlide = instaSlide
        for (let idx = 0; idx < cards.length; idx++) {
          setInstaSlide(idx)
          await new Promise(r => setTimeout(r, 400))
          const el = instaCardsRef.current[idx]
          if (!el) continue
          await captureElement(el, `인스타그램_${idx + 1}.png`)
          await new Promise(r => setTimeout(r, 500))
        }
        setInstaSlide(prevSlide)
      }
    } catch (err) {
      console.error('다운로드 실패:', err)
    }
    setDownloading(false)
  }

  const {
    parsedText, verification, summary,
    blogContent, newsletterContent, instagramContent,
    shortsScript, blogImages: initialBlogImages, instagramImages,
    shortsVideo: initialShortsVideo,
    shortsNarration: initialShortsNarration,
    fileName, fileBase64,
  } = location.state || {}

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)
  const [shortsVideo, setShortsVideo] = useState(initialShortsVideo || null)
  const [shortsNarration, setShortsNarration] = useState(initialShortsNarration || null)

  // blogImages / shorts 미디어가 없으면 IndexedDB에서 불러오기
  useEffect(() => {
    const stateData = location.state
    if (!stateData) return
    const extractions = getExtractions()
    const match = extractions.find(e => e.fileName === stateData.fileName)
    if (!match?.id) return

    if (!blogImages?.length) {
      loadImages(match.id).then(imgs => {
        if (imgs?.length) setBlogImages(imgs)
      })
    }

    if (!shortsVideo?.combinedVideoUrl && shortsScript) {
      loadShortsMedia(match.id).then(media => {
        if (!media) return
        if (media.combinedVideoUrl) {
          const videoData = { combinedVideoUrl: media.combinedVideoUrl, sceneTimings: media.sceneTimings || [] }
          setShortsVideo(videoData)
        }
        if (media.narration?.length) {
          setShortsNarration(media.narration)
        }
      })
    }
  }, [])

  // 블로그 이미지 HTML → PNG 변환
  const convertBlogImagesToPng = async () => {
    const refs = blogImagesRef.current.filter(Boolean)
    if (refs.length === 0) return
    const urls = []
    for (const el of refs) {
      try {
        const url = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
        urls.push(url)
      } catch { urls.push(null) }
    }
    setBlogPngUrls(urls)
  }

  // 인스타 카드 HTML → PNG 변환
  const convertInstaCardsToPng = async () => {
    const cards = instagramContent?.cards || []
    if (cards.length === 0) return
    const prevSlide = instaSlide
    const urls = []
    for (let i = 0; i < cards.length; i++) {
      setInstaSlide(i)
      await new Promise(r => setTimeout(r, 300))
      const el = instaCardsRef.current[i]
      if (!el) { urls.push(null); continue }
      try {
        const url = await domToPng(el, { scale: 2, quality: 1, fetchOptions: { mode: 'cors' } })
        urls.push(url)
      } catch { urls.push(null) }
    }
    setInstaPngUrls(urls)
    setInstaSlide(prevSlide)
  }

  const handleDownload = () => {
    if (!fileBase64) return
    const link = document.createElement('a')
    link.href = fileBase64
    link.download = fileName || 'document.pdf'
    link.click()
  }

  // 블로그 이미지 PNG 변환 트리거
  useEffect(() => {
    if (activeMenu === 'blog' && blogContent && blogPngUrls.length === 0) {
      // HTML 렌더링 완료 후 변환
      const timer = setTimeout(() => convertBlogImagesToPng(), 500)
      return () => clearTimeout(timer)
    }
  }, [activeMenu, blogContent])

  // 마크다운 볼드를 HTML <strong>으로 직접 변환 (파서 의존 제거)
  const normalizeMd = (text) => {
    if (!text) return ''
    return text
      .replace(/\*{3,}([^*]+?)\*{3,}/g, '<strong>$1</strong>')  // ***text*** → <strong>
      .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '<strong>$1</strong>') // **text** → <strong> (공백 포함)
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<strong>$1</strong>')  // *text* → <strong>
      .replace(/\*{2,}/g, '')  // 남은 고아 ** 제거
  }

  // 결과 저장은 ExtractionPage에서 navigateToResults 시 1회만 수행
  // savedFromExtraction 플래그가 있을 때만 저장
  useEffect(() => {
    const stateData = location.state
    if (!stateData || !stateData.savedFromExtraction) return
    const hasContent = stateData.blogContent || stateData.newsletterContent || stateData.instagramContent || stateData.shortsScript
    if (!hasContent) return

    saveExtraction(stateData)
  }, [])

  if (!blogContent && !newsletterContent && !instagramContent && !shortsScript) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-text-muted mb-4">결과 데이터가 없습니다.</p>
          <button onClick={() => navigate('/extraction')} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
            콘텐츠 추출로 이동
          </button>
        </div>
      </div>
    )
  }

  const copy = (text, { richText = false } = {}) => {
    if (richText) {
      const normalized = normalizeMd(text)
      const html = normalized.includes('<strong>') ? normalized.replace(/\n/g, '<br>') : marked.parse(normalized)
      const blob = new Blob([html], { type: 'text/html' })
      const plainBlob = new Blob([text], { type: 'text/plain' })
      navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })
      ])
    } else {
      navigator.clipboard.writeText(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── 블로그 (실제 블로그 포스트 형태) ──
  const renderBlog = () => (
    <article className="max-w-3xl mx-auto">
      {/* 블로그 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text leading-tight mb-3">{blogContent?.title}</h1>
        {blogContent?.metaDescription && (
          <p className="text-sm text-text-muted leading-relaxed">{blogContent.metaDescription}</p>
        )}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">A</div>
          <div>
            <p className="text-xs font-medium text-text">AutoCreator</p>
            <p className="text-xs text-text-muted">{new Date().toLocaleDateString('ko-KR')}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => downloadAllImages('blog')} disabled={downloading}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors">
              <Download size={12} /> {downloading ? '저장중...' : '이미지 저장하기'}
            </button>
            <button onClick={() => copy(blogContent?.sections?.map(s => `## ${s.heading}\n${s.content}`).join('\n\n'), { richText: true })}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors">
              {copied ? <CheckCircle size={12} /> : <Copy size={12} />} {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      </div>

      {/* 블로그 본문 */}
      <div className="space-y-8">
        {(() => {
          // 첫 번째 이미지를 기준으로 모든 섹션에서 동일한 배경 사용
          const firstImage = blogImages?.find(img => img.imageUrl)
          return blogContent?.sections?.map((section, i) => {
          const image = blogImages?.find(img => img.heading === section.heading)
          const bgImageUrl = firstImage?.imageUrl || image?.imageUrl
          return (
            <section key={i}>
              <h2 className="text-lg font-bold text-text mb-3 pb-2 border-b border-border">{section.heading}</h2>
              {(() => {
                const hasOverlayImg = !!bgImageUrl
                const bgColors = ['bg-[#FFF3E0]', 'bg-[#E8F5E9]', 'bg-[#E3F2FD]', 'bg-[#F3E5F5]']
                const keyword = image?.keyPhrase || section.keyPhrase || section.heading
                const isFirst = i === 0
                const labels = ['INSIGHT', 'STUDY TIP', 'CORE', 'CHECK LIST', 'KEY POINT']
                // 첫 번째 배경색 기준으로 모든 강조색 통일
                const bgAccentMap = {
                  'bg-[#FFF3E0]': '#e57a00',
                  'bg-[#E8F5E9]': '#2e7d32',
                  'bg-[#E3F2FD]': '#1565c0',
                  'bg-[#F3E5F5]': '#7b1fa2',
                }
                const firstBg = bgColors[0]
                const accentColor = bgAccentMap[firstBg] || '#6366f1'

                return (
                  <div className="mb-4">
                    {/* PNG 미리보기 */}
                    {blogPngUrls[i] ? (
                      <img src={blogPngUrls[i]} alt={section.heading} className="w-full rounded-xl shadow-sm" />
                    ) : (
                      <div ref={el => blogImagesRef.current[i] = el} className="w-full aspect-square rounded-xl relative overflow-hidden shadow-sm" style={{ fontFamily: "'Pretendard', sans-serif" }}>
                        {hasOverlayImg ? (
                          <img src={bgImageUrl} alt="" className="w-full h-full object-cover absolute inset-0" />
                        ) : (
                          <div className={`w-full h-full absolute inset-0 ${bgColors[i % 4]}`} />
                        )}

                        {isFirst ? (
                          <>
                            <div className="absolute inset-0 bg-white/35 backdrop-blur-[1px]" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center" style={{ wordBreak: 'keep-all' }}>
                              <span className="inline-block px-3 py-1 rounded-lg text-sm font-bold mb-3 bg-white shadow-sm" style={{ letterSpacing: '1.5px', color: accentColor }}>{labels[i % labels.length]}</span>
                              <p className="font-black text-gray-800 leading-snug drop-shadow-sm" style={{ fontSize: 'clamp(28px, 8vw, 36px)', letterSpacing: '-0.5px', wordBreak: 'keep-all', overflowWrap: 'normal' }}>{section.heading.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</p>
                              <div className="w-12 h-1 rounded-full mt-3 mb-3" style={{ background: accentColor }} />
                              <p className="text-lg text-gray-500 font-semibold">{keyword}</p>
                              <div className="absolute bottom-5 flex gap-1.5">
                                {(blogContent?.tags || []).slice(0, 3).map((tag, ti) => (
                                  <span key={ti} className="px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full text-xs text-gray-600 font-medium">#{tag}</span>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-[75%] h-[75%] rounded-full bg-white/[0.93] shadow-lg flex flex-col items-center justify-center text-center p-6 relative" style={{ wordBreak: 'keep-all' }}>
                              <p className="font-black text-gray-800 leading-snug" style={{ fontSize: 'clamp(22px, 6vw, 30px)', letterSpacing: '-0.5px', wordBreak: 'keep-all', overflowWrap: 'normal' }}>{section.heading.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</p>
                              <div className="w-10 h-1 rounded-full mt-2 mb-2" style={{ background: accentColor }} />
                              <p className="text-base text-gray-500 font-semibold">{keyword}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
              {section.keyPhrase && (
                <div className="border-l-4 border-primary pl-4 py-2 mb-4 bg-primary/5 rounded-r-lg">
                  <p className="text-sm font-bold text-text">{section.keyPhrase}</p>
                </div>
              )}
              <div className="text-sm text-text-muted leading-7 max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    strong: ({ children }) => <strong className="font-bold text-text">{children}</strong>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-text mt-4 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold text-text mt-3 mb-1">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                    p: ({ children }) => <p className="mb-2">{children}</p>,
                  }}
                >{normalizeMd(section.content)}</ReactMarkdown>
              </div>
            </section>
          )
        })
        })()}
      </div>

      {/* 태그 */}
      {blogContent?.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-border">
          {blogContent.tags.map((tag, i) => (
            <span key={i} className="text-xs px-3 py-1.5 bg-primary/10 text-primary-light rounded-full flex items-center gap-1 hover:bg-primary/20 transition-colors cursor-pointer">
              <Hash size={10} />{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )

  // ── 인스타그램 (카드 캐러셀 + 캡션) ──
  const renderInstagram = () => {
    const cards = instagramContent?.cards || []
    const currentCard = cards[instaSlide]
    const currentImage = instagramImages?.find(img => img.cardNumber === currentCard?.cardNumber)

    return (
      <div className="max-w-lg mx-auto">
        {/* 인스타그램 프로필 헤더 */}
        <div className="flex items-center gap-3 mb-4 p-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">AC</div>
          <div>
            <p className="text-sm font-semibold text-text">autocreator_official</p>
            <p className="text-xs text-text-muted">AutoCreator</p>
          </div>
        </div>

        {/* 카드 이미지 캐러셀 */}
        {cards.length > 0 && (
          <div className="relative">
            <div
              ref={el => instaCardsRef.current[instaSlide] = el}
              className="aspect-square rounded-none overflow-hidden relative"
              style={{ backgroundColor: currentCard?.backgroundColor || '#f0f4ff', fontFamily: "'Pretendard', sans-serif", wordBreak: 'keep-all' }}
            >
              {/* 인포그래픽 PPT 스타일 오버레이 */}
              <div className="absolute inset-0 flex flex-col justify-between p-7">
                {/* 상단: 카드 번호 뱃지 */}
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center text-xs font-black shadow-sm">{currentCard?.cardNumber}</span>
                  <div className="h-0.5 flex-1 bg-white/40 rounded-full" />
                </div>

                {/* 중앙: 메인 콘텐츠 */}
                <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
                  {currentCard?.dataPoint && (
                    <div className="mb-4 px-5 py-3 bg-white/90 rounded-2xl shadow-lg">
                      <p className="text-3xl font-black text-gray-800 leading-none">{currentCard.dataPoint}</p>
                    </div>
                  )}
                  <h3 className="text-gray-800 font-extrabold text-xl mb-2 leading-tight" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{currentCard?.headline?.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</h3>
                  <p className="text-gray-600 font-semibold text-sm leading-relaxed" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{currentCard?.body?.split(/([,:])\s*/).reduce((acc, tok) => { if (tok === ',' || tok === ':') { acc[acc.length - 1] += tok; } else if (tok) { acc.push(tok); } return acc; }, []).map((part, pi, arr) => <span key={pi}><span style={{ whiteSpace: 'nowrap' }}>{part}</span>{pi < arr.length - 1 ? ' ' : ''}</span>)}</p>
                </div>

                {/* 하단 여백 */}
                <div />
              </div>
            </div>

            {/* 좌우 화살표 */}
            {instaSlide > 0 && (
              <button onClick={() => setInstaSlide(p => p - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors">
                <ChevronLeft size={16} className="text-gray-800" />
              </button>
            )}
            {instaSlide < cards.length - 1 && (
              <button onClick={() => setInstaSlide(p => p + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors">
                <ChevronRight size={16} className="text-gray-800" />
              </button>
            )}

            {/* 하단 인디케이터 */}
            <div className="flex justify-center gap-1.5 mt-3">
              {cards.map((_, i) => (
                <button key={i} onClick={() => setInstaSlide(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === instaSlide ? 'bg-primary w-4' : 'bg-border'}`} />
              ))}
            </div>
          </div>
        )}

        {/* 모든 카드 미리보기 (썸네일) */}
        <div className="grid grid-cols-5 gap-1.5 mt-4 px-3">
          {cards.map((card, i) => {
            const img = instagramImages?.find(im => im.cardNumber === card.cardNumber)
            return (
              <button key={i} onClick={() => setInstaSlide(i)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${i === instaSlide ? 'border-primary' : 'border-transparent'}`}
                style={{ backgroundColor: card.backgroundColor || '#1a1a2e' }}>
                {img?.imageUrl ? (
                  <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-white/60 text-xs font-bold">{card.cardNumber}</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 캡션 */}
        <div className="mt-4 px-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-text">캡션</p>
            <div className="flex items-center gap-2">
            <button onClick={() => downloadAllImages('insta')} disabled={downloading}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Download size={11} /> {downloading ? '저장중...' : '이미지 저장하기'}
            </button>
            <button onClick={() => {
              const icons = ['📌', '💡', '📊', '🔑', '✅', '🎯', '📈', '⭐', '🔥', '💬']
              const caption = instagramContent?.caption || ''
              const cardText = (instagramContent?.cards || []).map((card, i) => `${icons[i % icons.length]} ${card.headline || ''}${card.dataPoint ? ' ' + card.dataPoint : ''}${card.body ? ' — ' + card.body : ''}`).join('\n')
              const hashtags = (instagramContent?.hashtags || []).join(' ')
              const fullText = [caption, cardText, hashtags].filter(Boolean).join('\n\n')
              copy(fullText)
            }} className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Copy size={11} /> 글 복사
            </button>
            </div>
          </div>
          <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{instagramContent?.caption}</p>

          {cards.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {cards.map((card, i) => {
                const icons = ['📌', '💡', '📊', '🔑', '✅', '🎯', '📈', '⭐', '🔥', '💬']
                return (
                  <p key={i} className="text-sm text-text-muted leading-relaxed">
                    {icons[i % icons.length]} {card.headline}{card.dataPoint ? ` ${card.dataPoint}` : ''}{card.body ? ` — ${card.body}` : ''}
                  </p>
                )
              })}
            </div>
          )}

          {instagramContent?.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {instagramContent.hashtags.map((tag, i) => (
                <span key={i} className="text-xs text-primary-light hover:underline cursor-pointer">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 뉴스레터 (이메일 형태) ──
  const renderNewsletter = () => (
    <div className="max-w-2xl mx-auto">
      {/* 이메일 프레임 */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        {/* 이메일 상단 바 */}
        <div className="bg-surface-light border-b border-border px-6 py-3 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <p className="text-xs text-text-muted ml-3 flex-1 truncate">{newsletterContent?.subject}</p>
          <button onClick={() => copy(JSON.stringify(newsletterContent, null, 2))} className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
            <Copy size={11} /> 복사
          </button>
        </div>

        {/* 이메일 헤더 */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-8 py-8 text-center">
          <h2 className="text-xl font-bold text-text">{newsletterContent?.headline || newsletterContent?.subject}</h2>
          {newsletterContent?.preheader && (
            <p className="text-sm text-text-muted mt-2">{newsletterContent.preheader}</p>
          )}
        </div>

        {/* 이메일 본문 */}
        <div className="px-8 py-6 space-y-5">
          {newsletterContent?.greeting && (
            <p className="text-sm text-text">{newsletterContent.greeting}</p>
          )}

          {newsletterContent?.keyPoints?.length > 0 && (
            <div className="bg-primary/5 rounded-lg p-5 border border-primary/10">
              <p className="text-xs font-bold text-primary-light mb-3 uppercase tracking-wide">KEY POINTS</p>
              <ul className="space-y-2.5">
                {newsletterContent.keyPoints.map((point, i) => (
                  <li key={i} className="text-sm text-text flex items-start gap-2.5">
                    <CheckCircle size={15} className="text-primary shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm text-text-muted leading-7 whitespace-pre-wrap">{newsletterContent?.body}</div>

          {newsletterContent?.dataHighlights?.length > 0 && (
            <div className="grid grid-cols-2 gap-3 py-2">
              {newsletterContent.dataHighlights.map((d, i) => (
                <div key={i} className="bg-surface-light rounded-xl p-4 border border-border text-center">
                  <p className="text-2xl font-bold text-primary-light">{d.value}</p>
                  <p className="text-xs text-text-muted mt-1">{d.label}</p>
                </div>
              ))}
            </div>
          )}

          {newsletterContent?.closingNote && (
            <div className="pt-5 border-t border-border">
              <p className="text-sm text-text-muted">{newsletterContent.closingNote}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ── 숏폼 (세로 영상 스크립트) ──
  const shortsVideoRef = useRef(null)
  const shortsAudioRefs = useRef([])
  const [currentScene, setCurrentScene] = useState(-1)
  const playingSceneRef = useRef(-1)

  const combinedVideoUrl = shortsVideo?.combinedVideoUrl
  const sceneTimings = shortsVideo?.sceneTimings || []

  // 현재 시간에 해당하는 씬 인덱스 계산
  const getSceneAtTime = (t) => {
    for (let i = 0; i < sceneTimings.length; i++) {
      const s = sceneTimings[i]
      if (t >= s.startTime && t < s.startTime + s.duration) return i
    }
    return -1
  }

  // timeupdate 기반 나레이션 싱크
  const handleShortsTimeUpdate = () => {
    const video = shortsVideoRef.current
    if (!video || !sceneTimings.length) return
    const t = video.currentTime
    const sceneIdx = getSceneAtTime(t)
    if (sceneIdx !== currentScene) setCurrentScene(sceneIdx)
    if (sceneIdx !== playingSceneRef.current) {
      shortsAudioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
      if (sceneIdx >= 0 && !video.paused) {
        const audio = shortsAudioRefs.current[sceneIdx]
        if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
      }
      playingSceneRef.current = sceneIdx
    }
  }

  const handleShortsPlay = () => { playingSceneRef.current = -1 }

  const handleShortsPause = () => {
    shortsAudioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0 } })
    playingSceneRef.current = -1
  }

  const renderVideoPanel = (videoData, versionLabel) => {
    const videoUrl = videoData?.combinedVideoUrl
    const timings = videoData?.sceneTimings || []
    return (
      <div className="w-64 shrink-0">
        <div className="aspect-[9/16] bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl overflow-hidden relative shadow-xl">
          {videoUrl ? (
            <video
              ref={shortsVideoRef}
              controls
              className="w-full h-full object-cover absolute inset-0"
              src={videoUrl}
              onPlay={handleShortsPlay}
              onPause={handleShortsPause}
              onEnded={handleShortsPause}
              onTimeUpdate={handleShortsTimeUpdate}
            />
          ) : (
            <>
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <Film size={32} className="text-white/20 mb-4" />
                <h3 className="text-white font-bold text-sm mb-2">{shortsScript?.title}</h3>
                <p className="text-white/60 text-xs">{versionLabel}</p>
                <p className="text-white/40 text-xs mt-1">영상 미생성</p>
              </div>
              {shortsScript?.hook && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-4">
                  <p className="text-white text-xs font-medium">{shortsScript.hook}</p>
                </div>
              )}
            </>
          )}
        </div>
        {videoUrl && (
          <div className="mt-2 flex items-center gap-3">
            <a href={videoUrl} download={`숏폼_${versionLabel}.webm`}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors">
              <Download size={10} /> 다운로드
            </a>
            <button
              onClick={() => navigate('/shorts/view', { state: {
                combinedVideoUrl: videoUrl,
                sceneTimings: timings,
                scenes: shortsScript?.scenes || [],
                narrations: shortsNarration || [],
                title: `${shortsScript?.title || '숏폼 영상'} (${versionLabel})`,
              }})}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
            >
              <ExternalLink size={10} /> 웹에서 보기
            </button>
          </div>
        )}
        {/* 나레이션 오디오 (숨김, 싱크용) */}
        {shortsNarration?.map((n, i) => (
          n.audioUrl && <audio key={i} ref={el => shortsAudioRefs.current[i] = el} src={n.audioUrl} preload="auto" />
        ))}
      </div>
    )
  }

  const renderShorts = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-6">
        {/* 9:16 통합 영상 프레임 */}
        {renderVideoPanel(shortsVideo, '숏폼 영상')}

        {/* 스크립트 (공유) */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-text">{shortsScript?.title}</h3>
            <button onClick={() => copy(shortsScript?.scenes?.map(s => s.narration).join('\n\n'))}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1">
              <Copy size={11} /> 대본 복사
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1"><Clock size={12} /> {shortsScript?.duration}초</span>
            <span>{shortsScript?.scenes?.length}개 씬</span>
          </div>

          {shortsScript?.scenes?.map((scene, i) => {
            const sceneAudio = shortsNarration?.find(n => n.sceneNumber === scene.sceneNumber)
            const isActive = combinedVideoUrl && i === currentScene
            return (
              <div key={i} className={`p-4 rounded-lg border transition-all ${isActive ? 'bg-amber-400/5 border-amber-400/30' : 'bg-surface border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-amber-400/30 text-amber-400' : 'bg-amber-400/20 text-amber-400'}`}>{scene.sceneNumber}</span>
                  <span className="text-xs text-text-muted">{scene.duration}초</span>
                  {isActive && <span className="text-xs text-amber-400 font-medium animate-pulse">재생중</span>}
                </div>
                <p className="text-sm text-text mb-1">{scene.narration}</p>
                {scene.textOverlay && <p className="text-xs text-amber-400 font-medium mb-2">[자막] {scene.textOverlay}</p>}
                {sceneAudio?.audioUrl && !combinedVideoUrl && (
                  <audio controls className="w-full h-8 mt-2" src={sceneAudio.audioUrl} />
                )}
              </div>
            )
          })}

          {shortsScript?.cta && (
            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
              <p className="text-xs text-primary-light font-medium">CTA: {shortsScript.cta}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderContent = { blog: renderBlog, instagram: renderInstagram, newsletter: renderNewsletter, shorts: renderShorts }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/extraction')} className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-text transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-xs text-text-muted">소스 파일</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text">{fileName}</p>
              {fileBase64 && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  title="원본 파일 다운로드"
                >
                  <Download size={13} />
                  다운로드
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 채널 탭 */}
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-border p-2">
        {menuItems.map(({ id, label, icon: Icon, color, bg }) => {
          const hasData = { blog: blogContent, instagram: instagramContent, newsletter: newsletterContent, shorts: shortsScript }[id]
          return (
            <button
              key={id}
              onClick={() => hasData && setActiveMenu(id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeMenu === id
                  ? 'bg-primary/15 text-primary-light'
                  : hasData
                    ? 'text-text-muted hover:text-text hover:bg-surface-light'
                    : 'text-text-muted/40 cursor-not-allowed'
                }`}
            >
              <Icon size={16} />
              {label}
              {hasData && <CheckCircle size={12} className="text-success" />}
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 영역 */}
      <div>
        {renderContent[activeMenu]?.() || (
          <div className="flex items-center justify-center h-96 text-text-muted text-sm">
            이 채널의 콘텐츠가 아직 생성되지 않았습니다.
          </div>
        )}
      </div>
    </div>
  )
}
