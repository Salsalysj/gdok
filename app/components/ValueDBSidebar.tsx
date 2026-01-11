'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import { useSidebar } from '../contexts/SidebarContext';
import type { ValueDbEntry } from '@/lib/valueDb';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

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
        const rates = data.exchangeRates || [];
        if (rates.length > 0) {
          const latest = rates[rates.length - 1];
          setDiscordRate(latest.discord || null);
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

  // 검색 필터링 (검색어가 있으면 필터링, 없으면 전체 리스트)
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '운명의 파괴석 결정', '운명의 수호석 결정', '위대한 운명의 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

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
      <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-1">
          <div className="text-sm font-semibold text-gray-300">
            {goldPerWon != null 
              ? `현재 1원당 ${formatNumberWithSignificantDigits(goldPerWon)}골드`
              : '현재 1원당 골드 계산 중...'}
          </div>
          {/* 디코기준 스위치 */}
          <div className="flex items-center gap-2">
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
              title="디코기준"
              className={`relative inline-flex h-6 w-11 items-center rounded-full border ${
                !lightMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-700 border-gray-600'
              }`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white ${
                !lightMode ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-xs text-gray-300">디코기준</span>
          </div>
        </div>
        <button
          onClick={closeSidebar}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 flex-shrink-0"
          aria-label="닫기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {/* 1단 */}
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          {/* 2단 */}
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>전설 카드 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>어빌리티 스톤 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>유물 각인서 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800 relative">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => {
            // 약간의 지연을 두어 드롭다운 클릭 가능하게 함
            setTimeout(() => setIsSearchFocused(false), 200);
          }}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:outline-none focus:border-gray-600"
        />
        {/* 검색 결과 오버레이 드롭다운 (검색어가 있거나 포커스 상태일 때 표시) */}
        {(searchQuery.trim() || isSearchFocused) && (
          <div 
            className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 max-h-[400px] overflow-y-auto"
            onMouseDown={(e) => {
              // 드롭다운 클릭 시 포커스 유지
              e.preventDefault();
            }}
          >
            <div className="p-2">
              <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-gray-300 text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-gray-300 text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-gray-300 text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-gray-300 text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {searchQuery.trim() && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
              {!searchQuery.trim() && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    데이터 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        )}
      </div>
      
      {/* 검색어가 없고 포커스되지 않았을 때 표시할 영역 */}
      {!searchQuery.trim() && !isSearchFocused && (
        <div className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="text-gray-400 text-sm">여긴 뭐 넣을까...흠</div>
        </div>
      )}
      
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

