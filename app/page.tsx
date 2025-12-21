'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        {/* 환영 문구 */}
        <div className="text-center mb-12 md:mb-16">
          <div className="mb-4">
            <span className="inline-block px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/50 rounded-lg text-sm font-medium">
              Version : 0.3.0 (Open Beta)
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              껨산기
            </span>
            에 오신 것을 환영합니다
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
            로스트아크 게임 내 아이템 가치를 정확하게 계산하고 효율을 분석하는 도구입니다
          </p>
        </div>

        {/* 기능 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 md:mb-16">
          <Link href="/content-rewards" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-blue-500 transition-all hover:shadow-lg hover:shadow-blue-500/20">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                컨텐츠 보상
              </h3>
              <p className="text-gray-400 text-sm">
                각종 컨텐츠에서 획득할 수 있는 보상의 가치를 계산하고 비교합니다
              </p>
            </div>
          </Link>

          <Link href="/hell" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-all hover:shadow-lg hover:shadow-purple-500/20">
              <div className="text-3xl mb-3">🔥</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors">
                지옥 보상 계산기
              </h3>
              <p className="text-gray-400 text-sm">
                지옥과 나락 보상의 기대값을 계산하여 최적의 선택을 도와줍니다
              </p>
            </div>
          </Link>

          <Link href="/package-efficiency" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-green-500 transition-all hover:shadow-lg hover:shadow-green-500/20">
              <div className="text-3xl mb-3">📦</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-green-400 transition-colors">
                패키지 효율
              </h3>
              <p className="text-gray-400 text-sm">
                상점 패키지의 가성비를 분석하여 구매 효율을 판단합니다
              </p>
            </div>
          </Link>

          <Link href="/event-efficiency" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-yellow-500 transition-all hover:shadow-lg hover:shadow-yellow-500/20">
              <div className="text-3xl mb-3">🎁</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-yellow-400 transition-colors">
                이벤트 효율
              </h3>
              <p className="text-gray-400 text-sm">
                이벤트 보상의 가치를 계산하여 참여 여부를 결정합니다
              </p>
            </div>
          </Link>

          <Link href="/refining-simulation" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-red-500 transition-all hover:shadow-lg hover:shadow-red-500/20">
              <div className="text-3xl mb-3">⚙️</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-red-400 transition-colors">
                재련 효율
              </h3>
              <p className="text-gray-400 text-sm">
                장비 재련의 효율을 시뮬레이션하고 최적의 전략을 제시합니다
              </p>
            </div>
          </Link>

          <Link href="/crystal-gold" className="group">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 hover:border-cyan-500 transition-all hover:shadow-lg hover:shadow-cyan-500/20">
              <div className="text-3xl mb-3">💎</div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                골드 환율
              </h3>
              <p className="text-gray-400 text-sm">
                크리스탈과 골드의 환율을 확인하고 현금 가치를 계산합니다
              </p>
            </div>
          </Link>
        </div>

        {/* 사이트 소개 */}
        <div className="bg-gray-800/30 rounded-lg p-8 md:p-10 border border-gray-700">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">
            사이트 소개
          </h2>
          <div className="space-y-4 text-gray-300 max-w-3xl mx-auto">
            <p className="text-center text-lg">
              <span className="font-semibold text-blue-400">껨산기</span>는 로스트아크 플레이어를 위한 
              <span className="font-semibold text-purple-400"> 가치 계산 및 효율 분석 도구</span>입니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h4 className="font-semibold text-white mb-1">실시간 시세 반영</h4>
                  <p className="text-sm text-gray-400">
                    거래소 시세를 실시간으로 반영하여 정확한 가치 계산
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎯</span>
                <div>
                  <h4 className="font-semibold text-white mb-1">효율 분석</h4>
                  <p className="text-sm text-gray-400">
                    다양한 컨텐츠와 패키지의 효율을 비교 분석
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <h4 className="font-semibold text-white mb-1">빠른 계산</h4>
                  <p className="text-sm text-gray-400">
                    복잡한 계산을 자동화하여 즉시 결과 확인
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔧</span>
                <div>
                  <h4 className="font-semibold text-white mb-1">맞춤 설정</h4>
                  <p className="text-sm text-gray-400">
                    개인 상황에 맞는 가격 조정 옵션 제공
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 시작하기 버튼 */}
        <div className="text-center mt-12">
          <Link
            href="/content-rewards"
            className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            시작하기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
