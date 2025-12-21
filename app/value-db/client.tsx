'use client';

import { useMemo, useState } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { ValueDbEntry } from '@/lib/valueDb';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';

import type { RefiningStage, MarketItemInfo } from '../refining-simulation/page';

type Props = {
  entries: ValueDbEntry[];
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  kurzanStageRewards: Record<string, { itemName: string; quantity: number; price?: number | null; cubeStageRewards?: { itemName: string; quantity: number; price?: number | null }[] }[]>;
  marketPriceMap: Record<string, number>;
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>;
  weaponStages: RefiningStage[];
  armorStages: RefiningStage[];
  marketInfo: Record<string, MarketItemInfo>;
};

const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';

// 재련 효율 계산을 위한 간단한 버전 (순환 돌파석 가치 계산용)
function calculateBreakthroughValue(
  stage: RefiningStage,
  adjustedMarketInfo: Record<string, MarketItemInfo>
): number | null {
  const getUnitInfo = (name: string): MarketItemInfo => adjustedMarketInfo[name] || { unitPrice: 0, icon: null };

  const baseMaterialsCost = stage.baseMaterials.reduce((sum, material) => {
    if (material.name === SILVER_ITEM) return sum;
    const info = getUnitInfo(material.name);
    return sum + info.unitPrice * material.quantity;
  }, 0);
  const goldCost = stage.goldCost * (getUnitInfo(GOLD_ITEM).unitPrice || 1);
  const perAttemptBaseCost = baseMaterialsCost + goldCost;

  const expInfo = stage.expMaterial ? getUnitInfo(stage.expMaterial.name) : null;
  const expMaterialCost = stage.expMaterial
    ? (expInfo?.unitPrice || 0) * stage.expMaterial.quantity
    : 0;

  const breathInfo = stage.breathMaterial ? getUnitInfo(stage.breathMaterial.name) : null;
  const breathUnitPrice = breathInfo?.unitPrice || 0;

  const metallurgyInfo = stage.metallurgyMaterial ? getUnitInfo(stage.metallurgyMaterial.name) : null;
  const metallurgyUnitPrice = metallurgyInfo?.unitPrice || 0;

  const ARTISAN_ENERGY_FACTOR = 0.4651162791;
  const maxAttempts = 500;
  const maxBreathUses = 25;
  const maxMetallurgyUses = 25;

  let minExpectedCost = Infinity;

  for (let b = 0; b <= maxBreathUses; b++) {
    for (let m = 0; m <= maxMetallurgyUses; m++) {
      let expectedTotalCost = expMaterialCost;
      let totalProbability = 0;
      let artisanEnergy = 0;

      for (let n = 1; n <= maxAttempts; n++) {
        let currentBaseRate = stage.baseSuccessRate + (n - 1) * 0.1 * stage.baseSuccessRate;
        currentBaseRate = Math.min(currentBaseRate, stage.baseSuccessRate * 2, 100);

        let actualSuccessRate = currentBaseRate;
        let currentAttemptCost = perAttemptBaseCost;
        let currentBreathCost = 0;
        let currentMetallurgyCost = 0;

        const useBreath = !!(n <= b && stage.breathMaterial);
        const useMetallurgy = !!(n <= m && stage.metallurgyMaterial);

        const isLowRate = stage.baseSuccessRate === 0.5;
        const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;

        if (useBreath && useMetallurgy) {
          actualSuccessRate = Math.min(currentBaseRate + 2 * bonusRate, 100);
          currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
          currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
        } else if (useBreath) {
          actualSuccessRate = Math.min(currentBaseRate + bonusRate, 100);
          currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
        } else if (useMetallurgy) {
          actualSuccessRate = Math.min(currentBaseRate + bonusRate, 100);
          currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
        }

        if (artisanEnergy >= 100) {
          actualSuccessRate = 100;
        }

        const currentAttemptTotalCost = currentAttemptCost + currentBreathCost + currentMetallurgyCost;
        const probOfSuccessThisAttempt = (actualSuccessRate / 100) * (1 - totalProbability);
        expectedTotalCost += currentAttemptTotalCost * (1 - totalProbability);
        totalProbability += probOfSuccessThisAttempt;

        if (totalProbability >= 0.999999) break;

        artisanEnergy = Math.min(100, artisanEnergy + (actualSuccessRate * ARTISAN_ENERGY_FACTOR));
      }

      if (expectedTotalCost < minExpectedCost) {
        minExpectedCost = expectedTotalCost;
      }
    }
  }

  const refiningCost = minExpectedCost - expMaterialCost;
  const baseSuccessRate = stage.baseSuccessRate / 100;

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

  const stoneCount = getBreakthroughStoneCount(stage.level, stage.baseMaterials.some(m => m.name === '운명의 파괴석') ? 'weapon' : 'armor');
  return stoneCount > 0 ? (refiningCost * baseSuccessRate) / stoneCount : null;
}

export default function ValueDBClient({
  entries,
  cubeStageRewards,
  kurzanStageRewards,
  marketPriceMap,
  etcListData,
  weaponStages,
  armorStages,
  marketInfo,
}: Props) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
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

    // 순환 돌파석 가치 재계산
    let circularBreakthroughValue: number | null = null;
    if (weaponStages && armorStages && marketInfo) {
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

    return baseAdjustedEntries.map(entry => {
      let adjustedValue = entry.unitValue;
      
      // 순환 돌파석: 재계산된 값 사용 (항상 재계산된 값으로 덮어쓰기)
      if (entry.itemName === '순환 돌파석') {
        // 재계산된 값이 있으면 사용, 없으면 원래 값에 가격 조정만 적용
        if (circularBreakthroughValue != null && circularBreakthroughValue > 0) {
          adjustedValue = circularBreakthroughValue;
        } else {
          // 재계산 실패 시 원래 값에 가격 조정 적용 (다른 항목들과 동일하게)
          adjustedValue = adjustPrice(entry.itemName, adjustedValue);
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
      // baseAdjustedEntries에서 이미 조정된 값을 사용하므로 여기서는 추가 조정 불필요
      
      return {
        ...entry,
        unitValue: adjustedValue,
      };
    });
  }, [entries, adjustPrice, adjustRelicEngravingAverage, cubeStageRewards, kurzanStageRewards, marketPriceMap, etcListData, weaponStages, armorStages, marketInfo]);

  // 검색 필터링 및 자동완성
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 자동완성 제안
  const autocompleteSuggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) return [];
    const query = searchQuery.toLowerCase().trim();
    const matches = adjustedEntries
      .filter(entry => entry.itemName.toLowerCase().includes(query))
      .slice(0, 10)
      .map(entry => entry.itemName);
    return matches;
  }, [adjustedEntries, searchQuery]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">가치 계산 DB</h1>
          <p className="text-sm md:text-base text-gray-400 mb-4">
            패키지 효율 탭에서 선택 가능한 아이템들의 기준 가치를 확인합니다. 크리스탈/골드/현금 항목은
            각 단위로 표시되며, 별도 정보가 없으면 시장가(골드 기준)가 사용됩니다.
          </p>
          
          {/* 검색 입력 */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="아이템명 검색..."
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                aria-label="검색 초기화"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            
            {/* 자동완성 드롭다운 */}
            {autocompleteSuggestions.length > 0 && searchQuery.trim() && (
              <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSearchQuery(suggestion);
                    }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto bg-gray-900/70 rounded-xl border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800 text-sm md:text-base">
            <thead className="bg-gray-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-200 w-28">단위</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-200 w-40">가치</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-200">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredEntries.map((entry) => (
                <tr key={entry.itemName}>
                  <td className="px-4 py-3 text-white">{entry.itemName}</td>
                  <td className="px-4 py-3 text-gray-300">{entry.unitType ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-yellow-300">
                    {entry.unitValue != null
                      ? formatNumberWithSignificantDigits(entry.unitValue)
                      : '정보 없음'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{entry.note ?? ''}</td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    표시할 아이템이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          ※ 값이 0 또는 “정보 없음”으로 표시되는 항목은 etc_list.csv나 시장 데이터에 값이 없거나, 계산 로직이
          적용되지 않은 항목입니다.
        </p>
      </div>
    </div>
  );
}


