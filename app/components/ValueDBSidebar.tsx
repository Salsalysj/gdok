'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import type { ValueDbEntry } from '@/lib/valueDb';

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap, cubeStageRewards, marketPriceMap, etcListData, valueDbMap, marketData } = useValueDb();
  const { adjustPrice } = usePriceAdjustment();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExplanation, setSelectedExplanation] = useState<{ itemName: string; explanation: string; x: number; y: number; isRight: boolean } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 툴팁 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setSelectedExplanation(null);
      }
    };

    if (selectedExplanation) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [selectedExplanation]);

  // 에브니 큐브 입장권 가치 재계산 함수 (가격 조정 스위치 반영)
  const recalculateCubeTicketValue = useCallback((itemName: string): number | null => {
    if (!itemName.startsWith('에브니 큐브 입장권')) return null;
    
    // 지옥교환 항목은 valueDbMap에서 직접 가져오기
    const hellExchangeMatch = itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
    if (hellExchangeMatch) {
      const valueDbEntry = valueDbMap[itemName];
      if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
        let adjustedValue = valueDbEntry.unitValue;
        if (valueDbEntry.unitType === '골드') {
          adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
        }
        return adjustedValue;
      }
      return null;
    }
    
    // 일반 에브니 큐브 입장권: cubeStageRewards를 사용하여 재계산
    const m = itemName.match(/에브니 큐브 입장권 \(([^)]+)\)/);
    const key = m ? m[1] : '';
    if (key && cubeStageRewards[key]) {
      let sum = 0;
      for (const reward of cubeStageRewards[key]) {
        let originalPrice: number | null = null;
        
        // 1레벨 보석 (4T) 또는 (3T): marketData에서 계산
        if (reward.itemName === '1레벨 보석 (4T)' || reward.itemName === '1레벨 보석 (3T)') {
          const gemType = reward.itemName.includes('4T') ? '4T' : '3T';
          // marketData에서 5레벨 보석 가격 찾기
          const findGemPrice = (gemName: string): number | null => {
            if (!marketData) return null;
            const allItems = [
              ...(marketData.tier4Results || []),
              ...(marketData.tier3Results || []),
              ...(marketData.gemResults || []),
              ...(marketData.otherResults || []),
            ];
            const item = allItems.find((item: any) => {
              const name = (item.displayName || item.Name || '').trim();
              return name === gemName;
            });
            if (item) {
              const price = item.CurrentMinPrice || item.RecentPrice;
              return price && price > 0 ? price : null;
            }
            return null;
          };
          const fearGem = findGemPrice('5레벨 겁화의 보석');
          const fireGem = findGemPrice('5레벨 작열의 보석');
          if (fearGem && fireGem) {
            if (gemType === '4T') {
              originalPrice = (fearGem + fireGem) / 162;
            } else {
              const tier4Unit = (fearGem + fireGem) / 162;
              originalPrice = tier4Unit / 9;
            }
          }
        }
        // 카드 경험치: valueDbMap에서 찾기
        else if (reward.itemName === '카드 경험치') {
          const cardExpEntry = Object.values(valueDbMap).find(e => e.itemName === '카드경험치 1당');
          if (cardExpEntry && cardExpEntry.unitValue != null) {
            originalPrice = cardExpEntry.unitValue;
          } else {
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            }
          }
        }
        // 실링: 제외
        else if (reward.itemName === '실링') {
          originalPrice = null; // 실링은 합계에서 제외
        }
        // 기타 항목: etcListData 또는 marketPriceMap에서 찾기
        else {
          const etc = etcListData[reward.itemName];
          if (etc?.gold != null) {
            originalPrice = etc.gold;
          } else if (marketPriceMap[reward.itemName] != null) {
            originalPrice = marketPriceMap[reward.itemName];
          } else if (marketData) {
            // marketData에서 직접 찾기
            const allItems = [
              ...(marketData.tier4Results || []),
              ...(marketData.tier3Results || []),
              ...(marketData.gemResults || []),
              ...(marketData.otherResults || []),
            ];
            const item = allItems.find((item: any) => {
              const name = (item.displayName || item.Name || '').trim();
              return name === reward.itemName;
            });
            if (item) {
              const price = item.CurrentMinPrice || item.RecentPrice;
              if (price && price > 0) {
                // 묶음 개수 확인
                const bundleMatch = reward.itemName.match(/\((\d+)개 묶음\)/);
                const bundleCount = bundleMatch ? parseInt(bundleMatch[1], 10) : 1;
                originalPrice = bundleCount > 0 ? price / bundleCount : price;
              }
            }
          }
        }
        
        // originalPrice가 null이 아니고 0보다 크면 가격 조정 적용
        if (originalPrice != null && originalPrice > 0) {
          const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
          if (adjustedPrice != null && adjustedPrice > 0) {
            sum += adjustedPrice * reward.quantity;
          }
        }
      }
      return sum;
    }
    
    return null;
  }, [cubeStageRewards, marketPriceMap, etcListData, valueDbMap, marketData, adjustPrice]);

  // 가격 조정이 적용된 entries 생성
  const adjustedEntriesWithCubeRecalc = useMemo(() => {
    return adjustedEntries.map(entry => {
      // 에브니 큐브 입장권 항목만 재계산
      if (entry.itemName.startsWith('에브니 큐브 입장권')) {
        const recalculatedValue = recalculateCubeTicketValue(entry.itemName);
        if (recalculatedValue != null) {
          return {
            ...entry,
            unitValue: recalculatedValue,
            unitType: '골드' as const,
          };
        }
      }
      return entry;
    });
  }, [adjustedEntries, recalculateCubeTicketValue]);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntriesWithCubeRecalc;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntriesWithCubeRecalc.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntriesWithCubeRecalc, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
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

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
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
                  {categorizedEntries.currency.map((entry) => {
                    const explanation = explanationMap[entry.itemName];
                    return (
                      <tr key={entry.itemName} className="hover:bg-gray-800/50">
                        <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                          <div className="flex items-center gap-1 relative">
                            <span className="truncate">{entry.itemName}</span>
                            {explanation && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const tooltipWidth = 320; // max-w-xs = 320px
                                  const windowWidth = window.innerWidth;
                                  const isRight = rect.right + tooltipWidth + 16 <= windowWidth;
                                  const x = isRight
                                    ? rect.right + 8 
                                    : rect.left - tooltipWidth - 8;
                                  setSelectedExplanation({ 
                                    itemName: entry.itemName, 
                                    explanation,
                                    x,
                                    y: rect.top + rect.height / 2,
                                    isRight
                                  });
                                }}
                                className="flex-shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
                                title="계산 방법 보기"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
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
                    );
                  })}
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
                  {categorizedEntries.growth.map((entry) => {
                    const explanation = explanationMap[entry.itemName];
                    return (
                      <tr key={entry.itemName} className="hover:bg-gray-800/50">
                        <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                          <div className="flex items-center gap-1 relative">
                            <span className="truncate">{entry.itemName}</span>
                            {explanation && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const tooltipWidth = 320; // max-w-xs = 320px
                                  const windowWidth = window.innerWidth;
                                  const isRight = rect.right + tooltipWidth + 16 <= windowWidth;
                                  const x = isRight
                                    ? rect.right + 8 
                                    : rect.left - tooltipWidth - 8;
                                  setSelectedExplanation({ 
                                    itemName: entry.itemName, 
                                    explanation,
                                    x,
                                    y: rect.top + rect.height / 2,
                                    isRight
                                  });
                                }}
                                className="flex-shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
                                title="계산 방법 보기"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
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
                    );
                  })}
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
                  {categorizedEntries.card.map((entry) => {
                    const explanation = explanationMap[entry.itemName];
                    return (
                      <tr key={entry.itemName} className="hover:bg-gray-800/50">
                        <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                          <div className="flex items-center gap-1 relative">
                            <span className="truncate">{entry.itemName}</span>
                            {explanation && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const tooltipWidth = 320; // max-w-xs = 320px
                                  const windowWidth = window.innerWidth;
                                  const isRight = rect.right + tooltipWidth + 16 <= windowWidth;
                                  const x = isRight
                                    ? rect.right + 8 
                                    : rect.left - tooltipWidth - 8;
                                  setSelectedExplanation({ 
                                    itemName: entry.itemName, 
                                    explanation,
                                    x,
                                    y: rect.top + rect.height / 2,
                                    isRight
                                  });
                                }}
                                className="flex-shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
                                title="계산 방법 보기"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
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
                    );
                  })}
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
                  {categorizedEntries.others.map((entry) => {
                    const explanation = explanationMap[entry.itemName];
                    return (
                      <tr key={entry.itemName} className="hover:bg-gray-800/50">
                        <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                          <div className="flex items-center gap-1 relative">
                            <span className="truncate">{entry.itemName}</span>
                            {explanation && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const tooltipWidth = 320; // max-w-xs = 320px
                                  const windowWidth = window.innerWidth;
                                  const isRight = rect.right + tooltipWidth + 16 <= windowWidth;
                                  const x = isRight
                                    ? rect.right + 8 
                                    : rect.left - tooltipWidth - 8;
                                  setSelectedExplanation({ 
                                    itemName: entry.itemName, 
                                    explanation,
                                    x,
                                    y: rect.top + rect.height / 2,
                                    isRight
                                  });
                                }}
                                className="flex-shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
                                title="계산 방법 보기"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
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
                    );
                  })}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 계산 방법 툴팁 */}
      {selectedExplanation && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-800 rounded-lg p-3 max-w-xs border border-gray-700 shadow-lg"
          style={{
            left: `${selectedExplanation.x}px`,
            top: `${selectedExplanation.y}px`,
            transform: 'translateY(-50%)',
          }}
        >
          <p className="text-sm text-white">{selectedExplanation.explanation}</p>
          {/* 화살표 - 툴팁이 오른쪽에 있을 때 왼쪽 화살표, 왼쪽에 있을 때 오른쪽 화살표 */}
          <div 
            className={`absolute top-1/2 -translate-y-1/2 w-0 h-0 ${
              selectedExplanation.isRight
                ? '-left-2 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-800'
                : '-right-2 border-t-4 border-b-4 border-l-4 border-transparent border-l-gray-800'
            }`}
          ></div>
        </div>
      )}
    </div>
  );
}

