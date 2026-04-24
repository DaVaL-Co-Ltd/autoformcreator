import { useState } from 'react'
import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react'

// 기본 목업 데이터
const DEFAULT_CONTENT = {
  title: '네이버 블로그 게시물 미리보기',
  metaDescription: '이것은 블로그 게시물의 요약 설명입니다. SEO에 활용되는 메타 설명 텍스트입니다.',
  sections: [
    {
      heading: '첫 번째 섹션 제목',
      content: '여기에 본문 내용이 들어갑니다. **중요한 내용**은 굵게 표시됩니다.\n\n- 첫 번째 항목\n- 두 번째 항목\n- 세 번째 항목',
      imageUrl: null,
    },
    {
      heading: '두 번째 섹션 제목',
      content: '추가적인 내용이 여기에 표시됩니다. 블로그 게시물의 세부 정보를 담습니다.',
      imageUrl: null,
    },
  ],
  tags: ['마이베스트', '블로그', '콘텐츠자동화', '정보'],
}

// 마크다운-라이트 파서: **bold**, - 리스트, \n 줄바꿈
function renderContent(text) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 my-2 text-gray-700 text-sm leading-relaxed">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      listItems.push(trimmed.slice(2))
    } else {
      flushList()
      if (trimmed === '') {
        elements.push(<div key={`br-${key++}`} className="h-2" />)
      } else {
        elements.push(
          <p key={`p-${key++}`} className="text-gray-700 text-sm leading-relaxed">
            {renderInline(trimmed)}
          </p>
        )
      }
    }
  })
  flushList()

  return elements
}

// **bold** 인라인 파싱
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// 현재 날짜 포맷
function formatDate() {
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}.`
}

export default function NaverBlogPreview({ content } = {}) {
  const c = content || DEFAULT_CONTENT
  const sections = c.sections || []
  const tags = c.tags || []

  const [liked, setLiked] = useState(false)
  const likeCount = liked ? 124 : 123

  return (
    <div className="w-full max-w-[600px] bg-white font-sans">
      {/* 네이버 블로그 상단 헤더 바 */}
      <div className="bg-[#03C75A] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* 네이버 블로그 로고 */}
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
            <path d="M13.5 2L2 13.5V22h8.5L22 10.5V2H13.5zM10 19.5H4V14L14 4h6v6L10 19.5z" />
          </svg>
          <span className="text-white font-bold text-sm tracking-tight">BLOG</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/80 text-xs">이웃추가</span>
          <span className="text-white/80 text-xs">|</span>
          <span className="text-white/80 text-xs">공유하기</span>
        </div>
      </div>

      {/* 블로그 정보 바 */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 블로거 아바타 */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#03C75A] to-green-400 flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900">마이베스트 공식블로그</p>
            <p className="text-[11px] text-gray-400">{formatDate()} · 마케팅/정보</p>
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600 transition-colors">
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* 본문 영역 */}
      <div className="px-5 py-5">
        {/* 제목 */}
        <h1 className="text-xl font-bold text-gray-900 leading-snug mb-3">
          {c.title}
        </h1>

        {/* 메타 설명 */}
        {c.metaDescription && (
          <p className="text-sm text-gray-500 leading-relaxed mb-5 pb-5 border-b border-gray-100">
            {c.metaDescription}
          </p>
        )}

        {/* 섹션들 */}
        <div className="space-y-6">
          {sections.map((section, idx) => (
            <div key={idx}>
              {/* 섹션 헤딩 */}
              {section.heading && (
                <h3 className="text-base font-bold text-gray-900 mb-2 pb-1.5 border-b-2 border-[#03C75A] inline-block">
                  {section.heading}
                </h3>
              )}

              {/* 섹션 본문 */}
              <div className="mt-2">
                {renderContent(section.content)}
              </div>

              {/* 섹션 이미지 */}
              {section.imageUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border border-gray-100">
                  <img
                    src={section.imageUrl}
                    alt={section.heading || `섹션 ${idx + 1} 이미지`}
                    className="w-full object-cover max-h-80"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 섹션 없을 때 플레이스홀더 */}
        {sections.length === 0 && (
          <div className="py-12 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-400 text-sm">콘텐츠가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 하단: 태그 + 반응 버튼 */}
      <div className="px-5 pb-5 border-t border-gray-100 pt-4">
        {/* 태그 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-[#E8F9EE] text-[#03C75A] text-xs font-medium rounded-full cursor-pointer hover:bg-[#03C75A] hover:text-white transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* 좋아요/댓글 버튼 */}
        <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
          <button
            onClick={() => setLiked(v => !v)}
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
              liked ? 'text-[#03C75A]' : 'text-gray-400 hover:text-[#03C75A]'
            }`}
          >
            <Heart size={16} className={liked ? 'fill-[#03C75A]' : ''} />
            <span>공감 {likeCount}</span>
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
            <MessageCircle size={16} />
            <span>댓글 8</span>
          </button>

          {/* 이웃추가 버튼 */}
          <div className="ml-auto">
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-[#03C75A] text-[#03C75A] text-xs font-medium rounded-full hover:bg-[#03C75A] hover:text-white transition-colors">
              + 이웃추가
            </button>
          </div>
        </div>
      </div>

      {/* 저작권 텍스트 */}
      <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 text-center">
          이 블로그는 마이베스트 콘텐츠 자동화 시스템으로 생성되었습니다.
        </p>
      </div>
    </div>
  )
}
