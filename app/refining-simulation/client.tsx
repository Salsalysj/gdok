'use client';

import { useMemo, useState, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { RefiningStage, MarketItemInfo } from './page';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import FavoriteButton from '../components/FavoriteButton';

type Props = {
  weaponStages: RefiningStage[];
  armorStages: RefiningStage[];
  weaponStagesSerka: RefiningStage[];
  armorStagesSerka: RefiningStage[];
  marketInfo: Record<string, MarketItemInfo>;
  lastUpdated: string | null;
  silverCashValue: number | null;
  initialRates?: { exchange: number | null; discord: number | null };
  initialCrystalGoldRate?: number | null;
};

type ScenarioSummary = {
  label: string;
  description: string;
  cost: number | null;
  successRate: number | null;
};

type StrategySummary = {
  label: string;
  description: string;
  expectedCost: number;
  averageAttempts: number;
  simulationDetails: SimulationDetail[];
  breathAttempts: number;
  metallurgyAttempts: number;
  breathTotalCost: number;
  metallurgyTotalCost: number;
};

type SimulationDetail = {
  attempt: number;
  baseRate: number;
  currentRate: number;
  actualRate: number;
  artisanEnergy: number;
  cost: number;
  cumulativeProbability: number;
  strategy: string;
  breathUsed: boolean;
  metallurgyUsed: boolean;
};

type MaterialValueInsight = {
  name: string;
  available: boolean;
  usedCount: number;
  quantityPerUse: number;
  marketPrice: number;
  actualValuePerItem: number | null;
  diffFromMarket: number | null;
  basis: 'optimal' | 'full' | 'none';
};

type MaterialValueAnalysis = {
  breath: MaterialValueInsight;
  metallurgy: MaterialValueInsight;
  enhancedMetallurgy: MaterialValueInsight | null; // 19-20단계용 강화 야금술/재봉술
};

const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';
const BREATH_ITEM = '용암의 숨결';
const FALLBACK_ICON: Record<string, string> = {
  [GOLD_ITEM]: '🪙',
  [SILVER_ITEM]: '💠',
  [BREATH_ITEM]: '🔥',
  '빙하의 숨결': '❄️',
  '운명의 파괴석': '💎',
  '운명의 수호석': '🛡️',
  '운명의 돌파석': '🔷',
  '아비도스 융화 재료': '🧪',
  '운명의 파괴석 결정': '💎',
  '운명의 수호석 결정': '🛡️',
  '위대한 운명의 돌파석': '🔷',
  '상급 아비도스 융화 재료': '🧪',
  '운명의 파편': '✨',
  '운명의 파편 (경험치)': '✨',
  '야금술 : 업화 [11-14]': '🛠️',
  '야금술 : 업화 [15-18]': '🛠️',
  '야금술 : 업화 [19-20]': '🛠️',
  '재봉술 : 업화 [11-14]': '🧵',
  '재봉술 : 업화 [15-18]': '🧵',
  '재봉술 : 업화 [19-20]': '🧵',
  '강화 야금술 : 업화 [19-20]': '⚒️',
  '강화 재봉술 : 업화 [19-20]': '🪡',
};

function clampRate(value: number | null): number | null {
  if (value == null) return null;
  return Math.min(value, 100);
}

function formatRate(value: number | null): string {
  if (value == null || value <= 0) return '-';
  return `${formatNumberWithSignificantDigits(value)}%`;
}

function formatCost(value: number | null): string {
  if (value == null || value <= 0) return '-';
  return `${formatNumberWithSignificantDigits(value)} 골드`;
}

type CostLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  icon?: string | null;
};

export function calculateOptimalStrategy(
  stage: RefiningStage,
  marketInfo: Record<string, MarketItemInfo>,
  maxAttempts: number = 500,
  maxBreathUses: number = 25,
  maxMetallurgyUses: number = 25
): {
  optimalStrategy: StrategySummary;
  baseStrategy: StrategySummary;
  fullBreathStrategy: StrategySummary | null;
  fullMetallurgyStrategy: StrategySummary | null;
  fullEnhancedMetallurgyStrategy: StrategySummary | null;
  fullBothStrategy: StrategySummary | null;
  materialValueAnalysis: MaterialValueAnalysis | null;
} {
  const ARTISAN_ENERGY_FACTOR = 0.4651162791;
  const getUnitInfo = (name: string): MarketItemInfo => marketInfo[name] || { unitPrice: 0, icon: null };

  const baseMaterialsCost = stage.baseMaterials.reduce((sum, material) => {
    const info = getUnitInfo(material.name);
    return sum + info.unitPrice * material.quantity;
  }, 0);
  const goldCost = stage.goldCost * (getUnitInfo(GOLD_ITEM).unitPrice || 1);
  const silverCost = stage.silverCost * (getUnitInfo(SILVER_ITEM).unitPrice || 0);
  const perAttemptBaseCost = baseMaterialsCost + goldCost + silverCost;

  const expInfo = stage.expMaterial ? getUnitInfo(stage.expMaterial.name) : null;
  const expMaterialCost = stage.expMaterial
    ? (expInfo?.unitPrice || 0) * stage.expMaterial.quantity
    : 0;

  const breathInfo = stage.breathMaterial ? getUnitInfo(stage.breathMaterial.name) : null;
  const breathUnitPrice = breathInfo?.unitPrice || 0;

  const metallurgyInfo = stage.metallurgyMaterial ? getUnitInfo(stage.metallurgyMaterial.name) : null;
  const metallurgyUnitPrice = metallurgyInfo?.unitPrice || 0;

  // 19-20단계용 강화 야금술/재봉술
  const enhancedMetallurgyInfo = stage.enhancedMetallurgyMaterial ? getUnitInfo(stage.enhancedMetallurgyMaterial.name) : null;
  const enhancedMetallurgyUnitPrice = enhancedMetallurgyInfo?.unitPrice || 0;

  const calculateExpectedCost = (
    breathUses: number,
    metallurgyUses: number,
    useEnhancedMetallurgy: boolean = false
  ): {
    expectedTotalCost: number;
    averageAttempts: number;
    simulationDetails: SimulationDetail[];
    breathAttempts: number;
    metallurgyAttempts: number;
    breathTotalCost: number;
    metallurgyTotalCost: number;
  } => {
    let expectedTotalCost = expMaterialCost;
    let totalProbability = 0;
    let totalAttempts = 0;
    let artisanEnergy = 0;
    const simulationDetails: SimulationDetail[] = [];
    let breathAttemptCount = 0;
    let metallurgyAttemptCount = 0;

    for (let n = 1; n <= maxAttempts; n++) {
      let currentBaseRate = stage.baseSuccessRate + (n - 1) * 0.1 * stage.baseSuccessRate;
      // 기본 재련 확률은 최초 확률의 2배를 초과할 수 없음
      currentBaseRate = Math.min(currentBaseRate, stage.baseSuccessRate * 2, 100);

      let actualSuccessRate = currentBaseRate;
      let currentAttemptCost = perAttemptBaseCost;
      let currentBreathCost = 0;
      let currentMetallurgyCost = 0;
      let strategyLabel = '기본';

      const useBreath = !!(n <= breathUses && stage.breathMaterial);
      const useMetallurgy = !!(n <= metallurgyUses && stage.metallurgyMaterial);

      // 최초 성공률이 0.5%인 경우 보조 재료 보너스는 +1.0% 고정
      const isLowRate = stage.baseSuccessRate === 0.5;
      const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;

      // 강화 야금술/재봉술 사용 시 보너스 2배
      const metallurgyBonusMultiplier = useEnhancedMetallurgy ? 2 : 1;

      if (useBreath && useMetallurgy) {
        actualSuccessRate = Math.min(currentBaseRate + bonusRate + bonusRate * metallurgyBonusMultiplier, 100);
        currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
        
        if (useEnhancedMetallurgy && stage.enhancedMetallurgyMaterial) {
          currentMetallurgyCost = stage.enhancedMetallurgyMaterial.quantity * enhancedMetallurgyUnitPrice;
          strategyLabel = `${stage.breathMaterial!.name} & ${stage.enhancedMetallurgyMaterial.name}`;
        } else {
          currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
          strategyLabel = `${stage.breathMaterial!.name} & ${stage.metallurgyMaterial!.name}`;
        }
      } else if (useBreath) {
        actualSuccessRate = Math.min(currentBaseRate + bonusRate, 100);
        currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
        strategyLabel = stage.breathMaterial!.name;
      } else if (useMetallurgy) {
        actualSuccessRate = Math.min(currentBaseRate + bonusRate * metallurgyBonusMultiplier, 100);
        
        if (useEnhancedMetallurgy && stage.enhancedMetallurgyMaterial) {
          currentMetallurgyCost = stage.enhancedMetallurgyMaterial.quantity * enhancedMetallurgyUnitPrice;
          strategyLabel = stage.enhancedMetallurgyMaterial.name;
        } else {
          currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
          strategyLabel = stage.metallurgyMaterial!.name;
        }
      }

      if (artisanEnergy >= 100) {
        actualSuccessRate = 100;
      }

      const currentAttemptTotalCost = currentAttemptCost + currentBreathCost + currentMetallurgyCost;
      const probOfSuccessThisAttempt = (actualSuccessRate / 100) * (1 - totalProbability);
      expectedTotalCost += currentAttemptTotalCost * (1 - totalProbability);
      totalProbability += probOfSuccessThisAttempt;
      totalAttempts += (1 - totalProbability + probOfSuccessThisAttempt) * 1;

      simulationDetails.push({
        attempt: n,
        baseRate: stage.baseSuccessRate,
        currentRate: currentBaseRate,
        actualRate: actualSuccessRate,
        artisanEnergy: artisanEnergy,
        cost: currentAttemptTotalCost,
        cumulativeProbability: totalProbability,
        strategy: strategyLabel,
        breathUsed: useBreath || false,
        metallurgyUsed: useMetallurgy || false,
      });

      if (useBreath) {
        breathAttemptCount += 1;
      }
      if (useMetallurgy) {
        metallurgyAttemptCount += 1;
      }

      if (totalProbability >= 0.999999) break;

      artisanEnergy = Math.min(100, artisanEnergy + (actualSuccessRate * ARTISAN_ENERGY_FACTOR));
    }

    const breathTotalCost = breathAttemptCount * (stage.breathMaterial?.quantity || 0) * breathUnitPrice;
    const metallurgyTotalCost = metallurgyAttemptCount * (stage.metallurgyMaterial?.quantity || 0) * metallurgyUnitPrice;

    return {
      expectedTotalCost,
      averageAttempts: totalAttempts,
      simulationDetails,
      breathAttempts: breathAttemptCount,
      metallurgyAttempts: metallurgyAttemptCount,
      breathTotalCost,
      metallurgyTotalCost,
    };
  };

  let minExpectedCost = Infinity;
  let optimalBreathUses = 0;
  let optimalMetallurgyUses = 0;
  let optimalUseEnhancedMetallurgy = false;
  let optimalSimulationDetails: SimulationDetail[] = [];
  let optimalAverageAttempts = 0;
  let optimalBreathAttempts = 0;
  let optimalMetallurgyAttempts = 0;
  let optimalBreathCost = 0;
  let optimalMetallurgyCost = 0;

  const baseStrategyResult = calculateExpectedCost(0, 0, false);
  const baseStrategy: StrategySummary = {
    label: '기본 재련 전략',
    description: '보조 재료 미사용',
    expectedCost: baseStrategyResult.expectedTotalCost,
    averageAttempts: baseStrategyResult.averageAttempts,
    simulationDetails: baseStrategyResult.simulationDetails,
    breathAttempts: baseStrategyResult.breathAttempts,
    metallurgyAttempts: baseStrategyResult.metallurgyAttempts,
    breathTotalCost: baseStrategyResult.breathTotalCost,
    metallurgyTotalCost: baseStrategyResult.metallurgyTotalCost,
  };

  minExpectedCost = baseStrategyResult.expectedTotalCost;
  optimalSimulationDetails = baseStrategyResult.simulationDetails;
  optimalAverageAttempts = baseStrategyResult.averageAttempts;
  optimalBreathAttempts = baseStrategyResult.breathAttempts;
  optimalMetallurgyAttempts = baseStrategyResult.metallurgyAttempts;
  optimalBreathCost = baseStrategyResult.breathTotalCost;
  optimalMetallurgyCost = baseStrategyResult.metallurgyTotalCost;

  // 19-20단계인 경우 일반/강화 야금술/재봉술 모두 탐색
  const hasEnhancedOption = stage.enhancedMetallurgyMaterial && (stage.level === 19 || stage.level === 20);
  const enhancedOptions = hasEnhancedOption ? [false, true] : [false];

  for (let b = 0; b <= maxBreathUses; b++) {
    for (let m = 0; m <= maxMetallurgyUses; m++) {
      for (const useEnhanced of enhancedOptions) {
        const {
          expectedTotalCost,
          averageAttempts,
          simulationDetails,
          breathAttempts,
          metallurgyAttempts,
          breathTotalCost,
          metallurgyTotalCost,
        } = calculateExpectedCost(b, m, useEnhanced);

        if (expectedTotalCost < minExpectedCost) {
          minExpectedCost = expectedTotalCost;
          optimalBreathUses = b;
          optimalMetallurgyUses = m;
          optimalUseEnhancedMetallurgy = useEnhanced;
          optimalSimulationDetails = simulationDetails;
        optimalAverageAttempts = averageAttempts;
        optimalBreathAttempts = breathAttempts;
        optimalMetallurgyAttempts = metallurgyAttempts;
        optimalBreathCost = breathTotalCost;
        optimalMetallurgyCost = metallurgyTotalCost;
        }
      }
    }
  }

  // 최적 전략이 25회까지 투입인 경우, 모든 시도에 투입하는 경우도 비교
  // 25회까지도 투입이 이득이면 나머지 회차에도 전부 투입하는 게 이득일 확률이 높음
  if (optimalBreathUses === maxBreathUses || optimalMetallurgyUses === maxMetallurgyUses) {
    // 숨결이 25회인 경우, 모든 시도에 투입하는 경우 비교
    const breathUsesToCheck = optimalBreathUses === maxBreathUses ? maxAttempts : optimalBreathUses;
    // 야금술/재봉술이 25회인 경우, 모든 시도에 투입하는 경우 비교
    const metallurgyUsesToCheck = optimalMetallurgyUses === maxMetallurgyUses ? maxAttempts : optimalMetallurgyUses;
    
    const {
      expectedTotalCost,
      averageAttempts,
      simulationDetails,
      breathAttempts,
      metallurgyAttempts,
      breathTotalCost,
      metallurgyTotalCost,
    } = calculateExpectedCost(breathUsesToCheck, metallurgyUsesToCheck, optimalUseEnhancedMetallurgy);

    if (expectedTotalCost < minExpectedCost) {
      minExpectedCost = expectedTotalCost;
      optimalBreathUses = breathUsesToCheck;
      optimalMetallurgyUses = metallurgyUsesToCheck;
      optimalSimulationDetails = simulationDetails;
      optimalAverageAttempts = averageAttempts;
      optimalBreathAttempts = breathAttempts;
      optimalMetallurgyAttempts = metallurgyAttempts;
      optimalBreathCost = breathTotalCost;
      optimalMetallurgyCost = metallurgyTotalCost;
    }
  }

  // 장인 에너지가 100%에 도달한 시점 찾기
  const artisanEnergy100Attempt = optimalSimulationDetails.find(detail => detail.artisanEnergy >= 100)?.attempt || Infinity;
  
  // 숨결과 야금술 모두 사용하는 경우
  const formatStrategyLabel = (
    breathUses: number, 
    metallurgyUses: number, 
    useEnhanced: boolean, 
    avgAttempts: number,
    breathAttempts: number,
    metallurgyAttempts: number
  ): string => {
    // 실제로 모든 시도에 숨결을 사용하는지 확인
    // - breathUses가 maxAttempts 이상이면 모든 시도에 사용
    // - 또는 실제 숨결 사용 횟수(breathAttempts)가 평균 시도 횟수와 거의 같으면 (차이가 0.1 이하) 모든 시도에 사용한 것으로 간주
    // - 또는 장인 에너지가 100%에 도달한 시점이 breathUses 이하이면 그 이후에는 성공률 100%이므로 모든 시도에 사용한 것으로 간주
    const breathAllUsed = breathUses >= maxAttempts || 
      (breathUses > 0 && (Math.abs(breathAttempts - avgAttempts) < 0.1 || artisanEnergy100Attempt <= breathUses));
    const metallurgyAllUsed = metallurgyUses >= maxAttempts || 
      (metallurgyUses > 0 && (Math.abs(metallurgyAttempts - avgAttempts) < 0.1 || artisanEnergy100Attempt <= metallurgyUses));
    
    // 강화 야금술/재봉술 표기
    const metallurgyName = useEnhanced && stage.enhancedMetallurgyMaterial
      ? (stage.enhancedMetallurgyMaterial.name.includes('야금술') ? '강화 야금술' : '강화 재봉술')
      : (stage.metallurgyMaterial?.name.includes('야금술') ? '야금술' : '재봉술');
    
    if (breathUses > 0 && metallurgyUses > 0) {
      const breathLabel = breathAllUsed ? '숨결 모두 투입' : `숨결 ${breathUses}회까지 투입`;
      const metallurgyLabel = metallurgyAllUsed ? `${metallurgyName} 모두 투입` : `${metallurgyName} ${metallurgyUses}회까지 투입`;
      return `${breathLabel}, ${metallurgyLabel}`;
    } else if (breathUses > 0) {
      return breathAllUsed ? '숨결 모두 투입' : `숨결 ${breathUses}회까지 투입`;
    } else if (metallurgyUses > 0) {
      return metallurgyAllUsed ? `${metallurgyName} 모두 투입` : `${metallurgyName} ${metallurgyUses}회까지 투입`;
    } else {
      return '보조 재료 미사용 (기본 전략과 동일)';
    }
  };

  const optimalStrategyLabel = formatStrategyLabel(
    optimalBreathUses, 
    optimalMetallurgyUses, 
    optimalUseEnhancedMetallurgy, 
    optimalAverageAttempts,
    optimalBreathAttempts,
    optimalMetallurgyAttempts
  );

  const optimalStrategy: StrategySummary = {
    label: '최적 재련 전략',
    description: optimalStrategyLabel,
    expectedCost: minExpectedCost,
    averageAttempts: optimalAverageAttempts,
    simulationDetails: optimalSimulationDetails,
    breathAttempts: optimalBreathAttempts,
    metallurgyAttempts: optimalMetallurgyAttempts,
    breathTotalCost: optimalBreathCost,
    metallurgyTotalCost: optimalMetallurgyCost,
  };

  let fullBreathStrategy: StrategySummary | null = null;
  if (stage.breathMaterial) {
    const fullBreathResult = calculateExpectedCost(maxAttempts, 0, false);
    fullBreathStrategy = {
      label: '풀숨 전략',
      description: '숨결 모두 투입',
      expectedCost: fullBreathResult.expectedTotalCost,
      averageAttempts: fullBreathResult.averageAttempts,
      simulationDetails: fullBreathResult.simulationDetails,
      breathAttempts: fullBreathResult.breathAttempts,
      metallurgyAttempts: fullBreathResult.metallurgyAttempts,
      breathTotalCost: fullBreathResult.breathTotalCost,
      metallurgyTotalCost: fullBreathResult.metallurgyTotalCost,
    };
  }

  let fullMetallurgyStrategy: StrategySummary | null = null;
  if (stage.metallurgyMaterial) {
    // 풀책 전략은 항상 일반 야금술/재봉술만 사용 (강화 버전은 별도 전략)
    const fullMetallurgyResult = calculateExpectedCost(0, maxAttempts, false);
    const metallurgyName = stage.metallurgyMaterial.name.includes('야금술') ? '야금술' : '재봉술';
    
    fullMetallurgyStrategy = {
      label: '풀책 전략',
      description: `${metallurgyName} 모두 투입`,
      expectedCost: fullMetallurgyResult.expectedTotalCost,
      averageAttempts: fullMetallurgyResult.averageAttempts,
      simulationDetails: fullMetallurgyResult.simulationDetails,
      breathAttempts: fullMetallurgyResult.breathAttempts,
      metallurgyAttempts: fullMetallurgyResult.metallurgyAttempts,
      breathTotalCost: fullMetallurgyResult.breathTotalCost,
      metallurgyTotalCost: fullMetallurgyResult.metallurgyTotalCost,
    };
  }

  let fullBothStrategy: StrategySummary | null = null;
  if (stage.breathMaterial && stage.metallurgyMaterial) {
    // 19-20단계인 경우 일반/강화 버전 중 더 저렴한 것 선택
    let bestResult = calculateExpectedCost(maxAttempts, maxAttempts, false);
    let useEnhanced = false;
    
    if (hasEnhancedOption) {
      const enhancedResult = calculateExpectedCost(maxAttempts, maxAttempts, true);
      if (enhancedResult.expectedTotalCost < bestResult.expectedTotalCost) {
        bestResult = enhancedResult;
        useEnhanced = true;
      }
    }
    
    const metallurgyName = useEnhanced && stage.enhancedMetallurgyMaterial
      ? (stage.enhancedMetallurgyMaterial.name.includes('야금술') ? '강화 야금술' : '강화 재봉술')
      : (stage.metallurgyMaterial.name.includes('야금술') ? '야금술' : '재봉술');
    
    fullBothStrategy = {
      label: '풀숨 & 풀책 전략',
      description: `숨결 모두 투입, ${metallurgyName} 모두 투입`,
      expectedCost: bestResult.expectedTotalCost,
      averageAttempts: bestResult.averageAttempts,
      simulationDetails: bestResult.simulationDetails,
      breathAttempts: bestResult.breathAttempts,
      metallurgyAttempts: bestResult.metallurgyAttempts,
      breathTotalCost: bestResult.breathTotalCost,
      metallurgyTotalCost: bestResult.metallurgyTotalCost,
    };
  }

  const computeMaterialInsight = (
    type: 'breath' | 'metallurgy',
    strategy: StrategySummary | null,
    fallbackStrategy: StrategySummary | null,
    unitPrice: number,
    quantityPerUse: number,
    name: string
  ): MaterialValueInsight => {
    const available = quantityPerUse > 0;

    // 가치 분석은 항상 풀 전략(fallbackStrategy)을 기준으로 비교
    // - 숨결: 기본 전략 vs 풀숨 전략
    // - 야금술/재봉술: 기본 전략 vs 풀책 전략
    // - 강화 야금술/재봉술: 기본 전략 vs 풀 강화책 전략
    let reference: StrategySummary | null = null;
    let basis: 'optimal' | 'full' | 'none' = 'none';
    if (available && fallbackStrategy) {
      const hasUsage = type === 'breath' ? fallbackStrategy.breathAttempts > 0 : fallbackStrategy.metallurgyAttempts > 0;
      if (hasUsage) {
        reference = fallbackStrategy;
        basis = 'full';
      }
    }

    if (!reference) {
      return {
        name,
        available,
        usedCount: 0,
        quantityPerUse,
        marketPrice: unitPrice,
        actualValuePerItem: null,
        diffFromMarket: null,
        basis,
      };
    }

    const rawUsedCount = type === 'breath' ? reference.breathAttempts : reference.metallurgyAttempts;
    // n(횟수): 풀 전략 기준이므로 평균 시도 횟수 사용
    // 풀 전략에서는 모든 시도에 사용하므로 n = 평균 시도 횟수
    const usedCount = reference.averageAttempts;
    // 해당 보조재료의 비용만 사용 (다른 보조재료 비용 제외)
    const currentMaterialCost = type === 'breath' ? reference.breathTotalCost : reference.metallurgyTotalCost;
    // 보조재료 투입 시 비용에서 해당 보조재료 비용을 제외한 순수 비용
    // = 보조재료 없이 계산한 비용
    const costWithoutCurrentMaterial = reference.expectedCost - currentMaterialCost;
    // 실제 가치 = (기본 전략 비용 - 보조재료 투입 시 비용) / 총 개수 + 단가
    // 공식: (a - b) / m + p
    // a = 기본 전략 비용, b = 보조재료 투입 시 비용, m = 총 개수(= n * 1회당 투입 개수), p = 단가
    // n = 평균 시도 횟수 기반 기대 사용 횟수
    const actualValueGain = baseStrategy.expectedCost - reference.expectedCost;
    const totalItems = usedCount * quantityPerUse;
    const actualValuePerItem = totalItems > 0 ? (actualValueGain / totalItems) + unitPrice : null;
    const diffFromMarket = actualValuePerItem !== null ? actualValuePerItem - unitPrice : null;

    return {
      name,
      available,
      usedCount,
      quantityPerUse,
      marketPrice: unitPrice,
      actualValuePerItem,
      diffFromMarket,
      basis,
    };
  };

  // 19-20단계용 강화 야금술/재봉술 풀 전략 계산
  let fullEnhancedMetallurgyStrategy: StrategySummary | null = null;
  if (stage.enhancedMetallurgyMaterial && hasEnhancedOption) {
    const fullEnhancedResult = calculateExpectedCost(0, maxAttempts, true);
    const enhancedName = stage.enhancedMetallurgyMaterial.name.includes('야금술') ? '강화 야금술' : '강화 재봉술';
    fullEnhancedMetallurgyStrategy = {
      label: '풀 강화책 전략',
      description: `${enhancedName} 모두 투입`,
      expectedCost: fullEnhancedResult.expectedTotalCost,
      averageAttempts: fullEnhancedResult.averageAttempts,
      simulationDetails: fullEnhancedResult.simulationDetails,
      breathAttempts: fullEnhancedResult.breathAttempts,
      metallurgyAttempts: fullEnhancedResult.metallurgyAttempts,
      breathTotalCost: fullEnhancedResult.breathTotalCost,
      metallurgyTotalCost: fullEnhancedResult.metallurgyTotalCost,
    };
  }

  const materialValueAnalysis: MaterialValueAnalysis = {
    breath: computeMaterialInsight('breath', optimalStrategy, fullBreathStrategy, breathUnitPrice, stage.breathMaterial?.quantity || 0, stage.breathMaterial?.name || BREATH_ITEM),
    metallurgy: computeMaterialInsight(
      'metallurgy',
      optimalStrategy,
      fullMetallurgyStrategy,
      stage.metallurgyMaterial ? metallurgyUnitPrice : 0,
      stage.metallurgyMaterial?.quantity || 0,
      stage.metallurgyMaterial?.name || '야금술'
    ),
    enhancedMetallurgy: stage.enhancedMetallurgyMaterial ? computeMaterialInsight(
      'metallurgy',
      optimalStrategy,
      fullEnhancedMetallurgyStrategy,
      enhancedMetallurgyUnitPrice,
      stage.enhancedMetallurgyMaterial.quantity,
      stage.enhancedMetallurgyMaterial.name
    ) : null,
  };

  return { optimalStrategy, baseStrategy, fullBreathStrategy, fullMetallurgyStrategy, fullEnhancedMetallurgyStrategy, fullBothStrategy, materialValueAnalysis };
}

function calculateScenarioSummaries(
  stage: RefiningStage,
  marketInfo: Record<string, MarketItemInfo>
): {
  scenarios: ScenarioSummary[];
  baseCostBreakdown: CostLine[];
  oneTimeCost: CostLine | null;
  optionalCosts: CostLine[];
} {
  const getUnitInfo = (name: string): MarketItemInfo => marketInfo[name] || { unitPrice: 0, icon: null };

  const baseCostBreakdown: CostLine[] = stage.baseMaterials.map((material) => {
    const info = getUnitInfo(material.name);
    return {
      name: material.name,
      quantity: material.quantity,
      unitPrice: info.unitPrice,
      totalPrice: info.unitPrice * material.quantity,
      icon: info.icon,
    };
  });

  const goldInfo = getUnitInfo(GOLD_ITEM);
  const goldUnitPrice = goldInfo.unitPrice || 1;
  const goldCost = stage.goldCost * goldUnitPrice;
  
  const silverInfo = getUnitInfo(SILVER_ITEM);
  const silverUnitPrice = silverInfo.unitPrice || 0;
  const silverCost = stage.silverCost * silverUnitPrice;

  const perAttemptBaseCost = baseCostBreakdown.reduce((sum, item) => sum + item.totalPrice, 0) + goldCost + silverCost;

  const expInfo = stage.expMaterial ? getUnitInfo(stage.expMaterial.name) : null;
  const oneTimeCost = stage.expMaterial
    ? {
        name: stage.expMaterial.name,
        quantity: stage.expMaterial.quantity,
        unitPrice: expInfo?.unitPrice || 0,
        totalPrice: (expInfo?.unitPrice || 0) * stage.expMaterial.quantity,
        icon: expInfo?.icon,
      }
    : null;

  const optionalCosts: CostLine[] = [];

  const breathInfo = stage.breathMaterial ? getUnitInfo(stage.breathMaterial.name) : null;
  const breathUnitPrice = stage.breathMaterial ? (breathInfo?.unitPrice || 0) : 0;
  const breathCost = stage.breathMaterial ? breathUnitPrice * stage.breathMaterial.quantity : 0;
  if (stage.breathMaterial) {
    optionalCosts.push({
      name: stage.breathMaterial.name,
      quantity: stage.breathMaterial.quantity,
      unitPrice: breathUnitPrice,
      totalPrice: breathCost,
      icon: breathInfo?.icon,
    });
  }

  const metallurgyInfo = stage.metallurgyMaterial ? getUnitInfo(stage.metallurgyMaterial.name) : null;
  const metallurgyUnitPrice = stage.metallurgyMaterial
    ? (metallurgyInfo?.unitPrice || 0)
    : 0;
  const metallurgyCost = stage.metallurgyMaterial ? metallurgyUnitPrice * stage.metallurgyMaterial.quantity : 0;
  if (stage.metallurgyMaterial) {
    optionalCosts.push({
      name: stage.metallurgyMaterial.name,
      quantity: stage.metallurgyMaterial.quantity,
      unitPrice: metallurgyUnitPrice,
      totalPrice: metallurgyCost,
      icon: metallurgyInfo?.icon,
    });
  }

  // 19-20단계용 강화 야금술/재봉술
  const enhancedMetallurgyInfo = stage.enhancedMetallurgyMaterial ? getUnitInfo(stage.enhancedMetallurgyMaterial.name) : null;
  const enhancedMetallurgyUnitPrice = stage.enhancedMetallurgyMaterial
    ? (enhancedMetallurgyInfo?.unitPrice || 0)
    : 0;
  const enhancedMetallurgyCost = stage.enhancedMetallurgyMaterial ? enhancedMetallurgyUnitPrice * stage.enhancedMetallurgyMaterial.quantity : 0;
  if (stage.enhancedMetallurgyMaterial) {
    optionalCosts.push({
      name: stage.enhancedMetallurgyMaterial.name,
      quantity: stage.enhancedMetallurgyMaterial.quantity,
      unitPrice: enhancedMetallurgyUnitPrice,
      totalPrice: enhancedMetallurgyCost,
      icon: enhancedMetallurgyInfo?.icon,
    });
  }

  const baseRate = stage.baseSuccessRate;
  // 최초 성공률이 0.5%인 경우 보조 재료 보너스는 +1.0% 고정
  const isLowRate = stage.baseSuccessRate === 0.5;
  const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;
  
  const breathRate = stage.breathMaterial ? clampRate(baseRate + bonusRate) : null;
  const metallurgyRate = stage.metallurgyMaterial ? clampRate(baseRate + bonusRate) : null;
  const bothRate = stage.breathMaterial && stage.metallurgyMaterial ? clampRate(baseRate + 2 * bonusRate) : null;

  const scenarios: ScenarioSummary[] = [
    {
      label: '기본',
      description: '보조 재료 미사용',
      cost: perAttemptBaseCost,
      successRate: clampRate(baseRate),
    },
  ];

  if (stage.breathMaterial) {
    scenarios.push({
      label: `${stage.breathMaterial.name} 사용`,
      description: '숨결만 추가',
      cost: perAttemptBaseCost + breathCost,
      successRate: breathRate,
    });
  }

  if (stage.metallurgyMaterial) {
    scenarios.push({
      label: `${stage.metallurgyMaterial.name} 사용`,
      description: '야금술만 추가',
      cost: perAttemptBaseCost + metallurgyCost,
      successRate: metallurgyRate,
    });
  }

  // 19-20단계용 강화 야금술/재봉술 (보너스 2배)
  if (stage.enhancedMetallurgyMaterial) {
    const enhancedMetallurgyRate = clampRate(baseRate + bonusRate * 2);
    scenarios.push({
      label: `${stage.enhancedMetallurgyMaterial.name} 사용`,
      description: '강화 야금술/재봉술만 추가',
      cost: perAttemptBaseCost + enhancedMetallurgyCost,
      successRate: enhancedMetallurgyRate,
    });
  }

  if (stage.breathMaterial && stage.metallurgyMaterial) {
    scenarios.push({
      label: `${stage.breathMaterial.name} & ${stage.metallurgyMaterial.name}`,
      description: '숨결과 야금술 모두 추가',
      cost: perAttemptBaseCost + breathCost + metallurgyCost,
      successRate: bothRate,
    });
  }

  // 19-20단계용 강화 야금술/재봉술 + 숨결 (보너스: 숨결 +1x, 강화 야금술/재봉술 +2x)
  if (stage.breathMaterial && stage.enhancedMetallurgyMaterial) {
    const enhancedBothRate = clampRate(baseRate + bonusRate + bonusRate * 2);
    scenarios.push({
      label: `${stage.breathMaterial.name} & ${stage.enhancedMetallurgyMaterial.name}`,
      description: '숨결과 강화 야금술/재봉술 모두 추가',
      cost: perAttemptBaseCost + breathCost + enhancedMetallurgyCost,
      successRate: enhancedBothRate,
    });
  }

  return {
    scenarios,
    baseCostBreakdown,
    oneTimeCost,
    optionalCosts,
  };
}

function ItemIcon({ name, icon }: { name: string; icon?: string | null }) {
  const fallback = FALLBACK_ICON[name] || '📦';
  // icon이 없거나 빈 문자열이면 fallback 사용
  if (!icon || icon.trim() === '') {
    return <span className="w-6 h-6 flex items-center justify-center text-lg">{fallback}</span>;
  }
  return (
    <img 
      src={icon} 
      alt={name} 
      className="w-6 h-6 object-contain" 
      onError={(e) => {
        // 이미지 로드 실패 시 fallback으로 교체
        const target = e.target as HTMLImageElement;
        const parent = target.parentElement;
        if (parent) {
          target.style.display = 'none';
          if (!parent.querySelector('.fallback-icon')) {
            const fallbackSpan = document.createElement('span');
            fallbackSpan.className = 'w-6 h-6 flex items-center justify-center text-lg fallback-icon';
            fallbackSpan.textContent = fallback;
            parent.appendChild(fallbackSpan);
          }
        }
      }} 
    />
  );
}

type StageCardProps = {
  stage: RefiningStage;
  marketInfo: Record<string, MarketItemInfo>;
  sillingUnitPrice: number;
  selectedTier: 'basic' | 'upper';
  allStages?: RefiningStage[]; // 이전 단계 아이템 레벨 계산을 위한 전체 stages 배열
};

function StageCard({ stage, marketInfo, sillingUnitPrice, selectedTier, allStages }: StageCardProps) {
  const { adjustPrice } = usePriceAdjustment();
  
  // 이전 단계의 아이템 레벨 계산
  const prevItemLevel = useMemo(() => {
    if (allStages) {
      const prevStage = allStages.find(s => s.level === stage.level - 1);
      if (prevStage?.itemLevel != null) {
        return prevStage.itemLevel;
      }
    }
    // 이전 단계가 없으면 현재 단계에서 5를 빼서 추정 (일반적으로 5씩 증가)
    return stage.itemLevel != null ? stage.itemLevel - 5 : null;
  }, [stage, allStages]);
  
  // 가격 조정이 적용된 marketInfo 생성
  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    // 실링의 unitPrice를 동적으로 계산된 값으로 설정 (항상 포함)
    adjusted['실링'] = {
      unitPrice: sillingUnitPrice,
      icon: marketInfo['실링']?.icon || FALLBACK_ICON[SILVER_ITEM] || null,
    };
    console.log('[StageCard] adjustedMarketInfo 실링:', adjusted['실링'], 'sillingUnitPrice:', sillingUnitPrice);
    return adjusted;
  }, [marketInfo, adjustPrice, sillingUnitPrice]);

  const { scenarios, baseCostBreakdown, oneTimeCost, optionalCosts } = useMemo(
    () => calculateScenarioSummaries(stage, adjustedMarketInfo),
    [stage, adjustedMarketInfo]
  );

  const { optimalStrategy, baseStrategy, fullBreathStrategy, fullMetallurgyStrategy, fullEnhancedMetallurgyStrategy, fullBothStrategy, materialValueAnalysis } = useMemo(
    () => calculateOptimalStrategy(stage, adjustedMarketInfo),
    [stage, adjustedMarketInfo]
  );

  const [showOptimization, setShowOptimization] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);

  const goldLine: CostLine = {
    name: GOLD_ITEM,
    quantity: stage.goldCost,
    unitPrice: adjustedMarketInfo[GOLD_ITEM]?.unitPrice ?? 1,
    totalPrice: stage.goldCost * (adjustedMarketInfo[GOLD_ITEM]?.unitPrice ?? 1),
    icon: adjustedMarketInfo[GOLD_ITEM]?.icon,
  };

  const silverLine: CostLine = {
    name: SILVER_ITEM,
    quantity: stage.silverCost,
    unitPrice: adjustedMarketInfo[SILVER_ITEM]?.unitPrice ?? 0,
    totalPrice: stage.silverCost * (adjustedMarketInfo[SILVER_ITEM]?.unitPrice ?? 0),
    icon: adjustedMarketInfo[SILVER_ITEM]?.icon ?? null,
  };

  const essentialLeft = baseCostBreakdown.filter(item => item.name !== GOLD_ITEM && item.name !== SILVER_ITEM);
  const essentialRight: CostLine[] = [];
  // 실링 수량이 있으면 항상 표시 (가격 조정으로 0이 되어도 수량은 표시)
  if (stage.silverCost > 0) {
    essentialRight.push(silverLine);
  }
  essentialRight.push(goldLine);

  // 무기/방어구 구분 및 최적 전략 요약
  const isWeapon = stage.breathMaterial?.name === '용암의 숨결' || stage.metallurgyMaterial?.name?.includes('야금술') || false;
  const breathName = isWeapon ? '용암의 숨결' : '빙하의 숨결';
  const craftName = isWeapon ? '야금술' : '재봉술';
  
  // description에서 숨결과 야금술 정보 추출
  const parseStrategyDescription = (description: string) => {
    const breathMatch = description.match(/숨결\s*(모두\s*투입|(\d+)회까지\s*투입)/);
    const metallurgyMatch = description.match(/야금술\s*(모두\s*투입|(\d+)회까지\s*투입)/);
    
    const breathText = breathMatch ? (breathMatch[1] === '모두 투입' ? '모두 투입' : `${breathMatch[2]}회까지 투입`) : null;
    const metallurgyText = metallurgyMatch ? (metallurgyMatch[1] === '모두 투입' ? '모두 투입' : `${metallurgyMatch[2]}회까지 투입`) : null;
    
    return { breathText, metallurgyText };
  };
  
  const { breathText, metallurgyText } = parseStrategyDescription(optimalStrategy.description);
  const breathStatus = breathText || (optimalStrategy.breathAttempts > 0 ? '투입' : '투입 안함');
  const craftStatus = metallurgyText || (optimalStrategy.metallurgyAttempts > 0 ? `${optimalStrategy.metallurgyAttempts}회 투입` : '투입 안함');

  // 강화 야금술/재봉술 (19-20단계)
  const enhancedCraftName = isWeapon ? '강화 야금술' : '강화 재봉술';
  const hasEnhancedOption = !!stage.enhancedMetallurgyMaterial;
  const enhancedUsed = hasEnhancedOption && /강화\s*(야금술|재봉술)/.test(optimalStrategy.description);
  const enhancedStatus = enhancedUsed ? '투입' : '투입 안함';

  return (
    <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white">
              {stage.level - 1} → {stage.level} 재련
              {prevItemLevel != null && stage.itemLevel != null && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  ({prevItemLevel} → {stage.itemLevel})
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-300 mt-1">기본 성공률: {formatRate(stage.baseSuccessRate)}</p>
          </div>
          {/* 최적 재련 전략 요약 */}
          <div className="flex flex-col items-end gap-2 md:min-w-[280px]">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60 border ${optimalStrategy.breathAttempts > 0 ? 'border-blue-500/50' : 'border-gray-700/50'}`}>
              <span className="text-xs text-gray-400">{breathName}</span>
              <span className={`text-sm font-semibold ${optimalStrategy.breathAttempts > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                {breathStatus}
              </span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60 border ${optimalStrategy.metallurgyAttempts > 0 ? 'border-purple-500/50' : 'border-gray-700/50'}`}>
              <span className="text-xs text-gray-400">{craftName}</span>
              <span className={`text-sm font-semibold ${optimalStrategy.metallurgyAttempts > 0 ? 'text-purple-400' : 'text-gray-500'}`}>
                {craftStatus}
              </span>
            </div>
            {hasEnhancedOption && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/60 border ${enhancedUsed ? 'border-amber-500/50' : 'border-gray-700/50'}`}>
                <span className="text-xs text-gray-400">{enhancedCraftName}</span>
                <span className={`text-sm font-semibold ${enhancedUsed ? 'text-amber-400' : 'text-gray-500'}`}>
                  {enhancedStatus}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {oneTimeCost && (
          <div>
            <h4 className="text-xs font-semibold text-purple-200 mb-2">경험치 재료 (첫 시도 1회)</h4>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-3">
              <MaterialLine data={oneTimeCost} selectedTier={selectedTier} />
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-purple-200 mb-2">필수 재료 (시도당)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {essentialLeft.map(item => (
                <MaterialLine key={item.name} data={item} selectedTier={selectedTier} />
              ))}
              {essentialLeft.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-400">표시할 재료가 없습니다.</div>
              )}
            </div>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {essentialRight.map(item => (
                <MaterialLine key={item.name} data={item} selectedTier={selectedTier} />
              ))}
            </div>
          </div>
        </div>

        {optionalCosts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-purple-200 mb-2">보조 재료 (선택)</h4>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {optionalCosts.map(item => (
                <MaterialLine key={item.name} data={item} selectedTier={selectedTier} />
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-purple-200 mb-2">1회 시도 비용 요약 (경험치 제외)</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-800 text-xs">
              <thead>
                <tr className="bg-gray-900/90 text-gray-200">
                  <th className="px-3 py-2 text-left font-medium">구분</th>
                  <th className="px-3 py-2 text-left font-medium">설명</th>
                  <th className="px-3 py-2 text-center font-medium">성공률</th>
                  <th className="px-3 py-2 text-right font-medium">총 비용</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr key={scenario.label} className="border-t border-gray-800">
                    <td className="px-3 py-2 text-white font-medium">{scenario.label}</td>
                    <td className="px-3 py-2 text-gray-300">{scenario.description}</td>
                    <td className="px-3 py-2 text-center text-blue-300">{formatRate(scenario.successRate)}</td>
                    <td className="px-3 py-2 text-right text-green-300">{formatCost(scenario.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-purple-200">재료 사용 최적화</h4>
            <button
              onClick={() => setShowOptimization(!showOptimization)}
              className="px-3 py-1 bg-purple-700/40 hover:bg-purple-700/60 text-white text-xs rounded-lg"
            >
              {showOptimization ? '숨기기' : '자세히 보기'}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-4 space-y-2">
              <h5 className="text-sm font-semibold text-white">{baseStrategy.label}</h5>
              <p className="text-xs text-gray-400">{baseStrategy.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">예상 비용:</span>
                  <span className="text-green-300 font-medium">{formatCost(baseStrategy.expectedCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">평균 시도 횟수:</span>
                  <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(baseStrategy.averageAttempts)}회</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/80 rounded-lg border border-purple-600 p-4 space-y-2">
              <h5 className="text-sm font-semibold text-purple-300">{optimalStrategy.label}</h5>
              <p className="text-xs text-gray-400">{optimalStrategy.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">예상 비용:</span>
                  <span className="text-green-300 font-medium">{formatCost(optimalStrategy.expectedCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">평균 시도 횟수:</span>
                  <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(optimalStrategy.averageAttempts)}회</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-gray-300">기본 대비:</span>
                  {(() => {
                    const diff = optimalStrategy.expectedCost - baseStrategy.expectedCost;
                    if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                    const sign = diff > 0 ? '+' : '-';
                    const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                    return (
                      <span className={`${color} font-medium`}>
                        {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {(fullBreathStrategy || fullMetallurgyStrategy || fullEnhancedMetallurgyStrategy || fullBothStrategy) && (
            <div className="mt-3">
              <h5 className="text-xs font-semibold text-purple-200 mb-2">기타 전략</h5>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${stage.enhancedMetallurgyMaterial ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
                {fullBreathStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-orange-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-orange-200">{fullBreathStrategy.label}</div>
                    <div className="text-gray-400">{fullBreathStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullBreathStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullBreathStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullBreathStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {fullMetallurgyStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-cyan-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-cyan-200">{fullMetallurgyStrategy.label}</div>
                    <div className="text-gray-400">{fullMetallurgyStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullMetallurgyStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullMetallurgyStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullMetallurgyStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {fullEnhancedMetallurgyStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-purple-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-purple-200">{fullEnhancedMetallurgyStrategy.label}</div>
                    <div className="text-gray-400">{fullEnhancedMetallurgyStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullEnhancedMetallurgyStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullEnhancedMetallurgyStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullEnhancedMetallurgyStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {fullBothStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-indigo-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-indigo-200">{fullBothStrategy.label}</div>
                    <div className="text-gray-400">{fullBothStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullBothStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullBothStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullBothStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {materialValueAnalysis && (
            <div className="mt-3 bg-gray-900/80 rounded-lg border border-gray-800 p-4">
              <h5 className="text-xs font-semibold text-purple-200 mb-3">보조 재료 가치 분석</h5>
              <div className="space-y-3 text-xs">
                {[materialValueAnalysis.breath, materialValueAnalysis.metallurgy, materialValueAnalysis.enhancedMetallurgy]
                  .filter((insight): insight is MaterialValueInsight => insight !== null)
                  .map((insight) => {
                  const totalAmount = insight.usedCount * insight.quantityPerUse;
                  const usageText = !insight.available
                    ? '사용 불가'
                    : insight.usedCount > 0
                      ? `사용 횟수: ${formatNumberWithSignificantDigits(insight.usedCount)}회${insight.quantityPerUse > 0 ? ` (총 ${formatNumberWithSignificantDigits(totalAmount)}개)` : ''}`
                      : '사용하지 않음';

                  const basisLabel = !insight.available || insight.basis === 'none'
                    ? ''
                    : insight.basis === 'optimal'
                      ? '기준: 최적 전략'
                      : '기준: 풀 전략';

                  const marketText = insight.marketPrice > 0
                    ? `${formatNumberWithSignificantDigits(insight.marketPrice)} 골드`
                    : '-';

                  const actualText = insight.actualValuePerItem !== null
                    ? `${formatNumberWithSignificantDigits(insight.actualValuePerItem)} 골드`
                    : '-';

                  const diff = insight.diffFromMarket;
                  const diffClass = diff === null
                    ? 'text-gray-400'
                    : diff >= 0
                      ? 'text-green-400'
                      : 'text-red-400';
                  const diffText = diff === null
                    ? '-'
                    : `${diff >= 0 ? '+' : '-'}${formatNumberWithSignificantDigits(Math.abs(diff))} 골드`;

                  return (
                    <div key={insight.name} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                      <div>
                        <div className="text-white font-medium">{insight.name}</div>
                        <div className="text-gray-400 text-xs">{usageText}</div>
                        {basisLabel && <div className="text-gray-500 text-xs">{basisLabel}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-gray-300">시장 단가: {marketText}</div>
                        <div className="text-blue-300">체감 가치: {actualText}</div>
                        <div className={diffClass}>차이: {diffText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showOptimization && (
            <div className="mt-3 bg-gray-900/80 rounded-lg border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-xs font-semibold text-purple-200">
                  시도별 시뮬레이션 상세 (총 {optimalStrategy.simulationDetails.length}회)
                </h5>
                {optimalStrategy.simulationDetails.length > 50 && (
                  <button
                    onClick={() => setShowAllDetails(!showAllDetails)}
                    className="px-2 py-1 bg-indigo-700/40 hover:bg-indigo-700/60 text-white text-xs rounded"
                  >
                    {showAllDetails ? '처음 50개만 보기' : '전체 보기'}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full text-xs border border-gray-700">
                  <thead className="bg-gray-900/90 text-gray-200 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-center">회차</th>
                      <th className="px-2 py-1 text-center">전략</th>
                      <th className="px-2 py-1 text-center">성공률</th>
                      <th className="px-2 py-1 text-center">장인의 기운</th>
                      <th className="px-2 py-1 text-right">비용</th>
                      <th className="px-2 py-1 text-center">누적 확률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllDetails 
                      ? optimalStrategy.simulationDetails 
                      : optimalStrategy.simulationDetails.slice(0, 50)
                    ).map((detail) => (
                      <tr key={detail.attempt} className="border-t border-gray-800">
                        <td className="px-2 py-1 text-center text-white">{detail.attempt}</td>
                        <td className="px-2 py-1 text-center text-gray-300">{detail.strategy}</td>
                        <td className="px-2 py-1 text-center text-blue-300">{formatRate(detail.actualRate)}</td>
                        <td className="px-2 py-1 text-center text-purple-300">{detail.artisanEnergy.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-green-300">{formatCost(detail.cost)}</td>
                        <td className="px-2 py-1 text-center text-yellow-300">{formatNumberWithSignificantDigits(detail.cumulativeProbability * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialLine({
  data,
  selectedTier,
}: {
  data: CostLine;
  selectedTier?: 'basic' | 'upper';
}) {
  // 세르카 장비일 때 재료 이름 변경
  const getDisplayName = (name: string) => {
    if (selectedTier === 'upper') {
      const nameMap: Record<string, string> = {
        '운명의 파괴석': '운명의 파괴석 결정',
        '운명의 수호석': '운명의 수호석 결정',
        '운명의 돌파석': '위대한 운명의 돌파석',
        '아비도스 융화 재료': '상급 아비도스 융화 재료',
      };
      return nameMap[name] || name;
    }
    return name;
  };

  const displayName = getDisplayName(data.name);
  const quantityText = formatNumberWithSignificantDigits(data.quantity);
  const isSilver = data.name === SILVER_ITEM;
  const isGold = data.name === GOLD_ITEM;
  const unitText = data.unitPrice > 0
    ? `${formatNumberWithSignificantDigits(data.unitPrice)} 골드`
    : '-';
  const totalText = data.totalPrice > 0
    ? `${formatNumberWithSignificantDigits(data.totalPrice)} 골드`
    : '-';
  const iconUrl = data.icon;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-white">
        {isGold || isSilver ? null : <ItemIcon name={displayName} icon={iconUrl} />}
        <span className="font-medium">{displayName}</span>
      </div>
      <div className="flex flex-col text-right text-xs text-gray-300">
        <span>
          수량: {quantityText}
          {isGold ? ' 골드' : ''}
          {isSilver ? ' 실링' : ''}
        </span>
        {!isGold && (
          <>
            <span>단가: {unitText}</span>
            <span>합계: {totalText}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function RefiningSimulationClient({ weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, marketInfo, lastUpdated, silverCashValue, initialRates, initialCrystalGoldRate }: Props) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  
  console.log('[일반 재련 클라이언트] 초기화:', { silverCashValue, initialRates, initialCrystalGoldRate });
  
  // 디코기준 스위치 상태 및 환율 정보
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(initialRates?.discord ?? null);
  const [crystalGoldRate, setCrystalGoldRate] = useState<number | null>(initialCrystalGoldRate ?? null);

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

  // 환율 정보 업데이트 (서버에서 초기값을 받았지만, 클라이언트에서도 주기적으로 업데이트 가능)
  useEffect(() => {
    async function fetchRates() {
      try {
        // 디스코드 환율 (서버에서 받지 못한 경우에만)
        if (!discordRate) {
          const discordRes = await fetch('/api/admin/crystal-gold');
          const discordData = await discordRes.json();
          const rates = discordData.exchangeRates || [];
          if (rates.length > 0) {
            const latest = rates[rates.length - 1];
            const rate = latest.discord || null;
            console.log('[일반 재련] 디스코드 환율 (클라이언트):', rate);
            setDiscordRate(rate);
          }
        }
        
        // 크리스탈-골드 환율 (서버에서 받지 못한 경우에만)
        if (!crystalGoldRate) {
          const crystalRes = await fetch('/api/crystal-gold');
          const crystalData = await crystalRes.json();
          if (crystalData.rate) {
            console.log('[일반 재련] 크리스탈-골드 환율 (클라이언트):', crystalData.rate);
            setCrystalGoldRate(crystalData.rate);
          }
        }
      } catch (error) {
        console.error('[일반 재련] 환율 정보 조회 실패:', error);
      }
    }
    fetchRates();
  }, [discordRate, crystalGoldRate]);

  // 현금(원) 1원당 골드 계산
  const goldPerWon = useMemo(() => {
    // 디코기준 스위치가 켜져있으면 (lightMode가 false이면 디코기준 ON)
    if (!lightMode && discordRate && discordRate > 0) {
      // 디스코드 환율 = 100 : n
      // 1원당 골드 = 100 / n
      return 100 / discordRate;
    }
    
    // 디코기준 스위치가 꺼져있으면 크리스탈 환율 사용
    if (crystalGoldRate && crystalGoldRate > 0) {
      // 크리스탈 1개당 골드 = crystalGoldRate / 100 (100크리당 골드를 1크리당으로)
      // 2750원 = 100크리
      // 1원 = 100/2750 크리
      // 1원당 골드 = (100/2750) * (crystalGoldRate/100)
      return (crystalGoldRate / 2750);
    }
    return null;
  }, [lightMode, discordRate, crystalGoldRate]);

  // 실링 1개당 골드 가치 계산 (가격 조정 적용 전)
  const baseSillingUnitPrice = useMemo(() => {
    if (silverCashValue != null && goldPerWon != null) {
      const result = silverCashValue * goldPerWon;
      console.log('[일반 재련] 실링 1개당 골드 가치 (기본):', result);
      return result;
    }
    console.log('[일반 재련] 실링 가치 계산 실패 - 기본값 0 반환');
    return 0; // 기본값
  }, [silverCashValue, goldPerWon, lightMode, discordRate, crystalGoldRate]);

  // 실링 1개당 골드 가치 계산 (가격 조정 적용)
  const sillingUnitPrice = useMemo(() => {
    const adjusted = adjustPrice('실링', baseSillingUnitPrice);
    console.log('[일반 재련] 실링 1개당 골드 가치 (조정 후):', adjusted, 'ignoreSilver:', priceOverrideState.ignoreSilver);
    return adjusted ?? 0;
  }, [baseSillingUnitPrice, adjustPrice, priceOverrideState.ignoreSilver]);
  
  // 가격 조정이 적용된 marketInfo 생성 (요약표와 특수재련효율에서 사용)
  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    // 실링의 unitPrice를 동적으로 계산된 값으로 설정 (항상 포함)
    adjusted['실링'] = {
      unitPrice: sillingUnitPrice,
      icon: marketInfo['실링']?.icon || FALLBACK_ICON[SILVER_ITEM] || null,
    };
    console.log('[일반 재련] adjustedMarketInfo 실링:', adjusted['실링'], 'sillingUnitPrice:', sillingUnitPrice);
    return adjusted;
  }, [marketInfo, adjustPrice, sillingUnitPrice]);

  const [activeSubTab, setActiveSubTab] = useState<'simulation' | 'special'>('simulation');
  const [activeSimulationTab, setActiveSimulationTab] = useState<'weapon' | 'armor' | 'summary'>('weapon');
  const [selectedTier, setSelectedTier] = useState<'basic' | 'upper'>('basic');
  const [activeSpecialTab, setActiveSpecialTab] = useState<'circular' | 'transition'>('circular');
  const [summaryEquipmentType, setSummaryEquipmentType] = useState<'kazeros' | 'serka'>('kazeros');
  
  // selectedTier에 따라 적절한 stages 선택
  const currentStages = useMemo(() => {
    if (activeSimulationTab === 'weapon') {
      return selectedTier === 'upper' ? weaponStagesSerka : weaponStages;
    } else if (activeSimulationTab === 'armor') {
      return selectedTier === 'upper' ? armorStagesSerka : armorStages;
    }
    return [];
  }, [activeSimulationTab, selectedTier, weaponStages, armorStages, weaponStagesSerka, armorStagesSerka]);
  
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>(currentStages[0]?.level ?? 'all');
  
  // 탭 변경 시 selectedLevel 업데이트
  useEffect(() => {
    if (currentStages.length > 0 && activeSimulationTab !== 'summary') {
      setSelectedLevel(currentStages[0]?.level ?? 'all');
    }
  }, [activeSimulationTab, currentStages]);
  
  const options = useMemo(() => currentStages.map(stage => stage.level), [currentStages]);
  const filteredStages = useMemo(() => {
    if (selectedLevel === 'all') return currentStages;
    return currentStages.filter(stage => stage.level === selectedLevel);
  }, [selectedLevel, currentStages]);

  // 탭 변경 시 selectedLevel 초기화
  const handleSimulationTabChange = (tab: 'weapon' | 'armor' | 'summary') => {
    setActiveSimulationTab(tab);
  };

  // 요약표 데이터 계산 (카제로스 장비)
  const summaryDataKazeros = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStages.map(s => s.level), ...armorStages.map(s => s.level)])).sort((a, b) => a - b);
    
    return allLevels.map(level => {
      const weaponStage = weaponStages.find(s => s.level === level);
      const armorStage = armorStages.find(s => s.level === level);
      
      let weaponCost: number | null = null;
      let weaponStrategy: string = '-';
      let armorCost: number | null = null;
      let armorStrategy: string = '-';
      
      // 아이템 레벨 정보 (무기와 방어구 중 하나라도 있으면 사용)
      const weaponItemLevel = weaponStage?.itemLevel ?? null;
      const armorItemLevel = armorStage?.itemLevel ?? null;
      const itemLevel = weaponItemLevel ?? armorItemLevel;
      
      // 이전 단계의 아이템 레벨 계산
      const prevLevel = level - 1;
      const prevWeaponStage = weaponStages.find(s => s.level === prevLevel);
      const prevArmorStage = armorStages.find(s => s.level === prevLevel);
      const prevWeaponItemLevel = prevWeaponStage?.itemLevel ?? null;
      const prevArmorItemLevel = prevArmorStage?.itemLevel ?? null;
      const prevItemLevel = prevWeaponItemLevel ?? prevArmorItemLevel;
      
      // 이전 단계가 없으면 현재 단계에서 5를 빼서 추정 (일반적으로 5씩 증가)
      const estimatedPrevItemLevel = prevItemLevel ?? (itemLevel != null ? itemLevel - 5 : null);
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        weaponCost = optimalStrategy.expectedCost;
        weaponStrategy = getDetailedStrategyLabel(optimalStrategy, weaponStage, 'weapon');
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        armorCost = optimalStrategy.expectedCost;
        armorStrategy = getDetailedStrategyLabel(optimalStrategy, armorStage, 'armor');
      }
      
      const totalCost = weaponCost != null && armorCost != null 
        ? weaponCost + (armorCost * 5)
        : null;
      
      return {
        level,
        itemLevel,
        prevItemLevel: estimatedPrevItemLevel,
        weaponCost,
        weaponStrategy,
        armorCost,
        armorStrategy,
        totalCost,
      };
    });
  }, [weaponStages, armorStages, adjustedMarketInfo]);

  // 요약표 데이터 계산 (세르카 장비)
  const summaryDataSerka = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStagesSerka.map(s => s.level), ...armorStagesSerka.map(s => s.level)])).sort((a, b) => a - b);
    
    return allLevels.map(level => {
      const weaponStage = weaponStagesSerka.find(s => s.level === level);
      const armorStage = armorStagesSerka.find(s => s.level === level);
      
      let weaponCost: number | null = null;
      let weaponStrategy: string = '-';
      let armorCost: number | null = null;
      let armorStrategy: string = '-';
      
      // 아이템 레벨 정보 (무기와 방어구 중 하나라도 있으면 사용)
      const weaponItemLevel = weaponStage?.itemLevel ?? null;
      const armorItemLevel = armorStage?.itemLevel ?? null;
      const itemLevel = weaponItemLevel ?? armorItemLevel;
      
      // 이전 단계의 아이템 레벨 계산
      const prevLevel = level - 1;
      const prevWeaponStage = weaponStagesSerka.find(s => s.level === prevLevel);
      const prevArmorStage = armorStagesSerka.find(s => s.level === prevLevel);
      const prevWeaponItemLevel = prevWeaponStage?.itemLevel ?? null;
      const prevArmorItemLevel = prevArmorStage?.itemLevel ?? null;
      const prevItemLevel = prevWeaponItemLevel ?? prevArmorItemLevel;
      
      // 이전 단계가 없으면 현재 단계에서 5를 빼서 추정 (일반적으로 5씩 증가)
      const estimatedPrevItemLevel = prevItemLevel ?? (itemLevel != null ? itemLevel - 5 : null);
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        weaponCost = optimalStrategy.expectedCost;
        weaponStrategy = getDetailedStrategyLabel(optimalStrategy, weaponStage, 'weapon');
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        armorCost = optimalStrategy.expectedCost;
        armorStrategy = getDetailedStrategyLabel(optimalStrategy, armorStage, 'armor');
      }
      
      const totalCost = weaponCost != null && armorCost != null 
        ? weaponCost + (armorCost * 5)
        : null;
      
      return {
        level,
        itemLevel,
        prevItemLevel: estimatedPrevItemLevel,
        weaponCost,
        weaponStrategy,
        armorCost,
        armorStrategy,
        totalCost,
      };
    });
  }, [weaponStagesSerka, armorStagesSerka, adjustedMarketInfo]);

  // 선택된 장비 타입에 따른 요약표 데이터
  const summaryData = useMemo(() => {
    return summaryEquipmentType === 'kazeros' ? summaryDataKazeros : summaryDataSerka;
  }, [summaryEquipmentType, summaryDataKazeros, summaryDataSerka]);

  // 특수재련효율 데이터 계산 (순환 돌파석)
  const specialRefiningData = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStages.map(s => s.level), ...armorStages.map(s => s.level)])).sort((a, b) => a - b);
    
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
    
    return allLevels.map((level, idx) => {
      const weaponStage = weaponStages.find(s => s.level === level);
      const armorStage = armorStages.find(s => s.level === level);
      
      let weaponValue: number | null = null;
      let armorValue: number | null = null;
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        const expInfo = weaponStage.expMaterial ? (adjustedMarketInfo[weaponStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = weaponStage.expMaterial && expInfo
          ? expInfo.unitPrice * weaponStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = weaponStage.baseSuccessRate / 100; // 퍼센트를 소수로 변환
        const stoneCount = getBreakthroughStoneCount(level, 'weapon');
        
        if (stoneCount > 0) {
          weaponValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        const expInfo = armorStage.expMaterial ? (adjustedMarketInfo[armorStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = armorStage.expMaterial && expInfo
          ? expInfo.unitPrice * armorStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = armorStage.baseSuccessRate / 100; // 퍼센트를 소수로 변환
        const stoneCount = getBreakthroughStoneCount(level, 'armor');
        
        if (stoneCount > 0) {
          armorValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      return {
        level,
        idx,
        weaponValue,
        armorValue,
      };
    });
  }, [weaponStages, armorStages, adjustedMarketInfo]);

  // 특수재련효율 데이터 계산 (전이 돌파석 - 세르카 장비)
  const specialRefiningDataSerka = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStagesSerka.map(s => s.level), ...armorStagesSerka.map(s => s.level)])).sort((a, b) => a - b);
    
    // 전이 돌파석 소모 개수 계산
    const getTransitionStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
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
    };
    
    return allLevels.map((level, idx) => {
      const weaponStage = weaponStagesSerka.find(s => s.level === level);
      const armorStage = armorStagesSerka.find(s => s.level === level);
      
      let weaponValue: number | null = null;
      let armorValue: number | null = null;
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        const expInfo = weaponStage.expMaterial ? (adjustedMarketInfo[weaponStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = weaponStage.expMaterial && expInfo
          ? expInfo.unitPrice * weaponStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = weaponStage.baseSuccessRate / 100;
        const stoneCount = getTransitionStoneCount(level, 'weapon');
        
        if (stoneCount > 0) {
          weaponValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        const expInfo = armorStage.expMaterial ? (adjustedMarketInfo[armorStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = armorStage.expMaterial && expInfo
          ? expInfo.unitPrice * armorStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = armorStage.baseSuccessRate / 100;
        const stoneCount = getTransitionStoneCount(level, 'armor');
        
        if (stoneCount > 0) {
          armorValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      return {
        level,
        idx,
        weaponValue,
        armorValue,
      };
    });
  }, [weaponStagesSerka, armorStagesSerka, adjustedMarketInfo]);

  // 전략 라벨을 간단한 형태로 변환
  function getStrategyLabel(description: string, stage: RefiningStage): string {
    if (description.includes('보조 재료 미사용') || description.includes('기본 전략과 동일')) {
      return '기본';
    }
    
    // 새로운 표기 형식 파싱: "숨결 모두 투입", "숨결 n회까지 투입" 등
    const breathAllMatch = description.match(/숨결\s*모두\s*투입/);
    const metallurgyAllMatch = description.match(/야금술\s*모두\s*투입/);
    const breathPartialMatch = description.match(/숨결\s*(\d+)회까지\s*투입/);
    const metallurgyPartialMatch = description.match(/야금술\s*(\d+)회까지\s*투입/);
    
    // 둘 다 모두 투입
    if (breathAllMatch && metallurgyAllMatch) {
      return '풀숨&풀책';
    }
    
    // 숨결만 모두 투입
    if (breathAllMatch && !metallurgyAllMatch && !metallurgyPartialMatch) {
      return '풀숨';
    }
    
    // 야금술만 모두 투입
    if (metallurgyAllMatch && !breathAllMatch && !breathPartialMatch) {
      return '풀책';
    }
    
    // 둘 다 일부 투입
    if (breathPartialMatch && metallurgyPartialMatch) {
      return '숨결&야금술';
    }
    
    // 숨결만 일부 투입
    if (breathPartialMatch && !metallurgyPartialMatch && !metallurgyAllMatch) {
      return '숨결';
    }
    
    // 야금술만 일부 투입
    if (metallurgyPartialMatch && !breathPartialMatch && !breathAllMatch) {
      return '야금술';
    }
    
    // 레거시 형식 지원 (하위 호환성)
    if (description.includes('모든 회차에 숨결과 야금술')) {
      return '풀숨&풀책';
    }
    if (description.includes('모든 회차에 숨결')) {
      return '풀숨';
    }
    if (description.includes('모든 회차에 야금술')) {
      return '풀책';
    }
    
    // 레거시 숫자 형식
    if (description.includes('숨결') && description.includes('야금술')) {
      const breathMatch = description.match(/숨결\s*(\d+)/);
      const metallurgyMatch = description.match(/야금술\s*(\d+)/);
      if (breathMatch && metallurgyMatch) {
        return '숨결&야금술';
      }
    }
    if (description.includes('숨결')) {
      return '숨결';
    }
    if (description.includes('야금술')) {
      return '야금술';
    }
    
    return '기본';
  }

  // 상세한 전략 라벨 생성 (요약표용)
  function getDetailedStrategyLabel(strategy: StrategySummary, stage: RefiningStage, type: 'weapon' | 'armor'): string {
    if (strategy.breathAttempts === 0 && strategy.metallurgyAttempts === 0) {
      return '기본';
    }

    const breathName = type === 'weapon' ? '숨결' : (stage.breathMaterial?.name.includes('빙하') ? '숨결' : '숨결');
    const craftName = type === 'weapon' ? '야금술' : '재봉술';

    // description에서 정보 추출 (새로운 표기 형식)
    const breathAllMatch = strategy.description.match(/숨결\s*모두\s*투입/);
    const metallurgyAllMatch = strategy.description.match(/야금술\s*모두\s*투입/);
    const breathPartialMatch = strategy.description.match(/숨결\s*(\d+)회까지\s*투입/);
    const metallurgyPartialMatch = strategy.description.match(/야금술\s*(\d+)회까지\s*투입/);

    const parts: string[] = [];

    if (strategy.breathAttempts > 0) {
      if (breathAllMatch) {
        parts.push(`${breathName} 모두 투입`);
      } else if (breathPartialMatch) {
        parts.push(`${breathName} ${breathPartialMatch[1]}회까지 투입`);
      } else {
        // 레거시 형식 지원
        const maxAttempts = 500;
        if (strategy.breathAttempts >= maxAttempts) {
          parts.push(`${breathName} 모두 투입`);
        } else {
          parts.push(`${breathName} ${strategy.breathAttempts}회까지 투입`);
        }
      }
    }

    if (strategy.metallurgyAttempts > 0) {
      if (metallurgyAllMatch) {
        parts.push(`${craftName} 모두 투입`);
      } else if (metallurgyPartialMatch) {
        parts.push(`${craftName} ${metallurgyPartialMatch[1]}회까지 투입`);
      } else {
        // 레거시 형식 지원
        const maxAttempts = 500;
        if (strategy.metallurgyAttempts >= maxAttempts) {
          parts.push(`${craftName} 모두 투입`);
        } else {
          parts.push(`${craftName} ${strategy.metallurgyAttempts}회까지 투입`);
        }
      }
    }

    return parts.length > 0 ? parts.join(', ') : '기본';
  }

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="space-y-8">
        <header className="space-y-3 mb-8">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">재련 효율</h1>
            <FavoriteButton title="일반 재련" />
          </div>
          {lastUpdated && (
            <p className="text-xs text-gray-500">시세 기준 시각: {new Date(lastUpdated).toLocaleString('ko-KR')}</p>
          )}
        </header>

        {/* 서브탭 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setActiveSubTab('simulation')}
            className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
              activeSubTab === 'simulation'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
            }`}
          >
            재련 시뮬레이션
          </button>
                  <button
                    onClick={() => setActiveSubTab('special')}
            className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
                      activeSubTab === 'special'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
                    }`}
                  >
                    특수 재련 효율
                  </button>
                  </div>

        {/* 서브탭 콘텐츠 */}
        {activeSubTab === 'simulation' && (
          <div className="space-y-8">
            {/* 재련 시뮬레이션 서브서브탭 */}
            <div className="flex gap-2 border-b border-gray-700">
              <button
                onClick={() => handleSimulationTabChange('weapon')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'weapon'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                무기
              </button>
              <button
                onClick={() => handleSimulationTabChange('armor')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'armor'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                방어구
              </button>
              <button
                onClick={() => handleSimulationTabChange('summary')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                요약표
              </button>
            </div>

            {/* 무기 탭 콘텐츠 */}
            {activeSimulationTab === 'weapon' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    목표 재련 수치별 필요 재료와 1회 시도 비용을 계산합니다. 보조 재료 사용 시 성공률 증가 효과와 비용 변화를 함께 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="tier-select" className="text-sm text-gray-300">등급 선택</label>
                    <select
                      id="tier-select"
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTier(e.target.value as 'basic' | 'upper');
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="basic">카제로스 장비</option>
                      <option value="upper">세르카 장비</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="refine-level" className="text-sm text-gray-300">재련 단계 선택</label>
                  <select
                    id="refine-level"
                    value={selectedLevel === 'all' ? 'all' : String(selectedLevel)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedLevel(value === 'all' ? 'all' : Number(value));
                    }}
                    className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">전체 보기</option>
                    {options.map(level => (
                        <option key={level} value={level}>{level - 1} → {level}</option>
                    ))}
                  </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {filteredStages.map(stage => (
                    <StageCard key={stage.level} stage={stage} marketInfo={marketInfo} sillingUnitPrice={sillingUnitPrice} selectedTier={selectedTier} allStages={currentStages} />
                  ))}
                </div>
              </div>
            )}

            {/* 방어구 탭 콘텐츠 */}
            {activeSimulationTab === 'armor' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    목표 재련 수치별 필요 재료와 1회 시도 비용을 계산합니다. 보조 재료 사용 시 성공률 증가 효과와 비용 변화를 함께 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="tier-select-armor" className="text-sm text-gray-300">등급 선택</label>
                    <select
                      id="tier-select-armor"
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTier(e.target.value as 'basic' | 'upper');
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="basic">카제로스 장비</option>
                      <option value="upper">세르카 장비</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="refine-level-armor" className="text-sm text-gray-300">재련 단계 선택</label>
                  <select
                    id="refine-level-armor"
                    value={selectedLevel === 'all' ? 'all' : String(selectedLevel)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedLevel(value === 'all' ? 'all' : Number(value));
                    }}
                    className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">전체 보기</option>
                    {options.map(level => (
                        <option key={level} value={level}>{level - 1} → {level}</option>
                    ))}
                  </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {filteredStages.map(stage => (
                    <StageCard key={stage.level} stage={stage} marketInfo={marketInfo} sillingUnitPrice={sillingUnitPrice} selectedTier={selectedTier} allStages={currentStages} />
                  ))}
                </div>
              </div>
            )}

            {/* 요약표 탭 콘텐츠 */}
            {activeSimulationTab === 'summary' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    무기와 방어구의 재련 비용을 한눈에 비교할 수 있는 요약표입니다. 6부위 합계는 [무기 재련 비용 + 방어구 재련 비용 × 5]로 계산됩니다.
                  </p>
                </div>

                {/* 장비 타입 선택 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSummaryEquipmentType('kazeros')}
                    className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
                      summaryEquipmentType === 'kazeros'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
                    }`}
                  >
                    카제로스 장비
                  </button>
                  <button
                    onClick={() => setSummaryEquipmentType('serka')}
                    className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
                      summaryEquipmentType === 'serka'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
                    }`}
                  >
                    세르카 장비
                  </button>
                </div>

                {/* 요약표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">목표 재련 단계</th>
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">재련 비용(무기)</th>
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">재련 비용(방어구)</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">6부위 합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.map((row, idx) => (
                          <tr key={row.level} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                              <div>{row.level - 1} → {row.level}강</div>
                              {row.prevItemLevel != null && row.itemLevel != null && (
                                <div className="text-xs text-gray-400 mt-1">
                                  ({row.prevItemLevel} → {row.itemLevel})
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                              {row.weaponCost != null ? (
                                <div>
                                  <div>{formatCost(row.weaponCost)}</div>
                                  <div className="text-xs text-gray-400">(최적 전략: {row.weaponStrategy})</div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                              {row.armorCost != null ? (
                                <div>
                                  <div>{formatCost(row.armorCost)}</div>
                                  <div className="text-xs text-gray-400">(최적 전략: {row.armorStrategy})</div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-green-300 font-medium border-b border-gray-800">
                              {row.totalCost != null ? formatCost(row.totalCost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'special' && (
          <div className="space-y-8">
            {/* 탭 선택 */}
            <div className="flex gap-3">
              <button
                onClick={() => setActiveSpecialTab('circular')}
                className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
                  activeSpecialTab === 'circular'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
                }`}
              >
                순환 돌파석
              </button>
              <button
                onClick={() => setActiveSpecialTab('transition')}
                className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
                  activeSpecialTab === 'transition'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
                }`}
              >
                전이 돌파석
              </button>
            </div>

            {activeSpecialTab === 'circular' && (
              <>
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    순환 돌파석을 사용한 특수 재련의 효율을 계산합니다. 순환 돌파석 1개당 기대 가치를 확인할 수 있습니다.
                  </p>
                </div>

                {/* 특수 재련 효율 표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">목표 재련 단계</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">순환 돌파석 1개당 (무기)</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">순환 돌파석 1개당 (방어구)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {specialRefiningData.map(({ level, idx, weaponValue, armorValue }) => (
                          <tr key={level} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                              {level - 1} → {level}강
                            </td>
                            <td className="px-4 py-3 text-right text-blue-300 border-b border-gray-800">
                              {weaponValue != null ? formatCost(weaponValue) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-purple-300 border-b border-gray-800">
                              {armorValue != null ? formatCost(armorValue) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeSpecialTab === 'transition' && (
              <>
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    전이 돌파석을 사용한 특수 재련의 효율을 계산합니다. 전이 돌파석 1개당 기대 가치를 확인할 수 있습니다. (세르카 장비 기준)
                  </p>
                </div>

                {/* 특수 재련 효율 표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">목표 재련 단계</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">전이 돌파석 1개당 (무기)</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">전이 돌파석 1개당 (방어구)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {specialRefiningDataSerka.map(({ level, idx, weaponValue, armorValue }) => (
                          <tr key={level} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                              {level - 1} → {level}강
                            </td>
                            <td className="px-4 py-3 text-right text-blue-300 border-b border-gray-800">
                              {weaponValue != null ? formatCost(weaponValue) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-purple-300 border-b border-gray-800">
                              {armorValue != null ? formatCost(armorValue) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
