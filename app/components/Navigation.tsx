'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const [lightMode, setLightMode] = useState<boolean>(false);

  // 로컬 스토리지와 동기화 & 이벤트 브로드캐스트
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) {
        setLightMode(saved === '1');
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('themeLight', lightMode ? '1' : '0');
      window.dispatchEvent(new CustomEvent('theme-change', { detail: { light: lightMode } }));
      // 문서 루트에 테마 클래스 토글(페이지별 조건부 스타일에 도움)
      if (lightMode) {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    } catch {}
  }, [lightMode]);

  const tabs = [
    { name: '검색', href: '/' },
    { name: '주요 아이템 시세', href: '/market' },
    { name: '컨텐츠 보상', href: '/content-rewards' },
    { name: '이벤트 효율', href: '/event-efficiency' },
    { name: '패키지 효율', href: '/package-efficiency' },
    { name: '재련 효율', href: '/refining-simulation' },
    { name: '골드 환율', href: '/crystal-gold' },
    { name: '관리자', href: '/admin' },
  ];

  return (
    <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              껨산기
            </span>
            <span className="text-xs text-gray-400">
              by 스누껨독
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* 네비게이션 탭 + 스위치 (골드 환율 오른쪽) */}
            <div className="flex items-center space-x-1">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href;
                const linkEl = (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-6 py-2 rounded-lg font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {tab.name}
                  </Link>
                );

                if (tab.name === '골드 환율') {
                  const switchOn = !lightMode; // ON = 어두운 테마
                  return (
                    <div key={tab.href} className="flex items-center gap-3">
                      {linkEl}
                      <button
                        type="button"
                        onClick={() => setLightMode(v => !v)}
                        aria-pressed={switchOn}
                        title="디코기준"
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border ${
                          switchOn ? 'bg-purple-600 border-purple-500' : 'bg-gray-600 border-gray-500'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          switchOn ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                      <span className="text-sm text-gray-300">디코기준</span>
                    </div>
                  );
                }

                if (tab.name === '관리자') {
                  return null; // 상단 탭에서 관리자 숨김 (홈 하단으로 이동)
                }

                return linkEl;
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

