'use client';

import Link from 'next/link';
import { useMemo, useState, useRef, useEffect } from 'react';
import AdsenseSidebar from './AdsenseSidebar';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import { useSidebar } from '../contexts/SidebarContext';
type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const { close: closeSidebar } = useSidebar();
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);

  // 가격 조정 UI용 로컬 상태 (버튼 색 즉시 반응용)
  const [localOverrides, setLocalOverrides] = useState(state);

  // 컨텍스트 상태가 외부에서 변경되면 로컬 상태를 동기화
  useEffect(() => {
    setLocalOverrides(state);
  }, [state]);

  // 디코기준 스위치 상태 동기화
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) {
        setLightMode(saved === '1');
      }
    } catch {}
    
    const handleThemeChange = (e: CustomEvent<{ light: boolean }>) => {
      setLightMode(e.detail.light);
    };
    
    window.addEventListener('theme-change', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('theme-change', handleThemeChange as EventListener);
    };
  }, []);

  // 디스코드 환율 정보 가져오기
  useEffect(() => {
    async function fetchDiscordRate() {
      try {
        const res = await fetch('/api/admin/crystal-gold');
        const data = await res.json();
        // Supabase에서 가져온 discord 값 사용
        if (data.discord != null) {
          setDiscordRate(data.discord);
        }
      } catch (error) {
        console.error('디스코드 환율 조회 실패:', error);
      }
    }
    fetchDiscordRate();
  }, []);

  // 현금(원) 1원당 골드 계산
  const goldPerWon = useMemo(() => {
    // 디코기준 스위치가 켜져있으면 (lightMode가 false이면 디코기준 ON)
    if (!lightMode && discordRate && discordRate > 0) {
      // 디스코드 환율 = 100 : n
      // 1원당 골드 = 100 / n
      return 100 / discordRate;
    }
    
    // 디코기준 스위치가 꺼져있으면 크리스탈 환율 사용
    const crystalEntry = adjustedEntries.find(entry => entry.itemName === '크리스탈');
    if (crystalEntry && crystalEntry.unitValue != null && crystalEntry.unitValue > 0) {
      // 크리스탈 1개당 골드 = unitValue
      // 2750원 = 100크리
      // 1원 = 100/2750 크리
      // 1원당 골드 = (100/2750) * unitValue
      return (100 / 2750) * crystalEntry.unitValue;
    }
    return null;
  }, [adjustedEntries, lightMode, discordRate]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.right + 8, // 물음표 오른쪽에 8px 여백
        y: rect.top, // 물음표와 같은 높이
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800">
      {/* 헤더: 골드 환율 + 디코기준 스위치 + 닫기 버튼 */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link
              href="/crystal-gold"
              className="inline-flex items-center px-2 py-1 rounded border border-blue-500/60 text-[11px] text-blue-300 hover:bg-blue-900/40 hover:text-blue-100 transition-colors whitespace-nowrap flex-shrink-0 group"
              title="골드 환율 페이지로 이동"
            >
              <span className="mr-1">📈</span>
              <span>골드 환율</span>
              <svg className="w-3 h-3 ml-1 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
            <div className="text-xs font-semibold text-gray-300 truncate min-w-0">
              {goldPerWon != null 
                ? `1원당 ${formatNumberWithSignificantDigits(goldPerWon)}골드`
                : '1원당 골드 계산 중...'}
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 flex-shrink-0"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* 디코기준 스위치 */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] whitespace-nowrap transition-colors ${
            lightMode 
              ? 'font-bold text-blue-400' 
              : 'text-gray-500'
          }`}>
            화폐거래소
          </span>
          <button
            type="button"
            onClick={() => {
              const newLightMode = !lightMode;
              setLightMode(newLightMode);
              try {
                localStorage.setItem('themeLight', newLightMode ? '1' : '0');
                window.dispatchEvent(new CustomEvent('theme-change', { detail: { light: newLightMode } }));
                if (newLightMode) {
                  document.documentElement.classList.add('light');
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
              } catch {}
            }}
            aria-pressed={!lightMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors flex-shrink-0 ${
              !lightMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-700 border-gray-600'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
              !lightMode ? 'translate-x-5' : 'translate-x-1'
            }`} />
          </button>
          <span className={`text-[11px] whitespace-nowrap transition-colors ${
            !lightMode 
              ? 'font-bold text-purple-400' 
              : 'text-gray-500'
          }`}>
            디코기준
          </span>
        </div>
      </div>
      
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-300">가격 조정 (클릭 시 0골드로 반영)</h2>
          <button
            type="button"
            onClick={() => {
              const initial = {
                ignoreSilver: false,
                ignoreDestructionGuardStone: false,
                ignoreBreakthroughStone: false,
                ignoreFragment: false,
                cardSetGraduated: false,
                ignoreCardExp: false,
                has97Stone: false,
                hasFullRelicEngraving: false,
                ignoreFusionMaterial: false,
                ignoreBreath: false,
                ignoreLowTierCrafting: false,
                ignoreGem: false,
                ignoreHeavenChallengeTicket: false,
              };
              setLocalOverrides(initial);
              setState(initial);
            }}
            className="text-[11px] px-2 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:border-gray-500 transition-colors shrink-0"
          >
            초기화
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {/* 1단 */}
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreSilver: !prev.ignoreSilver };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreSilver ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            실링
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreDestructionGuardStone: !prev.ignoreDestructionGuardStone };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreDestructionGuardStone ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            파괴석/수호석
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreBreakthroughStone: !prev.ignoreBreakthroughStone };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreBreakthroughStone ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            돌파석
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreFragment: !prev.ignoreFragment };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreFragment ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            파편
          </button>
          {/* 2단 */}
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, cardSetGraduated: !prev.cardSetGraduated };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.cardSetGraduated ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            전설 카드
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreCardExp: !prev.ignoreCardExp };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreCardExp ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            카드경험치
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, has97Stone: !prev.has97Stone };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.has97Stone ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            어빌리티 스톤
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, hasFullRelicEngraving: !prev.hasFullRelicEngraving };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.hasFullRelicEngraving ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            유물 각인서
          </button>
          {/* 3단 */}
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreFusionMaterial: !prev.ignoreFusionMaterial };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreFusionMaterial ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            융화 재료
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreBreath: !prev.ignoreBreath };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreBreath ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            숨결
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreLowTierCrafting: !prev.ignoreLowTierCrafting };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreLowTierCrafting ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            하위 야금/재봉
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreGem: !prev.ignoreGem };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreGem ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            젬
          </button>
          <button
            type="button"
            onClick={() =>
              setLocalOverrides(prev => {
                const next = { ...prev, ignoreHeavenChallengeTicket: !prev.ignoreHeavenChallengeTicket };
                setTimeout(() => setState(next), 0);
                return next;
              })
            }
            className={`text-[11px] px-2 py-1 rounded border text-left truncate
              ${!localOverrides.ignoreHeavenChallengeTicket ? 'bg-blue-700/50 border-blue-500/70 text-blue-50' : 'bg-gray-800 border-gray-600 text-gray-300 line-through'}`}
          >
            천상 도전권
          </button>
        </div>
      </div>
      
      {/* 가격 조정 아래 영역 */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center min-h-0">
        <AdsenseSidebar />
      </div>
      
      {/* 하단 광고 영역 (남는 공간) */}
      {/* <div className="mt-auto flex-shrink-0 p-3 pt-2 border-t border-gray-800 flex justify-center items-center min-h-[80px]">
        <img src="/adraising.png" alt="ad" className="w-full h-auto object-contain" />
      </div>
       */}
      {/* 툴팁 */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded p-3 max-w-xs text-xs text-gray-200 pointer-events-auto"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div className="font-semibold text-white mb-1">{tooltip.itemName}</div>
          <div className="text-gray-300 whitespace-pre-wrap">{tooltip.explanation}</div>
        </div>
      )}
    </div>
  );
}

