'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { usePriceOverride } from '../../contexts/PriceOverrideContext';
import { useValueDb } from '../../contexts/ValueDbContext';

type RewardData = {
  [itemName: string]: number;
};

type GateData = {
  [gateNumber: string]: {
    클리어?: RewardData;
    더보기?: RewardData;
  };
};

type DifficultyData = {
  [difficulty: string]: {
    level: string;
    gates: GateData;
  };
};

type RaidData = {
  [raidName: string]: DifficultyData;
};

type CategoryData = {
  [category: string]: RaidData;
};

type ValueDbEntryMap = Record<string, { 
  itemName: string; 
  unitType: '크리스탈' | '골드' | '현금' | null; 
  unitValue: number | null; 
  note?: string 
}>;

type RatesProps = { exchange: number | null; discord: number | null };

export default function RaidRewardsClient({ 
  data, 
  valueDbEntryMap,
  rates
}: { 
  data: CategoryData;
  valueDbEntryMap?: ValueDbEntryMap;
  rates?: RatesProps;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // adjustedEntries를 맵으로 변환
  const adjustedEntriesMap = useMemo(() => {
    const map: Record<string, ValueDbEntryMap[string]> = {};
    adjustedEntries.forEach(entry => {
      map[entry.itemName] = entry;
    });
    return map;
  }, [adjustedEntries]);

  // price-override-change 이벤트 리스너
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  const categories = Object.keys(data);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || '');
  const [activeRaid, setActiveRaid] = useState<string>('');
  const [activeDifficulty, setActiveDifficulty] = useState<string>('');

  // 카테고리 변경 시 레이드 초기화
  useEffect(() => {
    if (activeCategory && data[activeCategory]) {
      const raids = Object.keys(data[activeCategory]);
      setActiveRaid(raids[0] || '');
    }
  }, [activeCategory, data]);

  // 레이드 변경 시 난이도 초기화
  useEffect(() => {
    if (activeCategory && activeRaid && data[activeCategory]?.[activeRaid]) {
      const difficulties = Object.keys(data[activeCategory][activeRaid]);
      setActiveDifficulty(difficulties[0] || '');
    }
  }, [activeCategory, activeRaid, data]);

  const currentRaidData = useMemo(() => {
    if (!activeCategory || !activeRaid || !activeDifficulty) return null;
    const diffData = data[activeCategory]?.[activeRaid]?.[activeDifficulty];
    return diffData?.gates || null;
  }, [data, activeCategory, activeRaid, activeDifficulty]);
  
  const currentLevel = useMemo(() => {
    if (!activeCategory || !activeRaid || !activeDifficulty) return '';
    return data[activeCategory]?.[activeRaid]?.[activeDifficulty]?.level || '';
  }, [data, activeCategory, activeRaid, activeDifficulty]);

  const raids = useMemo(() => {
    if (!activeCategory || !data[activeCategory]) return [];
    return Object.keys(data[activeCategory]);
  }, [data, activeCategory]);

  const difficulties = useMemo(() => {
    if (!activeCategory || !activeRaid || !data[activeCategory]?.[activeRaid]) return [];
    return Object.keys(data[activeCategory][activeRaid]);
  }, [data, activeCategory, activeRaid]);

  // 가격 조정 함수 - adjustedEntries 사용 (가치계산DB 사이드바와 동일한 방식)
  const getAdjustedPrice = useMemo(() => {
    return (itemName: string): number | null => {
      // 골드는 1골드로 계산
      if (itemName === '골드') {
        return 1;
      }
      
      // adjustedEntries에서 찾기 (이미 가격 조정이 적용됨)
      const entry = adjustedEntriesMap[itemName];
      if (entry && entry.unitValue != null) {
        return entry.unitValue;
      }
      
      // 운명의 파편 - "운명의 파편 1개당"으로도 찾기
      if (itemName === '운명의 파편') {
        const fragmentEntry = adjustedEntriesMap['운명의 파편 1개당'];
        if (fragmentEntry && fragmentEntry.unitValue != null) {
          return fragmentEntry.unitValue;
        }
      }
      
      return null;
    };
  }, [adjustedEntriesMap, refreshKey, priceOverrideState]);

  // 거래가능/귀속 판별
  const tradableSet = useMemo(() => new Set<string>([
    '골드',
    // 대부분의 레이드 재료는 거래가능
  ]), []);

  const getTradeClass = (itemName: string) => {
    // 골드, 비늘, 쐐기돌, 잔영 등은 거래가능
    // 파괴석, 수호석, 돌파석, 파편 등은 귀속
    const tradableKeywords = ['골드'];
    const isTradable = tradableKeywords.some(keyword => itemName.includes(keyword)) || tradableSet.has(itemName);
    
    return {
      isTradable,
      nameClass: isTradable ? 'text-green-300' : 'text-red-300',
      badgeClass: isTradable
        ? 'bg-green-900/30 text-green-300 border border-green-600'
        : 'bg-red-900/30 text-red-300 border border-red-600',
      badgeText: isTradable ? '거래가능' : '귀속',
    } as const;
  };

  const isExcludedForTotal = (name: string) => {
    if (priceOverrideState.ignoreBreakthroughStone && (name === '운명의 돌파석' || name === '위대한 운명의 돌파석')) return true;
    if (priceOverrideState.ignoreFragment && name === '운명의 파편') return true;
    if (priceOverrideState.ignoreDestructionGuardStone && (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정')) return true;
    return false;
  };

  // 디코기준 스위치 상태 동기화 (전역 테마 스위치 사용)
  const [lightMode, setLightMode] = useState<boolean>(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) setLightMode(saved === '1');
    } catch {}
    const handler = (e: any) => setLightMode(!!e?.detail?.light);
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  // 현금 환산 비율 계산
  // OFF(밝음) → 오피셜, ON(어두움) → 디코기준
  const goldToCashPerGold = useMemo(() => {
    const exchange = rates?.exchange ?? null; // 100크리당 골드
    const discord = rates?.discord ?? null;   // 100:n 에서 n
    if (!lightMode) {
      // 어두움(디코기준 ON): 100골드 = n원이므로, 1골드 = n / 100원
      if (discord && discord > 0) return discord / 100;
      return null;
    } else {
      // 밝음(디코기준 OFF): 1골드 = 2750 / (100크리당 골드)
      if (exchange && exchange > 0) return 2750 / exchange;
      return null;
    }
  }, [lightMode, rates]);

  // 합계 계산
  const calculateTotals = (rewards: RewardData) => {
    let tradable = 0;
    let total = 0;
    
    for (const [itemName, quantity] of Object.entries(rewards)) {
      if (isExcludedForTotal(itemName)) continue;
      
      const price = getAdjustedPrice(itemName);
      if (price !== null) {
        const amount = price * quantity;
        total += amount;
        
        const tradeInfo = getTradeClass(itemName);
        if (tradeInfo.isTradable) {
          tradable += amount;
        }
      }
    }
    
    return { tradable, total };
  };

  if (categories.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 p-8">
        <div>
          <div className="bg-gray-800 border border-gray-700 rounded p-6">
            <h2 className="text-2xl font-bold text-gray-300 mb-2">데이터 없음</h2>
            <p className="text-gray-400">레이드 보상 데이터가 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div>
        <div className="mb-6 md:mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            레이드 보상 계산기
          </h1>
          <p className="text-base text-gray-400">레이드별 보상과 골드 가치를 확인하세요.</p>
        </div>

        {/* 구분 선택 (에픽/카제로스/그림자) */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">구분</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 rounded font-semibold ${
                  activeCategory === category
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 레이드 선택 */}
        {raids.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">레이드</h3>
            <div className="flex flex-wrap gap-2">
              {raids.map(raid => (
                <button
                  key={raid}
                  onClick={() => setActiveRaid(raid)}
                  className={`px-4 py-2 rounded font-semibold ${
                    activeRaid === raid
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {raid}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 난이도 선택 */}
        {difficulties.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">난이도</h3>
            <div className="flex flex-wrap gap-2">
              {difficulties.map(difficulty => {
                const level = data[activeCategory]?.[activeRaid]?.[difficulty]?.level || '';
                return (
                  <button
                    key={difficulty}
                    onClick={() => setActiveDifficulty(difficulty)}
                    className={`px-4 py-2 rounded font-semibold ${
                      activeDifficulty === difficulty
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {difficulty} {level && `(${level})`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 요약 카드 */}
        {currentRaidData && (() => {
          // 전체 합계 계산
          let totalClearGold = 0;
          let totalClearBound = 0;
          let totalMoreCost = 0;
          let totalMoreBound = 0;
          const gateEfficiency: { gate: string; efficiency: number; isProfit: boolean }[] = [];

          Object.entries(currentRaidData).forEach(([gateNumber, gateData]) => {
            // 클리어 골드 및 귀속 아이템
            if (gateData.클리어) {
              const clearGold = gateData.클리어['골드'] || 0;
              totalClearGold += clearGold;
              
              const boundItems = Object.entries(gateData.클리어).filter(([name]) => name !== '골드');
              const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                if (isExcludedForTotal(itemName)) return sum;
                const price = getAdjustedPrice(itemName);
                return sum + (price !== null ? price * quantity : 0);
              }, 0);
              totalClearBound += boundTotal;
            }

            // 더보기 비용 및 귀속 아이템
            if (gateData.더보기) {
              const moreCost = Math.abs(gateData.더보기['골드'] || 0);
              totalMoreCost += moreCost;
              
              const boundItems = Object.entries(gateData.더보기).filter(([name]) => name !== '골드');
              const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                if (isExcludedForTotal(itemName)) return sum;
                const price = getAdjustedPrice(itemName);
                return sum + (price !== null ? price * quantity : 0);
              }, 0);
              totalMoreBound += boundTotal;

              // 관문별 효율
              const efficiency = boundTotal - moreCost;
              gateEfficiency.push({
                gate: gateNumber,
                efficiency,
                isProfit: efficiency >= 0
              });
            }
          });

          return (
            <div className="mb-6 bg-gray-800 rounded p-6 border border-gray-700">
              <h3 className="text-2xl font-bold text-white mb-4">요약</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 좌측 - 클리어 정보 */}
                <div className="bg-gray-900 rounded border border-gray-700 p-4">
                  <h4 className="text-lg font-semibold text-blue-300 mb-3">클리어 보상</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-green-300 font-semibold">클리어 골드 총합</span>
                      <span className="text-green-300 font-bold">
                        {totalClearGold.toLocaleString('ko-KR')}골드
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-red-300 font-semibold">귀속 아이템 총합</span>
                      <span className="text-red-300 font-bold">
                        {formatNumberWithSignificantDigits(totalClearBound)}골드
                      </span>
                    </div>
                  </div>
                </div>

                {/* 우측 - 더보기 정보 */}
                <div className="bg-gray-900 rounded border border-gray-700 p-4">
                  <h4 className="text-lg font-semibold text-purple-300 mb-3">더보기 효율</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-orange-300 font-semibold">더보기 비용 총합</span>
                      <span className="text-orange-300 font-bold">
                        {totalMoreCost.toLocaleString('ko-KR')}골드
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-700">
                      <span className="text-red-300 font-semibold">귀속 아이템 총합</span>
                      <span className="text-red-300 font-bold">
                        {formatNumberWithSignificantDigits(totalMoreBound)}골드
                      </span>
                    </div>
                    
                    {/* 관문별 효율 */}
                    {gateEfficiency.map(({ gate, efficiency, isProfit }) => (
                      <div key={gate} className="flex items-center justify-between py-1.5">
                        <span className="text-gray-300">{gate}관문</span>
                        <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {formatNumberWithSignificantDigits(Math.abs(efficiency))}골드 {isProfit ? '이득' : '손해'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 관문별 보상 표시 */}
        {currentRaidData && (
          <div className="space-y-6">
            {Object.entries(currentRaidData).map(([gateNumber, gateData]) => (
              <div key={gateNumber} className="bg-gray-800 rounded p-6 border border-gray-700">
                <h3 className="text-2xl font-bold text-white mb-4">{gateNumber}관문</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 클리어 보상 */}
                  {gateData.클리어 && (() => {
                    const goldReward = gateData.클리어['골드'] || 0;
                    const boundItems = Object.entries(gateData.클리어).filter(([name]) => name !== '골드');
                    const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                      if (isExcludedForTotal(itemName)) return sum;
                      const price = getAdjustedPrice(itemName);
                      return sum + (price !== null ? price * quantity : 0);
                    }, 0);
                    
                    return (
                      <div className="bg-gray-900 rounded border border-gray-700 p-4">
                        <h4 className="text-xl font-bold text-blue-300 mb-4">클리어 보상</h4>
                        
                        <div className="space-y-2">
                          {/* 클리어 골드 */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-700">
                            <span className="text-green-300 font-semibold">클리어 골드</span>
                            <span className="text-green-300 font-bold">
                              {goldReward.toLocaleString('ko-KR')}골드
                            </span>
                          </div>
                          
                          {/* 귀속 아이템 총합 */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-700">
                            <span className="text-red-300 font-semibold">귀속 아이템 총합</span>
                            <span className="text-red-300 font-bold">
                              {formatNumberWithSignificantDigits(boundTotal)}골드
                            </span>
                          </div>
                          
                          {/* 각 귀속 아이템 */}
                          {boundItems.map(([itemName, quantity]) => {
                            const price = getAdjustedPrice(itemName);
                            const itemTotal = price !== null ? price * quantity : 0;
                            const strike = isExcludedForTotal(itemName) ? 'line-through opacity-60' : '';
                            
                            return (
                              <div key={itemName} className={`flex items-center justify-between py-1.5 pl-4 ${strike}`}>
                                <span className="text-gray-300">
                                  {itemName} {formatNumberWithSignificantDigits(quantity)}개
                                </span>
                                <span className="text-gray-400">
                                  ({formatNumberWithSignificantDigits(itemTotal)}골드)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 더보기 효율 */}
                  {gateData.더보기 && (() => {
                    const goldCost = Math.abs(gateData.더보기['골드'] || 0);
                    const boundItems = Object.entries(gateData.더보기).filter(([name]) => name !== '골드');
                    const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                      if (isExcludedForTotal(itemName)) return sum;
                      const price = getAdjustedPrice(itemName);
                      return sum + (price !== null ? price * quantity : 0);
                    }, 0);
                    const efficiency = boundTotal - goldCost;
                    const isProfit = efficiency >= 0;
                    
                    return (
                      <div className="bg-gray-900 rounded border border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xl font-bold text-purple-300">더보기 효율</h4>
                          <span className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '이득' : '손해'} {formatNumberWithSignificantDigits(Math.abs(efficiency))}골드
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {/* 더보기 비용 */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-700">
                            <span className="text-orange-300 font-semibold">더보기 비용</span>
                            <span className="text-orange-300 font-bold">
                              {goldCost.toLocaleString('ko-KR')}골드
                            </span>
                          </div>
                          
                          {/* 귀속 아이템 총합 */}
                          <div className="flex items-center justify-between py-2 border-b border-gray-700">
                            <span className="text-red-300 font-semibold">귀속 아이템 총합</span>
                            <span className="text-red-300 font-bold">
                              {formatNumberWithSignificantDigits(boundTotal)}골드
                            </span>
                          </div>
                          
                          {/* 각 귀속 아이템 */}
                          {boundItems.map(([itemName, quantity]) => {
                            const price = getAdjustedPrice(itemName);
                            const itemTotal = price !== null ? price * quantity : 0;
                            const strike = isExcludedForTotal(itemName) ? 'line-through opacity-60' : '';
                            
                            return (
                              <div key={itemName} className={`flex items-center justify-between py-1.5 pl-4 ${strike}`}>
                                <span className="text-gray-300">
                                  {itemName} {formatNumberWithSignificantDigits(quantity)}개
                                </span>
                                <span className="text-gray-400">
                                  ({formatNumberWithSignificantDigits(itemTotal)}골드)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
