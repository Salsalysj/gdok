'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-16">
        <div className="text-center mb-12 md:mb-14 space-y-4">
          <div>
            <span className="inline-block px-3 py-1 border border-gray-700 rounded text-sm text-gray-300">
              Version 0.3.0 (Open Beta)
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white">
            껨산기에 오신 것을 환영합니다
          </h1>
          <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            로스트아크 게임 내 아이템 가치를 계산하고 효율을 분석하는 도구입니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-14">
          <Link href="/content-rewards">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">컨텐츠 보상</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                각종 컨텐츠 보상의 가치를 계산하고 비교합니다.
              </p>
            </div>
          </Link>

          <Link href="/hell">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">지옥 보상 계산기</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                지옥과 나락 보상의 기대값을 계산하여 최적의 선택을 돕습니다.
              </p>
            </div>
          </Link>

          <Link href="/package-efficiency">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">과금 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                상점 패키지의 가성비를 분석하여 구매 효율을 판단합니다.
              </p>
            </div>
          </Link>

          <Link href="/refining-simulation">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">재련 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                장비 재련의 효율을 시뮬레이션하고 최적의 전략을 제시합니다.
              </p>
            </div>
          </Link>

          <Link href="/event-efficiency">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">이벤트 효율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                이벤트 보상의 가치를 계산하여 참여 여부를 결정합니다.
              </p>
            </div>
          </Link>

          <Link href="/crystal-gold">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 hover:border-gray-700 transition-colors">
              <h3 className="text-lg font-semibold text-white mb-2">골드 환율</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                크리스탈과 골드의 환율을 확인하고 현금 가치를 계산합니다.
              </p>
            </div>
          </Link>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-7 md:p-9">
          <h2 className="text-xl md:text-2xl font-semibold text-white mb-3 text-center">
            사이트 소개
          </h2>
          <p className="text-base text-gray-300 text-center leading-relaxed mb-6">
            껨산기는 로스트아크 플레이어를 위한 가치 계산 및 효율 분석 도구입니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <h4 className="font-semibold text-white">실시간 시세 반영</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                거래소 시세를 반영하여 정확한 가치 계산을 제공합니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold text-white">효율 분석</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                다양한 컨텐츠와 패키지의 효율을 비교 분석합니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold text-white">빠른 계산</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                복잡한 계산을 자동화하여 즉시 결과를 확인할 수 있습니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold text-white">맞춤 설정</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                개인 상황에 맞는 가격 조정 옵션을 제공합니다.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
