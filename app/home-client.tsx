'use client';

import Link from 'next/link';
import { useState } from 'react';

type YouTubeVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
} | null;

type LostArkNotice = {
  Title: string;
  Date: string;
  Link: string;
  Type: string;
};

export default function HomeClient({ 
  youtubeVideo, 
  lostarkNotices 
}: { 
  youtubeVideo: YouTubeVideo;
  lostarkNotices: LostArkNotice[];
}) {
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="py-8 md:py-12 px-4 max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-8 md:mb-12 space-y-3">
          <div>
            <span className="inline-block px-3 py-1 border border-gray-700 rounded text-sm text-gray-300">
              Open Beta
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-semibold tracking-tight text-white">
            껨산기
          </h1>

        </div>

        {/* 사이트 소개 */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <h4 className="text-base sm:text-lg font-semibold text-white">실시간 시세 반영</h4>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                거래소 시세를 반영하여 정확한 가치 계산을 제공합니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-base sm:text-lg font-semibold text-white">효율 분석</h4>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                다양한 컨텐츠와 패키지의 효율을 비교 분석합니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-base sm:text-lg font-semibold text-white">빠른 계산</h4>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                복잡한 계산을 자동화하여 즉시 결과를 확인할 수 있습니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-base sm:text-lg font-semibold text-white">맞춤 설정</h4>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                개인 상황에 맞는 가격 조정 옵션을 제공합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 메인 컨텐츠 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* 왼쪽: YouTube 동영상 */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-red-500">▶</span>
                  스누껨독 최신 영상
                </h2>
              </div>
              {youtubeVideo ? (
                <div className="relative">
                  {!showVideo ? (
                    <div className="relative cursor-pointer group" onClick={() => setShowVideo(true)}>
                      <img 
                        src={youtubeVideo.thumbnail} 
                        alt={youtubeVideo.title}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${youtubeVideo.videoId}?autoplay=1`}
                        title={youtubeVideo.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-white font-medium mb-2 line-clamp-2">
                      {youtubeVideo.title}
                    </h3>
                    <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                      {youtubeVideo.description}
                    </p>
                    <div className="flex items-center justify-between">

                      <a 
                        href={`https://www.youtube.com/watch?v=${youtubeVideo.videoId}`}                  
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-500 hover:text-red-400"
                      >
                        YouTube에서 보기 →
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <p>동영상을 불러올 수 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 로스트아크 공지사항 */}
          <div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-yellow-500">📢</span>
                  로스트아크 공지사항
                </h2>
              </div>
              <div className="divide-y divide-gray-800">
                {lostarkNotices.length > 0 ? (
                  lostarkNotices.map((notice, index) => (
                    <a
                      key={index}
                      href={notice.Link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                          notice.Type === '점검' ? 'bg-red-900/30 text-red-400 border border-red-800' :
                          notice.Type === '이벤트' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                          'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}>
                          {notice.Type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white line-clamp-2 mb-1">
                            {notice.Title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(notice.Date).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <p className="text-sm">공지사항을 불러올 수 없습니다.</p>
                  </div>
                )}
              </div>
              {lostarkNotices.length > 0 && (
                <div className="p-3 border-t border-gray-800 text-center">
                  <a
                    href="https://lostark.game.onstove.com/News/Notice/List"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    더보기 →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
