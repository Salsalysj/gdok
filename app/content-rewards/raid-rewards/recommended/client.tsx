'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatNumberWithSignificantDigits } from '../../../utils/formatNumber';
import { usePriceAdjustment } from '../../../hooks/usePriceAdjustment';
import { usePriceOverride } from '../../../contexts/PriceOverrideContext';
import { useValueDb } from '../../../contexts/ValueDbContext';
import FavoriteButton from '../../../components/FavoriteButton';
import GoldUnit from '../../../components/GoldUnit';

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

type RecommendedGate = {
  category: string;
  raidName: string;
  difficulty: string;
  level: string;
  gateNumber: string;
  moreCost: number;
  moreBound: number;
  efficiency: number;
  gateData: GateData[string];
};

export default function RecommendedClient({ 
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
  
  // 세르카 장비 계승 완료 스위치 상태
  const [isSerkaCompleted, setIsSerkaCompleted] = useState<boolean>(false);
  
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

  // 가격 조정 함수
  const getAdjustedPrice = useMemo(() => {
    return (itemName: string): { price: number | null; method?: '거래소 기준' | '5:1 합성 기준' } => {
      if (itemName === '골드') {
        return { price: 1 };
      }
      
      if (isSerkaCompleted) {
        if (itemName === '운명의 파괴석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          const crystalEntry = adjustedEntriesMap['운명의 파괴석 결정'];
          const crystalPrice = crystalEntry?.unitValue != null ? crystalEntry.unitValue / 5 : null;
          
          if (marketPrice != null && crystalPrice != null) {
            if (marketPrice <= crystalPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: crystalPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (crystalPrice != null) {
            return { price: crystalPrice, method: '5:1 합성 기준' };
          }
        }
        
        if (itemName === '운명의 수호석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          const crystalEntry = adjustedEntriesMap['운명의 수호석 결정'];
          const crystalPrice = crystalEntry?.unitValue != null ? crystalEntry.unitValue / 5 : null;
          
          if (marketPrice != null && crystalPrice != null) {
            if (marketPrice <= crystalPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: crystalPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (crystalPrice != null) {
            return { price: crystalPrice, method: '5:1 합성 기준' };
          }
        }
        
        if (itemName === '운명의 돌파석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          const greatEntry = adjustedEntriesMap['위대한 운명의 돌파석'];
          const greatPrice = greatEntry?.unitValue != null ? greatEntry.unitValue / 5 : null;
          
          if (marketPrice != null && greatPrice != null) {
            if (marketPrice <= greatPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: greatPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (greatPrice != null) {
            return { price: greatPrice, method: '5:1 합성 기준' };
          }
        }
        
        if (itemName === '순환 돌파석') {
          const transferEntry = adjustedEntriesMap['전이 돌파석'];
          const transferPrice = transferEntry?.unitValue != null ? transferEntry.unitValue / 5 : null;
          
          if (transferPrice != null) {
            return { price: transferPrice, method: '5:1 합성 기준' };
          }
        }
      }
      
      if (itemName === '운명의 파괴석 결정') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        const sourceEntry = adjustedEntriesMap['운명의 파괴석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      if (itemName === '운명의 수호석 결정') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        const sourceEntry = adjustedEntriesMap['운명의 수호석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      if (itemName === '위대한 운명의 돌파석') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        const sourceEntry = adjustedEntriesMap['운명의 돌파석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      const entry = adjustedEntriesMap[itemName];
      if (entry && entry.unitValue != null) {
        return { price: entry.unitValue };
      }
      
      if (itemName === '운명의 파편') {
        const fragmentEntry = adjustedEntriesMap['운명의 파편 1개당'];
        if (fragmentEntry && fragmentEntry.unitValue != null) {
          return { price: fragmentEntry.unitValue };
        }
      }
      
      return { price: null };
    };
  }, [adjustedEntriesMap, refreshKey, priceOverrideState, isSerkaCompleted]);

  // 제외할 아이템 목록
  const isExcludedForTotal = (itemName: string) => {
    return false; // 필요시 제외 로직 추가
  };

  // 더보기 효율이 이득인 관문들 필터링 및 정렬
  const recommendedGates = useMemo(() => {
    const gates: RecommendedGate[] = [];

    Object.entries(data).forEach(([category, raidData]) => {
      Object.entries(raidData).forEach(([raidName, difficultyData]) => {
        Object.entries(difficultyData).forEach(([difficulty, diffData]) => {
          const level = diffData.level || '';
          const gatesData = diffData.gates || {};

          Object.entries(gatesData).forEach(([gateNumber, gateData]) => {
            if (gateData.더보기) {
              const gateMoreCost = Math.abs(gateData.더보기['골드'] || 0);
              const boundItems = Object.entries(gateData.더보기).filter(([name]) => name !== '골드');
              const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                if (isExcludedForTotal(itemName)) return sum;
                const priceInfo = getAdjustedPrice(itemName);
                return sum + (priceInfo.price !== null ? priceInfo.price * quantity : 0);
              }, 0);
              
              const efficiency = boundTotal - gateMoreCost;
              
              // 이득이면서 더보기 비용의 20% 이상인 경우만 추가
              const minEfficiency = gateMoreCost * 0.2;
              if (efficiency >= minEfficiency) {
                gates.push({
                  category,
                  raidName,
                  difficulty,
                  level,
                  gateNumber,
                  moreCost: gateMoreCost,
                  moreBound: boundTotal,
                  efficiency,
                  gateData,
                });
              }
            }
          });
        });
      });
    });

    // 카테고리별로 그룹화한 후, 각 그룹 내에서 레벨 순서로 정렬
    const categoryGroups = new Map<string, RecommendedGate[]>();
    
    gates.forEach(gate => {
      if (!categoryGroups.has(gate.category)) {
        categoryGroups.set(gate.category, []);
      }
      categoryGroups.get(gate.category)!.push(gate);
    });
    
    // 각 카테고리 그룹 내에서 레벨 순서로 정렬
    categoryGroups.forEach((groupGates) => {
      groupGates.sort((a, b) => {
        const levelA = parseFloat(a.level) || 0;
        const levelB = parseFloat(b.level) || 0;
        if (levelA !== levelB) {
          return levelA - levelB;
        }
        // 레벨이 같으면 레이드명, 난이도 순으로 정렬
        if (a.raidName !== b.raidName) {
          return a.raidName.localeCompare(b.raidName);
        }
        if (a.difficulty !== b.difficulty) {
          return a.difficulty.localeCompare(b.difficulty);
        }
        return a.gateNumber.localeCompare(b.gateNumber);
      });
    });
    
    // 카테고리 순서 고정: 에픽 레이드, 카제로스 레이드, 그림자 레이드
    const categoryOrder = ['에픽 레이드', '카제로스 레이드', '그림자 레이드'];
    const result: RecommendedGate[] = [];
    
    categoryOrder.forEach(category => {
      if (categoryGroups.has(category)) {
        result.push(...categoryGroups.get(category)!);
      }
    });
    
    // 정의되지 않은 카테고리는 마지막에 추가
    categoryGroups.forEach((gates, category) => {
      if (!categoryOrder.includes(category)) {
        result.push(...gates);
      }
    });
    
    return result;
  }, [data, getAdjustedPrice, refreshKey]);

  // 같은 레이드 이름끼리 그룹화하여 rowspan 계산
  const groupedGates = useMemo(() => {
    const groups: { raidName: string; gates: RecommendedGate[] }[] = [];
    const raidMap = new Map<string, RecommendedGate[]>();

    // 레이드 이름별로 그룹화
    recommendedGates.forEach(gate => {
      if (!raidMap.has(gate.raidName)) {
        raidMap.set(gate.raidName, []);
      }
      raidMap.get(gate.raidName)!.push(gate);
    });

    // 레벨 순서로 정렬된 레이드 이름 순서 유지하면서 그룹 생성
    const seenRaids = new Set<string>();
    recommendedGates.forEach(gate => {
      if (!seenRaids.has(gate.raidName)) {
        seenRaids.add(gate.raidName);
        groups.push({
          raidName: gate.raidName,
          gates: raidMap.get(gate.raidName) || []
        });
      }
    });

    return groups;
  }, [recommendedGates]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div>
        <div className="mb-8 md:mb-12">
          <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="hidden md:block text-4xl font-bold tracking-tight text-white bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                  더보기 추천
                </h1>
                <div className="hidden md:block">
                  <FavoriteButton title="더보기 추천" />
                </div>
              </div>
              <p className="text-lg text-gray-400">더보기 이득률이 20% 이상인 레이드 관문들만 자동 필터링하여 추천드립니다.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/content-rewards/raid-rewards"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
              >
                ← 돌아가기
              </Link>
            </div>
          </div>
        </div>

        {/* 세르카 장비 계승 완료 스위치 */}
        <div className="mb-8 bg-gradient-to-r from-gray-800/50 to-gray-900/50 backdrop-blur rounded-xl p-4 border border-gray-700/50 shadow-lg">
          <div className="flex items-start gap-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isSerkaCompleted}
                  onChange={(e) => setIsSerkaCompleted(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                  isSerkaCompleted ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                    isSerkaCompleted ? 'translate-x-6' : 'translate-x-0.5'
                  } mt-0.5`}></div>
                </div>
              </div>
              <span className="text-white font-medium">세르카 장비 계승 완료</span>
            </label>
          </div>
        </div>

        {/* 추천 관문 목록 */}
        {recommendedGates.length > 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-3 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-gray-300">레이드 이름</th>
                    <th className="px-3 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-gray-300">난이도</th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-300">레벨</th>
                    <th className="px-3 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-gray-300">관문</th>
                    <th className="px-3 md:px-4 py-2 md:py-3 text-right text-xs md:text-sm font-semibold text-gray-300"><span className="hidden md:inline">골드 </span><span className="md:hidden">G </span>이득</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {groupedGates.map((group) =>
                    group.gates.map((gate, index) => {
                      const isFirstInDifficultyRun = index === 0 || group.gates[index - 1].difficulty !== gate.difficulty;
                      let difficultyRunLength = 1;
                      if (isFirstInDifficultyRun) {
                        for (let i = index + 1; i < group.gates.length && group.gates[i].difficulty === gate.difficulty; i++) {
                          difficultyRunLength++;
                        }
                      }
                      const raidNameMatch = gate.raidName.match(/^(.+?)\s*\((.+)\)\s*$/);
                      const raidNameMain = raidNameMatch ? raidNameMatch[1] : gate.raidName;
                      const raidNameParen = raidNameMatch ? `(${raidNameMatch[2]})` : null;
                      return (
                        <tr 
                          key={`${gate.category}-${gate.raidName}-${gate.difficulty}-${gate.gateNumber}`}
                          className="hover:bg-gray-800/50 transition-colors"
                        >
                          {index === 0 && (
                            <td 
                              rowSpan={group.gates.length}
                              className="px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-white font-medium align-top"
                            >
                              <span className="hidden md:inline">{gate.raidName}</span>
                              <span className="md:hidden">
                                {raidNameMain}
                                {raidNameParen != null && (
                                  <>
                                    <br />
                                    <span className="text-gray-400">{raidNameParen}</span>
                                  </>
                                )}
                              </span>
                            </td>
                          )}
                          <td className="hidden md:table-cell px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {gate.difficulty}
                          </td>
                          {isFirstInDifficultyRun && (
                            <td
                              rowSpan={difficultyRunLength}
                              className="md:hidden px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300 align-top"
                            >
                              {gate.difficulty}
                            </td>
                          )}
                          <td className="hidden md:table-cell px-4 py-3 text-blue-400">{gate.level || '-'}</td>
                          <td className="px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            <span className="md:hidden">{gate.gateNumber}</span>
                            <span className="hidden md:inline">{gate.gateNumber}관문</span>
                          </td>
                          <td className="px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-right">
                            <span className="text-green-400 font-semibold block md:inline">
                              +{formatNumberWithSignificantDigits(gate.efficiency)}<GoldUnit />
                            </span>
                            {gate.moreCost > 0 && (
                              <span className="block md:inline md:ml-1 text-[10px] md:text-sm text-gray-400 md:text-green-300">
                                (+{((gate.efficiency / gate.moreCost) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded p-6 text-center">
            <p className="text-gray-400">더보기 이득률이 20% 이상인 관문이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
