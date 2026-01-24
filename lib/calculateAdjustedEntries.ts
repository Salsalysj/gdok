import type { ValueDbEntry } from './valueDb';
import type { RefiningStage, MarketItemInfo } from '../app/refining-simulation/page';
import { calculateOptimalStrategy } from '../app/refining-simulation/client';
import simulationDataLevel3 from './advancedRefiningData-level3.json';
import simulationDataLevel4 from './advancedRefiningData-level4.json';

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
  weaponStagesSerka?: RefiningStage[];
  armorStagesSerka?: RefiningStage[];
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
  rates?: { exchange: number | null; discord: number | null };
  lightMode?: boolean;
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

// 전이 돌파석 소모 개수 계산
function getTransitionStoneCount(level: number, type: 'weapon' | 'armor'): number {
  if (type === 'weapon') {
    if (level >= 10 && level <= 11) return 25;
    if (level >= 12 && level <= 13) return 30;
    if (level >= 14 && level <= 16) return 35;
    if (level >= 17 && level <= 19) return 40;
    if (level >= 20 && level <= 21) return 45;
    if (level >= 22 && level <= 23) return 50;
    if (level >= 24 && level <= 25) return 55;
  } else {
    if (level >= 10 && level <= 11) return 10;
    if (level >= 12 && level <= 13) return 12;
    if (level >= 14 && level <= 16) return 14;
    if (level >= 17 && level <= 19) return 16;
    if (level >= 20 && level <= 21) return 18;
    if (level >= 22 && level <= 23) return 20;
    if (level >= 24 && level <= 25) return 22;
  }
  return 0;
}

// 상재3, 4의 보조재료 실제 가치 계산
function calculateAdvancedRefiningRealValue(
  level: 3 | 4,
  gearType: '무기' | '방어구',
  materialType: 'breath' | 'craft',
  adjustPrice: (itemName: string, price: number | null) => number | null,
  marketPriceMap: Record<string, number>,
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>,
  entries: ValueDbEntry[]
): number | null {
  const simulationData = level === 3 ? simulationDataLevel3 : simulationDataLevel4;
  const data = simulationData.data as any[];
  
  // 보조재료를 사용하지 않는 전략 찾기 (모두 false)
  const noAuxStrategy = data.find((d: any) => 
    d.gearType === gearType &&
    !d.strategy.normalBreath &&
    !d.strategy.normalCraft &&
    !d.strategy.ancestorBreath &&
    !d.strategy.ancestorCraft &&
    !d.strategy.enhancedAncestorBreath &&
    !d.strategy.enhancedAncestorCraft
  );
  
  // 모든 턴에 보조재료를 사용하는 전략 찾기
  const allTurnsStrategy = data.find((d: any) => {
    if (d.gearType !== gearType) return false;
    
    if (materialType === 'breath') {
      return d.strategy.normalBreath === true &&
             d.strategy.ancestorBreath === true &&
             d.strategy.enhancedAncestorBreath === true &&
             d.strategy.normalCraft === false &&
             d.strategy.ancestorCraft === false &&
             d.strategy.enhancedAncestorCraft === false;
    } else { // craft
      return d.strategy.normalCraft === true &&
             d.strategy.ancestorCraft === true &&
             d.strategy.enhancedAncestorCraft === true &&
             d.strategy.normalBreath === false &&
             d.strategy.ancestorBreath === false &&
             d.strategy.enhancedAncestorBreath === false;
    }
  });
  
  if (!noAuxStrategy || !allTurnsStrategy) return null;
  
  // 재료 이름 (레벨에 따라 단계 결정)
  const materialName = materialType === 'breath' 
    ? (gearType === '무기' ? '용암의 숨결' : '빙하의 숨결')
    : (gearType === '무기' ? `장인의 야금술 : ${level}단계` : `장인의 재봉술 : ${level}단계`);
  
  // 1회당 필수 재료 비용 계산 (client.tsx와 동일한 방식: valueDbMap 사용)
  const getRequiredMaterialsCost = (): number => {
    let cost = 0;
    
    // 레벨과 장비 타입에 따른 기본 재료
    const baseMaterials = {
      '상재3_무기': {
        '운명의 파괴석': 1200,
        '운명의 돌파석': 25,
        '아비도스 융화 재료': 28,
        '운명의 파편': 11500,
        '실링': 55000,
        '골드': 3000,
      },
      '상재3_방어구': {
        '운명의 수호석': 1000,
        '운명의 돌파석': 18,
        '아비도스 융화 재료': 17,
        '운명의 파편': 7000,
        '실링': 44000,
        '골드': 2000,
      },
      '상재4_무기': {
        '운명의 파괴석': 1400,
        '운명의 돌파석': 32,
        '아비도스 융화 재료': 30,
        '운명의 파편': 13000,
        '실링': 70000,
        '골드': 4000,
      },
      '상재4_방어구': {
        '운명의 수호석': 1200,
        '운명의 돌파석': 23,
        '아비도스 융화 재료': 19,
        '운명의 파편': 8000,
        '실링': 56000,
        '골드': 2400,
      },
    };
    
    const key = `상재${level}_${gearType}` as keyof typeof baseMaterials;
    const materials = baseMaterials[key];
    
    for (const [itemName, quantity] of Object.entries(materials)) {
      if (itemName === '골드') {
        cost += quantity;
      } else if (itemName === '실링') {
        // 실링은 0골드로 처리
        // cost += 0;
      } else {
        const priceItemName = itemName === '운명의 파편' ? '운명의 파편 1개당' : itemName;
        
        // client.tsx와 동일: 원본 entries에서 찾고 adjustPrice 적용
        let basePrice: number | null = null;
        const entry = entries.find(e => e.itemName === priceItemName);
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          basePrice = entry.unitValue; // 원본 가격
        }
        
        // 가격 조정 적용 (client.tsx의 getMaterialValue와 동일)
        let price: number | null = null;
        if (basePrice != null) {
          price = adjustPrice(priceItemName, basePrice);
        } else {
          // entries에 없으면 fallback
          price = adjustPrice(priceItemName, null);
          if (price == null || price === 0) {
            if (marketPriceMap[priceItemName] != null && marketPriceMap[priceItemName] > 0) {
              price = marketPriceMap[priceItemName];
            } else if (etcListData[priceItemName]?.gold != null) {
              price = etcListData[priceItemName].gold!;
            }
          }
        }
        
        if (price != null && price > 0) {
          cost += price * quantity;
        }
      }
    }
    
    return cost;
  };
  
  // 보조재료 비용 계산 (client.tsx와 동일한 방식: valueDbMap 사용)
  const getAuxiliaryCost = (useBreath: boolean, useCraft: boolean): number => {
    let cost = 0;
    
    // 숨결 비용
    if (useBreath) {
      const breathName = gearType === '무기' ? '용암의 숨결' : '빙하의 숨결';
      const breathAmount = level === 4 ? 25 : 20; // 상재3: 20개, 상재4: 25개
      
      // client.tsx와 동일: 원본 entries에서 찾고 adjustPrice 적용
      let baseBreathPrice: number | null = null;
      const breathEntry = entries.find(e => e.itemName === breathName);
      if (breathEntry && breathEntry.unitType === '골드' && breathEntry.unitValue != null) {
        baseBreathPrice = breathEntry.unitValue; // 원본 가격
      }
      
      // 가격 조정 적용
      let breathPrice: number | null = null;
      if (baseBreathPrice != null) {
        breathPrice = adjustPrice(breathName, baseBreathPrice);
      } else {
        // entries에 없으면 fallback
        breathPrice = adjustPrice(breathName, null);
        if (breathPrice == null || breathPrice === 0) {
          if (marketPriceMap[breathName] != null && marketPriceMap[breathName] > 0) {
            breathPrice = marketPriceMap[breathName];
          } else if (etcListData[breathName]?.gold != null) {
            breathPrice = etcListData[breathName].gold!;
          }
        }
      }
      
      if (breathPrice != null && breathPrice > 0) {
        cost += breathPrice * breathAmount;
      }
    }
    
    // 야금술/재봉술 비용
    if (useCraft) {
      const craftAmount = 1;
      
      // client.tsx와 동일: 원본 entries에서 찾고 adjustPrice 적용
      let baseCraftPrice: number | null = null;
      const craftEntry = entries.find(e => e.itemName === materialName);
      if (craftEntry && craftEntry.unitType === '골드' && craftEntry.unitValue != null) {
        baseCraftPrice = craftEntry.unitValue; // 원본 가격
      }
      
      // 가격 조정 적용
      let craftPrice: number | null = null;
      if (baseCraftPrice != null) {
        craftPrice = adjustPrice(materialName, baseCraftPrice);
      } else {
        // entries에 없으면 fallback
        craftPrice = adjustPrice(materialName, null);
        if (craftPrice == null || craftPrice === 0) {
          if (marketPriceMap[materialName] != null && marketPriceMap[materialName] > 0) {
            craftPrice = marketPriceMap[materialName];
          } else if (etcListData[materialName]?.gold != null) {
            craftPrice = etcListData[materialName].gold!;
          }
        }
      }
      
      if (craftPrice != null && craftPrice > 0) {
        cost += craftPrice * craftAmount;
      }
    }
    
    return cost;
  };
  
  // 모든 전략에 대해 비용 계산 (16개 시나리오와 동일한 방식)
  const requiredMaterialsCost = getRequiredMaterialsCost();
  
  // 해당 gearType의 모든 전략에 대해 비용 계산
  const allScenarios = data.filter((d: any) => d.gearType === gearType);
  const scenarioCosts = new Map<string, number>();
  
  for (const scenario of allScenarios) {
    const strategy = scenario.strategy;
    const result = scenario.result;
    
    const normalUseBreath = strategy.normalBreath || false;
    const normalUseCraft = strategy.normalCraft || false;
    const ancestorUseBreath = strategy.ancestorBreath || false;
    const ancestorUseCraft = strategy.ancestorCraft || false;
    const enhancedAncestorUseBreath = strategy.enhancedAncestorBreath || false;
    const enhancedAncestorUseCraft = strategy.enhancedAncestorCraft || false;
    
    const normalTurnCost = requiredMaterialsCost + getAuxiliaryCost(normalUseBreath, normalUseCraft);
    const ancestorTurnCost = requiredMaterialsCost + getAuxiliaryCost(ancestorUseBreath, ancestorUseCraft);
    const enhancedAncestorTurnCost = requiredMaterialsCost + getAuxiliaryCost(enhancedAncestorUseBreath, enhancedAncestorUseCraft);
    const freeTurnCost = getAuxiliaryCost(normalUseBreath, normalUseCraft); // 무료턴은 필수 재료 비용 0
    
    const normalTurnTotal = result.normalTurns * normalTurnCost;
    const ancestorTurnTotal = result.ancestorTurns * ancestorTurnCost;
    const enhancedAncestorTurnTotal = result.enhancedAncestorTurns * enhancedAncestorTurnCost;
    const freeTurnTotal = result.freeTurns * freeTurnCost;
    
    const totalCost = normalTurnTotal + ancestorTurnTotal + enhancedAncestorTurnTotal + freeTurnTotal;
    
    // 전략을 문자열 키로 변환하여 저장
    const strategyKey = `${normalUseBreath}-${normalUseCraft}-${ancestorUseBreath}-${ancestorUseCraft}-${enhancedAncestorUseBreath}-${enhancedAncestorUseCraft}`;
    scenarioCosts.set(strategyKey, totalCost);
  }
  
  // noAux와 allTurns의 비용 가져오기
  const noAuxKey = 'false-false-false-false-false-false';
  const allTurnsKey = materialType === 'breath' 
    ? 'true-false-true-false-true-false'
    : 'false-true-false-true-false-true';
  
  const noAuxCost = scenarioCosts.get(noAuxKey);
  const allTurnsCost = scenarioCosts.get(allTurnsKey);
  
  if (noAuxCost == null || allTurnsCost == null) return null;
  
  // 디버깅 로그
  console.log(`\n=== ${gearType} ${materialName} 실제가치 계산 ===`);
  console.log(`총 ${allScenarios.length}개 시나리오 비용 계산 완료`);
  console.log('noAuxCost (11개 시나리오에서 참조):', noAuxCost);
  console.log('allTurnsCost (11개 시나리오에서 참조):', allTurnsCost);
  
  // 비용 차이
  const additionalValue = noAuxCost - allTurnsCost;
  console.log('additionalValue (비용 차이):', additionalValue);
  
  // 보조재료 사용량
  const materialAmount = (allTurnsStrategy.result.materialBreakdown[materialName] || 0) - 
                         (noAuxStrategy.result.materialBreakdown[materialName] || 0);
  console.log('materialAmount (보조재료 사용량):', materialAmount);
  
  if (materialAmount <= 0) {
    console.log('보조재료 사용량이 0 이하입니다.');
    return null;
  }
  
  // 단위당 가치 계산
  const unitValue = additionalValue / materialAmount;
  console.log('unitValue (단위당 가치):', unitValue);
  
  // 거래소 가격 찾기
  let marketPrice = adjustPrice(materialName, null);
  
  if (marketPrice == null || marketPrice === 0) {
    if (marketPriceMap[materialName] != null && marketPriceMap[materialName] > 0) {
      marketPrice = marketPriceMap[materialName];
    } else if (etcListData[materialName]?.gold != null && etcListData[materialName].gold! > 0) {
      marketPrice = etcListData[materialName].gold!;
    } else {
      marketPrice = 0;
    }
  }
  console.log('marketPrice (거래소 가격):', marketPrice);
  
  // 실제 가치 = 단위당 가치 + 거래소 가격
  const realValue = unitValue + marketPrice;
  console.log('realValue (실제 가치):', realValue);
  console.log('=== 계산 완료 ===\n');
  
  return realValue;
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

// 전이 돌파석 가치 계산 (세르카 장비용)
function calculateTransitionBreakthroughValue(
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
  
  // 무기/방어구 구분 (세르카 장비는 '운명의 파괴석 결정' 또는 '운명의 수호석 결정' 사용)
  const type = stage.baseMaterials.some(m => m.name === '운명의 파괴석 결정') ? 'weapon' : 'armor';
  const stoneCount = getTransitionStoneCount(stage.level, type);
  
  // 전이 돌파석 1개당 가치 = (재련 비용 * 기본 성공률) / 전이 돌파석 개수
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
    weaponStagesSerka,
    armorStagesSerka,
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
    rates,
    lightMode = false,
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
    // 크리스탈 단위인 경우에도 가격 조정 적용 (카드 세트 졸업 등)
    else if (entry.unitType === '크리스탈' && adjustedValue != null) {
      const adjustedPrice = adjustPrice(entry.itemName, null);
      if (adjustedPrice === 0) {
        adjustedValue = 0;
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
    for (const reward of rewards as any[]) {
      // 컨텐츠 보상 로직과 동일하게, cubeStageRewards에 저장된 price를 우선 사용
      let originalPrice: number | null = reward.price ?? null;

      // price 정보가 없을 때만 기존 fallback 로직 사용
      if (originalPrice == null) {
        if (reward.itemName === '카드 경험치') {
          // 카드경험치 1당 값 우선
          const cardExpEntry = entries.find(e => e.itemName === '카드경험치 1당');
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
        } else {
          // 운명의 파편인 경우 '운명의 파편 1개당' 우선
          if (reward.itemName === '운명의 파편') {
            const fragmentEntry = entries.find(e => e.itemName === '운명의 파편 1개당');
            if (fragmentEntry && fragmentEntry.unitValue != null) {
              originalPrice = fragmentEntry.unitValue;
            }
          }
          // 실링인 경우 가치계산DB에서 가격 사용
          else if (reward.itemName === '실링') {
            const silverEntry = entries.find(e => e.itemName === '실링');
            if (silverEntry && silverEntry.unitValue != null) {
              // unitType에 따라 현금→골드 환산 (컨텐츠 보상 클라이언트와 동일한 방식)
              if (silverEntry.unitType === '현금') {
                if (!lightMode && rates?.discord && rates.discord > 0) {
                  // 디코기준: 100골드 = discord원이므로, 1원 = 100/discord 골드
                  originalPrice = silverEntry.unitValue * (100 / rates.discord);
                } else if (lightMode && rates?.exchange && rates.exchange > 0) {
                  // 크리스탈 거래소 기준: 1원 = exchange/2750 골드
                  originalPrice = silverEntry.unitValue * (rates.exchange / 2750);
                } else {
                  // 환율 정보가 없으면 원래 값 그대로 사용
                  originalPrice = silverEntry.unitValue;
                }
              } else if (silverEntry.unitType === '골드') {
                originalPrice = silverEntry.unitValue;
              }
            }
          }
          // fallback: etc_list / marketPriceMap
          if (originalPrice == null) {
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            }
          }
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

  // 전이 돌파석 가치 재계산 (특수 재련 효율과 동일한 방식)
  let transitionBreakthroughValue: number | null = null;
  if (weaponStagesSerka && armorStagesSerka && marketInfo && weaponStagesSerka.length > 0 && armorStagesSerka.length > 0) {
      // 가격 조정이 적용된 marketInfo 생성
      const adjustedMarketInfo: Record<string, MarketItemInfo> = {};
      for (const [name, info] of Object.entries(marketInfo)) {
        adjustedMarketInfo[name] = {
          ...info,
          unitPrice: adjustPrice(name, info.unitPrice ?? null) ?? info.unitPrice ?? 0,
        };
      }

    // 모든 무기와 방어구 스테이지에서 전이 돌파석 가치 계산
    const allTransitionBreakthroughValues: number[] = [];
    
    [...weaponStagesSerka, ...armorStagesSerka].forEach(stage => {
      const value = calculateTransitionBreakthroughValue(stage, adjustedMarketInfo);
      if (value != null && value > 0 && isFinite(value)) {
        allTransitionBreakthroughValues.push(value);
      }
    });

    // 상위 5개의 평균 계산 (재련 효율 탭과 동일한 방식)
    if (allTransitionBreakthroughValues.length > 0) {
      const sorted = allTransitionBreakthroughValues.sort((a, b) => b - a);
      const top5 = sorted.slice(0, 5);
      const average = top5.reduce((sum, val) => sum + val, 0) / top5.length;
      if (isFinite(average) && average > 0) {
        transitionBreakthroughValue = average;
      }
    }
  }

  // 지옥/나락 열쇠 가치 재계산 (지옥 보상 계산기와 동일한 방식)
  const hellKeyValues: Record<string, number | null> = {};
  if (valueDbEntryMap && (hellStages || hell1Stages || hell2Stages || narakStages || narak1Stages || narak2Stages)) {
    // 가치계산DB에서 아이템 가격 가져오기 함수
    const getValueDbPrice = (itemName: string): number | null => {
      // 순환 돌파석은 클라이언트에서 재계산된 값 사용
      if (itemName === '순환 돌파석') {
        return circularBreakthroughValue;
      }
      // 전이 돌파석은 클라이언트에서 재계산된 값 사용
      if (itemName === '전이 돌파석') {
        return transitionBreakthroughValue;
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
    if (stageKey.includes('1730') && stageKey.includes('심연의 역류 I')) {
      let sum = 0;
      for (const reward of rewards) {
        // 에브니 큐브 입장권 또는 시련의 모래인 경우 내부 보상(cubeStageRewards) 처리
        if ((reward.itemName.startsWith('에브니 큐브 입장권') || reward.itemName.startsWith('시련의 모래')) && reward.cubeStageRewards && reward.cubeStageRewards.length > 0) {
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
            } else if (cubeReward.itemName === '운명의 파편') {
              // 운명의 파편인 경우 가치계산DB의 '운명의 파편 1개당' 가격 사용
              const fragmentEntry = entries.find(e => e.itemName === '운명의 파편 1개당');
              if (fragmentEntry && fragmentEntry.unitValue != null) {
                originalPrice = fragmentEntry.unitValue;
              } else {
                // fallback: price가 있으면 사용, 없으면 etcListData나 marketPriceMap에서 찾기
                if ('price' in cubeReward && cubeReward.price != null) {
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
            } else if (cubeReward.itemName === '실링') {
              // 실링인 경우 가치계산DB에서 가격 사용 (컨텐츠 보상 페이지와 동일한 방식)
              const silverEntry = entries.find(e => e.itemName === '실링');
              if (silverEntry && silverEntry.unitValue != null) {
                // 현금 단위인 경우 디코기준 스위치에 따라 골드로 변환
                if (silverEntry.unitType === '현금') {
                  if (!lightMode && rates?.discord && rates.discord > 0) {
                    // 디코기준: 100골드 = discord원이므로, 1원 = 100/discord 골드
                    originalPrice = silverEntry.unitValue * (100 / rates.discord);
                  } else if (lightMode && rates?.exchange && rates.exchange > 0) {
                    // 크리스탈 거래소 기준: 1원 = exchange/2750 골드
                    originalPrice = silverEntry.unitValue * (rates.exchange / 2750);
                  } else {
                    // 환율 정보가 없으면 원래 값 그대로 사용
                    originalPrice = silverEntry.unitValue;
                  }
                } else if (silverEntry.unitType === '골드') {
                  originalPrice = silverEntry.unitValue;
                }
              } else {
                // fallback: price가 있으면 사용, 없으면 etcListData나 marketPriceMap에서 찾기
                if ('price' in cubeReward && cubeReward.price != null) {
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
            } else {
              // 다른 보상의 경우 원본 가격 찾기
              if ('price' in cubeReward && cubeReward.price != null) {
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
            // 운명의 파편인 경우 '운명의 파편 1개당'으로 adjustPrice 호출
            // 실링은 그대로 '실링'으로 호출 (가격 조정 스위치 적용)
            const adjustItemName = cubeReward.itemName === '운명의 파편' ? '운명의 파편 1개당' : cubeReward.itemName;
            const adjustedPrice = adjustPrice(adjustItemName, originalPrice);
            if (adjustedPrice != null && adjustedPrice > 0) {
              cubeSum += adjustedPrice * cubeReward.quantity;
            }
          }
          // 에브니 큐브 입장권 또는 시련의 모래의 수량을 곱해야 함
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
          } else if (reward.itemName === '운명의 파편') {
            // 운명의 파편인 경우 가치계산DB의 '운명의 파편 1개당' 가격 사용
            const fragmentEntry = entries.find(e => e.itemName === '운명의 파편 1개당');
            if (fragmentEntry && fragmentEntry.unitValue != null) {
              originalPrice = fragmentEntry.unitValue;
            } else {
              originalPrice = reward.price ?? null;
            }
          } else if (reward.itemName === '실링') {
            // 실링인 경우 가치계산DB에서 가격 사용 (컨텐츠 보상 페이지와 동일한 방식)
            const silverEntry = entries.find(e => e.itemName === '실링');
            if (silverEntry && silverEntry.unitValue != null) {
              // 현금 단위인 경우 디코기준 스위치에 따라 골드로 변환
              if (silverEntry.unitType === '현금') {
                if (!lightMode && rates?.discord && rates.discord > 0) {
                  // 디코기준: 100골드 = discord원이므로, 1원 = 100/discord 골드
                  originalPrice = silverEntry.unitValue * (100 / rates.discord);
                } else if (lightMode && rates?.exchange && rates.exchange > 0) {
                  // 크리스탈 거래소 기준: 1원 = exchange/2750 골드
                  originalPrice = silverEntry.unitValue * (rates.exchange / 2750);
                } else {
                  // 환율 정보가 없으면 원래 값 그대로 사용
                  originalPrice = silverEntry.unitValue;
                }
              } else if (silverEntry.unitType === '골드') {
                originalPrice = silverEntry.unitValue;
              }
            } else {
              // fallback: price가 있으면 사용, 없으면 etcListData나 marketPriceMap에서 찾기
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
          // 운명의 파편인 경우 '운명의 파편 1개당'으로 adjustPrice 호출
          const adjustItemName = reward.itemName === '운명의 파편' ? '운명의 파편 1개당' : reward.itemName;
          const adjustedPrice = adjustPrice(adjustItemName, originalPrice);
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

  const resultEntries = baseAdjustedEntries.map(entry => {
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
    // 전이 돌파석: 재계산된 값 사용 (특수 재련 효율과 동일한 방식)
    else if (entry.itemName === '전이 돌파석') {
      if (transitionBreakthroughValue != null && transitionBreakthroughValue > 0) {
        adjustedValue = transitionBreakthroughValue;
      }
    }
    // 에브니 큐브 입장권: 재계산된 값 사용
    else if (entry.itemName.startsWith('에브니 큐브 입장권')) {
      // 지옥교환 항목 처리: 클라이언트에서 재계산된 지옥 열쇠 값 사용
      const hellExchangeMatch = entry.itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
      if (hellExchangeMatch) {
        const cubeStage = hellExchangeMatch[1]; // 1해금, 2해금, 3해금, 4해금
        let hellKeyName: string | null = null;
        
        // 해금 단계에 따라 전설 지옥 열쇠 매핑
        if (cubeStage === '1해금' || cubeStage === '2해금') {
          hellKeyName = '전설 지옥 열쇠 I';
        } else if (cubeStage === '3해금') {
          hellKeyName = '전설 지옥 열쇠 II';
        } else if (cubeStage === '4해금') {
          hellKeyName = '전설 지옥 열쇠 III';
        }
        
        if (hellKeyName && hellKeyValues[hellKeyName] != null && hellKeyValues[hellKeyName]! > 0) {
          adjustedValue = hellKeyValues[hellKeyName]! / 10;
        }
      } else if (recalculatedValues[entry.itemName] != null) {
        // 일반 에브니 큐브 입장권은 recalculatedValues에서 가져오기
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
  
  return resultEntries;
}

