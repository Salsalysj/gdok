'use client';

import { useMemo, useState } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { ValueDbEntry } from '@/lib/valueDb';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';

import type { RefiningStage, MarketItemInfo } from '../refining-simulation/page';
import { calculateOptimalStrategy } from '../refining-simulation/client';

// 순환 돌파석 소모 개수 계산
function getBreakthroughStoneCount(level: number, type: 'weapon' | 'armor'): number {
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
}

// 특수 재련 효율과 동일한 방식으로 순환 돌파석 가치 계산
function calculateBreakthroughValue(
  stage: RefiningStage,
  adjustedMarketInfo: Record<string, MarketItemInfo>
): number | null {
  // calculateOptimalStrategy를 사용하여 최적 전략 계산 (특수 재련 효율과 동일)
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
  return stoneCount > 0 ? (refiningCost * baseSuccessRate) / stoneCount : null;
}

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  category?: string;
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type Props = {
  entries: ValueDbEntry[];
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  kurzanStageRewards: Record<string, { itemName: string; quantity: number; price?: number | null; cubeStageRewards?: { itemName: string; quantity: number; price?: number | null }[] }[]>;
  marketPriceMap: Record<string, number>;
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>;
  weaponStages?: RefiningStage[];
  armorStages?: RefiningStage[];
  marketInfo?: Record<string, MarketItemInfo>;
  hellStages?: Stage[];
  narakStages?: Stage[];
  valueDbEntryMap?: Map<string, ValueDbEntry>;
};

export default function ValueDBSidebar({
  entries,
  cubeStageRewards,
  kurzanStageRewards,
  marketPriceMap,
  etcListData,
  weaponStages,
  armorStages,
  marketInfo,
  hellStages,
  narakStages,
  valueDbEntryMap,
}: Props) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
  const { state, setState } = usePriceOverride();
  const [searchQuery, setSearchQuery] = useState('');

  // 가격 조정된 엔트리 생성
  const adjustedEntries = useMemo(() => {
    // 먼저 entries에 adjustPrice를 적용하여 기본 adjustedEntries 생성
    const baseAdjustedEntries = entries.map(entry => {
      let adjustedValue = entry.unitValue;
      
      // 골드 단위인 경우 가격 조정 적용
      if (entry.unitType === '골드' && adjustedValue != null) {
        // 유물 각인서 랜덤의 경우 특별 처리
        if (entry.itemName === '유물 각인서 랜덤' || entry.itemName === '유물 각인서 랜덤 주머니') {
          adjustedValue = adjustRelicEngravingAverage(adjustedValue);
        } else {
          adjustedValue = adjustPrice(entry.itemName, adjustedValue);
        }
      }
      // 현금 단위인 경우에도 가격 조정 적용 (카드경험치 미반영 등)
      else if (entry.unitType === '현금' && adjustedValue != null) {
        const adjustedPrice = adjustPrice(entry.itemName, null);
        if (adjustedPrice === 0) {
          adjustedValue = 0;
        }
      }
      
      return {
        ...entry,
        unitValue: adjustedValue,
      };
    });

    // 큐브 입장권과 쿠르잔 관련 항목들의 가격을 재계산
    const recalculatedValues: Record<string, number | null> = {};

    // 에브니 큐브 입장권 재계산
    Object.entries(cubeStageRewards).forEach(([stageName, rewards]) => {
      // entries에서 "에브니 큐브 입장권 (stageName)" 형식으로 찾기
      const entryName = `에브니 큐브 입장권 (${stageName})`;
      let sum = 0;
      for (const reward of rewards) {
        // 각 보상의 원본 가격 찾기
        let originalPrice: number | null = null;
        
        if (reward.itemName === '카드 경험치') {
          // 카드 경험치인 경우 가치계산DB의 '카드경험치 1당' 가격 사용
          const cardExpEntry = entries.find(e => e.itemName === '카드경험치 1당');
          if (cardExpEntry && cardExpEntry.unitValue != null) {
            originalPrice = cardExpEntry.unitValue;
          } else {
            // fallback: etcListData나 marketPriceMap에서 찾기
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            }
          }
        } else {
          // 다른 보상의 경우 원본 가격 찾기
          const etc = etcListData[reward.itemName];
          if (etc?.gold != null) {
            originalPrice = etc.gold;
          } else if (marketPriceMap[reward.itemName] != null) {
            originalPrice = marketPriceMap[reward.itemName];
          }
        }
        
        // adjustPrice로 가격 조정 (카드경험치 미반영, 돌파석 미반영, 파편 미반영 등)
        const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
        if (adjustedPrice != null && adjustedPrice > 0) {
          sum += adjustedPrice * reward.quantity;
        }
      }
      // sum이 0이어도 업데이트 (카드경험치 미반영 시 0이 될 수 있음)
      recalculatedValues[entryName] = sum;
    });

    // 순환 돌파석 가치 재계산 (특수 재련 효율과 동일한 방식)
    let circularBreakthroughValue: number | null = null;
    if (weaponStages && armorStages && marketInfo && weaponStages.length > 0 && armorStages.length > 0) {
      // 가격 조정이 적용된 marketInfo 생성
      const adjustedMarketInfo: Record<string, MarketItemInfo> = {};
      for (const [name, info] of Object.entries(marketInfo)) {
        adjustedMarketInfo[name] = {
          ...info,
          unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
        };
      }

      // 모든 무기와 방어구 스테이지에서 순환 돌파석 가치 계산
      const allBreakthroughValues: number[] = [];
      
      [...weaponStages, ...armorStages].forEach(stage => {
        const value = calculateBreakthroughValue(stage, adjustedMarketInfo);
        if (value != null && value > 0) {
          allBreakthroughValues.push(value);
        }
      });

      // 상위 5개의 평균 계산 (재련 효율 탭과 동일한 방식)
      if (allBreakthroughValues.length > 0) {
        const sorted = allBreakthroughValues.sort((a, b) => b - a);
        const top5 = sorted.slice(0, 5);
        circularBreakthroughValue = top5.reduce((sum, val) => sum + val, 0) / top5.length;
      }
    }

    // 지옥/나락 열쇠 가치 재계산 (지옥 보상 계산기와 동일한 방식)
    const hellKeyValues: Record<string, number | null> = {};
    if (hellStages && narakStages && valueDbEntryMap) {
      // 가치계산DB에서 아이템 가격 가져오기 함수
      const getValueDbPrice = (itemName: string): number | null => {
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
          // 가격 조정 적용
          return adjustPrice(itemName, valueDbPrice);
        }
        
        // 가치계산DB에 없는 경우 기존 로직 사용 후 가격 조정 적용
        let price = originalPrice ?? null;
        if (price != null) {
          price = adjustPrice(itemName, price);
        }
        
        return price;
      };

      // 지옥3 스테이지 기대값 계산
      const calculateHellStageExpectedValue = (stage: Stage, isNarak: boolean = false): number | null => {
        if (!stage || !stage.rewards || stage.rewards.length === 0) return null;
        
        // 카테고리별로 그룹화
        const groupedByCategory: Record<string, RewardItem[]> = {};
        stage.rewards.forEach((reward) => {
          const category = reward.category || '기본';
          if (!groupedByCategory[category]) {
            groupedByCategory[category] = [];
          }
          groupedByCategory[category].push(reward);
        });
        
        const categories = Object.keys(groupedByCategory);
        if (categories.length === 0) return null;
        
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
                  const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                  return sum + ((adjustedPrice || 0) * r.quantity);
                }, 0);
              });
              maxValues.push(Math.max(...comboValues));
            });
            
            // 기대값 = 모든 최고값의 평균
            return maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
          } else if (categories.length > 0) {
            // 카테고리가 3개 미만이면 모든 카테고리의 최고값
            const categoryValues = categories.map(cat => {
              return groupedByCategory[cat].reduce((sum, r) => {
                const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                return sum + ((adjustedPrice || 0) * r.quantity);
              }, 0);
            });
            return Math.max(...categoryValues);
          }
          return null;
        } else {
          // 지옥: 기본 보상 + 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
          const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
          const otherCategories = categories.filter(cat => cat !== baseCategory);
          
          // 기본 보상 가치 계산
          // 풍요 시 10배 기대값 고려: 100% + 90% = 190%
          let baseRewardValue = 0;
          if (baseCategory && groupedByCategory[baseCategory]) {
            const baseValue = groupedByCategory[baseCategory].reduce((sum, r) => {
              const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
              return sum + ((adjustedPrice || 0) * r.quantity);
            }, 0);
            // 기본 보상 상자는 190% 반영 (100% 기본 + 90% 풍요 기대값)
            baseRewardValue = baseValue * 1.9;
          }
          
          if (otherCategories.length === 0) return baseRewardValue;
          
          // 선택 보상 기대값 계산
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
            
            // 각 조합의 최고값 계산
            const maxValues: number[] = [];
            combinations.forEach(combo => {
              const comboValues = combo.map(cat => {
                return groupedByCategory[cat].reduce((sum, r) => {
                  const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                  return sum + ((adjustedPrice || 0) * r.quantity);
                }, 0);
              });
              maxValues.push(Math.max(...comboValues));
            });
            
            // 기대값 = 모든 최고값의 평균
            const expectedSelectionValue = maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
            return baseRewardValue + expectedSelectionValue;
          } else if (otherCategories.length > 0) {
            // 카테고리가 3개 미만이면 모든 카테고리의 최고값
            const otherValues = otherCategories.map(cat => {
              return groupedByCategory[cat].reduce((sum, r) => {
                const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                return sum + ((adjustedPrice || 0) * r.quantity);
              }, 0);
            });
            const maxOtherValue = Math.max(...otherValues);
            return baseRewardValue + maxOtherValue;
          } else {
            return baseRewardValue;
          }
        }
      };

      // 전설 지옥 열쇠 III: 지옥3 7단계
      const hell7Stage = hellStages.find(s => s.stage === '7단계');
      if (hell7Stage) {
        hellKeyValues['전설 지옥 열쇠 III'] = calculateHellStageExpectedValue(hell7Stage, false);
      }

      // 영웅 지옥 열쇠 III: 지옥3 6단계
      const hell6Stage = hellStages.find(s => s.stage === '6단계');
      if (hell6Stage) {
        hellKeyValues['영웅 지옥 열쇠 III'] = calculateHellStageExpectedValue(hell6Stage, false);
      }

      // 희귀 지옥 열쇠 III: 지옥3 5단계
      const hell5Stage = hellStages.find(s => s.stage === '5단계');
      if (hell5Stage) {
        hellKeyValues['희귀 지옥 열쇠 III'] = calculateHellStageExpectedValue(hell5Stage, false);
      }

      // 전설 나락의 화염 열쇠 III, 전설 나락의 서리 열쇠 III: 나락3 2단계
      const narak2Stage = narakStages.find(s => s.stage === '2단계');
      if (narak2Stage) {
        const narakValue = calculateHellStageExpectedValue(narak2Stage, true);
        hellKeyValues['전설 나락의 화염 열쇠 III'] = narakValue;
        hellKeyValues['전설 나락의 서리 열쇠 III'] = narakValue;
      }
    }

    // 쿠르잔 관련 항목 재계산
    Object.entries(kurzanStageRewards).forEach(([stageKey, rewards]) => {
      if (stageKey.includes('네프타 2')) {
        let sum = 0;
        for (const reward of rewards) {
          // 에브니 큐브 입장권인 경우 내부 보상(cubeStageRewards) 처리
          if (reward.itemName.startsWith('에브니 큐브 입장권') && reward.cubeStageRewards && reward.cubeStageRewards.length > 0) {
            // 에브니 큐브 입장권의 내부 보상들 처리
            let cubeSum = 0;
            for (const cubeReward of reward.cubeStageRewards) {
              let originalPrice: number | null = null;
              
              if (cubeReward.itemName === '카드 경험치') {
                // 카드 경험치인 경우 가치계산DB의 '카드경험치 1당' 가격 사용
                const cardExpEntry = entries.find(e => e.itemName === '카드경험치 1당');
                if (cardExpEntry && cardExpEntry.unitValue != null) {
                  originalPrice = cardExpEntry.unitValue;
                } else {
                  originalPrice = cubeReward.price ?? null;
                }
              } else {
                // 다른 보상의 경우 원본 가격 찾기
                if (cubeReward.price != null) {
                  originalPrice = cubeReward.price;
                } else {
                  const etc = etcListData[cubeReward.itemName];
                  if (etc?.gold != null) {
                    originalPrice = etc.gold;
                  } else if (marketPriceMap[cubeReward.itemName] != null) {
                    originalPrice = marketPriceMap[cubeReward.itemName];
                  }
                }
              }
              
              // adjustPrice로 가격 조정
              const adjustedPrice = adjustPrice(cubeReward.itemName, originalPrice);
              if (adjustedPrice != null && adjustedPrice > 0) {
                cubeSum += adjustedPrice * cubeReward.quantity;
              }
            }
            // 에브니 큐브 입장권의 수량(0.1)을 곱해야 함
            sum += cubeSum * (reward.quantity || 0.1);
          } else {
            // 일반 보상 처리
            let originalPrice: number | null = null;
            
            if (reward.itemName === '카드 경험치') {
              // 카드 경험치인 경우 가치계산DB의 '카드경험치 1당' 가격 사용
              const cardExpEntry = entries.find(e => e.itemName === '카드경험치 1당');
              if (cardExpEntry && cardExpEntry.unitValue != null) {
                originalPrice = cardExpEntry.unitValue;
              } else {
                originalPrice = reward.price ?? null;
              }
            } else {
              // 다른 보상의 경우 원본 가격 찾기
              if (reward.price != null) {
                originalPrice = reward.price;
              } else {
                const etc = etcListData[reward.itemName];
                if (etc?.gold != null) {
                  originalPrice = etc.gold;
                } else if (marketPriceMap[reward.itemName] != null) {
                  originalPrice = marketPriceMap[reward.itemName];
                }
              }
            }
            
            // adjustPrice로 가격 조정 (카드경험치 미반영, 돌파석 미반영, 파편 미반영 등)
            const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
            if (adjustedPrice != null && adjustedPrice > 0) {
              sum += adjustedPrice * reward.quantity;
            }
          }
        }
        // sum이 0이어도 업데이트 (카드경험치 미반영 시 0이 될 수 있음)
        recalculatedValues['공명의 기운 회복 비약'] = sum;
        recalculatedValues['휴식 게이지 회복 비약'] = sum;
      }
    });

    return baseAdjustedEntries.map(entry => {
      let adjustedValue = entry.unitValue;
      
      // 지옥/나락 열쇠: 재계산된 값 사용 (지옥 보상 계산기와 동일한 방식)
      if (hellKeyValues[entry.itemName] != null) {
        adjustedValue = hellKeyValues[entry.itemName];
      }
      // 순환 돌파석: 재계산된 값 사용 (특수 재련 효율과 동일한 방식)
      else if (entry.itemName === '순환 돌파석') {
        if (circularBreakthroughValue != null && circularBreakthroughValue > 0) {
          adjustedValue = circularBreakthroughValue;
        }
      }
      // 에브니 큐브 입장권: 재계산된 값 사용
      else if (entry.itemName.startsWith('에브니 큐브 입장권')) {
        if (recalculatedValues[entry.itemName] != null) {
          adjustedValue = recalculatedValues[entry.itemName];
        }
      }
      // 공명의 기운 회복 비약, 휴식 게이지 회복 비약: 재계산된 값 사용
      else if (entry.itemName === '공명의 기운 회복 비약' || entry.itemName === '휴식 게이지 회복 비약') {
        if (recalculatedValues[entry.itemName] != null) {
          adjustedValue = recalculatedValues[entry.itemName];
        }
      }
      // 재계산된 값이 있으면 우선 사용
      else if (recalculatedValues[entry.itemName] != null) {
        adjustedValue = recalculatedValues[entry.itemName];
      }
      
      return {
        ...entry,
        unitValue: adjustedValue,
      };
    });
  }, [entries, adjustPrice, adjustRelicEngravingAverage, cubeStageRewards, kurzanStageRewards, marketPriceMap, etcListData, weaponStages, armorStages, marketInfo, hellStages, narakStages, valueDbEntryMap]);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결'];
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
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
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
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
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
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
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
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
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
    </div>
  );
}

