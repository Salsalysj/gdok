'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSidebar } from '../contexts/SidebarContext';

export default function Navigation() {
  const pathname = usePathname();
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar();
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [contentRewardsOpen, setContentRewardsOpen] = useState<boolean>(false);
  const [refiningOpen, setRefiningOpen] = useState<boolean>(false);
  const [eventEfficiencyOpen, setEventEfficiencyOpen] = useState<boolean>(false);
  const [customCalcOpen, setCustomCalcOpen] = useState<boolean>(false);

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

  // 경로 변경 시 드롭다운 닫기
  useEffect(() => {
    setContentRewardsOpen(false);
    setRefiningOpen(false);
    setEventEfficiencyOpen(false);
    setCustomCalcOpen(false);
  }, [pathname]);

  // 외부 클릭 시 서브탭 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 링크 클릭은 허용 (라우팅 방해 방지)
      if (target.closest('a')) {
        return;
      }
      if (contentRewardsOpen && !target.closest('.content-rewards-menu')) {
        setContentRewardsOpen(false);
      }
      if (refiningOpen && !target.closest('.refining-menu')) {
        setRefiningOpen(false);
      }
      if (eventEfficiencyOpen && !target.closest('.event-efficiency-menu')) {
        setEventEfficiencyOpen(false);
      }
      if (customCalcOpen && !target.closest('.custom-calc-menu')) {
        setCustomCalcOpen(false);
      }
    };

    if (contentRewardsOpen || refiningOpen || eventEfficiencyOpen || customCalcOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contentRewardsOpen, refiningOpen, eventEfficiencyOpen, customCalcOpen]);

  const tabs = [
    { name: '컨텐츠 보상', href: '/content-rewards', hasSubmenu: true },
    { name: '이벤트 효율', href: '/event-efficiency', hasSubmenu: true },
    { name: '과금 효율', href: '/package-efficiency' },
    { name: '재련 효율', href: '/refining-simulation', hasSubmenu: true },
    { name: '커스텀 계산기', href: '/custom-calculator', hasSubmenu: true },
    { name: '골드 환율', href: '/crystal-gold' },
  ];

  const contentRewardsSubTabs = [
    { name: '전선 & 균열', href: '/content-rewards?tab=쿠르잔 전선' },
    { name: '가디언 토벌', href: '/content-rewards?tab=가디언 토벌' },
    { name: '큐브 & 모래시계', href: '/content-rewards?tab=에브니 큐브' },
    { name: '필보 & 카게', href: '/content-rewards/boss-gate' },
    { name: '레이드 보상', href: '/content-rewards/raid-rewards' },
    { name: '지옥', href: '/hell' },
  ];

  const refiningSubTabs = [
    { name: '일반 재련', href: '/refining-simulation' },
    { name: '상급 재련', href: '/advanced-refining' },
  ];

  const eventEfficiencySubTabs = [
    { name: 'PC방 이벤트', href: '/event-efficiency/pc-room' },
    { name: '아크패스 선택 가이드', href: '/event-efficiency/arkpass' },
    { name: '이벤트 상점 교환', href: '/event-efficiency/event-shop' },
    { name: '혈석 상점 교환', href: '/event-efficiency/bloodstone-shop' },
  ];

  const customCalcSubTabs = [
    { name: '상자 선택 도우미', href: '/custom-calculator/box-selector' },
    { name: '시급 계산기', href: '/custom-calculator/wage-calculator' }
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-700 fixed top-0 left-0 right-0 z-40">
      <div className="w-full">
        {/* 상단 헤더 */}
        <div className="flex items-center h-14 md:h-16 px-3 md:px-4">
          {/* 모바일 로고 - 데스크톱에서는 숨김 (좌측 사이드바로 이동) */}
          <Link href="/" className="flex lg:hidden items-center space-x-2 flex-shrink-0">
            <span className="text-xl md:text-2xl font-bold text-white">
              껨산기
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 border border-gray-700 rounded">
              오픈베타
            </span>
            <span className="text-xs text-gray-400 hidden sm:inline">
              by 스누껨독
            </span>
          </Link>

          {/* 모바일: 햄버거 메뉴 */}
          <div className="flex items-center gap-3 lg:hidden ml-auto">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-white p-2 hover:bg-gray-800 rounded"
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

          {/* 데스크톱: 홈 링크 + 네비게이션 탭 (1024px 이상) - 가운데 정렬 */}
          <div className="hidden lg:flex items-center gap-3 absolute left-1/2 transform -translate-x-1/2">
            {/* 홈 링크 (집 이모지) */}
            <Link 
              href="/" 
              className="flex items-center justify-center w-10 h-10 text-white hover:bg-gray-800 rounded transition-colors"
              aria-label="홈으로 이동"
              title="홈"
            >
              <span className="text-xl">🏠︎</span>
            </Link>
            
            <div className="flex items-center space-x-1 relative">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href || 
                  (tab.href === '/content-rewards' && pathname.startsWith('/content-rewards')) ||
                  (tab.href === '/refining-simulation' && (pathname.startsWith('/refining-simulation') || pathname.startsWith('/advanced-refining'))) ||
                  (tab.href === '/event-efficiency' && pathname.startsWith('/event-efficiency')) ||
                  (tab.href === '/custom-calculator' && pathname.startsWith('/custom-calculator'));
                
                if (tab.hasSubmenu) {
                  const isContentRewards = tab.name === '컨텐츠 보상';
                  const isRefining = tab.name === '재련 효율';
                  const isEventEfficiency = tab.name === '이벤트 효율';
                  const isCustomCalc = tab.name === '커스텀 계산기';
                  const isOpen = isContentRewards ? contentRewardsOpen : (isRefining ? refiningOpen : (isEventEfficiency ? eventEfficiencyOpen : (isCustomCalc ? customCalcOpen : false)));
                  const setIsOpen = isContentRewards ? setContentRewardsOpen : (isRefining ? setRefiningOpen : (isEventEfficiency ? setEventEfficiencyOpen : (isCustomCalc ? setCustomCalcOpen : () => {})));
                  const subTabs = isContentRewards ? contentRewardsSubTabs : (isRefining ? refiningSubTabs : (isEventEfficiency ? eventEfficiencySubTabs : (isCustomCalc ? customCalcSubTabs : [])));
                  const menuClass = isContentRewards ? 'content-rewards-menu' : (isRefining ? 'refining-menu' : (isEventEfficiency ? 'event-efficiency-menu' : (isCustomCalc ? 'custom-calc-menu' : '')));
                  
                  return (
                    <div key={tab.href} className={`relative ${menuClass}`}>
                      <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={`px-4 xl:px-6 py-2 rounded font-medium text-sm xl:text-base flex items-center gap-1 ${
                          isActive
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        {tab.name}
                        <svg 
                          className={`w-4 h-4 ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded min-w-[160px] z-50">
                          {subTabs.map((subTab) => {
                            const isSubActive = pathname === subTab.href || pathname.startsWith(subTab.href + '/');
                            return (
                              <Link
                                key={subTab.href}
                                href={subTab.href}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsOpen(false);
                                }}
                                className={`block px-4 py-2 text-sm first:rounded-t last:rounded-b ${
                                  isSubActive
                                    ? 'text-white bg-gray-700'
                                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                }`}
                              >
                                {subTab.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-4 xl:px-6 py-2 rounded font-medium text-sm xl:text-base ${
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {tab.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>


        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 space-y-2 border-t border-gray-700">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href || 
                (tab.href === '/content-rewards' && pathname.startsWith('/content-rewards')) ||
                (tab.href === '/refining-simulation' && (pathname.startsWith('/refining-simulation') || pathname.startsWith('/advanced-refining'))) ||
                (tab.href === '/event-efficiency' && pathname.startsWith('/event-efficiency'));
              
              if (tab.hasSubmenu) {
                const isContentRewards = tab.name === '컨텐츠 보상';
                const isRefining = tab.name === '재련 효율';
                const isEventEfficiency = tab.name === '이벤트 효율';
                const isCustomCalc = tab.name === '커스텀 계산기';
                const isOpen = isContentRewards ? contentRewardsOpen : (isRefining ? refiningOpen : (isEventEfficiency ? eventEfficiencyOpen : (isCustomCalc ? customCalcOpen : false)));
                const setIsOpen = isContentRewards ? setContentRewardsOpen : (isRefining ? setRefiningOpen : (isEventEfficiency ? setEventEfficiencyOpen : (isCustomCalc ? setCustomCalcOpen : () => {})));
                const subTabs = isContentRewards ? contentRewardsSubTabs : (isRefining ? refiningSubTabs : (isEventEfficiency ? eventEfficiencySubTabs : (isCustomCalc ? customCalcSubTabs : [])));
                
                return (
                  <div key={tab.href}>
                    <button
                      onClick={() => setIsOpen(!isOpen)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded font-medium ${
                        isActive
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      {tab.name}
                      <svg 
                        className={`w-4 h-4 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="pl-4 mt-1 space-y-1">
                        {subTabs.map((subTab) => {
                          const isSubActive = pathname === subTab.href || pathname.startsWith(subTab.href + '/');
                          return (
                            <Link
                              key={subTab.href}
                              href={subTab.href}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                                setMobileMenuOpen(false);
                              }}
                              className={`block px-4 py-2 rounded text-sm ${
                                isSubActive
                                  ? 'text-white bg-gray-800'
                                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                              }`}
                            >
                              {subTab.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={(e) => {
                    // 링크 클릭은 정상적으로 처리되도록 함
                    setMobileMenuOpen(false);
                  }}
                  className={`block px-4 py-3 rounded font-medium ${
                    isActive
                      ? 'bg-gray-700 text-white'
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

