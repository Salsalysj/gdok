'use client';

import { useEffect, useMemo, useState } from 'react';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import type { ValueDbEntry } from '@/lib/valueDb';
import type { RefiningStage, MarketItemInfo } from '../refining-simulation/page';
import { calculateOptimalStrategy } from '../refining-simulation/client';

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  category?: string; // 카테고리 정보 (지옥3용)
  selectionComponents?: { itemName: string; quantity: number; price: number | null; totalValue: number }[]; // 선택 상자 구성품
  selectedComponent?: { itemName: string; quantity: number; price: number | null; totalValue: number }; // 선택된 구성품
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type HellData = {
  [key: string]: Stage[] | undefined;
};

type RatesProps = { exchange: number | null; discord: number | null };

export default function HellClient({ 
  data, 
  rates,
  valueDbEntries = [],
  weaponStages,
  armorStages,
  marketInfo,
}: { 
  data: HellData | undefined; 
  rates: RatesProps;
  valueDbEntries?: ValueDbEntry[];
  weaponStages?: RefiningStage[];
  armorStages?: RefiningStage[];
  marketInfo?: Record<string, MarketItemInfo>;
}) {
  const hellTypes = ['지옥1', '지옥2', '지옥3', '나락1', '나락2', '나락3'];
  const [activeHellType, setActiveHellType] = useState<string>('지옥1');
  const [activeHellStage, setActiveHellStage] = useState<string>('0단계');
  
  // 지옥3 카테고리 펼치기 상태
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // 첫 로드 시 첫 번째 단계 선택
  useMemo(() => {
    if (!activeHellType) {
      setActiveHellType('지옥1');
    }
    if (!activeHellStage) {
      setActiveHellStage('0단계');
    }
    if (activeHellType && data) {
      const stages = data[activeHellType];
      if (stages && stages.length > 0) {
        const firstStage = stages.find(s => s.stage === activeHellStage) || stages[0];
        if (firstStage && firstStage.stage !== activeHellStage) {
          setActiveHellStage(firstStage.stage);
        }
      }
    }
  }, [activeHellType, activeHellStage, data]);
  
  // 현재 표시할 데이터 결정
  let currentLevelData: Stage[] = [];
  if (activeHellType && data) {
    const stages = data[activeHellType];
    if (stages) {
      if (activeHellStage) {
        const selectedStage = stages.find(s => s.stage === activeHellStage);
        currentLevelData = selectedStage ? [selectedStage] : [];
      } else {
        currentLevelData = stages;
      }
    }
  } else {
    // 데이터가 없어도 빈 Stage 구조로 표시
    currentLevelData = activeHellStage ? [{
      stage: activeHellStage,
      rewards: []
    }] : [];
  }

  const isNarak = activeHellType.startsWith('나락');

  // 거래가능/귀속 색상 구분
  const tradableSet = useMemo(() => new Set<string>([
    '정제된 파괴강석',
    '정제된 수호강석',
    '1레벨 보석 (3T)',
    '1레벨 보석 (4T)',
    '운명의 파괴석',
    '운명의 수호석',
  ]), []);

  const getTradeClass = (itemName: string, category?: string) => {
    // 기본 보상 상자 카테고리에 있는 아이템은 항상 귀속
    // category에 "기본"이나 "보상 상자"가 포함되어 있으면 기본 보상 상자로 판단
    const isBaseRewardItem = !isNarak && category && (category.includes('기본') || category.includes('보상 상자'));
    
    // 지옥 보상에서 운명의 파괴석, 운명의 수호석은 항상 귀속
    const isHellBoundItem = !isNarak && (itemName === '운명의 파괴석' || itemName === '운명의 수호석');
    
    // 기본 보상 상자 아이템이거나 지옥 보상의 운명의 파괴석/수호석이면 항상 귀속, 아니면 tradableSet 확인
    const isTradable = (isBaseRewardItem || isHellBoundItem) ? false : tradableSet.has(itemName);
    return {
      isTradable,
      nameClass: isTradable ? 'text-green-300' : 'text-red-300',
      badgeClass: isTradable
        ? 'bg-green-900/30 text-green-300 border border-green-600'
        : 'bg-red-900/30 text-red-300 border border-red-600',
      badgeText: isTradable ? '거래가능' : '귀속',
    } as const;
  };

  // 가격 조정 훅 사용
  const { adjustPrice } = usePriceAdjustment();
  
  // 가치계산DB 엔트리 맵 생성
  const valueDbEntryMap = useMemo(() => {
    const map = new Map<string, ValueDbEntry>();
    valueDbEntries.forEach(entry => {
      map.set(entry.itemName, entry);
    });
    return map;
  }, [valueDbEntries]);
  
  // 순환 돌파석 가치를 클라이언트에서 재계산 (가치계산DB 사이드바와 동일한 방식)
  const circularBreakthroughValue = useMemo(() => {
    // weaponStages, armorStages, marketInfo가 있으면 특수 재련 효율과 동일한 방식으로 계산
    if (weaponStages && armorStages && marketInfo && weaponStages.length > 0 && armorStages.length > 0) {
      // 가격 조정이 적용된 marketInfo 생성
      const adjustedMarketInfo: Record<string, MarketItemInfo> = {};
      for (const [name, info] of Object.entries(marketInfo)) {
        adjustedMarketInfo[name] = {
          ...info,
          unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
        };
      }

      // 순환 돌파석 소모 개수 계산
      const getBreakthroughStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
        if (type === 'weapon') {
          if (level >= 10 && level <= 12) return 30;
          if (level >= 13 && level <= 16) return 40;
          if (level >= 17 && level <= 25) return 50;
        } else {
          if (level >= 10 && level <= 12) return 12;
          if (level >= 13 && level <= 16) return 16;
          if (level >= 17 && level <= 25) return 20;
        }
        return 0;
      };

      // 모든 무기와 방어구 스테이지에서 순환 돌파석 가치 계산
      const allBreakthroughValues: number[] = [];
      
      [...weaponStages, ...armorStages].forEach(stage => {
        // calculateOptimalStrategy를 사용하여 최적 전략 계산
        const { optimalStrategy } = calculateOptimalStrategy(stage, adjustedMarketInfo);
        
        // 경험치 재료 비용 계산
        const expInfo = stage.expMaterial ? (adjustedMarketInfo[stage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = stage.expMaterial && expInfo
          ? expInfo.unitPrice * stage.expMaterial.quantity
          : 0;
        
        // 재련 비용 = 전체 기대 비용 - 경험치 재료 비용
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = stage.baseSuccessRate / 100; // 퍼센트를 소수로 변환
        
        // 무기/방어구 구분
        const type = stage.baseMaterials.some(m => m.name === '운명의 파괴석') ? 'weapon' : 'armor';
        const stoneCount = getBreakthroughStoneCount(stage.level, type);
        
        // 순환 돌파석 1개당 가치 = (재련 비용 * 기본 성공률) / 순환 돌파석 개수
        if (stoneCount > 0) {
          const value = (refiningCost * baseSuccessRate) / stoneCount;
          if (value > 0) {
            allBreakthroughValues.push(value);
          }
        }
      });

      // 상위 5개의 평균 계산 (재련 효율 탭과 동일한 방식)
      if (allBreakthroughValues.length > 0) {
        const sorted = allBreakthroughValues.sort((a, b) => b - a);
        const top5 = sorted.slice(0, 5);
        return top5.reduce((sum, val) => sum + val, 0) / top5.length;
      }
    }
    
    // weaponStages, armorStages, marketInfo가 없으면 가치계산DB에서 가져온 값에 가격 조정만 적용
    const entry = valueDbEntries.find(e => e.itemName === '순환 돌파석');
    if (entry && entry.unitType === '골드' && entry.unitValue != null) {
      // 가격 조정 적용 (돌파석 미반영, 파편 미반영 등)
      return adjustPrice('순환 돌파석', entry.unitValue);
    }
    return null;
  }, [valueDbEntries, adjustPrice, weaponStages, armorStages, marketInfo]);
  
  // 가치계산DB에서 아이템 가격 가져오기
  const getValueDbPrice = (itemName: string): number | null => {
    // 순환 돌파석은 클라이언트에서 재계산된 값 사용
    if (itemName === '순환 돌파석') {
      return circularBreakthroughValue;
    }
    
    const entry = valueDbEntryMap.get(itemName);
    if (entry && entry.unitType === '골드' && entry.unitValue != null) {
      return entry.unitValue;
    }
    return null;
  };
  
  // 지옥 보상 가격 조정 함수 (모든 아이템은 가치계산DB 우선 사용)
  const getAdjustedPrice = (itemName: string, originalPrice: number | null | undefined): number | null => {
    // 모든 아이템은 가치계산DB에서 가격 가져오기 (우선순위)
    const valueDbPrice = getValueDbPrice(itemName);
    if (valueDbPrice != null) {
      // 순환 돌파석은 이미 adjustPrice가 적용된 값이므로 그대로 반환
      if (itemName === '순환 돌파석') {
        return valueDbPrice;
      }
      // 다른 아이템은 가격 조정 적용
      return adjustPrice(itemName, valueDbPrice);
    }
    
    // 가치계산DB에 없는 경우 기존 로직 사용 후 가격 조정 적용
    let price = originalPrice ?? null;
    if (price != null) {
      price = adjustPrice(itemName, price);
    }
    
    return price;
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
  
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-400 mb-2">데이터 없음</h2>
            <p className="text-gray-400">
              지옥 보상 데이터가 없습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">지옥 보상 계산기</h1>
          <p className="text-sm md:text-base text-gray-400">지옥 보상과 골드 가치를 확인하세요.</p>
        </div>
        
        {/* 지옥 선택 UI */}
        <div className="mb-6 space-y-4">
          {/* 지옥1, 지옥2, 지옥3 선택 */}
          <div className="flex gap-2">
            {hellTypes.map(hellType => (
              <button
                key={hellType}
                onClick={() => {
                  setActiveHellType(hellType);
                  // 데이터가 있으면 첫 번째 단계로 설정, 없으면 0단계 유지
                  if (data) {
                    const stages = data[hellType];
                    if (stages && stages.length > 0) {
                      setActiveHellStage(stages[0].stage);
                    } else {
                      setActiveHellStage('0단계');
                    }
                  } else {
                    setActiveHellStage('0단계');
                  }
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  activeHellType === hellType
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {hellType}
              </button>
            ))}
          </div>
          
          {/* 단계 선택 (0단계 ~ 10단계) */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">단계 선택</label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 11 }, (_, i) => {
                const stageName = `${i}단계`;
                const isActive = activeHellStage === stageName;
                // 데이터가 있으면 해당 단계가 있는지 확인
                const hasData = data && data[activeHellType]?.some(s => s.stage === stageName);
                return (
                  <button
                    key={stageName}
                    onClick={() => setActiveHellStage(stageName)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-red-600 text-white border-red-500'
                        : hasData
                        ? 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:border-gray-600'
                        : 'bg-gray-800/50 text-gray-500 border-gray-700/50 cursor-not-allowed opacity-50'
                    }`}
                    disabled={!hasData}
                    title={!hasData ? '데이터 없음' : ''}
                  >
                    {stageName}
                  </button>
                );
              })}
            </div>
            {data && !data[activeHellType] && (
              <p className="text-yellow-400 text-sm mt-2">
                {activeHellType} 데이터가 없습니다. 데이터를 추가해주세요.
              </p>
            )}
          </div>
        </div>
        
        {/* 단계별 보상 표시 */}
        <div className="space-y-6">
          {currentLevelData.map((stage, idx) => {
              // 모든 지옥/나락 타입에서 카테고리별로 그룹화
              const isSpecialStage = ['지옥1', '지옥2', '지옥3', '나락1', '나락2', '나락3'].includes(activeHellType);
            
            // 카테고리별로 그룹화
            const groupedByCategory = isSpecialStage && stage.rewards.some(r => r.category) 
              ? stage.rewards.reduce((acc, reward) => {
                  const category = reward.category || '기타';
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(reward);
                  return acc;
                }, {} as { [category: string]: RewardItem[] })
              : null;
            
            // 지옥/나락 보상 기대값 계산
            let hellExpectedValue: number | null = null;
            let baseRewardValue: number = 0;
            if (isSpecialStage && groupedByCategory) {
              const categories = Object.keys(groupedByCategory);
              
              if (isNarak) {
                // 나락: 기본 보상 없음, 모든 카테고리 중 3개를 랜덤 추출 후 최고가 선택
                if (categories.length >= 3) {
                  // 모든 3개 조합 생성
                  const combinations: string[][] = [];
                  for (let i = 0; i < categories.length; i++) {
                    for (let j = i + 1; j < categories.length; j++) {
                      for (let k = j + 1; k < categories.length; k++) {
                        combinations.push([categories[i], categories[j], categories[k]]);
                      }
                    }
                  }
                  
                  // 각 조합의 최고값 계산 (가격 조정 적용, 가치계산DB 우선 사용)
                  const maxValues: number[] = [];
                  combinations.forEach(combo => {
                    const comboValues = combo.map(cat => {
                      return groupedByCategory[cat].reduce((sum, r) => {
                        const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                        return sum + ((adjustedPrice || 0) * r.quantity);
                      }, 0);
                    });
                    maxValues.push(Math.max(...comboValues));
                  });
                  
                  // 기대값 = 모든 최고값의 평균
                  hellExpectedValue = maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
                } else if (categories.length > 0) {
                  // 카테고리가 3개 미만이면 모든 카테고리의 최고값 (가격 조정 적용, 가치계산DB 우선 사용)
                  const categoryValues = categories.map(cat => {
                    return groupedByCategory[cat].reduce((sum, r) => {
                      const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                      return sum + ((adjustedPrice || 0) * r.quantity);
                    }, 0);
                  });
                  hellExpectedValue = Math.max(...categoryValues);
                }
              } else {
                // 지옥: 기본 보상 + 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
                // 기본 보상 상자 찾기 (첫 번째 카테고리 또는 "기본 보상" 이름의 카테고리)
                const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
                const otherCategories = categories.filter(cat => cat !== baseCategory);
                
                // 기본 보상 가치 계산 (가격 조정 적용, 가치계산DB 우선 사용)
                // 풍요 시 10배 기대값 고려: 100% + 90% = 190%
                if (baseCategory && groupedByCategory[baseCategory]) {
                  const baseValue = groupedByCategory[baseCategory].reduce((sum, r) => {
                    const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                    return sum + ((adjustedPrice || 0) * r.quantity);
                  }, 0);
                  // 기본 보상 상자는 190% 반영 (100% 기본 + 90% 풍요 기대값)
                  baseRewardValue = baseValue * 1.9;
                }
                
                // 선택 보상 기대값 계산: 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
                if (otherCategories.length >= 3) {
                  // 모든 3개 조합 생성
                  const combinations: string[][] = [];
                  for (let i = 0; i < otherCategories.length; i++) {
                    for (let j = i + 1; j < otherCategories.length; j++) {
                      for (let k = j + 1; k < otherCategories.length; k++) {
                        combinations.push([otherCategories[i], otherCategories[j], otherCategories[k]]);
                      }
                    }
                  }
                  
                  // 각 조합의 최고값 계산 (가격 조정 적용, 가치계산DB 우선 사용)
                  const maxValues: number[] = [];
                  combinations.forEach(combo => {
                    const comboValues = combo.map(cat => {
                      return groupedByCategory[cat].reduce((sum, r) => {
                        const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                        return sum + ((adjustedPrice || 0) * r.quantity);
                      }, 0);
                    });
                    maxValues.push(Math.max(...comboValues));
                  });
                  
                  // 기대값 = 모든 최고값의 평균
                  const expectedSelectionValue = maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
                  hellExpectedValue = baseRewardValue + expectedSelectionValue;
                } else if (otherCategories.length > 0) {
                  // 카테고리가 3개 미만이면 모든 카테고리의 최고값 (가격 조정 적용, 가치계산DB 우선 사용)
                  const otherValues = otherCategories.map(cat => {
                    return groupedByCategory[cat].reduce((sum, r) => {
                      const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                      return sum + ((adjustedPrice || 0) * r.quantity);
                    }, 0);
                  });
                  const maxOtherValue = Math.max(...otherValues);
                  hellExpectedValue = baseRewardValue + maxOtherValue;
                } else {
                  // 선택 보상이 없으면 기본 보상만
                  hellExpectedValue = baseRewardValue;
                }
              }
            }
            
            return (
              <div key={idx} className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-white">단계 {stage.stage}</h3>
                  {isSpecialStage && hellExpectedValue !== null ? (
                    <div className="text-right">
                      <div className="text-sm text-gray-400 mb-2">
                        {isNarak ? (
                          <div className="text-xs text-gray-500">
                            모든 카테고리 중 3개 랜덤 선택 → 최고값 선택
                          </div>
                        ) : (
                          <>
                            <div>기본 보상 상자: 190% 반영</div>
                            <div className="text-xs text-gray-400 mt-1">
                              기본 보상 상자는 풍요 시 10배 기대값 고려.
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              선택 보상: 나머지 카테고리 중 3개 랜덤 선택 → 최고값 선택
                            </div>
                          </>
                        )}
                      </div>
                      <div className="text-sm text-gray-400">기대값 {isNarak ? '' : '(기본 + 선택)'}</div>
                      <div className="text-3xl font-bold text-yellow-400">
                        {formatNumberWithSignificantDigits(hellExpectedValue)}골드
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 카테고리별 그룹화 표시 */}
                {isSpecialStage && groupedByCategory ? (
                  <div className="space-y-3">
                    {Object.entries(groupedByCategory).map(([category, rewards]) => {
                      const isExpanded = expandedCategories.has(category);
                      // 기본 보상 상자 카테고리 확인
                      const categories = Object.keys(groupedByCategory);
                      const baseCategory = !isNarak 
                        ? (categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0])
                        : null;
                      const isBaseRewardCategory = !isNarak && category === baseCategory;
                      
                      const categoryTotal = rewards.reduce((sum, r) => {
                        const adjustedPrice = getAdjustedPrice(r.itemName, r.price); // 모든 아이템은 가치계산DB 우선 사용
                        return sum + ((adjustedPrice || 0) * r.quantity);
                      }, 0);
                      
                      return (
                        <div key={category} className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                          <button
                            onClick={() => {
                              setExpandedCategories(prev => {
                                const next = new Set(prev);
                                if (next.has(category)) {
                                  next.delete(category);
                                } else {
                                  next.add(category);
                                }
                                return next;
                              });
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                ▶
                              </span>
                              <span className="font-semibold text-white">{category}</span>
                              <span className="text-sm text-gray-400">
                                ({rewards.length}개 구성품)
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-400">카테고리 합계</div>
                              <div className="text-lg font-bold text-yellow-400">
                                {formatNumberWithSignificantDigits(categoryTotal)}골드
                              </div>
                            </div>
                          </button>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-700">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                {rewards.map((reward, rewardIdx) => {
                                  // 모든 아이템은 가치계산DB 우선 사용
                                  const adjustedPrice = getAdjustedPrice(reward.itemName, reward.price);
                                  const itemTotal = (adjustedPrice || 0) * reward.quantity;
                                  const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                                  const priceStr = adjustedPrice !== null ? formatNumberWithSignificantDigits(adjustedPrice) : '';
                                  const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                                  const tradeInfo = getTradeClass(reward.itemName);
                                  
                                  return (
                                    <div
                                      key={rewardIdx}
                                      className="bg-gray-900/50 rounded-lg border border-gray-700 p-3"
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`font-medium ${tradeInfo.nameClass}`}>{reward.itemName}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                                        {isBaseRewardCategory && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-900/30 text-blue-300 border border-blue-600">
                                            가치계산DB
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-gray-400 text-sm mb-1">수량: {quantityStr}</div>
                                      {reward.itemName === '어빌리티 스톤 키트' || reward.itemName.includes('어빌리티 스톤 키트') ? (
                                        <div>
                                          <div className="text-blue-400 text-xs mb-1">페온 9개 + 100골드</div>
                                          {adjustedPrice !== null && adjustedPrice > 0 ? (
                                            <div className="text-yellow-400 text-sm">
                                              {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                            </div>
                                          ) : adjustedPrice === 0 ? (
                                            <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                                          ) : (
                                            <div className="text-gray-500 text-xs">크리스탈 환율 정보 없음</div>
                                          )}
                                        </div>
                                      ) : adjustedPrice !== null && adjustedPrice > 0 ? (
                                        <div className="text-yellow-400 text-sm">
                                          {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                        </div>
                                      ) : adjustedPrice === 0 ? (
                                        <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                                      ) : (
                                        <div className="text-gray-500 text-xs">가격 정보 없음</div>
                                      )}
                                      
                                      {/* 상급재련 보조 선택 상자 구성품 표시 */}
                                      {reward.itemName === '상급재련 보조 선택 상자' && reward.selectionComponents && (
                                        <div className="mt-2 pt-2 border-t border-gray-600">
                                          <div className="text-[10px] text-gray-400 mb-1.5">구성품 (최고가 선택):</div>
                                          <div className="space-y-1">
                                            {reward.selectionComponents.map((component, compIdx) => {
                                              const isSelected = reward.selectedComponent && 
                                                component.itemName === reward.selectedComponent.itemName &&
                                                component.quantity === reward.selectedComponent.quantity;
                                              const componentPriceStr = component.price !== null ? formatNumberWithSignificantDigits(component.price) : '-';
                                              const componentTotalStr = formatNumberWithSignificantDigits(component.totalValue);
                                              
                                              return (
                                                <div
                                                  key={compIdx}
                                                  className={`text-[10px] p-1.5 rounded ${
                                                    isSelected
                                                      ? 'bg-yellow-900/30 border border-yellow-600'
                                                      : 'bg-gray-800/50 border border-gray-600'
                                                  }`}
                                                >
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className={isSelected ? 'text-yellow-400 font-semibold' : 'text-gray-300'}>
                                                        {component.itemName}
                                                      </span>
                                                      {isSelected && (
                                                        <span className="px-1 py-0.5 rounded text-[9px] bg-yellow-900/50 text-yellow-300 border border-yellow-600">
                                                          선택
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className={`text-right ${isSelected ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                      {componentPriceStr}골드 × {component.quantity} = {componentTotalStr}골드
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {stage.rewards.map((reward, rewardIdx) => {
                      // 모든 아이템은 가치계산DB 우선 사용
                      const adjustedPrice: number | null = getAdjustedPrice(reward.itemName, reward.price);
                      const itemTotal = (adjustedPrice ?? 0) * reward.quantity;
                      const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                      const priceStr = adjustedPrice !== null ? formatNumberWithSignificantDigits(adjustedPrice) : '';
                      const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                      // 일반 보상 표시 (지옥3/나락3이 아닌 경우)에서는 카테고리 정보가 없으므로 null 전달
                      const tradeInfo = getTradeClass(reward.itemName, reward.category);
                      
                      // 상급재련 보조 선택 상자 구성품 표시
                      const isSelectionBox = reward.itemName === '상급재련 보조 선택 상자' && reward.selectionComponents;
                      
                      return (
                        <div
                          key={rewardIdx}
                          className="bg-gray-900/50 rounded-lg border border-gray-700 p-4"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <ItemIcon name={reward.itemName} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${tradeInfo.nameClass}`}>{reward.itemName}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                              </div>
                              <div className="text-gray-400 text-sm">수량: {quantityStr}</div>
                              {adjustedPrice !== null && adjustedPrice > 0 ? (
                                <div className="text-yellow-400 text-sm">
                                  {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                </div>
                              ) : adjustedPrice === 0 ? (
                                <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                              ) : (
                                <div className="text-gray-500 text-xs">가격 정보 없음</div>
                              )}
                            </div>
                          </div>
                          
                          {/* 상급재련 보조 선택 상자 구성품 표시 */}
                          {isSelectionBox && reward.selectionComponents && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                              <div className="text-xs text-gray-400 mb-2">구성품 (최고가 선택):</div>
                              <div className="space-y-2">
                                {reward.selectionComponents.map((component, compIdx) => {
                                  const isSelected = reward.selectedComponent && 
                                    component.itemName === reward.selectedComponent.itemName &&
                                    component.quantity === reward.selectedComponent.quantity;
                                  const componentPriceStr = component.price !== null ? formatNumberWithSignificantDigits(component.price) : '-';
                                  const componentTotalStr = formatNumberWithSignificantDigits(component.totalValue);
                                  
                                  return (
                                    <div
                                      key={compIdx}
                                      className={`text-xs p-2 rounded ${
                                        isSelected
                                          ? 'bg-yellow-900/30 border border-yellow-600'
                                          : 'bg-gray-800/50 border border-gray-700'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className={isSelected ? 'text-yellow-400 font-semibold' : 'text-gray-300'}>
                                            {component.itemName}
                                          </span>
                                          {isSelected && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-900/50 text-yellow-300 border border-yellow-600">
                                              선택됨
                                            </span>
                                          )}
                                        </div>
                                        <div className={`text-right ${isSelected ? 'text-yellow-400' : 'text-gray-400'}`}>
                                          {componentPriceStr}골드 × {component.quantity} = {componentTotalStr}골드
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

