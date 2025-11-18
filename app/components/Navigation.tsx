'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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
    { name: '컨텐츠 보상', href: '/content-rewards' },
    { name: '이벤트 효율', href: '/event-efficiency' },
    { name: '패키지 효율', href: '/package-efficiency' },
    { name: '재련 효율', href: '/refining-simulation' },
    { name: '골드 환율', href: '/crystal-gold' },
    { name: '관리자', href: '/admin' },
  ];

  // 디코기준 스위치 컴포넌트
  const ThemeSwitch = ({ className = '' }: { className?: string }) => {
    const switchOn = !lightMode;
    return (
      <div className={`flex items-center gap-2 ${className}`}>
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
        <span className="text-xs md:text-sm text-gray-300">디코기준</span>
      </div>
    );
  };

  return (
    <nav className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-3 md:px-4">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* 로고 */}
          <div className="flex items-center space-x-2">
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              껨산기
            </span>
            <span className="text-xs text-gray-400 hidden sm:inline">
              by 스누껨독
            </span>
          </div>

          {/* 모바일: 햄버거 버튼 + 테마 스위치 */}
          <div className="flex items-center gap-3 lg:hidden">
            <ThemeSwitch />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="메뉴"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* 데스크톱: 네비게이션 탭 (1024px 이상) */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center space-x-1">
              {tabs.map((tab) => {
                if (tab.name === '관리자') return null;
                
                const isActive = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-4 xl:px-6 py-2 rounded-lg font-medium transition-all text-sm xl:text-base ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {tab.name}
                  </Link>
                );
              })}
            </div>
            <ThemeSwitch />
          </div>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 space-y-2 border-t border-gray-700">
            {tabs.map((tab) => {
              if (tab.name === '관리자') return null;
              
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-lg font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {tab.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

