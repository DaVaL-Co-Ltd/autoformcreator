import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileText, Image, Mail, Film, Video, ArrowLeft, ArrowRight, Copy, Download,
  CheckCircle, Hash, Clock, Layers, ChevronLeft, ChevronRight
} from 'lucide-react'
import { domToPng } from 'modern-screenshot'
import ReactMarkdown from 'react-markdown'
import { marked } from 'marked'
import { saveExtraction, getExtractions, loadImages } from '../services/storage'

const menuItems = [
  { id: 'blog', label: '블로그', icon: FileText, color: 'text-primary-light', bg: 'bg-primary/10' },
  { id: 'instagram', label: '인스타그램', icon: Image, color: 'text-pink-400', bg: 'bg-pink-400/10' },
  { id: 'newsletter', label: '뉴스레터', icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  { id: 'shorts', label: '숏폼', icon: Film, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { id: 'longform', label: '롱폼', icon: Video, color: 'text-sky-400', bg: 'bg-sky-400/10' },
]

export default function ExtractionResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state || {}
  const dataMap = { blog: state.blogContent, instagram: state.instagramContent, newsletter: state.newsletterContent, shorts: state.shortsScript, longform: state.longformScript }
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
    shortsScript, longformScript, blogImages: initialBlogImages, instagramImages,
    shortsVideo, shortsNarration, longformNarration,
    longformVideo, fileName, fileBase64,
  } = location.state || {}

  const [blogImages, setBlogImages] = useState(initialBlogImages || null)

  // blogImages가 없으면 IndexedDB에서 불러오기
  useEffect(() => {
    if (blogImages?.length) return
    const stateData = location.state
    if (!stateData) return
    // extractionId 찾기: localStorage에서 같은 fileName의 최신 항목
    const extractions = getExtractions()
    const match = extractions.find(e => e.fileName === stateData.fileName)
    if (match?.id) {
      loadImages(match.id).then(imgs => {
        if (imgs?.length) setBlogImages(imgs)
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

  // 결과 저장은 ExtractionPage에서 navigateToResults 시 1회만 수행
  // savedFromExtraction 플래그가 있을 때만 저장
  useEffect(() => {
    const stateData = location.state
    if (!stateData || !stateData.savedFromExtraction) return
    const hasContent = stateData.blogContent || stateData.newsletterContent || stateData.instagramContent || stateData.shortsScript || stateData.longformScript
    if (!hasContent) return

    saveExtraction(stateData)
  }, [])

  if (!blogContent && !newsletterContent && !instagramContent && !shortsScript && !longformScript) {
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
      const html = marked.parse(text)
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
              <div className="text-sm text-text-muted leading-7 prose prose-sm prose-invert max-w-none"><ReactMarkdown>{section.content}</ReactMarkdown></div>
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
  const renderShorts = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 숏폼 미리보기 프레임 */}
      <div className="flex gap-6">
        {/* 9:16 프레임 */}
        <div className="w-64 shrink-0">
          <div className="aspect-[9/16] bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl overflow-hidden relative shadow-xl">
            {shortsVideo?.[0]?.videoUrl ? (
              <video controls className="w-full h-full object-cover absolute inset-0" src={shortsVideo[0].videoUrl} />
            ) : (
              <>
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <Film size={32} className="text-white/20 mb-4" />
                  <h3 className="text-white font-bold text-sm mb-2">{shortsScript?.title}</h3>
                  <p className="text-white/60 text-xs">{shortsScript?.duration}초</p>
                </div>
                {shortsScript?.hook && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-4">
                    <p className="text-white text-xs font-medium">{shortsScript.hook}</p>
                  </div>
                )}
              </>
            )}
          </div>
          {shortsVideo?.length > 0 && (
            <div className="mt-2 space-y-1">
              {shortsVideo.map((sv, vi) => (
                sv.videoUrl && (
                  <a key={vi} href={sv.videoUrl} download={`숏폼_씬${sv.sceneNumber}.mp4`}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors">
                    <Download size={10} /> 씬{sv.sceneNumber} 다운로드
                  </a>
                )
              ))}
            </div>
          )}
        </div>

        {/* 스크립트 */}
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
            return (
              <div key={i} className="p-4 bg-surface rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center text-xs font-bold">{scene.sceneNumber}</span>
                  <span className="text-xs text-text-muted">{scene.duration}초</span>
                </div>
                <p className="text-sm text-text mb-1">{scene.narration}</p>
                {scene.textOverlay && <p className="text-xs text-amber-400 font-medium mb-2">[자막] {scene.textOverlay}</p>}
                {sceneAudio?.audioUrl && (
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

  // ── 롱폼 (영상 스크립트 타임라인) ──
  const renderLongform = () => !longformScript ? (
    <div className="flex items-center justify-center h-40 text-text-muted text-sm">롱폼 대본이 생성되지 않았습니다.</div>
  ) : (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text">{longformScript?.title}</h3>
          <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1"><Clock size={12} /> {longformScript?.estimatedDuration}</span>
            <span className="flex items-center gap-1"><Layers size={12} /> {longformScript?.sections?.length}개 섹션</span>
          </div>
        </div>
        <button onClick={() => copy(longformScript?.fullNarrationText || longformScript?.sections?.map(s => s.narration).join('\n\n'))}
          className="text-xs text-text-muted hover:text-primary flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg">
          <Copy size={11} /> 전체 나레이션 복사
        </button>
      </div>

      {/* 인트로 */}
      {longformScript?.intro && (
        <div className="bg-gradient-to-r from-sky-400/10 to-sky-400/5 rounded-xl p-5 border border-sky-400/20">
          <p className="text-xs font-bold text-sky-400 mb-2 uppercase tracking-wide">INTRO</p>
          {longformScript.intro.hook && <p className="text-base font-semibold text-text mb-2">{longformScript.intro.hook}</p>}
          <p className="text-sm text-text-muted leading-relaxed">{longformScript.intro.narration}</p>
        </div>
      )}

      {/* 타임라인 섹션 */}
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
        <div className="space-y-6">
          {longformScript?.sections?.map((section, i) => (
            <div key={i} className="relative pl-12">
              <div className="absolute left-0 w-10 h-10 rounded-full bg-sky-400/20 text-sky-400 flex items-center justify-center text-sm font-bold border-2 border-surface z-10">
                {section.sectionNumber}
              </div>
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 bg-surface-light border-b border-border flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-text">{section.title}</h4>
                  <span className="text-xs text-text-muted">{section.duration}초</span>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{section.narration}</p>

                  {section.dataPoints?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {section.dataPoints.map((dp, j) => (
                        <span key={j} className="text-xs bg-primary/5 text-primary-light px-2.5 py-1 rounded-full">{dp}</span>
                      ))}
                    </div>
                  )}

                  {section.visualElements?.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {section.visualElements.map((ve, j) => (
                        <div key={j} className="bg-surface-light rounded-lg p-2.5 border border-border">
                          <span className="text-xs font-medium text-sky-400">[{ve.type}]</span>
                          <p className="text-xs text-text-muted mt-0.5">{ve.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 아웃트로 */}
      {longformScript?.outro && (
        <div className="bg-gradient-to-r from-sky-400/10 to-sky-400/5 rounded-xl p-5 border border-sky-400/20">
          <p className="text-xs font-bold text-sky-400 mb-2 uppercase tracking-wide">OUTRO</p>
          <p className="text-sm text-text mb-2">{longformScript.outro.narration}</p>
          <p className="text-sm font-semibold text-primary-light">{longformScript.outro.cta}</p>
        </div>
      )}

      {/* 롱폼 영상/프리뷰 */}
      {longformVideo && (
        <div className="rounded-xl overflow-hidden border border-border">
          {longformVideo.endsWith('.mp4') ? (
            <video
              controls
              className="w-full"
              src={longformVideo}
              crossOrigin="anonymous"
              onError={(e) => {
                const iframe = document.createElement('iframe')
                iframe.src = longformVideo
                iframe.className = 'w-full aspect-video'
                iframe.allow = 'autoplay'
                e.target.replaceWith(iframe)
              }}
            />
          ) : longformVideo.match(/\.(jpg|png|jpeg)$/i) ? (
            <div className="relative">
              <img src={longformVideo} alt="롱폼 프리뷰" className="w-full" />
              <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white text-xs font-bold rounded-lg">PREVIEW</div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 bg-surface-light text-text-muted">
              <p className="text-sm mb-2">롱폼 영상 결과</p>
              <a href={longformVideo} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">링크에서 확인</a>
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-surface-light border-t border-border">
            <p className="text-xs font-medium text-success">
              {longformVideo.endsWith('.mp4') ? '롱폼 영상 생성 완료' : longformVideo.match(/\.(jpg|png|jpeg)$/i) ? '롱폼 프리뷰 (Preview 모드)' : '롱폼 영상 결과'}
            </p>
            <div className="flex gap-2">
              <a href={longformVideo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-surface text-text-muted text-xs font-medium rounded-lg hover:bg-border transition-all border border-border">
                새 탭에서 보기
              </a>
              {longformVideo.endsWith('.mp4') && (
                <a href={longformVideo} download="longform-video.mp4" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-dark transition-all">
                  <Download size={11} /> 다운로드
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 나레이션 오디오 */}
      {longformNarration?.audioUrl && (
        <div className="p-4 bg-surface border border-border rounded-xl">
          <p className="text-xs font-medium text-text mb-2">전체 나레이션 오디오</p>
          <audio controls className="w-full h-10" src={longformNarration.audioUrl} />
        </div>
      )}
    </div>
  )

  const renderContent = { blog: renderBlog, instagram: renderInstagram, newsletter: renderNewsletter, shorts: renderShorts, longform: renderLongform }

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
          const hasData = { blog: blogContent, instagram: instagramContent, newsletter: newsletterContent, shorts: shortsScript, longform: longformScript }[id]
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
