import { useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from 'lucide-react'

// 기본 목업 데이터
const DEFAULT_PROPS = {
  username: 'mybest_official',
  profileImg: null,
  content: {
    title: '인스타그램 피드 미리보기',
    body: '이것은 인스타그램 피드 게시물 미리보기입니다. 실제 콘텐츠가 여기에 표시됩니다.',
    imageUrls: [],
    hashtags: ['#마이베스트', '#콘텐츠자동화', '#SNS마케팅'],
    caption: '오늘의 콘텐츠를 공유합니다. 많은 관심 부탁드립니다!',
  },
}

// 프로필 이미지 or 기본 아바타
function ProfileAvatar({ src, size = 32 }) {
  if (src) {
    return (
      <img
        src={src}
        alt="프로필"
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 flex items-center justify-center text-white font-bold text-xs"
    >
      M
    </div>
  )
}

export default function InstagramPreview({ username, profileImg, content } = {}) {
  const u = username || DEFAULT_PROPS.username
  const img = profileImg || DEFAULT_PROPS.profileImg
  const c = content || DEFAULT_PROPS.content

  const imageUrls = c.imageUrls && c.imageUrls.length > 0 ? c.imageUrls : []
  const hashtags = c.hashtags || []
  const caption = c.caption || c.body || ''

  const [currentImage, setCurrentImage] = useState(0)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const likeCount = liked ? 1284 : 1283
  const CAPTION_LIMIT = 80

  const shouldTruncate = caption.length > CAPTION_LIMIT && !expanded

  return (
    <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-sm font-sans select-none">
      {/* 상단 프로필 바 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* 인스타그램 스타일 프로필 링 */}
          <div className="p-[2px] rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600">
            <div className="p-[2px] rounded-full bg-white">
              <ProfileAvatar src={img} size={30} />
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900 leading-tight">{u}</p>
            <p className="text-[11px] text-gray-500 leading-tight">서울특별시</p>
          </div>
        </div>
        <button className="text-gray-700 hover:text-gray-900 transition-colors">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* 이미지 영역 */}
      <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
        {imageUrls.length > 0 ? (
          <>
            <img
              src={imageUrls[currentImage]}
              alt={`게시물 이미지 ${currentImage + 1}`}
              className="w-full h-full object-cover"
            />
            {/* 이미지 여러장일 때 좌우 클릭 영역 */}
            {imageUrls.length > 1 && (
              <>
                <button
                  className="absolute left-0 top-0 h-full w-1/3 opacity-0"
                  onClick={() => setCurrentImage(i => Math.max(0, i - 1))}
                  aria-label="이전 이미지"
                />
                <button
                  className="absolute right-0 top-0 h-full w-1/3 opacity-0"
                  onClick={() => setCurrentImage(i => Math.min(imageUrls.length - 1, i + 1))}
                  aria-label="다음 이미지"
                />
                {/* 인디케이터 */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
                  {imageUrls.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentImage(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        i === currentImage ? 'bg-[#0095F6] scale-110' : 'bg-white/70'
                      }`}
                    />
                  ))}
                </div>
                {/* 이미지 카운터 */}
                <div className="absolute top-3 right-3 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded-full">
                  {currentImage + 1}/{imageUrls.length}
                </div>
              </>
            )}
          </>
        ) : (
          /* 이미지 없을 때 플레이스홀더 */
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center gap-2">
            <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-400 text-xs">이미지 없음</p>
          </div>
        )}
      </div>

      {/* 액션 바 */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => setLiked(v => !v)}
            className="transition-transform active:scale-90"
          >
            <Heart
              size={24}
              className={`transition-colors ${liked ? 'fill-red-500 text-red-500' : 'text-gray-900 hover:text-gray-500'}`}
            />
          </button>
          <button className="text-gray-900 hover:text-gray-500 transition-colors">
            <MessageCircle size={24} className="-scale-x-100" />
          </button>
          <button className="text-gray-900 hover:text-gray-500 transition-colors">
            <Send size={23} className="-rotate-12" />
          </button>
        </div>
        <button
          onClick={() => setSaved(v => !v)}
          className="transition-transform active:scale-90"
        >
          <Bookmark
            size={24}
            className={`transition-colors ${saved ? 'fill-gray-900 text-gray-900' : 'text-gray-900 hover:text-gray-500'}`}
          />
        </button>
      </div>

      {/* 좋아요 수 */}
      <div className="px-3 pb-1">
        <p className="text-[13px] font-semibold text-gray-900">좋아요 {likeCount.toLocaleString()}개</p>
      </div>

      {/* 캡션 */}
      <div className="px-3 pb-1">
        <p className="text-[13px] text-gray-900 leading-snug">
          <span className="font-semibold mr-1.5">{u}</span>
          {shouldTruncate ? (
            <>
              {caption.slice(0, CAPTION_LIMIT)}
              <button
                onClick={() => setExpanded(true)}
                className="text-gray-400 hover:text-gray-600 ml-1 text-[13px]"
              >
                ...더 보기
              </button>
            </>
          ) : (
            caption
          )}
        </p>
      </div>

      {/* 해시태그 */}
      {hashtags.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-x-1 gap-y-0.5">
          {hashtags.map((tag, i) => (
            <span key={i} className="text-[13px] text-[#0095F6] cursor-pointer hover:underline">
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {/* 댓글 보기 */}
      <div className="px-3 pb-1">
        <button className="text-[13px] text-gray-400 hover:text-gray-600">
          댓글 47개 모두 보기
        </button>
      </div>

      {/* 타임스탬프 */}
      <div className="px-3 pb-3">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">1시간 전</p>
      </div>
    </div>
  )
}
