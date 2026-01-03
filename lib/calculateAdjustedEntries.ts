import type { ValueDbEntry } from './valueDb';
import type { RefiningStage, MarketItemInfo } from '../app/refining-simulation/page';
import { calculateOptimalStrategy } from '../app/refining-simulation/client';

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

type CalculateAdjustedEntriesParams = {
  entries: ValueDbEntry[];
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  kurzanStageRewards: Record<string, { itemName: string; quantity: number; price?: number | null; cubeStageRewards?: { itemName: string; quantity: number; price?: number | null }[] }[]>;
  marketPriceMap: Record<string, number>;
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>;
  weaponStages?: RefiningStage[];
  armorStages?: RefiningStage[];
  marketInfo?: Record<string, MarketItemInfo>;
  hellStages?: Stage[]; // 지옥3 stages (기존 호환성 유지)
  hell1Stages?: Stage[];
  hell2Stages?: Stage[];
  narakStages?: Stage[]; // 나락3 stages (기존 호환성 유지)
  narak1Stages?: Stage[];
  narak2Stages?: Stage[];
  valueDbEntryMap?: Map<string, ValueDbEntry>;
  adjustPrice: (itemName: string, price: number | null) => number | null;
  adjustRelicEngravingAverage: (price: number | null) => number | null;
};

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

export function calculateAdjustedEntries(params: CalculateAdjustedEntriesParams): ValueDbEntry[] {
  const {
    entries,
    cubeStageRewards,
    kurzanStageRewards,
    marketPriceMap,
    etcListData,
    weaponStages,
    armorStages,
    marketInfo,
    hellStages,
    hell1Stages,
    hell2Stages,
    narakStages,
    narak1Stages,
    narak2Stages,
    valueDbEntryMap,
    adjustPrice,
    adjustRelicEngravingAverage,
  } = params;

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
          unitPrice: adjustPrice(name, info.unitPrice ?? null) ?? info.unitPrice ?? 0,
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
  if (valueDbEntryMap && (hellStages || hell1Stages || hell2Stages || narakStages || narak1Stages || narak2Stages)) {
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

    // 지옥 열쇠 I: 지옥1
    if (hell1Stages) {
      const hell1_7Stage = hell1Stages.find(s => s.stage === '7단계');
      if (hell1_7Stage) {
        hellKeyValues['전설 지옥 열쇠 I'] = calculateHellStageExpectedValue(hell1_7Stage, false);
      }
      const hell1_6Stage = hell1Stages.find(s => s.stage === '6단계');
      if (hell1_6Stage) {
        hellKeyValues['영웅 지옥 열쇠 I'] = calculateHellStageExpectedValue(hell1_6Stage, false);
      }
      const hell1_5Stage = hell1Stages.find(s => s.stage === '5단계');
      if (hell1_5Stage) {
        hellKeyValues['희귀 지옥 열쇠 I'] = calculateHellStageExpectedValue(hell1_5Stage, false);
      }
    }

    // 지옥 열쇠 II: 지옥2
    if (hell2Stages) {
      const hell2_7Stage = hell2Stages.find(s => s.stage === '7단계');
      if (hell2_7Stage) {
        hellKeyValues['전설 지옥 열쇠 II'] = calculateHellStageExpectedValue(hell2_7Stage, false);
      }
      const hell2_6Stage = hell2Stages.find(s => s.stage === '6단계');
      if (hell2_6Stage) {
        hellKeyValues['영웅 지옥 열쇠 II'] = calculateHellStageExpectedValue(hell2_6Stage, false);
      }
      const hell2_5Stage = hell2Stages.find(s => s.stage === '5단계');
      if (hell2_5Stage) {
        hellKeyValues['희귀 지옥 열쇠 II'] = calculateHellStageExpectedValue(hell2_5Stage, false);
      }
    }

    // 전설 지옥 열쇠 III: 지옥3 7단계
    if (hellStages) {
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
    }

    // 나락 열쇠 I: 나락1
    if (narak1Stages) {
      const narak1_2Stage = narak1Stages.find(s => s.stage === '2단계');
      if (narak1_2Stage) {
        const narakValue = calculateHellStageExpectedValue(narak1_2Stage, true);
        hellKeyValues['전설 나락의 화염 열쇠 I'] = narakValue;
        hellKeyValues['전설 나락의 서리 열쇠 I'] = narakValue;
      }
    }

    // 나락 열쇠 II: 나락2
    if (narak2Stages) {
      const narak2_2Stage = narak2Stages.find(s => s.stage === '2단계');
      if (narak2_2Stage) {
        const narakValue = calculateHellStageExpectedValue(narak2_2Stage, true);
        hellKeyValues['전설 나락의 화염 열쇠 II'] = narakValue;
        hellKeyValues['전설 나락의 서리 열쇠 II'] = narakValue;
      }
    }

    // 전설 나락의 화염 열쇠 III, 전설 나락의 서리 열쇠 III: 나락3 2단계
    if (narakStages) {
      const narak3_2Stage = narakStages.find(s => s.stage === '2단계');
      if (narak3_2Stage) {
        const narakValue = calculateHellStageExpectedValue(narak3_2Stage, true);
        hellKeyValues['전설 나락의 화염 열쇠 III'] = narakValue;
        hellKeyValues['전설 나락의 서리 열쇠 III'] = narakValue;
      }
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
}

