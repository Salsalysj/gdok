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
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            껨산기
          </h1>
          <p className="text-base text-gray-400 max-w-2xl mx-auto">
            로스트아크 게임 내 아이템 가치를 계산하고 효율을 분석하는 도구입니다.
          </p>
        </div>

        {/* 메인 컨텐츠 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 왼쪽: YouTube 동영상 */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-red-500">▶</span>
                  최신 영상
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
                      <span className="text-xs text-gray-500">
                        {new Date(youtubeVideo.publishedAt).toLocaleDateString('ko-KR')}
                      </span>
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
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
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

        {/* 사이트 소개 */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 md:p-8 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4 text-center">
            사이트 소개
          </h2>
          <p className="text-base text-gray-300 text-center leading-relaxed mb-6">
            껨산기는 로스트아크 플레이어를 위한 가치 계산 및 효율 분석 도구입니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">실시간 시세 반영</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                거래소 시세를 반영하여 정확한 가치 계산을 제공합니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">효율 분석</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                다양한 컨텐츠와 패키지의 효율을 비교 분석합니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">빠른 계산</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                복잡한 계산을 자동화하여 즉시 결과를 확인할 수 있습니다.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">맞춤 설정</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                개인 상황에 맞는 가격 조정 옵션을 제공합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 주요 기능 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <Link href="/content-rewards/raid-rewards">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-purple-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">레이드 (더보기 효율)</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                에픽 레이드, 카제로스 레이드, 그림자 레이드 보상의 더보기 효율을 계산합니다.
              </p>
            </div>
          </Link>

          <Link href="/content-rewards">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-blue-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">컨텐츠 보상</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                각종 컨텐츠 보상의 가치를 계산하고 비교합니다.
              </p>
            </div>
          </Link>

          <Link href="/hell">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-red-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">지옥 보상 계산기</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                지옥과 나락 보상의 기대값을 계산하여 최적의 선택을 돕습니다.
              </p>
            </div>
          </Link>

          <Link href="/package-efficiency">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-green-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">과금 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                상점 패키지의 가성비를 분석하여 구매 효율을 판단합니다.
              </p>
            </div>
          </Link>

          <Link href="/refining-simulation">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-yellow-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">재련 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                장비 재련의 효율을 시뮬레이션하고 최적의 전략을 제시합니다.
              </p>
            </div>
          </Link>

          <Link href="/event-efficiency">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-pink-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">이벤트 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                이벤트 보상의 가치를 계산하여 참여 여부를 결정합니다.
              </p>
            </div>
          </Link>

          <Link href="/crystal-gold">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-cyan-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">골드 환율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                크리스탈과 골드의 환율을 확인하고 현금 가치를 계산합니다.
              </p>
            </div>
          </Link>

          <Link href="/custom-calculator/box-selector">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-orange-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">상자 선택 도우미</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                선택 상자 속 아이템들의 가치를 계산하여 최적의 결과를 알려줍니다.
              </p>
            </div>
          </Link>

          <Link href="/custom-calculator/wage-calculator">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-indigo-700 hover:bg-gray-800/50 transition-all">
              <h3 className="text-lg font-semibold text-white mb-2">시급 계산기</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                컨텐츠 플레이 시 골드 획득 시급을 계산합니다.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
