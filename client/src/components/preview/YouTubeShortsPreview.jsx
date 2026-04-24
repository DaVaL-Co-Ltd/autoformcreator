import { useState } from 'react'
import { ThumbsUp, ThumbsDown, MessageCircle, Share2, MoreHorizontal } from 'lucide-react'

// 기본 목업 데이터
const DEFAULT_PROPS = {
  videoUrl: null,
  thumbnail: null,
  title: '유튜브 숏츠 미리보기 제목입니다',
  channelName: 'MyBest Official',
  channelImg: null,
  description: '오늘의 핵심 내용을 짧게 전달합니다.',
  hashtags: ['#마이베스트', '#숏츠', '#정보'],
}

// 채널 아바타
function ChannelAvatar({ src, size = 36 }) {
  if (src) {
    return (
      <img
        src={src}
        alt="채널"
        style={{ width: size, height: size }}
        className="rounded-full object-cover border-2 border-white"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white"
    >
      M
    </div>
  )
}

// 우측 액션 버튼
function _ActionButton() {
  return null
}

export default function YouTubeShortsPreview({ videoUrl, thumbnail, title, channelName, channelImg, description, hashtags } = {}) {
  const vUrl = videoUrl || DEFAULT_PROPS.videoUrl
  const thumb = thumbnail || DEFAULT_PROPS.thumbnail
  const t = title || DEFAULT_PROPS.title
  const cName = channelName || DEFAULT_PROPS.channelName
  const cImg = channelImg || DEFAULT_PROPS.channelImg
  const desc = description || DEFAULT_PROPS.description
  const tags = hashtags || DEFAULT_PROPS.hashtags

  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const likeCount = liked ? '1.3천' : '1.2천'

  return (
    /* 9:16 비율 컨테이너 */
    <div
      className="relative w-full max-w-[280px] bg-black overflow-hidden rounded-xl shadow-2xl"
      style={{ aspectRatio: '9 / 16' }}
    >
      {/* 배경: 영상 또는 썸네일 */}
      {vUrl ? (
        <video
          src={vUrl}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          playsInline
          autoPlay={isPlaying}
          onClick={() => setIsPlaying(v => !v)}
        />
      ) : thumb ? (
        <img
          src={thumb}
          alt="썸네일"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        /* 썸네일 없을 때 플레이스홀더 */
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-2">
              <svg className="w-8 h-8 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-white/40 text-xs">영상 없음</p>
          </div>
        </div>
      )}

      {/* 어두운 그라데이션 오버레이 (하단) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

      {/* 상단 YouTube Shorts 로고 */}
      <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex items-center gap-1.5">
          {/* YouTube 로고 */}
          <svg className="w-6 h-4" viewBox="0 0 90 20" fill="none">
            <path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z" fill="#FF0000" />
            <path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="white" />
          </svg>
          <span className="text-white font-bold text-sm tracking-tight">Shorts</span>
        </div>
      </div>

      {/* 우측 액션 바 */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        {/* 좋아요 */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => { setLiked(v => !v); setDisliked(false) }}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"
          >
            <ThumbsUp
              size={20}
              className={`text-white transition-colors ${liked ? 'fill-white' : ''}`}
            />
          </button>
          <span className="text-[11px] font-medium text-white/90">{likeCount}</span>
        </div>

        {/* 싫어요 */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => { setDisliked(v => !v); setLiked(false) }}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"
          >
            <ThumbsDown
              size={20}
              className={`text-white transition-colors ${disliked ? 'fill-white' : ''}`}
            />
          </button>
          <span className="text-[11px] font-medium text-white/90">싫어요</span>
        </div>

        {/* 댓글 */}
        <div className="flex flex-col items-center gap-1">
          <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-90">
            <MessageCircle size={20} className="text-white" />
          </button>
          <span className="text-[11px] font-medium text-white/90">247</span>
        </div>

        {/* 공유 */}
        <div className="flex flex-col items-center gap-1">
          <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-90">
            <Share2 size={20} className="text-white" />
          </button>
          <span className="text-[11px] font-medium text-white/90">공유</span>
        </div>

        {/* 더보기 */}
        <div className="flex flex-col items-center gap-1">
          <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all active:scale-90">
            <MoreHorizontal size={20} className="text-white" />
          </button>
        </div>

        {/* 채널 아바타 (아래) */}
        <div className="relative mt-1">
          <ChannelAvatar src={cImg} size={38} />
          <button
            onClick={() => setSubscribed(v => !v)}
            className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-lg font-bold transition-colors ${
              subscribed ? 'bg-gray-500' : 'bg-red-600'
            }`}
            title={subscribed ? '구독 취소' : '구독'}
          >
            {subscribed ? '✓' : '+'}
          </button>
        </div>
      </div>

      {/* 하단 콘텐츠 오버레이 */}
      <div className="absolute bottom-0 left-0 right-14 p-4">
        {/* 채널명 + 구독 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-semibold text-[13px]">@{cName.replace(/\s+/g, '_').toLowerCase()}</span>
          {!subscribed && (
            <button
              onClick={() => setSubscribed(true)}
              className="text-white border border-white/70 rounded-full px-2.5 py-0.5 text-[11px] font-medium hover:bg-white/10 transition-colors"
            >
              구독
            </button>
          )}
        </div>

        {/* 제목 (최대 2줄) */}
        <p className="text-white font-medium text-[13px] leading-snug line-clamp-2 mb-1.5">
          {t}
        </p>

        {/* 설명 */}
        {desc && (
          <p className="text-white/70 text-[11px] leading-snug line-clamp-1 mb-1.5">
            {desc}
          </p>
        )}

        {/* 해시태그 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
            {tags.map((tag, i) => (
              <span key={i} className="text-[#3EA6FF] text-[11px] font-medium cursor-pointer hover:underline">
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}

        {/* 음악 정보 (데코) */}
        <div className="flex items-center gap-1.5 mt-2">
          <svg className="w-3 h-3 text-white/60 animate-spin" style={{ animationDuration: '3s' }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
          <span className="text-white/60 text-[10px]">오리지널 오디오 · {cName}</span>
        </div>
      </div>
    </div>
  )
}
