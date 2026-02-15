'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSidebar } from '../contexts/SidebarContext';
import { usePriceOverride } from '../contexts/PriceOverrideContext';

export default function Navigation() {
  const pathname = usePathname();
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar();
  const { state: priceOverrideState } = usePriceOverride();
  const filterLabel = useMemo(() => {
    const hasAnyOverride = priceOverrideState && Object.values(priceOverrideState).some(Boolean);
    return hasAnyOverride ? '필터 : 조정됨' : '필터 : Default';
  }, [priceOverrideState]);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [contentRewardsOpen, setContentRewardsOpen] = useState<boolean>(false);
  const [refiningOpen, setRefiningOpen] = useState<boolean>(false);
  const [eventEfficiencyOpen, setEventEfficiencyOpen] = useState<boolean>(false);
  const [exchangeEfficiencyOpen, setExchangeEfficiencyOpen] = useState<boolean>(false);
  const [customCalcOpen, setCustomCalcOpen] = useState<boolean>(false);
  const mobileAccordionTouchHandled = useRef(false);
  type MobileSubmenuTab = 'content-rewards' | 'refining' | 'event-efficiency' | 'exchange-efficiency' | 'custom-calc' | null;
  const [mobileSubmenuTab, setMobileSubmenuTab] = useState<MobileSubmenuTab>(null);

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
    setExchangeEfficiencyOpen(false);
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
      if (exchangeEfficiencyOpen && !target.closest('.exchange-efficiency-menu')) {
        setExchangeEfficiencyOpen(false);
      }
      if (customCalcOpen && !target.closest('.custom-calc-menu')) {
        setCustomCalcOpen(false);
      }
    };

    if (contentRewardsOpen || refiningOpen || eventEfficiencyOpen || exchangeEfficiencyOpen || customCalcOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contentRewardsOpen, refiningOpen, eventEfficiencyOpen, exchangeEfficiencyOpen, customCalcOpen]);

  const tabs = [
    { name: '컨텐츠 보상', href: '/content-rewards', hasSubmenu: true },
    { name: '이벤트 효율', href: '/event-efficiency', hasSubmenu: true },
    { name: '각종 교환효율', href: '/bloodstone-shop', hasSubmenu: true },
    { name: '과금 효율', href: '/package-efficiency' },
    { name: '재련 효율', href: '/refining-simulation', hasSubmenu: true },
    { name: '커스텀 계산기', href: '/custom-calculator', hasSubmenu: true },
    { name: '쌀산기', href: '/auction-calculator' },
  ];

  const contentRewardsSubTabs = [
    { name: '핵심 컨텐츠', href: '/content-rewards' },
    { name: '레이드 (더보기 효율)', href: '/content-rewards/raid-rewards' },
    { name: '필보 & 카게', href: '/content-rewards/boss-gate' },
    { name: '원정대 주간 수익', href: '/content-rewards/expedition-weekly' },
    { name: '지옥 (시즌2)', href: '/hell' },
  ];

  const refiningSubTabs = [
    { name: '일반 재련', href: '/refining-simulation' },
    { name: '상급 재련', href: '/advanced-refining' },
    { name: '내 캐릭터 시뮬레이션', href: '/character-simulation' },
  ];

  const eventEfficiencySubTabs = [
    { name: 'PC방 이벤트', href: '/event-efficiency/pc-room' },
    { name: '아크패스 선택 가이드', href: '/event-efficiency/arkpass' },
    { name: '이벤트 상점 교환', href: '/event-efficiency/event-shop' },
  ];

  const exchangeEfficiencySubTabs = [
    { name: '혈석 상점 효율', href: '/bloodstone-shop' },
    { name: '제작 재료 교환', href: '/craft-materials' },
    { name: '싱글 상점 교환', href: '/single-shop' },
  ];

  const customCalcSubTabs = [
    { name: '상자 선택 도우미', href: '/custom-calculator/box-selector' },
    { name: '시급 계산기', href: '/custom-calculator/wage-calculator' }
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-700 fixed top-0 left-0 right-0 z-40">
      <div className="w-full">
        {/* 상단 헤더 */}
        <div className="flex items-center h-14 md:h-16 px-3 md:px-4 overflow-x-auto min-w-0">
          {/* 모바일: 로고만 (데스크톱에서는 숨김) */}
          <Link href="/" className="flex lg:hidden items-center gap-2 flex-shrink-0">
            <img src="/page_logo_white.png" alt="껨산기" className="h-10 md:h-11 w-auto object-contain" />
            <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 border border-gray-700 rounded">오픈베타</span>
            <span className="text-xs text-gray-400 hidden sm:inline">by 스누껨독</span>
          </Link>

          {/* 모바일: DB/필터 버튼 + 햄버거 메뉴 */}
          <div className="flex items-center gap-2 lg:hidden ml-auto">
            <button
              type="button"
              onClick={toggleSidebar}
              className={`text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-800 rounded border ${filterLabel === '필터 : 조정됨' ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700'}`}
              aria-label={filterLabel}
            >
              {filterLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                const nextOpen = !mobileMenuOpen;
                setMobileMenuOpen(nextOpen);
                if (nextOpen) {
                  setContentRewardsOpen(false);
                  setRefiningOpen(false);
                  setEventEfficiencyOpen(false);
                  setExchangeEfficiencyOpen(false);
                  setCustomCalcOpen(false);
                  setMobileSubmenuTab(null);
                }
              }}
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

          {/* 데스크톱: 로고(홈) + 네비게이션 탭 (1024px 이상) - 가운데 정렬 */}
          <div className="hidden lg:flex items-center gap-3 absolute left-1/2 transform -translate-x-1/2 flex-shrink-0">
            <Link
              href="/"
              className="flex items-center justify-center text-white hover:bg-gray-800 rounded-lg p-2 transition-colors flex-shrink-0"
              aria-label="홈으로 이동"
              title="홈"
            >
              <img src="/page_logo_white.png" alt="껨산기" className="h-10 w-auto object-contain" />
            </Link>
            
            <div className="flex items-center space-x-1 relative flex-shrink-0">
              {tabs.map((tab) => {
                const isActive = pathname === tab.href || 
                  (tab.href === '/content-rewards' && pathname.startsWith('/content-rewards')) ||
                  (tab.href === '/refining-simulation' && (pathname.startsWith('/refining-simulation') || pathname.startsWith('/advanced-refining') || pathname.startsWith('/character-simulation'))) ||
                  (tab.href === '/event-efficiency' && pathname.startsWith('/event-efficiency')) ||
                  (tab.name === '각종 교환효율' && (pathname.startsWith('/bloodstone-shop') || pathname.startsWith('/craft-materials') || pathname.startsWith('/single-shop'))) ||
                  (tab.href === '/custom-calculator' && pathname.startsWith('/custom-calculator'));
                
                if (tab.hasSubmenu) {
                  const isContentRewards = tab.name === '컨텐츠 보상';
                  const isRefining = tab.name === '재련 효율';
                  const isEventEfficiency = tab.name === '이벤트 효율';
                  const isExchangeEfficiency = tab.name === '각종 교환효율';
                  const isCustomCalc = tab.name === '커스텀 계산기';
                  const isOpen = isContentRewards ? contentRewardsOpen : (isRefining ? refiningOpen : (isEventEfficiency ? eventEfficiencyOpen : (isExchangeEfficiency ? exchangeEfficiencyOpen : (isCustomCalc ? customCalcOpen : false))));
                  const setIsOpen = isContentRewards ? setContentRewardsOpen : (isRefining ? setRefiningOpen : (isEventEfficiency ? setEventEfficiencyOpen : (isExchangeEfficiency ? setExchangeEfficiencyOpen : (isCustomCalc ? setCustomCalcOpen : () => {}))));
                  const subTabs = isContentRewards ? contentRewardsSubTabs : (isRefining ? refiningSubTabs : (isEventEfficiency ? eventEfficiencySubTabs : (isExchangeEfficiency ? exchangeEfficiencySubTabs : (isCustomCalc ? customCalcSubTabs : []))));
                  const menuClass = isContentRewards ? 'content-rewards-menu' : (isRefining ? 'refining-menu' : (isEventEfficiency ? 'event-efficiency-menu' : (isExchangeEfficiency ? 'exchange-efficiency-menu' : (isCustomCalc ? 'custom-calc-menu' : ''))));
                  
                  return (
                    <div key={tab.href} className={`relative ${menuClass}`}>
                      <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={`px-4 xl:px-6 py-2 rounded font-medium text-sm xl:text-base flex items-center gap-1 whitespace-nowrap flex-shrink-0 ${
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
                            const isSubActive = pathname === subTab.href || (subTab.href !== '/content-rewards' && pathname.startsWith(subTab.href + '/'));
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
                
                const isAuctionCalculator = tab.href === '/auction-calculator';

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-4 xl:px-6 py-2 rounded font-medium text-sm xl:text-base flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {isAuctionCalculator ? (
                      <>
                        <span className="text-lg">🧮</span>
                        <span>{tab.name}</span>
                      </>
                    ) : (
                      <span>{tab.name}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>


        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <>
          <div className="lg:hidden py-4 space-y-2 border-t border-gray-700">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href || 
                (tab.href === '/content-rewards' && pathname.startsWith('/content-rewards')) ||
                (tab.href === '/refining-simulation' && (pathname.startsWith('/refining-simulation') || pathname.startsWith('/advanced-refining') || pathname.startsWith('/character-simulation'))) ||
                (tab.href === '/event-efficiency' && pathname.startsWith('/event-efficiency')) ||
                (tab.name === '각종 교환효율' && (pathname.startsWith('/bloodstone-shop') || pathname.startsWith('/craft-materials') || pathname.startsWith('/single-shop'))) ||
                (tab.href === '/custom-calculator' && pathname.startsWith('/custom-calculator'));
              
              if (tab.hasSubmenu) {
                const isContentRewards = tab.name === '컨텐츠 보상';
                const isRefining = tab.name === '재련 효율';
                const isEventEfficiency = tab.name === '이벤트 효율';
                const isExchangeEfficiency = tab.name === '각종 교환효율';
                const isCustomCalc = tab.name === '커스텀 계산기';
                const tabKey: MobileSubmenuTab = isContentRewards ? 'content-rewards' : (isRefining ? 'refining' : (isEventEfficiency ? 'event-efficiency' : (isExchangeEfficiency ? 'exchange-efficiency' : (isCustomCalc ? 'custom-calc' : null))));
                const isOpen = isContentRewards ? contentRewardsOpen : (isRefining ? refiningOpen : (isEventEfficiency ? eventEfficiencyOpen : (isExchangeEfficiency ? exchangeEfficiencyOpen : (isCustomCalc ? customCalcOpen : false))));
                const setIsOpen = isContentRewards ? setContentRewardsOpen : (isRefining ? setRefiningOpen : (isEventEfficiency ? setEventEfficiencyOpen : (isExchangeEfficiency ? setExchangeEfficiencyOpen : (isCustomCalc ? setCustomCalcOpen : () => {}))));
                
                return (
                  <div key={tab.href} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (mobileAccordionTouchHandled.current) {
                          mobileAccordionTouchHandled.current = false;
                          return;
                        }
                        const nextOpen = !isOpen;
                        setIsOpen(nextOpen);
                        if (nextOpen) setMobileSubmenuTab(tabKey);
                        else if (mobileSubmenuTab === tabKey) setMobileSubmenuTab(null);
                      }}
                      onPointerDown={(e) => {
                        if (e.pointerType === 'touch' && isOpen) {
                          mobileAccordionTouchHandled.current = true;
                          e.preventDefault();
                          setIsOpen(prev => !prev);
                          if (mobileSubmenuTab === tabKey) setMobileSubmenuTab(null);
                        }
                      }}
                      className={`relative z-10 w-full flex items-center justify-between px-4 py-3 rounded font-medium ${
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
                  </div>
                );
              }
              
              const isAuctionCalculator = tab.href === '/auction-calculator';
              
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={(e) => {
                    // 링크 클릭은 정상적으로 처리되도록 함
                    setMobileMenuOpen(false);
                  }}
                  className={`block px-4 py-3 rounded font-medium flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {isAuctionCalculator ? (
                    <>
                      <span className="text-lg">🧮</span>
                      <span>{tab.name}</span>
                    </>
                  ) : (
                    <span>{tab.name}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* 모바일: 서브메뉴 옆쪽 오버레이 */}
          {mobileSubmenuTab && (
            <>
              <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                aria-hidden
                onClick={() => {
                  if (mobileSubmenuTab === 'content-rewards') setContentRewardsOpen(false);
                  if (mobileSubmenuTab === 'refining') setRefiningOpen(false);
                  if (mobileSubmenuTab === 'event-efficiency') setEventEfficiencyOpen(false);
                  if (mobileSubmenuTab === 'exchange-efficiency') setExchangeEfficiencyOpen(false);
                  if (mobileSubmenuTab === 'custom-calc') setCustomCalcOpen(false);
                  setMobileSubmenuTab(null);
                }}
              />
              <div className="fixed top-14 right-0 bottom-0 w-[min(280px,85%)] bg-gray-900 border-l border-gray-700 z-50 lg:hidden flex flex-col shadow-xl">
                <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-700 flex-shrink-0">
                  <span className="font-semibold text-white truncate">
                    {mobileSubmenuTab === 'content-rewards' && '컨텐츠 보상'}
                    {mobileSubmenuTab === 'refining' && '재련 효율'}
                    {mobileSubmenuTab === 'event-efficiency' && '이벤트 효율'}
                    {mobileSubmenuTab === 'exchange-efficiency' && '각종 교환효율'}
                    {mobileSubmenuTab === 'custom-calc' && '커스텀 계산기'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSubmenuTab === 'content-rewards') setContentRewardsOpen(false);
                      if (mobileSubmenuTab === 'refining') setRefiningOpen(false);
                      if (mobileSubmenuTab === 'event-efficiency') setEventEfficiencyOpen(false);
                      if (mobileSubmenuTab === 'exchange-efficiency') setExchangeEfficiencyOpen(false);
                      if (mobileSubmenuTab === 'custom-calc') setCustomCalcOpen(false);
                      setMobileSubmenuTab(null);
                    }}
                    className="text-gray-400 hover:text-white p-1 rounded"
                    aria-label="닫기"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-4 space-y-1 overflow-y-auto">
                  {mobileSubmenuTab === 'content-rewards' && contentRewardsSubTabs.map((subTab) => {
                    const isSubActive = pathname === subTab.href || (subTab.href !== '/content-rewards' && pathname.startsWith(subTab.href + '/'));
                    return (
                      <Link
                        key={subTab.href}
                        href={subTab.href}
                        onClick={() => { setContentRewardsOpen(false); setMobileMenuOpen(false); setMobileSubmenuTab(null); }}
                        className={`block px-4 py-2 rounded text-sm ${isSubActive ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                      >
                        {subTab.name}
                      </Link>
                    );
                  })}
                  {mobileSubmenuTab === 'refining' && refiningSubTabs.map((subTab) => {
                    const isSubActive = pathname === subTab.href || pathname.startsWith(subTab.href + '/');
                    return (
                      <Link key={subTab.href} href={subTab.href} onClick={() => { setRefiningOpen(false); setMobileMenuOpen(false); setMobileSubmenuTab(null); }} className={`block px-4 py-2 rounded text-sm ${pathname === subTab.href || pathname.startsWith(subTab.href + '/') ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{subTab.name}</Link>
                    );
                  })}
                  {mobileSubmenuTab === 'event-efficiency' && eventEfficiencySubTabs.map((subTab) => {
                    return (
                      <Link key={subTab.href} href={subTab.href} onClick={() => { setEventEfficiencyOpen(false); setMobileMenuOpen(false); setMobileSubmenuTab(null); }} className={`block px-4 py-2 rounded text-sm ${pathname === subTab.href || pathname.startsWith(subTab.href + '/') ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{subTab.name}</Link>
                    );
                  })}
                  {mobileSubmenuTab === 'exchange-efficiency' && exchangeEfficiencySubTabs.map((subTab) => {
                    return (
                      <Link key={subTab.href} href={subTab.href} onClick={() => { setExchangeEfficiencyOpen(false); setMobileMenuOpen(false); setMobileSubmenuTab(null); }} className={`block px-4 py-2 rounded text-sm ${pathname === subTab.href || pathname.startsWith(subTab.href + '/') ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{subTab.name}</Link>
                    );
                  })}
                  {mobileSubmenuTab === 'custom-calc' && customCalcSubTabs.map((subTab) => {
                    return (
                      <Link key={subTab.href} href={subTab.href} onClick={() => { setCustomCalcOpen(false); setMobileMenuOpen(false); setMobileSubmenuTab(null); }} className={`block px-4 py-2 rounded text-sm ${pathname === subTab.href || pathname.startsWith(subTab.href + '/') ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>{subTab.name}</Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          </>
        )}
      </div>
    </nav>
  );
}

