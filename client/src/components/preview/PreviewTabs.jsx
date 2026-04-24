import { useState } from 'react'
import InstagramPreview from './InstagramPreview'
import YouTubeShortsPreview from './YouTubeShortsPreview'
import NaverBlogPreview from './NaverBlogPreview'

// 탭 정의
const TABS = [
  {
    key: 'blog',
    label: '네이버 블로그',
    shortLabel: '블로그',
    color: 'text-[#03C75A]',
    activeBg: 'bg-[#03C75A]',
    activeBorder: 'border-[#03C75A]',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 2L2 13.5V22h8.5L22 10.5V2H13.5zM10 19.5H4V14L14 4h6v6L10 19.5z" />
      </svg>
    ),
  },
  {
    key: 'instagram',
    label: '인스타그램',
    shortLabel: '인스타',
    color: 'text-pink-500',
    activeBg: 'bg-gradient-to-r from-pink-500 to-purple-600',
    activeBorder: 'border-pink-500',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    key: 'shorts',
    label: '유튜브 숏츠',
    shortLabel: '숏츠',
    color: 'text-red-500',
    activeBg: 'bg-red-600',
    activeBorder: 'border-red-500',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
      </svg>
    ),
  },
]

// 탭 전환 버전 (단일 플랫폼 집중)
export function PreviewTabsView({ blogContent, instagramContent, shortsContent, shortsVideo }) {
  const [activeTab, setActiveTab] = useState('blog')

  return (
    <div className="w-full">
      {/* 탭 버튼 */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.key
                ? `${tab.color} ${tab.activeBorder} bg-white`
                : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300'
            }`}
          >
            <span className={activeTab === tab.key ? tab.color : 'text-gray-400'}>
              {tab.icon}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex justify-center">
        {activeTab === 'blog' && (
          <NaverBlogPreview content={blogContent} />
        )}
        {activeTab === 'instagram' && (
          <InstagramPreview
            username={instagramContent?.username}
            profileImg={instagramContent?.profileImg}
            content={instagramContent?.content}
          />
        )}
        {activeTab === 'shorts' && (
          <YouTubeShortsPreview
            videoUrl={shortsVideo || shortsContent?.videoUrl}
            thumbnail={shortsContent?.thumbnail}
            title={shortsContent?.title}
            channelName={shortsContent?.channelName}
            channelImg={shortsContent?.channelImg}
            description={shortsContent?.description}
            hashtags={shortsContent?.hashtags}
          />
        )}
      </div>
    </div>
  )
}

// 그리드 버전 (3개 나란히)
export function PreviewGrid({ blogContent, instagramContent, shortsContent, shortsVideo }) {
  return (
    <div className="w-full">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-base font-bold text-gray-800">플랫폼별 미리보기</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">3개 플랫폼</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
        {/* 네이버 블로그 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-[#03C75A]">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 2L2 13.5V22h8.5L22 10.5V2H13.5zM10 19.5H4V14L14 4h6v6L10 19.5z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">네이버 블로그</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <NaverBlogPreview content={blogContent} />
          </div>
        </div>

        {/* 인스타그램 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-pink-500">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">인스타그램</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm flex justify-center">
            <InstagramPreview
              username={instagramContent?.username}
              profileImg={instagramContent?.profileImg}
              content={instagramContent?.content}
            />
          </div>
        </div>

        {/* 유튜브 숏츠 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-red-500">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700">유튜브 숏츠</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm flex justify-center p-4 bg-gray-50">
            <YouTubeShortsPreview
              videoUrl={shortsVideo || shortsContent?.videoUrl}
              thumbnail={shortsContent?.thumbnail}
              title={shortsContent?.title}
              channelName={shortsContent?.channelName}
              channelImg={shortsContent?.channelImg}
              description={shortsContent?.description}
              hashtags={shortsContent?.hashtags}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// 기본 export: 탭 버전
export default PreviewTabsView
