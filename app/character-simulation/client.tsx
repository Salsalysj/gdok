'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { RefiningStage, MarketItemInfo } from './page';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import FavoriteButton from '../components/FavoriteButton';
import simulationDataLevel1 from '@/lib/advancedRefiningData.json';
import simulationDataLevel2 from '@/lib/advancedRefiningData-level2.json';
import simulationDataLevel3 from '@/lib/advancedRefiningData-level3.json';
import simulationDataLevel4 from '@/lib/advancedRefiningData-level4.json';
import type { GearType, RefiningLevel, SimulationResult, ScenarioWithCost } from '@/lib/advancedRefining';
import { getMaterialsForLevel } from '@/lib/advancedRefining';
import type { ValueDbEntry } from '@/lib/valueDb';
import { getAverageConsumptionLines } from '../refining-simulation/client';
import ItemIcon from '../components/ItemIcon';

type CharacterEquipment = {
  Type?: string;
  Name?: string;
  Icon?: string;
  Grade?: string;
  Tooltip?: string | any;
  ItemLevel?: number;
  ItemMaxLevel?: number;
  [key: string]: any;
};

type CharacterArmory = {
  CharacterName?: string;
  CharacterClassName?: string;
  ItemLevel?: string;
  ArmoryEquipment?: CharacterEquipment[];
  Armories?: {
    Equipment?: CharacterEquipment[];
  };
  Equipment?: CharacterEquipment[];
};

type RosterCharacter = {
  CharacterName?: string;
  CharacterClassName?: string;
  ItemAvgLevel?: string;
  ItemLevel?: string;
  ItemMaxLevel?: string;
  ServerName?: string;
  [key: string]: any;
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
  enhancedMetallurgy: MaterialValueInsight | null;
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
      currentBaseRate = Math.min(currentBaseRate, stage.baseSuccessRate * 2, 100);

      let actualSuccessRate = currentBaseRate;
      let currentAttemptCost = perAttemptBaseCost;
      let currentBreathCost = 0;
      let currentMetallurgyCost = 0;
      let strategyLabel = '기본';

      const useBreath = !!(n <= breathUses && stage.breathMaterial);
      const useMetallurgy = !!(n <= metallurgyUses && stage.metallurgyMaterial);

      const isLowRate = stage.baseSuccessRate === 0.5;
      const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;
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

  const artisanEnergy100Attempt = optimalSimulationDetails.find(detail => detail.artisanEnergy >= 100)?.attempt || Infinity;
  
  const formatStrategyLabel = (breathUses: number, metallurgyUses: number, useEnhanced: boolean): string => {
    const breathAllUsed = breathUses >= 25 || (breathUses > 0 && artisanEnergy100Attempt <= breathUses);
    const metallurgyAllUsed = metallurgyUses >= 25 || (metallurgyUses > 0 && artisanEnergy100Attempt <= metallurgyUses);
    
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

  const optimalStrategyLabel = formatStrategyLabel(optimalBreathUses, optimalMetallurgyUses, optimalUseEnhancedMetallurgy);

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
    const usedCount = reference.averageAttempts;
    const currentMaterialCost = type === 'breath' ? reference.breathTotalCost : reference.metallurgyTotalCost;
    const costWithoutCurrentMaterial = reference.expectedCost - currentMaterialCost;
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

const STORAGE_KEY = 'character-simulation-cache';
const ROSTER_CACHE_KEY = 'character-simulation-roster-cache';
const ARMORY_FETCH_DELAY_MS = 350;

/** 카제로스 목표 재련 21+ → 세르카 계승 매핑 (21→12, 22→13, ...) */
const KAZEROS_TO_SERKA_STAGE_OFFSET = 9; // 21 - 12 = 9
/** 카제로스 20 → 세르카 11 (계승 후) */
const KAZEROS_20_TO_SERKA = 11;

/**
 * 현재 재련 단계에서 목표 재련 단계까지의 진행 경로를 반환합니다.
 * isKazerosToSerka가 true이면 카제로스 20단계 달성 후 세르카 계승을 포함합니다.
 */
function getProgressionSteps(
  currentStage: number,
  targetStage: number,
  isKazerosToSerka: boolean
): string[] {
  if (!isKazerosToSerka) {
    if (currentStage >= targetStage) return [];
    const steps: string[] = [];
    for (let s = currentStage; s < targetStage; s++) {
      steps.push(`${s} → ${s + 1}`);
    }
    return steps;
  }
  // 카제로스 → 세르카 계승 경로
  // 세르카 계승은 항상 카제로스 20단계 + 상재4 완료 후 발생
  const steps: string[] = [];
  for (let s = currentStage; s < 20; s++) {
    steps.push(`${s} → ${s + 1}`);
  }
  steps.push('세르카 계승');
  const serkaStart = KAZEROS_20_TO_SERKA; // 계승 직후 세르카 단계 (= 11)
  for (let s = serkaStart; s < targetStage; s++) {
    steps.push(`${s} → ${s + 1}`);
  }
  return steps;
}

/**
 * 카제로스 재련 우선순위 로드맵에 따라 목표 재련 단계를 시뮬레이션합니다.
 *
 * 우선순위:
 *  일반재련 16단계 → 상재1 → 일반재련 17~18단계 → 상재2,3,4 → 일반재련 19~20단계 → 세르카 계승(상재4 완료 필요)
 *
 * 일반재련 1단계 = +5 아이템 레벨, 상재 1단계 = +10 아이템 레벨
 * 실제 아이템 레벨 = 일반재련 단계의 CSV 아이템 레벨 + 상재 완료 단계 × 10
 */
function calculateTargetLevelStages(
  equipments: Array<{
    type: string;
    currentLevel: number | null;
    currentItemLevel: number | null;
    isSerkaEquipment: boolean;
  }>,
  targetAvgLevel: number,
  weaponStages: RefiningStage[],
  armorStages: RefiningStage[],
  weaponStagesSerka: RefiningStage[],
  armorStagesSerka: RefiningStage[]
): Array<{ targetStageLevel: number | null; targetItemLevel: number | null; useSerkaForDisplay?: boolean }> {
  const getStagesArr = (type: string, isSerka: boolean): RefiningStage[] =>
    type === '무기'
      ? (isSerka ? weaponStagesSerka : weaponStages)
      : (isSerka ? armorStagesSerka : armorStages);

  const getBaseIL = (level: number, type: string, isSerka: boolean): number | null =>
    getStagesArr(type, isSerka).find(s => s.level === level)?.itemLevel ?? null;

  return equipments.map((eq) => {
    const currentStage = eq.currentLevel ?? 0;
    const currentIL = eq.currentItemLevel ?? 0;

    if (currentStage === 0 && currentIL === 0) {
      return { targetStageLevel: null, targetItemLevel: null };
    }

    let stage = currentStage;
    let il = currentIL;
    let isSerka = eq.isSerkaEquipment;

    // 현재 상재 완료 단계 추정: (실제 아이템레벨 - 현재 단계 CSV 아이템레벨) / 10
    const baseILNow = getBaseIL(stage, eq.type, isSerka) ?? il;
    let adv = Math.max(0, Math.floor((il - baseILNow) / 10));

    // 이미 목표 레벨 이상이면 현재 단계 그대로 반환
    if (il >= targetAvgLevel) {
      return { targetStageLevel: stage, targetItemLevel: il, useSerkaForDisplay: isSerka };
    }

    let result = { targetStageLevel: stage, targetItemLevel: il, useSerkaForDisplay: isSerka };

    for (let iter = 0; iter < 150; iter++) {
      let nextStage = stage;
      let nextIL = il;
      let nextAdv = adv;
      let nextIsSerka = isSerka;
      let moved = false;

      if (isSerka) {
        // 세르카: 상재 없이 일반재련만 진행
        const ns = stage + 1;
        const nsIL = getBaseIL(ns, eq.type, true);
        if (nsIL == null) break;
        nextStage = ns;
        nextIL = nsIL;
        moved = true;
      } else if (stage < 16) {
        // 카제로스 일반재련 16단계까지
        const ns = stage + 1;
        const nsIL = getBaseIL(ns, eq.type, false);
        if (nsIL == null) break;
        nextStage = ns;
        nextIL = nsIL + adv * 10;
        moved = true;
      } else if (stage === 16 && adv < 1) {
        // 16단계 도달 후 상재1 진행
        nextAdv = 1;
        nextIL = il + 10;
        moved = true;
      } else if ((stage === 16 && adv >= 1) || stage === 17) {
        // 상재1 완료 후 일반재련 17 또는 18단계로
        const ns = stage + 1;
        const nsIL = getBaseIL(ns, eq.type, false);
        if (nsIL == null) break;
        nextStage = ns;
        nextIL = nsIL + adv * 10;
        moved = true;
      } else if (stage >= 18 && adv < 4) {
        // 18단계 이상에서 상재 2,3,4 진행 (비표준 포함)
        nextAdv = adv + 1;
        nextIL = il + 10;
        moved = true;
      } else if (adv >= 4 && stage < 20) {
        // 상재4 완료 후 일반재련 19~20단계로
        const ns = stage + 1;
        const nsIL = getBaseIL(ns, eq.type, false);
        if (nsIL == null) break;
        nextStage = ns;
        nextIL = nsIL + 40;
        moved = true;
      } else if (stage === 20 && adv >= 4) {
        // 20단계 + 상재4 완료 → 세르카 계승
        const serkaArr = getStagesArr(eq.type, true)
          .filter(s => s.itemLevel != null)
          .sort((a, b) => a.level - b.level);
        const inheritStage = KAZEROS_20_TO_SERKA; // = 11
        const inheritData = serkaArr.find(s => s.level === inheritStage) ?? serkaArr[0];
        if (!inheritData) break;
        nextIsSerka = true;
        nextStage = inheritData.level;
        nextIL = inheritData.itemLevel!;
        nextAdv = 0;
        moved = true;
      }

      if (!moved) break;

      stage = nextStage;
      il = nextIL;
      adv = nextAdv;
      isSerka = nextIsSerka;

      if (il <= targetAvgLevel) {
        result = { targetStageLevel: stage, targetItemLevel: il, useSerkaForDisplay: isSerka };
      }

      if (il >= targetAvgLevel) break;
    }

    return result;
  });
}

type RosterCache = {
  rosterOwner: string;
  roster: RosterCharacter[];
  armories: Record<string, CharacterArmory>;
};

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function CharacterSimulation({
  weaponStages,
  armorStages,
  weaponStagesSerka,
  armorStagesSerka,
  marketInfo,
  sillingUnitPrice,
  valueDbMap = {},
  silverCashValue = null,
  initialRates,
  initialCrystalGoldRate,
}: {
  weaponStages: RefiningStage[];
  armorStages: RefiningStage[];
  weaponStagesSerka: RefiningStage[];
  armorStagesSerka: RefiningStage[];
  marketInfo: Record<string, MarketItemInfo>;
  sillingUnitPrice: number;
  valueDbMap?: Record<string, ValueDbEntry>;
  silverCashValue?: number | null;
  initialRates?: { exchange: number | null; discord: number | null };
  initialCrystalGoldRate?: number | null;
}) {
  const [characterName, setCharacterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [characterData, setCharacterData] = useState<CharacterArmory | null>(null);
  const [rosterCharacters, setRosterCharacters] = useState<RosterCharacter[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterCache, setRosterCache] = useState<RosterCache | null>(null);
  /** 카제로스 장비(운명의 업화) 1730+일 때 동일 레벨 세르카(운명의 전율)로 환산하여 계산 */
  const [convertKazeros1730ToSerka, setConvertKazeros1730ToSerka] = useState(false);
  /** 목표 재련 '상세' 툴팁 표시 중인 행 인덱스 (null이면 미표시) */
  const [detailTooltipIndex, setDetailTooltipIndex] = useState<number | null>(null);
  const [mobileItemTooltip, setMobileItemTooltip] = useState<{ title: string; lines: string[] } | null>(null);
  const [viewMode, setViewMode] = useState<'efficiency' | 'target-level'>('efficiency');
  const [targetLevelDropdownValue, setTargetLevelDropdownValue] = useState<number | null>(null);
  const [appliedTargetLevel, setAppliedTargetLevel] = useState<number | null>(null);
  const [targetLevelProgressionIndex, setTargetLevelProgressionIndex] = useState<number | null>(null);

  // 원정대 1640+ 전원 armory 조회 후 캐시 저장 (preloaded 있으면 해당 캐릭터는 스킵)
  const loadRoster = async (
    rosterOwner: string,
    opts?: { preloaded?: Record<string, CharacterArmory> }
  ): Promise<{ roster: RosterCharacter[]; armories: Record<string, CharacterArmory> } | null> => {
    if (!rosterOwner.trim()) return null;
    const preloaded = opts?.preloaded ?? {};
    const armories: Record<string, CharacterArmory> = { ...preloaded };

    setLoadingRoster(true);
    try {
      const res = await fetch(`/api/character/roster?characterName=${encodeURIComponent(rosterOwner.trim())}`);
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setRosterCharacters([]);
        setRosterCache(null);
        return null;
      }

      const parsed = data.map((char: any) => {
        const n = char.CharacterName || char.characterName || '';
        const levelStr = String(char.ItemAvgLevel || char.ItemLevel || char.ItemMaxLevel || char.itemAvgLevel || char.itemLevel || char.itemMaxLevel || '0').replace(/,/g, '');
        const level = parseFloat(levelStr);
        return {
          CharacterName: n,
          CharacterClassName: char.CharacterClassName || char.characterClassName,
          ItemAvgLevel: char.ItemAvgLevel || char.itemAvgLevel,
          ItemLevel: char.ItemLevel || char.itemLevel,
          ItemMaxLevel: char.ItemMaxLevel || char.itemMaxLevel,
          ServerName: char.ServerName || char.serverName,
          _level: level,
        };
      });

      const filtered = parsed.filter((c: { _level: number }) => !isNaN(c._level) && c._level >= 1640);
      const roster: RosterCharacter[] = filtered.map(({ _level, ...r }: any) => r);

      const namesToFetch = new Set<string>([rosterOwner.trim()]);
      roster.forEach((c) => { if (c.CharacterName) namesToFetch.add(c.CharacterName); });
      const namesList = Array.from(namesToFetch).filter((name) => !(name in armories));

      for (let i = 0; i < namesList.length; i++) {
        const name = namesList[i];
        try {
          const armoryRes = await fetch('/api/character/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterName: name }),
          });
          const armoryData = await armoryRes.json();
          if (armoryRes.ok && armoryData) {
            armories[name] = armoryData;
            const profile = armoryData.ArmoryProfile || {};
            const ilvl = profile.ItemAvgLevel ?? profile.ItemLevel ?? armoryData.ItemAvgLevel ?? armoryData.ItemLevel;
            const idx = roster.findIndex((r) => (r.CharacterName || '') === name);
            if (ilvl != null && idx >= 0) {
              roster[idx] = { ...roster[idx], ItemAvgLevel: String(ilvl), ItemLevel: String(ilvl) };
            }
          }
        } catch (e) {
          console.warn(`캐릭터 ${name} armory 조회 실패:`, e);
        }
        if (i < namesList.length - 1) await delay(ARMORY_FETCH_DELAY_MS);
      }

      const cache: RosterCache = { rosterOwner: rosterOwner.trim(), roster, armories };
      try {
        localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(cache));
      } catch {
        /* ignore */
      }
      setRosterCache(cache);
      setRosterCharacters(roster);
      return { roster, armories };
    } catch (err) {
      console.error('원정대 정보 조회 실패:', err);
      setRosterCharacters([]);
      setRosterCache(null);
      return null;
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleSearch = async (searchName?: string, persistToStorage = false) => {
    const nameToSearch = (searchName ?? characterName).trim();
    if (!nameToSearch) {
      setError('캐릭터명을 입력해주세요.');
      return;
    }

    if (persistToStorage) {
      try {
        setLoading(true);
        setError('');
        const res = await fetch('/api/character/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterName: nameToSearch }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || '캐릭터를 찾을 수 없습니다.');
          setCharacterData(null);
          setRosterCharacters([]);
          return;
        }
        setCharacterData(data);
        setCharacterName(nameToSearch);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            characterName: nameToSearch,
            characterData: data,
            rosterOwner: nameToSearch,
          }));
        } catch {
          /* ignore */
        }
        loadRoster(nameToSearch, { preloaded: { [nameToSearch]: data } }).catch(() => {});
      } catch (err) {
        setError('캐릭터 검색 중 오류가 발생했습니다.');
        setCharacterData(null);
        setRosterCharacters([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 갱신: 현재 캐릭터만 재조회 후 캐시 갱신
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/character/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterName: nameToSearch }),
      });
      const data = await res.json();
      if (res.ok) {
        setCharacterData(data);
        setCharacterName(nameToSearch);
        if (rosterCache && nameToSearch) {
          const next = { ...rosterCache, armories: { ...rosterCache.armories, [nameToSearch]: data } };
          setRosterCache(next);
          try {
            localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
      } else {
        setError(data.error || '캐릭터를 찾을 수 없습니다.');
      }
    } catch (err) {
      setError('캐릭터 검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterSelect = (selectedName: string) => {
    if (!selectedName) return;
    const armory = rosterCache?.armories[selectedName];
    if (armory) {
      setCharacterName(selectedName);
      setCharacterData(armory);
      return;
    }
    setCharacterName(selectedName);
    handleSearch(selectedName, false);
  };

  // 캐릭터 변경 시 목표 레벨 초기화
  useEffect(() => {
    setAppliedTargetLevel(null);
    setTargetLevelDropdownValue(null);
    setTargetLevelProgressionIndex(null);
  }, [characterName]);

  // 마운트 시 localStorage에서 가장 최근 캐릭터 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { characterName?: string; characterData?: CharacterArmory; rosterOwner?: string };
      const name = typeof parsed?.characterName === 'string' ? parsed.characterName.trim() : '';
      const data = parsed?.characterData && typeof parsed.characterData === 'object' ? parsed.characterData : null;
      if (name && data) {
        setCharacterName(name);
        setCharacterData(data);
        const owner = typeof parsed?.rosterOwner === 'string' ? parsed.rosterOwner.trim() : '';
        const rosterRaw = localStorage.getItem(ROSTER_CACHE_KEY);
        if (rosterRaw && owner) {
          const rosterParsed = JSON.parse(rosterRaw) as RosterCache;
          if (rosterParsed?.rosterOwner === owner && Array.isArray(rosterParsed?.roster) && rosterParsed?.armories && typeof rosterParsed.armories === 'object') {
            setRosterCache(rosterParsed);
            setRosterCharacters(rosterParsed.roster);
            return;
          }
        }
        loadRoster(name);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const equipmentTypeMap: Record<string, string> = {
    '무기': '무기',
    '투구': '투구',
    '상의': '상의',
    '하의': '하의',
    '장갑': '장갑',
    '어깨': '어깨',
  };

  const extractRefiningLevel = (tooltip: string | any): number | null => {
    if (!tooltip) return null;
    
    if (typeof tooltip === 'string') {
      const match = tooltip.match(/재련\s*단계[:\s]*\+?(\d+)/i) 
        || tooltip.match(/\+(\d+)/)
        || tooltip.match(/재련[:\s]*(\d+)/i);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    if (typeof tooltip === 'object') {
      const tooltipStr = JSON.stringify(tooltip);
      const match = tooltipStr.match(/재련\s*단계[:\s]*\+?(\d+)/i) 
        || tooltipStr.match(/\+(\d+)/)
        || tooltipStr.match(/재련[:\s]*(\d+)/i);
      if (match) {
        return parseInt(match[1]);
      }
      
      if (tooltip.Element_001) {
        const elementStr = typeof tooltip.Element_001 === 'string' 
          ? tooltip.Element_001 
          : JSON.stringify(tooltip.Element_001);
        const match = elementStr.match(/\+(\d+)/) || elementStr.match(/(\d+)/);
        if (match) {
          return parseInt(match[1]);
        }
      }
    }
    
    return null;
  };

  const getEquipmentType = (equipment: CharacterEquipment): string => {
    if (equipment.Type) {
      const mapped = equipmentTypeMap[equipment.Type];
      if (mapped) return mapped;
    }
    
    if (equipment.Tooltip) {
      let tooltipStr = '';
      if (typeof equipment.Tooltip === 'string') {
        tooltipStr = equipment.Tooltip;
      } else if (typeof equipment.Tooltip === 'object') {
        tooltipStr = JSON.stringify(equipment.Tooltip);
      }
      
      if (tooltipStr) {
        const typeMatch = tooltipStr.match(/<FONT[^>]*>([^<]+)<\/FONT>/);
        if (typeMatch) {
          const type = typeMatch[1].trim();
          return equipmentTypeMap[type] || type;
        }
      }
    }
    
    const name = equipment.Name || '';
    if (name.includes('무기') || name.includes('Weapon')) return '무기';
    if (name.includes('투구') || name.includes('Helmet') || name.includes('머리')) return '투구';
    if (name.includes('상의') || name.includes('Top') || name.includes('갑옷')) return '상의';
    if (name.includes('하의') || name.includes('Bottom') || name.includes('바지')) return '하의';
    if (name.includes('장갑') || name.includes('Gloves') || name.includes('장갑')) return '장갑';
    if (name.includes('어깨') || name.includes('Shoulder') || name.includes('어깨')) return '어깨';
    
    return equipment.Type || '알 수 없음';
  };

  const extractItemLevel = (equipment: any): number | null => {
    if (equipment.ItemLevel != null) {
      return Number(equipment.ItemLevel);
    }
    if (equipment.ItemMaxLevel != null) {
      return Number(equipment.ItemMaxLevel);
    }
    if (equipment.itemLevel != null) {
      return Number(equipment.itemLevel);
    }
    if (equipment.itemMaxLevel != null) {
      return Number(equipment.itemMaxLevel);
    }
    
    if (equipment.Tooltip) {
      let tooltipStr = '';
      if (typeof equipment.Tooltip === 'string') {
        tooltipStr = equipment.Tooltip;
      } else if (typeof equipment.Tooltip === 'object') {
        tooltipStr = JSON.stringify(equipment.Tooltip);
      }
      
      const levelMatch = tooltipStr.match(/아이템\s*레벨[:\s]*(\d+)/i) 
        || tooltipStr.match(/ItemLevel[:\s]*(\d+)/i)
        || tooltipStr.match(/아이템레벨[:\s]*(\d+)/i);
      if (levelMatch) {
        return parseInt(levelMatch[1]);
      }
    }
    
    return null;
  };

  const hasTier3Equipment = useMemo(() => {
    if (!characterData) return false;
    
    let equipment: any[] = [];
    
    if (Array.isArray(characterData.ArmoryEquipment)) {
      equipment = characterData.ArmoryEquipment;
    } else if (characterData.Armories?.Equipment && Array.isArray(characterData.Armories.Equipment)) {
      equipment = characterData.Armories.Equipment;
    } else if (Array.isArray(characterData.Equipment)) {
      equipment = characterData.Equipment;
    } else if (characterData.Armories && Array.isArray(characterData.Armories)) {
      equipment = characterData.Armories;
    }
    
    if (!Array.isArray(equipment) || equipment.length === 0) {
      return false;
    }
    
    const equipmentOrder = ['무기', '투구', '상의', '하의', '장갑', '어깨'];
    const mainEquipment = equipment
      .map(eq => ({
        ...eq,
        type: getEquipmentType(eq),
      }))
      .filter(eq => equipmentOrder.slice(0, 6).includes(eq.type));
    
    return mainEquipment.some(eq => {
      const itemLevel = extractItemLevel(eq);
      return itemLevel != null && itemLevel < 1640;
    });
  }, [characterData]);

  const equipmentOrder = ['무기', '투구', '상의', '하의', '장갑', '어깨'];
  const sortedEquipment = useMemo(() => {
    if (!characterData) {
      return [];
    }
    
    let equipment: any[] = [];
    
    if (Array.isArray(characterData.ArmoryEquipment)) {
      equipment = characterData.ArmoryEquipment;
    } else if (characterData.Armories?.Equipment && Array.isArray(characterData.Armories.Equipment)) {
      equipment = characterData.Armories.Equipment;
    } else if (Array.isArray(characterData.Equipment)) {
      equipment = characterData.Equipment;
    } else if (characterData.Armories && Array.isArray(characterData.Armories)) {
      equipment = characterData.Armories;
    }
    
    if (!Array.isArray(equipment) || equipment.length === 0) {
      return [];
    }
    
    const mapped = equipment
      .map(eq => {
        const type = getEquipmentType(eq);
        const level = extractRefiningLevel(eq.Tooltip);
        const itemLevel = extractItemLevel(eq);
        return {
          ...eq,
          type,
          level,
          itemLevel,
        };
      })
      .filter(eq => equipmentOrder.slice(0, 6).includes(eq.type))
      .sort((a, b) => {
        const aIndex = equipmentOrder.indexOf(a.type);
        const bIndex = equipmentOrder.indexOf(b.type);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    
    return mapped;
  }, [characterData]);

  /** 1730 이상 카제로스(운명의 업화) 장비가 하나라도 있으면 true → 세르카 환산 토글 활성화 */
  const hasKazeros1730Equipment = useMemo(() => {
    if (!sortedEquipment.length) return false;
    return sortedEquipment.some(
      eq => (eq.Name?.includes('운명의 업화') ?? false) && ((eq.itemLevel ?? 0) >= 1730)
    );
  }, [sortedEquipment]);

  const { adjustPrice } = usePriceAdjustment();

  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    adjusted['실링'] = {
      unitPrice: adjustPrice('실링', sillingUnitPrice) ?? sillingUnitPrice,
      icon: marketInfo['실링']?.icon || FALLBACK_ICON[SILVER_ITEM] || null,
    };
    return adjusted;
  }, [marketInfo, adjustPrice, sillingUnitPrice]);

  // 상급재련 전략 요약: 상급재련 페이지와 동일한 가격 소스 (valueDb + 실링 환산)
  const goldPerWon = useMemo(() => {
    if (initialCrystalGoldRate != null && initialCrystalGoldRate > 0) return initialCrystalGoldRate / 2750;
    const d = initialRates?.discord;
    if (d != null && d > 0) return 100 / d;
    return null;
  }, [initialCrystalGoldRate, initialRates?.discord]);

  const baseSillingUnitPrice = useMemo(() => {
    if (silverCashValue != null && goldPerWon != null) return silverCashValue * goldPerWon;
    return 0;
  }, [silverCashValue, goldPerWon]);

  const sillingUnitPriceAdv = useMemo(() => {
    const v = adjustPrice('실링', baseSillingUnitPrice);
    return v ?? baseSillingUnitPrice;
  }, [adjustPrice, baseSillingUnitPrice]);

  const getMaterialValueAdv = useCallback((itemName: string): number | null => {
    if (itemName === '골드') return 1;
    if (itemName === '실링') return sillingUnitPriceAdv;
    let basePrice: number | null = null;
    const key = itemName === '운명의 파편' ? '운명의 파편 1개당' : itemName;
    const entry = valueDbMap[key];
    if (entry?.unitType === '골드' && entry.unitValue != null) basePrice = entry.unitValue;
    if (basePrice != null) return adjustPrice(itemName, basePrice) ?? basePrice;
    return null;
  }, [valueDbMap, adjustPrice, sillingUnitPriceAdv]);

  const calculateRequiredMaterialsCostAdv = useCallback((materials: { name: string; amount: number; isOptional?: boolean }[]): number => {
    return materials
      .filter(m => !m.isOptional)
      .reduce((sum, mat) => {
        const v = getMaterialValueAdv(mat.name);
        return sum + (v != null ? v * mat.amount : 0);
      }, 0);
  }, [getMaterialValueAdv]);

  const calculateAuxiliaryCostAdv = useCallback((materials: { name: string; amount: number; isOptional?: boolean }[], useBreath: boolean, useCraftsmanship: boolean): number => {
    return materials
      .filter(m => m.isOptional)
      .reduce((sum, mat) => {
        if (mat.name.includes('숨결') && !useBreath) return sum;
        if ((mat.name.includes('야금술') || mat.name.includes('재봉술')) && !useCraftsmanship) return sum;
        const v = getMaterialValueAdv(mat.name);
        return sum + (v != null ? v * mat.amount : 0);
      }, 0);
  }, [getMaterialValueAdv]);

  const calculateAdvancedTotalCostAdv = useCallback((
    result: SimulationResult,
    materials: { name: string; amount: number; isOptional?: boolean }[],
    useBreathNormal: boolean,
    useCraftsmanshipNormal: boolean,
    useBreathAncestor: boolean,
    useCraftsmanshipAncestor: boolean,
    useBreathEnhancedAncestor?: boolean,
    useCraftsmanshipEnhancedAncestor?: boolean
  ): { totalCost: number; normalTurnCost: number; ancestorTurnCost: number; enhancedAncestorTurnCost?: number; freeTurnCost: number } => {
    const requiredCost = calculateRequiredMaterialsCostAdv(materials);
    const normalTurnCost = requiredCost + calculateAuxiliaryCostAdv(materials, useBreathNormal, useCraftsmanshipNormal);
    const ancestorTurnCost = requiredCost + calculateAuxiliaryCostAdv(materials, useBreathAncestor, useCraftsmanshipAncestor);
    const freeTurnCost = calculateAuxiliaryCostAdv(materials, useBreathNormal, useCraftsmanshipNormal);
    const normalTurnTotal = result.normalTurns * normalTurnCost;
    const ancestorTurnTotal = result.ancestorTurns * ancestorTurnCost;
    const freeTurnTotal = result.freeTurns * freeTurnCost;
    let enhancedAncestorTurnCost: number | undefined;
    let enhancedAncestorTurnTotal: number | undefined;
    if (result.enhancedAncestorTurns !== undefined && useBreathEnhancedAncestor !== undefined && useCraftsmanshipEnhancedAncestor !== undefined) {
      enhancedAncestorTurnCost = requiredCost + calculateAuxiliaryCostAdv(materials, useBreathEnhancedAncestor, useCraftsmanshipEnhancedAncestor);
      enhancedAncestorTurnTotal = result.enhancedAncestorTurns * enhancedAncestorTurnCost;
    }
    const totalCost = normalTurnTotal + ancestorTurnTotal + freeTurnTotal + (enhancedAncestorTurnTotal || 0);
    return {
      totalCost,
      normalTurnCost,
      ancestorTurnCost,
      ...(enhancedAncestorTurnCost !== undefined && { enhancedAncestorTurnCost }),
      freeTurnCost,
    };
  }, [calculateRequiredMaterialsCostAdv, calculateAuxiliaryCostAdv]);

  const [refreshKey, setRefreshKey] = useState(0);
  
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  const equipmentWithValues = useMemo(() => {
    if (!sortedEquipment.length) return [];
    
    return sortedEquipment.map(eq => {
      const isWeapon = eq.type === '무기';
      const isKazerosEquipment = eq.Name?.includes('운명의 업화') || false;
      const isSerkaByName = eq.Name?.includes('운명의 전율') || false;
      const useSerkaConversion = convertKazeros1730ToSerka && isKazerosEquipment && (eq.itemLevel ?? 0) >= 1730;
      const effectiveSerka = isSerkaByName || useSerkaConversion;
      
      const stages = isWeapon 
        ? (effectiveSerka ? weaponStagesSerka : weaponStages)
        : (effectiveSerka ? armorStagesSerka : armorStages);
      
      let currentLevel: number | null;
      let targetLevel: number | null;
      let stage: RefiningStage | null;
      
      if (useSerkaConversion) {
        // 카제로스 1730+ → 세르카 동일 아이템 레벨로 환산: 목표 단계 = 현재 장비 아이템 레벨보다 큰 다음 세르카 단계
        const ilvl = eq.itemLevel ?? 0;
        const nextStages = stages.filter(s => s.itemLevel != null && s.itemLevel > ilvl);
        const nextItemLevel = nextStages.length > 0 ? Math.min(...nextStages.map(s => s.itemLevel!)) : null;
        stage = nextItemLevel != null ? stages.find(s => s.itemLevel === nextItemLevel) ?? null : null;
        if (stage) {
          targetLevel = stage.level;
          const currentStage = stages.filter(s => s.itemLevel != null && s.itemLevel <= ilvl).sort((a, b) => (b.itemLevel ?? 0) - (a.itemLevel ?? 0))[0];
          currentLevel = currentStage ? currentStage.level : stage.level - 1;
        } else {
          currentLevel = null;
          targetLevel = null;
        }
      } else {
        currentLevel = eq.level ?? null;
        targetLevel = currentLevel != null ? currentLevel + 1 : null;
        stage = targetLevel != null ? (stages.find(s => s.level === targetLevel) ?? null) : null;
      }
      
      const isSerkaEquipment = effectiveSerka;
      
      if (!stage || currentLevel == null || targetLevel == null) {
        return {
          ...eq,
          craftValue: null,
          breathValue: null,
          breakthroughValue: null,
          currentLevel,
          targetLevel,
          advancedProgress: null,
          convertedToSerka: false,
          avgConsumption: [] as Array<{ name: string; quantity: number; unitPrice?: number; totalPrice?: number; icon?: string | null }>,
        };
      }

      const a = eq.itemLevel ?? null;  // 장비의 실제 아이템 레벨
      const b = stage.itemLevel ?? null;  // 목표 재련 단계에 매칭되는 베이스라인 아이템 레벨 (upgrade CSV)
      // 상재 단계는 카제로스 장비에만 해당 (세르카는 상급재련 없음)
      let advancedProgress: string | null = null;
      if (!isSerkaEquipment && a != null && b != null) {
        const diff = a - b + 5;
        if (diff === 0) advancedProgress = '미진행';
        else if (diff > 0 && diff < 10) advancedProgress = '1단계 진행중';
        else if (diff === 10) advancedProgress = '상급 재련 1단계 완료';
        else if (diff > 10 && diff < 20) advancedProgress = '2단계 진행중';
        else if (diff === 20) advancedProgress = '상급 재련 2단계 완료';
        else if (diff > 20 && diff < 30) advancedProgress = '3단계 진행중';
        else if (diff === 30) advancedProgress = '상급 재련 3단계 완료';
        else if (diff > 30 && diff < 40) advancedProgress = '4단계 진행중';
        else if (diff >= 40) advancedProgress = '상급 재련 4단계 완료';
        else advancedProgress = '미진행';
      }

      const { materialValueAnalysis } = calculateOptimalStrategy(stage, adjustedMarketInfo);
      // 장인의 야금술/재봉술 가치는 카제로스 장비에만 해당 (세르카는 해당 없음)
      let craftValue = isSerkaEquipment ? null : (materialValueAnalysis?.metallurgy?.actualValuePerItem ?? null);
      let craftItemName = isSerkaEquipment ? null : (stage.metallurgyMaterial?.name || null);
      let craftMarketPrice = craftItemName ? (adjustedMarketInfo[craftItemName]?.unitPrice ?? null) : null;

      let enhancedCraftValue = isSerkaEquipment ? null : (materialValueAnalysis?.enhancedMetallurgy?.actualValuePerItem ?? null);
      let enhancedCraftItemName = isSerkaEquipment ? null : (stage.enhancedMetallurgyMaterial?.name || null);
      let enhancedCraftMarketPrice = enhancedCraftItemName ? (adjustedMarketInfo[enhancedCraftItemName]?.unitPrice ?? null) : null;
      
      const breathValue = materialValueAnalysis?.breath?.actualValuePerItem ?? null;
      const breathItemName = stage.breathMaterial?.name || null;
      const breathMarketPrice = breathItemName ? (adjustedMarketInfo[breathItemName]?.unitPrice ?? null) : null;
      
      const { optimalStrategy } = calculateOptimalStrategy(stage, adjustedMarketInfo);
      const expInfo = stage.expMaterial ? (adjustedMarketInfo[stage.expMaterial.name] || { unitPrice: 0 }) : null;
      const expMaterialCost = stage.expMaterial && expInfo
        ? expInfo.unitPrice * stage.expMaterial.quantity
        : 0;
      
      const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
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
      
      const stoneCount = isSerkaEquipment 
        ? getTransitionStoneCount(targetLevel, isWeapon ? 'weapon' : 'armor')
        : getBreakthroughStoneCount(targetLevel, isWeapon ? 'weapon' : 'armor');
      const breakthroughValue = stoneCount > 0 ? (refiningCost * baseSuccessRate) / stoneCount : null;
      
      const avgConsumption = getAverageConsumptionLines(stage as Parameters<typeof getAverageConsumptionLines>[0], optimalStrategy as Parameters<typeof getAverageConsumptionLines>[1], adjustedMarketInfo);
      return {
        ...eq,
        craftValue,
        craftItemName,
        craftMarketPrice,
        enhancedCraftValue,
        enhancedCraftItemName,
        enhancedCraftMarketPrice,
        breathValue,
        breathItemName,
        breathMarketPrice,
        breakthroughValue,
        currentLevel,
        targetLevel,
        isSerkaEquipment,
        advancedProgress,
        convertedToSerka: useSerkaConversion,
        avgConsumption,
      };
    });
  }, [sortedEquipment, weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, adjustedMarketInfo, refreshKey, convertKazeros1730ToSerka]);

  const currentAvgItemLevel = useMemo(() => {
    if (!equipmentWithValues.length) return null;
    const getIL = (eq: (typeof equipmentWithValues)[0]): number | null => {
      if (eq.itemLevel != null) return eq.itemLevel;
      if (eq.currentLevel == null) return null;
      const stages = eq.type === '무기'
        ? (eq.isSerkaEquipment ? weaponStagesSerka : weaponStages)
        : (eq.isSerkaEquipment ? armorStagesSerka : armorStages);
      return stages.find(s => s.level === eq.currentLevel)?.itemLevel ?? null;
    };
    const levels = equipmentWithValues.map(getIL).filter((l): l is number => l != null);
    if (!levels.length) return null;
    return levels.reduce((a, b) => a + b, 0) / levels.length;
  }, [equipmentWithValues, weaponStages, armorStages, weaponStagesSerka, armorStagesSerka]);

  const targetLevelOptions = useMemo(() => {
    if (currentAvgItemLevel == null) return [];
    const minLevel = (Math.floor(currentAvgItemLevel / 5) + 1) * 5;
    const options: number[] = [];
    for (let l = minLevel; l <= 1800; l += 5) {
      options.push(l);
    }
    return options;
  }, [currentAvgItemLevel]);

  const targetLevelStages = useMemo(() => {
    if (appliedTargetLevel == null || !equipmentWithValues.length) return null;
    return calculateTargetLevelStages(
      equipmentWithValues.map(eq => ({
        type: eq.type,
        currentLevel: eq.currentLevel,
        currentItemLevel: eq.itemLevel ?? null,
        isSerkaEquipment: eq.isSerkaEquipment,
      })),
      appliedTargetLevel,
      weaponStages, armorStages, weaponStagesSerka, armorStagesSerka
    );
  }, [appliedTargetLevel, equipmentWithValues, weaponStages, armorStages, weaponStagesSerka, armorStagesSerka]);

  const summaryValues = useMemo(() => {
    if (!equipmentWithValues.length) {
      return {
        lavaBreathValue: null,
        lavaBreathMarketPrice: null,
        iceBreathValue: null,
        iceBreathMarketPrice: null,
        circularBreakthroughValue: null,
        circularBreakthroughBestEquipment: null,
        transitionBreakthroughValue: null,
        transitionBreakthroughBestEquipment: null,
        craftItems: [],
      };
    }

    const weapon = equipmentWithValues.find(eq => eq.type === '무기');
    const lavaBreathValue = weapon?.breathValue ?? null;
    const lavaBreathMarketPrice = weapon?.breathMarketPrice ?? null;

    const armorItems = equipmentWithValues.filter(eq => eq.type !== '무기');
    const iceBreathValues = armorItems.map(eq => ({ value: eq.breathValue, price: eq.breathMarketPrice, type: eq.type })).filter((v): v is { value: number; price: number | null; type: string } => v.value != null);
    const maxIceBreath = iceBreathValues.length > 0 
      ? iceBreathValues.reduce((max, curr) => curr.value > max.value ? curr : max, iceBreathValues[0])
      : null;
    const iceBreathValue = maxIceBreath?.value ?? null;
    const iceBreathMarketPrice = maxIceBreath?.price ?? null;

    const breakthroughItems = equipmentWithValues.map(eq => ({ 
      value: eq.breakthroughValue, 
      type: eq.type,
      targetLevel: eq.targetLevel,
      isSerkaEquipment: eq.isSerkaEquipment 
    })).filter((v): v is { value: number; type: string; targetLevel: number | null; isSerkaEquipment: boolean } => v.value != null);
    
    const kazerosBreakthroughItems = breakthroughItems.filter(item => !item.isSerkaEquipment);
    const maxKazerosBreakthrough = kazerosBreakthroughItems.length > 0 
      ? kazerosBreakthroughItems.reduce((max, curr) => curr.value > max.value ? curr : max, kazerosBreakthroughItems[0])
      : null;
    const circularBreakthroughValue = maxKazerosBreakthrough?.value ?? null;
    const circularBreakthroughBestEquipment = maxKazerosBreakthrough 
      ? `${maxKazerosBreakthrough.type} +${maxKazerosBreakthrough.targetLevel ?? '?'}`
      : null;
    
    const serkaBreakthroughItems = breakthroughItems.filter(item => item.isSerkaEquipment);
    const maxSerkaBreakthrough = serkaBreakthroughItems.length > 0 
      ? serkaBreakthroughItems.reduce((max, curr) => curr.value > max.value ? curr : max, serkaBreakthroughItems[0])
      : null;
    const transitionBreakthroughValue = maxSerkaBreakthrough?.value ?? null;
    const transitionBreakthroughBestEquipment = maxSerkaBreakthrough 
      ? `${maxSerkaBreakthrough.type} +${maxSerkaBreakthrough.targetLevel ?? '?'}`
      : null;

    const craftItemsMap = new Map<string, { 
      name: string; 
      value: number; 
      marketPrice: number | null;
      type: string;
    }>();
    
    equipmentWithValues.forEach(eq => {
      if (eq.craftItemName && eq.craftValue != null) {
        const existing = craftItemsMap.get(eq.craftItemName);
        if (!existing || eq.craftValue > existing.value) {
          craftItemsMap.set(eq.craftItemName, {
            name: eq.craftItemName,
            value: eq.craftValue,
            marketPrice: eq.craftMarketPrice,
            type: eq.type,
          });
        }
      }
      
      if (eq.enhancedCraftItemName && eq.enhancedCraftValue != null) {
        const existing = craftItemsMap.get(eq.enhancedCraftItemName);
        if (!existing || eq.enhancedCraftValue > existing.value) {
          craftItemsMap.set(eq.enhancedCraftItemName, {
            name: eq.enhancedCraftItemName,
            value: eq.enhancedCraftValue,
            marketPrice: eq.enhancedCraftMarketPrice,
            type: eq.type,
          });
        }
      }
    });
    
    const craftItems = Array.from(craftItemsMap.values());

    return {
      lavaBreathValue,
      lavaBreathMarketPrice,
      iceBreathValue,
      iceBreathMarketPrice,
      circularBreakthroughValue,
      circularBreakthroughBestEquipment,
      transitionBreakthroughValue,
      transitionBreakthroughBestEquipment,
      craftItems,
    };
  }, [equipmentWithValues]);

  // 상급재련 전략 분석
  const advancedRefiningAnalysis = useMemo(() => {
    if (!equipmentWithValues.length) return null;

    // 장비별 상급재련 목표 단계 집계
    const advancedTargets = equipmentWithValues
      .map(eq => ({
        type: eq.type,
        advancedTarget: (() => {
          const progress = eq.advancedProgress;
          if (!progress) return null;
          if (progress === '상급 재련 4단계 완료') return null;
          if (progress === '미진행' || progress === '1단계 진행중') return '상재1';
          if (progress === '상급 재련 1단계 완료' || progress === '2단계 진행중') return '상재2';
          if (progress === '상급 재련 2단계 완료' || progress === '3단계 진행중') return '상재3';
          if (progress === '상급 재련 3단계 완료' || progress === '4단계 진행중') return '상재4';
          return null;
        })(),
        advancedProgress: eq.advancedProgress,
      }))
      .filter(eq => eq.advancedTarget != null);

    if (advancedTargets.length === 0) return null;

    // 단계별로 그룹화
    const grouped = advancedTargets.reduce((acc, eq) => {
      const key = eq.advancedTarget!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(eq);
      return acc;
    }, {} as Record<string, typeof advancedTargets>);

    // 각 단계별 분석
    const analyses = Object.entries(grouped).flatMap(([stage, items]) => {
      const hasWeapon = items.some(eq => eq.type === '무기');
      const hasArmor = items.some(eq => eq.type !== '무기');
      const refiningLevel = stage as RefiningLevel;
      
      // 무기와 방어구를 별도로 분석
      const gearTypes: GearType[] = [];
      if (hasWeapon) gearTypes.push('무기');
      if (hasArmor) gearTypes.push('방어구');
      
      return gearTypes.map(gearType => {

      // 해당 단계의 시뮬레이션 데이터 로드
      let simulationData: any;
      if (stage === '상재3') {
        simulationData = simulationDataLevel3;
      } else if (stage === '상재4') {
        simulationData = simulationDataLevel4;
      } else if (stage === '상재2') {
        simulationData = simulationDataLevel2;
      } else {
        simulationData = simulationDataLevel1;
      }

      const isLevel3Or4 = stage === '상재3' || stage === '상재4';

      // 시뮬레이션 결과 필터링 및 변환
      const filteredData = (simulationData as any).data.filter((item: any) => item.gearType === gearType);
      const simulationResults = filteredData.map((item: any) => ({
        strategy: {
          normalTurn: {
            useBreath: item.strategy.normalBreath,
            useCraftsmanship: item.strategy.normalCraft,
          },
          ancestorTurn: {
            useBreath: item.strategy.ancestorBreath,
            useCraftsmanship: item.strategy.ancestorCraft,
          },
          ...(isLevel3Or4 && {
            enhancedAncestorTurn: {
              useBreath: item.strategy.enhancedAncestorBreath || false,
              useCraftsmanship: item.strategy.enhancedAncestorCraft || false,
            },
          }),
        },
        result: {
          expectedAttempts: item.result.expectedAttempts,
          normalTurns: item.result.normalTurns,
          ancestorTurns: item.result.ancestorTurns,
          ...(isLevel3Or4 && { enhancedAncestorTurns: item.result.enhancedAncestorTurns || 0 }),
          freeTurns: item.result.freeTurns,
          totalCost: 0,
          materialBreakdown: item.result.materialBreakdown,
        } as SimulationResult,
      }));

      // 재료 정보
      const materials = getMaterialsForLevel(refiningLevel, gearType);

      // 모든 시나리오 비용 계산
      const allResults = simulationResults.map((simResult: any) => {
        const costBreakdown = calculateAdvancedTotalCostAdv(
          simResult.result,
          materials,
          simResult.strategy.normalTurn.useBreath,
          simResult.strategy.normalTurn.useCraftsmanship,
          simResult.strategy.ancestorTurn.useBreath,
          simResult.strategy.ancestorTurn.useCraftsmanship,
          simResult.strategy.enhancedAncestorTurn?.useBreath,
          simResult.strategy.enhancedAncestorTurn?.useCraftsmanship
        );
        return {
          strategy: simResult.strategy,
          result: simResult.result,
          costBreakdown,
        } as ScenarioWithCost;
      });

      // 보조재료 미투입 시나리오
      const noAux = allResults.find(
        (r: ScenarioWithCost) => 
          !r.strategy.normalTurn.useBreath && 
          !r.strategy.normalTurn.useCraftsmanship &&
          !r.strategy.ancestorTurn.useBreath && 
          !r.strategy.ancestorTurn.useCraftsmanship &&
          !r.strategy.enhancedAncestorTurn?.useBreath &&
          !r.strategy.enhancedAncestorTurn?.useCraftsmanship
      );

      // 보조재료별 분석
      const craftMaterial = materials.find(m => m.name.includes('야금술') || m.name.includes('재봉술'));
      const breathMaterial = materials.find(m => m.name.includes('숨결'));

      const craftItemName = craftMaterial?.name || null;
      const breathItemName = breathMaterial?.name || null;
      const craftMarketPrice = craftItemName ? getMaterialValueAdv(craftItemName) : null;
      const breathMarketPrice = breathItemName ? getMaterialValueAdv(breathItemName) : null;

      // 강화선조턴, 선조턴, 일반턴 각각에서의 이득/손해 분석
      type TurnAnalysis = {
        profitable: boolean;
        valuePerUnit: number | null; // 순이득 (비용절감 - 구매비용이 이미 반영됨)
        realValue: number | null; // 실제가치 = valuePerUnit + marketPrice
        marketPrice: number | null;
      };

      const material = (mt: 'craft' | 'breath') => mt === 'craft' ? craftMaterial : breathMaterial;
      const marketPrice = (mt: 'craft' | 'breath') => mt === 'craft' ? craftMarketPrice : breathMarketPrice;
      const matName = (mt: 'craft' | 'breath') => material(mt)?.name;

      const getUsed = (r: ScenarioWithCost, mt: 'craft' | 'breath') => {
        const name = matName(mt);
        return name ? (r.result.materialBreakdown[name] || 0) : 0;
      };

      const analyzeMaterial = (
        materialType: 'craft' | 'breath',
        turnType: 'normal' | 'ancestor' | 'enhancedAncestor'
      ): TurnAnalysis => {
        const mp = marketPrice(materialType);
        if (!noAux) return { profitable: false, valuePerUnit: null, realValue: null, marketPrice: mp };

        let valuePerUnit: number | null = null;

        if (isLevel3Or4) {
          const enhOnly = allResults.find((r: ScenarioWithCost) =>
            materialType === 'craft'
              ? r.strategy.enhancedAncestorTurn?.useCraftsmanship && !r.strategy.enhancedAncestorTurn?.useBreath && !r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath
              : r.strategy.enhancedAncestorTurn?.useBreath && !r.strategy.enhancedAncestorTurn?.useCraftsmanship && !r.strategy.ancestorTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship
          );
          const ancEnh = allResults.find((r: ScenarioWithCost) => {
            if (materialType === 'craft') {
              return !!(
                r.strategy.enhancedAncestorTurn?.useCraftsmanship && !r.strategy.enhancedAncestorTurn?.useBreath &&
                r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath &&
                !r.strategy.normalTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath
              );
            }
            return !!(
              r.strategy.enhancedAncestorTurn?.useBreath && !r.strategy.enhancedAncestorTurn?.useCraftsmanship &&
              r.strategy.ancestorTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship &&
              !r.strategy.normalTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship
            );
          });
          const allThree = allResults.find((r: ScenarioWithCost) => {
            if (materialType === 'craft') {
              return !!(
                r.strategy.normalTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath &&
                r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath &&
                r.strategy.enhancedAncestorTurn?.useCraftsmanship && !r.strategy.enhancedAncestorTurn?.useBreath
              );
            }
            return !!(
              r.strategy.normalTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship &&
              r.strategy.ancestorTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship &&
              r.strategy.enhancedAncestorTurn?.useBreath && !r.strategy.enhancedAncestorTurn?.useCraftsmanship
            );
          });

          if (turnType === 'enhancedAncestor' && enhOnly) {
            const costReduction = noAux.costBreakdown.totalCost - enhOnly.costBreakdown.totalCost;
            const used = getUsed(enhOnly, materialType);
            valuePerUnit = used > 0 ? costReduction / used : null;
          } else if (turnType === 'ancestor' && enhOnly && ancEnh) {
            const costReduction = enhOnly.costBreakdown.totalCost - ancEnh.costBreakdown.totalCost;
            const usedDelta = getUsed(ancEnh, materialType) - getUsed(enhOnly, materialType);
            valuePerUnit = usedDelta > 0 ? costReduction / usedDelta : null;
          } else if (turnType === 'normal' && ancEnh && allThree) {
            const costReduction = ancEnh.costBreakdown.totalCost - allThree.costBreakdown.totalCost;
            const usedDelta = getUsed(allThree, materialType) - getUsed(ancEnh, materialType);
            valuePerUnit = usedDelta > 0 ? costReduction / usedDelta : null;
          }
        } else {
          const onlyTurn = allResults.find((r: ScenarioWithCost) => {
            if (turnType === 'ancestor') {
              return materialType === 'craft'
                ? r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath
                : r.strategy.ancestorTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship;
            } else {
              return materialType === 'craft'
                ? r.strategy.normalTurn.useCraftsmanship && !r.strategy.normalTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath
                : r.strategy.normalTurn.useBreath && !r.strategy.normalTurn.useCraftsmanship && !r.strategy.ancestorTurn.useBreath && !r.strategy.ancestorTurn.useCraftsmanship;
            }
          });
          if (onlyTurn) {
            const costReduction = noAux.costBreakdown.totalCost - onlyTurn.costBreakdown.totalCost;
            const used = getUsed(onlyTurn, materialType);
            valuePerUnit = used > 0 ? costReduction / used : null;
          }
        }

        // realValue = valuePerUnit + marketPrice (상급재련 페이지와 동일)
        const realValue = valuePerUnit != null && mp != null ? valuePerUnit + mp : null;
        // 이득/손해 판단: valuePerUnit >= 0 이면 이득 (상급재련 페이지와 동일)
        const profitable = valuePerUnit != null && valuePerUnit >= 0;
        return { profitable, valuePerUnit, realValue, marketPrice: mp };
      };

      const craftAnalysis = {
        enhancedAncestor: isLevel3Or4 ? analyzeMaterial('craft', 'enhancedAncestor') : null,
        ancestor: analyzeMaterial('craft', 'ancestor'),
        normal: analyzeMaterial('craft', 'normal'),
      };

      const breathAnalysis = {
        enhancedAncestor: isLevel3Or4 ? analyzeMaterial('breath', 'enhancedAncestor') : null,
        ancestor: analyzeMaterial('breath', 'ancestor'),
        normal: analyzeMaterial('breath', 'normal'),
      };

        return {
          stage,
          gearType,
          craftItemName,
          craftMarketPrice,
          craftAnalysis,
          breathItemName,
          breathMarketPrice,
          breathAnalysis,
        };
      });
    });

    return analyses;
  }, [equipmentWithValues, calculateAdvancedTotalCostAdv, getMaterialValueAdv]);

  const getAdvancedTargetLabel = (progress: string | null): string | null => {
    if (!progress) return null;
    if (progress === '상급 재련 4단계 완료') return null;
    if (progress === '미진행' || progress === '1단계 진행중') return '상재1단계';
    if (progress === '상급 재련 1단계 완료' || progress === '2단계 진행중') return '상재2단계';
    if (progress === '상급 재련 2단계 완료' || progress === '3단계 진행중') return '상재3단계';
    if (progress === '상급 재련 3단계 완료' || progress === '4단계 진행중') return '상재4단계';
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-950 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6 md:mb-10 px-4 sm:px-0">
        <div className="hidden sm:block">
          <div className="flex items-center gap-3 flex-wrap mb-1 sm:mb-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-white">내 캐릭터 시뮬레이션</h1>
            <FavoriteButton title="내 캐릭터 시뮬레이션" />
          </div>
          <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 whitespace-normal break-words">캐릭터명을 입력하여 착용 중인 장비의 재련 단계를 확인할 수 있습니다.</p>
        </div>
      </div>

      <div className="space-y-8 px-4 sm:px-0">
        {/* 검색 입력 */}
        <div className="bg-gray-900/70 rounded-xl border border-gray-700 p-6 space-y-4">
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSearch(undefined, true);
                }
              }}
              placeholder="캐릭터명을 입력하세요"
              className="flex-1 min-w-[10rem] px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={() => handleSearch(undefined, true)}
              disabled={loading}
              className="px-5 sm:px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? '검색 중...' : '검색'}
            </button>
            <button
              onClick={() => handleSearch(undefined, false)}
              disabled={loading || !characterName.trim()}
              className="px-5 sm:px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed border border-gray-600"
            >
              갱신
            </button>
          </div>
          
          <div>
              <label className="block text-sm text-gray-300 mb-2">내 원정대 캐릭터</label>
              <select
                value={characterName}
                onChange={(e) => handleCharacterSelect(e.target.value)}
                disabled={loading || loadingRoster}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {loadingRoster ? '원정대 불러오는 중...' : '캐릭터 선택'}
                </option>
                {rosterCharacters.map((char, idx) => {
                  const charName = char.CharacterName || '알 수 없음';
                  const className = char.CharacterClassName || '알 수 없음';
                  const itemLevel = char.ItemAvgLevel
                    || char.ItemLevel 
                    || char.ItemMaxLevel 
                    || char.itemAvgLevel
                    || char.itemLevel
                    || char.itemMaxLevel
                    || '?';
                  return (
                    <option key={idx} value={charName}>
                      {charName} ({className}) - 아이템 레벨: {itemLevel}
                    </option>
                  );
                })}
              </select>
            </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-900/50 rounded-xl border border-gray-700">
            <span className="hourglass-icon text-5xl sm:text-6xl mb-4 inline-block" aria-hidden>
              ⏳
            </span>
            <p className="text-lg sm:text-xl text-gray-300 font-medium">시뮬레이션 중</p>
            <style jsx>{`
              .hourglass-icon {
                animation: hourglass-flip 2s ease-in-out infinite;
              }
              @keyframes hourglass-flip {
                0%, 100% { transform: rotate(0deg); opacity: 1; }
                50% { transform: rotate(180deg); opacity: 0.9; }
              }
            `}</style>
          </div>
        ) : characterData ? (
          <>
            {/* 모드 전환 버튼 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('efficiency')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  viewMode === 'efficiency'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                재련 효율
              </button>
              <button
                type="button"
                onClick={() => setViewMode('target-level')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  viewMode === 'target-level'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                목표 레벨 계산
              </button>
            </div>

            {hasTier3Equipment ? (
              <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-6 text-center">
                <p className="text-yellow-300 text-lg font-semibold">
                  내 캐릭터 시뮬레이션은 전 부위 4티어 장비를 착용 시에만 제공 가능합니다
                </p>
              </div>
            ) : (
              <>
                {/* 목표 레벨 계산 모드: 레벨 선택기 */}
                {viewMode === 'target-level' && (
                  <div className="bg-gray-900/70 rounded-lg border border-gray-700 p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-sm text-white font-medium">목표 레벨</label>
                      <select
                        value={targetLevelDropdownValue ?? ''}
                        onChange={(e) => setTargetLevelDropdownValue(e.target.value ? Number(e.target.value) : null)}
                        className="px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">레벨 선택</option>
                        {targetLevelOptions.map(lvl => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setAppliedTargetLevel(targetLevelDropdownValue)}
                        disabled={!targetLevelDropdownValue}
                        className="px-4 py-1.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm"
                      >
                        계산 시작
                      </button>
                      {appliedTargetLevel != null && (
                        <span className="text-sm text-gray-400">
                          목표: <span className="text-purple-300 font-medium">{appliedTargetLevel}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 일반 재련 요약 정보 (재련 효율 모드에서만 표시) */}
                {viewMode === 'efficiency' && (
                <>
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700">
                    <h3 className="text-base font-semibold text-white">일반 재련 요약</h3>
                  </div>
                  <ul className="divide-y divide-gray-800">
                    {summaryValues.craftItems.length > 0 && summaryValues.craftItems.map((item, idx) => {
                      const isProfitable = item.marketPrice != null && item.value > item.marketPrice;
                      const isLoss = item.marketPrice != null && item.value < item.marketPrice;
                      return (
                        <li key={idx} className={`flex items-center gap-3 px-3 py-1.5 ${idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30'}`}>
                          <span className="min-w-[7rem] text-gray-300 shrink-0">{item.name}</span>
                          <span className="text-yellow-300 font-medium shrink-0">{formatNumberWithSignificantDigits(item.value)}g</span>
                          <span className="text-gray-500 shrink-0">
                            {item.marketPrice != null ? `${formatNumberWithSignificantDigits(item.marketPrice)}g` : '-'}
                          </span>
                          {item.marketPrice != null ? (
                            isProfitable ? (
                              <span className="text-green-400 ml-auto">사는 게 이득</span>
                            ) : isLoss ? (
                              <span className="text-red-400 ml-auto">사는 게 손해</span>
                            ) : (
                              <span className="text-gray-500 ml-auto">-</span>
                            )
                          ) : (
                            <span className="text-gray-500 ml-auto">-</span>
                          )}
                        </li>
                      );
                    })}
                    <li className={`flex items-center gap-3 px-3 py-1.5 ${summaryValues.craftItems.length % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30'}`}>
                      <span className="min-w-[7rem] text-gray-300 shrink-0">용암의 숨결</span>
                      <span className="text-blue-300 font-medium shrink-0">
                        {summaryValues.lavaBreathValue != null ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathValue)}g` : '-'}
                      </span>
                      <span className="text-gray-500 shrink-0">
                        {summaryValues.lavaBreathMarketPrice != null ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathMarketPrice)}g` : '-'}
                      </span>
                      {summaryValues.lavaBreathValue != null && summaryValues.lavaBreathMarketPrice != null ? (
                        summaryValues.lavaBreathValue > summaryValues.lavaBreathMarketPrice ? (
                          <span className="text-green-400 ml-auto">사는 게 이득</span>
                        ) : summaryValues.lavaBreathValue < summaryValues.lavaBreathMarketPrice ? (
                          <span className="text-red-400 ml-auto">사는 게 손해</span>
                        ) : (
                          <span className="text-gray-500 ml-auto">-</span>
                        )
                      ) : (
                        <span className="text-gray-500 ml-auto">-</span>
                      )}
                    </li>
                    <li className={`flex items-center gap-3 px-3 py-1.5 ${(summaryValues.craftItems.length + 1) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30'}`}>
                      <span className="min-w-[7rem] text-gray-300 shrink-0">빙하의 숨결</span>
                      <span className="text-purple-300 font-medium shrink-0">
                        {summaryValues.iceBreathValue != null ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathValue)}g` : '-'}
                      </span>
                      <span className="text-gray-500 shrink-0">
                        {summaryValues.iceBreathMarketPrice != null ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathMarketPrice)}g` : '-'}
                      </span>
                      {summaryValues.iceBreathValue != null && summaryValues.iceBreathMarketPrice != null ? (
                        summaryValues.iceBreathValue > summaryValues.iceBreathMarketPrice ? (
                          <span className="text-green-400 ml-auto">사는 게 이득</span>
                        ) : summaryValues.iceBreathValue < summaryValues.iceBreathMarketPrice ? (
                          <span className="text-red-400 ml-auto">사는 게 손해</span>
                        ) : (
                          <span className="text-gray-500 ml-auto">-</span>
                        )
                      ) : (
                        <span className="text-gray-500 ml-auto">-</span>
                      )}
                    </li>
                    {summaryValues.circularBreakthroughValue != null && (
                      <li className={`flex items-center gap-3 px-3 py-1.5 ${(summaryValues.craftItems.length + 3) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30'}`}>
                        <span className="min-w-[7rem] text-gray-300 shrink-0">순환 돌파석</span>
                        <span className="text-green-300 font-medium shrink-0">{formatNumberWithSignificantDigits(summaryValues.circularBreakthroughValue)}g</span>
                        <span className="text-gray-500 shrink-0">-</span>
                        <span className="text-gray-300 ml-auto truncate">
                          {summaryValues.circularBreakthroughBestEquipment
                            ? `${summaryValues.circularBreakthroughBestEquipment.replace(/\s*\+\d+.*$/, '').trim()} 부위 우선`
                            : '-'}
                        </span>
                      </li>
                    )}
                    {summaryValues.transitionBreakthroughValue != null && (
                      <li className={`flex items-center gap-3 px-3 py-1.5 ${(summaryValues.craftItems.length + 4) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30'}`}>
                        <span className="min-w-[7rem] text-gray-300 shrink-0">전이 돌파석</span>
                        <span className="text-green-300 font-medium shrink-0">{formatNumberWithSignificantDigits(summaryValues.transitionBreakthroughValue)}g</span>
                        <span className="text-gray-500 shrink-0">-</span>
                        <span className="text-gray-300 ml-auto truncate">
                          {summaryValues.transitionBreakthroughBestEquipment
                            ? `${summaryValues.transitionBreakthroughBestEquipment.replace(/\s*\+\d+.*$/, '').trim()} 부위 우선`
                            : '-'}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* 상급재련 전략 요약 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700">
                    <h3 className="text-base font-semibold text-white">상급재련 전략 요약</h3>
                    <p className="hidden sm:block text-[11px] text-gray-400 mt-0.5">목표 상급재련 단계별 보조재료 가치 및 전략 분석 (상급 재련 시뮬레이션 기반)</p>
                  </div>
                  <div className="p-3 space-y-4">
                    {!advancedRefiningAnalysis || advancedRefiningAnalysis.length === 0 ? (
                      <p className="text-gray-400 text-center py-2">상급재련 목표가 있는 장비가 없습니다.</p>
                    ) : (
                      (() => {
                        // 단계별로 그룹화
                        const groupedByStage = advancedRefiningAnalysis.reduce((acc, analysis) => {
                          if (!acc[analysis.stage]) acc[analysis.stage] = [];
                          acc[analysis.stage].push(analysis);
                          return acc;
                        }, {} as Record<string, typeof advancedRefiningAnalysis>);
                        // 가장 낮은 단계만 표시
                        const stageOrder = ['상재1', '상재2', '상재3', '상재4'];
                        const lowestStage = stageOrder.find(s => groupedByStage[s]);
                        if (!lowestStage) return null;
                        const analyses = groupedByStage[lowestStage];
                        const stage = lowestStage;

                        const isLevel3Or4 = stage === '상재3' || stage === '상재4';
                        const weaponAnalysis = analyses.find(a => a.gearType === '무기');
                        const armorAnalysis = analyses.find(a => a.gearType === '방어구');

                        return (
                            <div key={stage} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* 무기 */}
                                {weaponAnalysis && (
                                  <div className="border border-gray-600 rounded-lg p-2 bg-gray-800/50">
                                    <h5 className="text-xs font-semibold text-blue-300 mb-2">무기</h5>
                                    <div className="space-y-2.5 text-[11px]">
                                      {/* 장인의 야금술 */}
                                      {weaponAnalysis.craftItemName && (
                                        <div className="flex flex-col gap-1 pb-2 border-b border-gray-700">
                                          <div className="flex items-center justify-between">
                                            <span className="text-gray-200 font-medium">{weaponAnalysis.craftItemName}</span>
                                            <span className="text-gray-500 text-[10px]">
                                              거래소: {weaponAnalysis.craftMarketPrice != null ? `${formatNumberWithSignificantDigits(weaponAnalysis.craftMarketPrice)}g` : '-'}
                                            </span>
                                          </div>
                                          <div className="pl-2 space-y-0.5">
                                            {isLevel3Or4 && weaponAnalysis.craftAnalysis.enhancedAncestor && (
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-400">강화선조턴</span>
                                                <div className="flex items-center gap-2">
                                                  {weaponAnalysis.craftAnalysis.enhancedAncestor.realValue != null ? (
                                                    <>
                                                      <span className="text-yellow-300">{formatNumberWithSignificantDigits(weaponAnalysis.craftAnalysis.enhancedAncestor.realValue)}g</span>
                                                      <span className={weaponAnalysis.craftAnalysis.enhancedAncestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {weaponAnalysis.craftAnalysis.enhancedAncestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <span className="text-gray-500">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">선조턴</span>
                                              <div className="flex items-center gap-2">
                                                {weaponAnalysis.craftAnalysis.ancestor.realValue != null ? (
                                                  <>
                                                    <span className="text-yellow-300">{formatNumberWithSignificantDigits(weaponAnalysis.craftAnalysis.ancestor.realValue)}g</span>
                                                    <span className={weaponAnalysis.craftAnalysis.ancestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                      {weaponAnalysis.craftAnalysis.ancestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                    </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">일반턴</span>
                                              <div className="flex items-center gap-2">
                                                {weaponAnalysis.craftAnalysis.normal.realValue != null ? (
                                                  <>
                                                    <span className="text-yellow-300">{formatNumberWithSignificantDigits(weaponAnalysis.craftAnalysis.normal.realValue)}g</span>
                                                    <span className={weaponAnalysis.craftAnalysis.normal.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                      {weaponAnalysis.craftAnalysis.normal.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                    </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {/* 용암의 숨결 */}
                                      {weaponAnalysis.breathItemName && (
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center justify-between">
                                            <span className="text-gray-200 font-medium">{weaponAnalysis.breathItemName}</span>
                                            <span className="text-gray-500 text-[10px]">
                                              거래소: {weaponAnalysis.breathMarketPrice != null ? `${formatNumberWithSignificantDigits(weaponAnalysis.breathMarketPrice)}g` : '-'}
                                            </span>
                                          </div>
                                          <div className="pl-2 space-y-0.5">
                                            {isLevel3Or4 && weaponAnalysis.breathAnalysis.enhancedAncestor && (
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-400">강화선조턴</span>
                                                <div className="flex items-center gap-2">
                                                  {weaponAnalysis.breathAnalysis.enhancedAncestor.realValue != null ? (
                                                    <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(weaponAnalysis.breathAnalysis.enhancedAncestor.realValue)}g</span>
                                                      <span className={weaponAnalysis.breathAnalysis.enhancedAncestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {weaponAnalysis.breathAnalysis.enhancedAncestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <span className="text-gray-500">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">선조턴</span>
                                              <div className="flex items-center gap-2">
                                                {weaponAnalysis.breathAnalysis.ancestor.realValue != null ? (
                                                  <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(weaponAnalysis.breathAnalysis.ancestor.realValue)}g</span>
                                                      <span className={weaponAnalysis.breathAnalysis.ancestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {weaponAnalysis.breathAnalysis.ancestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">일반턴</span>
                                              <div className="flex items-center gap-2">
                                                {weaponAnalysis.breathAnalysis.normal.realValue != null ? (
                                                  <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(weaponAnalysis.breathAnalysis.normal.realValue)}g</span>
                                                      <span className={weaponAnalysis.breathAnalysis.normal.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {weaponAnalysis.breathAnalysis.normal.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* 방어구 */}
                                {armorAnalysis && (
                                  <div className="border border-gray-600 rounded-lg p-2 bg-gray-800/50">
                                    <h5 className="text-xs font-semibold text-purple-300 mb-2">방어구</h5>
                                    <div className="space-y-2.5 text-[11px]">
                                      {/* 장인의 재봉술 */}
                                      {armorAnalysis.craftItemName && (
                                        <div className="flex flex-col gap-1 pb-2 border-b border-gray-700">
                                          <div className="flex items-center justify-between">
                                            <span className="text-gray-200 font-medium">{armorAnalysis.craftItemName}</span>
                                            <span className="text-gray-500 text-[10px]">
                                              거래소: {armorAnalysis.craftMarketPrice != null ? `${formatNumberWithSignificantDigits(armorAnalysis.craftMarketPrice)}g` : '-'}
                                            </span>
                                          </div>
                                          <div className="pl-2 space-y-0.5">
                                            {isLevel3Or4 && armorAnalysis.craftAnalysis.enhancedAncestor && (
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-400">강화선조턴</span>
                                                <div className="flex items-center gap-2">
                                                  {armorAnalysis.craftAnalysis.enhancedAncestor.realValue != null ? (
                                                    <>
                                                      <span className="text-yellow-300">{formatNumberWithSignificantDigits(armorAnalysis.craftAnalysis.enhancedAncestor.realValue)}g</span>
                                                      <span className={armorAnalysis.craftAnalysis.enhancedAncestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.craftAnalysis.enhancedAncestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <span className="text-gray-500">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">선조턴</span>
                                              <div className="flex items-center gap-2">
                                                {armorAnalysis.craftAnalysis.ancestor.realValue != null ? (
                                                  <>
                                                      <span className="text-yellow-300">{formatNumberWithSignificantDigits(armorAnalysis.craftAnalysis.ancestor.realValue)}g</span>
                                                      <span className={armorAnalysis.craftAnalysis.ancestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.craftAnalysis.ancestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">일반턴</span>
                                              <div className="flex items-center gap-2">
                                                {armorAnalysis.craftAnalysis.normal.realValue != null ? (
                                                  <>
                                                      <span className="text-yellow-300">{formatNumberWithSignificantDigits(armorAnalysis.craftAnalysis.normal.realValue)}g</span>
                                                      <span className={armorAnalysis.craftAnalysis.normal.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.craftAnalysis.normal.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {/* 빙하의 숨결 */}
                                      {armorAnalysis.breathItemName && (
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center justify-between">
                                            <span className="text-gray-200 font-medium">{armorAnalysis.breathItemName}</span>
                                            <span className="text-gray-500 text-[10px]">
                                              거래소: {armorAnalysis.breathMarketPrice != null ? `${formatNumberWithSignificantDigits(armorAnalysis.breathMarketPrice)}g` : '-'}
                                            </span>
                                          </div>
                                          <div className="pl-2 space-y-0.5">
                                            {isLevel3Or4 && armorAnalysis.breathAnalysis.enhancedAncestor && (
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-400">강화선조턴</span>
                                                <div className="flex items-center gap-2">
                                                  {armorAnalysis.breathAnalysis.enhancedAncestor.realValue != null ? (
                                                    <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(armorAnalysis.breathAnalysis.enhancedAncestor.realValue)}g</span>
                                                      <span className={armorAnalysis.breathAnalysis.enhancedAncestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.breathAnalysis.enhancedAncestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <span className="text-gray-500">-</span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">선조턴</span>
                                              <div className="flex items-center gap-2">
                                                {armorAnalysis.breathAnalysis.ancestor.realValue != null ? (
                                                  <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(armorAnalysis.breathAnalysis.ancestor.realValue)}g</span>
                                                      <span className={armorAnalysis.breathAnalysis.ancestor.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.breathAnalysis.ancestor.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-400">일반턴</span>
                                              <div className="flex items-center gap-2">
                                                {armorAnalysis.breathAnalysis.normal.realValue != null ? (
                                                  <>
                                                      <span className="text-orange-300">{formatNumberWithSignificantDigits(armorAnalysis.breathAnalysis.normal.realValue)}g</span>
                                                      <span className={armorAnalysis.breathAnalysis.normal.profitable ? 'text-green-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                                                        {armorAnalysis.breathAnalysis.normal.profitable ? '사는 게 이득' : '사는 게 손해'}
                                                      </span>
                                                  </>
                                                ) : (
                                                  <span className="text-gray-500">-</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                        );
                      })()
                    )}
                  </div>
                </div>
                </>
                )}

                {/* 장비 표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  {viewMode === 'efficiency' && (
                  <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex flex-wrap items-center gap-3">
                    <label className={`flex items-center gap-3 select-none rounded-lg px-3 py-2 ${hasKazeros1730Equipment ? 'cursor-pointer bg-gray-700/70 hover:bg-gray-700 border border-gray-600' : 'cursor-not-allowed opacity-60 bg-gray-800/50 border border-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={convertKazeros1730ToSerka}
                        onChange={(e) => setConvertKazeros1730ToSerka(e.target.checked)}
                        disabled={!hasKazeros1730Equipment}
                        className="w-5 h-5 rounded border-2 border-gray-500 bg-gray-800 text-purple-500 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed accent-purple-500"
                      />
                      <span className="text-sm font-medium text-gray-200">1730 이상의 카제로스 장비를 세르카 장비로의 계승 기준으로 계산</span>
                    </label>
                  </div>
                  )}
                  <div className="overflow-x-auto sm:overflow-visible">
                    <table className="w-full border border-gray-800 text-[11px] sm:text-[13px] md:text-sm table-fixed sm:table-auto sm:min-w-[880px]">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-1 sm:px-3 py-1.5 sm:py-3 text-left font-medium border-b border-gray-700 w-[20%] sm:w-auto sm:min-w-[3.5rem]">장비 부위</th>
                          <th className="hidden sm:table-cell px-2 sm:px-3 py-2 sm:py-3 text-left font-medium border-b border-gray-700 min-w-[7rem]">장비명</th>
                          <th className="px-1 sm:px-3 py-1.5 sm:py-3 text-center font-medium border-b border-gray-700 w-[14%] sm:w-auto sm:min-w-[4.5rem]">목표 재련</th>
                          {viewMode === 'efficiency' && (<>
                          <th className="px-1 sm:px-3 py-1.5 sm:py-3 text-right font-medium border-b border-gray-700 w-[22%] sm:w-auto sm:min-w-[6.5rem]">야금/재봉</th>
                          <th className="px-1 sm:px-3 py-1.5 sm:py-3 text-right font-medium border-b border-gray-700 w-[22%] sm:w-auto sm:min-w-[5.5rem]">숨결</th>
                          <th className="px-1 sm:px-3 py-1.5 sm:py-3 text-right font-medium border-b border-gray-700 w-[22%] sm:w-auto sm:min-w-[5rem]">돌파석</th>
                          </>)}
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentWithValues.length > 0 ? (
                          equipmentWithValues.map((eq, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                              <td className="px-1 sm:px-3 py-1.5 sm:py-3 text-white font-medium border-b border-gray-800 align-top">
                                <span className="sm:hidden block leading-tight">
                                  {eq.type}
                                  <span className="block text-[10px] text-gray-400 font-normal">({eq.isSerkaEquipment ? '세르카' : '카제'}장비)</span>
                                </span>
                                <span className="hidden sm:inline">{eq.type}</span>
                              </td>
                              <td className="hidden sm:table-cell px-2 sm:px-3 py-2 sm:py-3 text-gray-300 border-b border-gray-800 align-top max-w-[12rem]">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-start gap-2 min-w-0">
                                    {eq.Icon && (
                                      <img src={eq.Icon} alt={eq.Name} className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0" />
                                    )}
                                    <span className="break-words min-w-0">{eq.Name}</span>
                                  </div>
                                  {eq.advancedProgress != null && (
                                    <span className="text-[11px] sm:text-xs text-gray-400 break-words">{eq.advancedProgress}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-1 sm:px-3 py-1.5 sm:py-3 text-center text-blue-300 font-medium border-b border-gray-800 align-top">
                                {viewMode === 'efficiency' ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="whitespace-nowrap">{eq.targetLevel != null ? `+${eq.targetLevel}` : '-'}</span>
                                  {eq.convertedToSerka && (
                                    <span className="text-[10px] sm:text-[11px] text-amber-400/90">세르카 환산</span>
                                  )}
                                  {(() => {
                                    const adv = getAdvancedTargetLabel(eq.advancedProgress);
                                    return adv ? <span className="hidden sm:inline text-[11px] sm:text-xs text-gray-400">{adv}</span> : null;
                                  })()}
                                  {eq.avgConsumption && eq.avgConsumption.length > 0 && (
                                    <div className="relative inline-flex flex-col items-center mt-1">
                                      <button
                                        type="button"
                                        onClick={() => setDetailTooltipIndex((prev) => (prev === idx ? null : idx))}
                                        className="text-[11px] px-2 py-0.5 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700/80 border border-gray-600"
                                        aria-label="평균 재료 소모량 보기"
                                      >
                                        상세
                                      </button>
                                      {detailTooltipIndex === idx && (
                                        <>
                                          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setDetailTooltipIndex(null)} />
                                          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-20 min-w-[200px] max-w-[90vw] rounded-lg border border-gray-600 bg-gray-800 py-2.5 px-3 shadow-xl">
                                            <div className="text-xs font-semibold text-purple-200 mb-1.5">평균 재료 소모량</div>
                                            <div className="flex flex-wrap gap-x-2 gap-y-1.5 text-xs text-gray-300">
                                              {eq.avgConsumption.map((item: { name: string; quantity: number }) => {
                                                const nameMap: Record<string, string> = eq.isSerkaEquipment ? { '운명의 파괴석': '운명의 파괴석 결정', '운명의 수호석': '운명의 수호석 결정', '운명의 돌파석': '위대한 운명의 돌파석', '아비도스 융화 재료': '상급 아비도스 융화 재료' } : {};
                                                const displayName = nameMap[item.name] || item.name;
                                                const q = formatNumberWithSignificantDigits(item.quantity);
                                                const unit = item.name === '골드' ? ' 골드' : item.name === '실링' ? ' 실링' : '개';
                                                const qDisplay = item.name === '운명의 파편 (경험치)' ? `${q}개 (경험치)` : `${q}${unit}`;
                                                return (
                                                  <span key={item.name} className="inline-flex items-center gap-1 whitespace-nowrap" title={displayName}>
                                                    <ItemIcon name={displayName} size="sm" className="flex-shrink-0" />
                                                    <span>{qDisplay}</span>
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                                ) : (
                                  /* 목표 레벨 계산 모드 */
                                  (() => {
                                    const ts = targetLevelStages?.[idx];
                                    if (!ts || ts.targetStageLevel == null) return <span className="text-gray-500">-</span>;
                                    const isKazerosToSerkaConversion = ts.useSerkaForDisplay && !eq.isSerkaEquipment;
                                    const isAlready = !isKazerosToSerkaConversion && ts.targetStageLevel === (eq.currentLevel ?? -1);
                                    const currentStage = eq.currentLevel ?? 0;
                                    const progressionSteps = !isAlready
                                      ? getProgressionSteps(currentStage, ts.targetStageLevel, isKazerosToSerkaConversion)
                                      : [];
                                    return (
                                      <div className="relative inline-flex flex-col items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={() => setTargetLevelProgressionIndex((prev) => (prev === idx ? null : idx))}
                                          className="text-left hover:bg-gray-700/50 rounded px-1 -mx-1 py-0.5 cursor-pointer"
                                          aria-label="재련 진행 과정 보기"
                                        >
                                          <span className="whitespace-nowrap">
                                            {isAlready
                                              ? <span className="text-gray-400 text-[10px]">현재 단계</span>
                                              : `+${ts.targetStageLevel}`}
                                          </span>
                                          {ts.targetItemLevel != null && (
                                            <span className="block text-[10px] text-gray-400">{ts.targetItemLevel}</span>
                                          )}
                                          {isKazerosToSerkaConversion && (
                                            <span className="text-[10px] text-amber-400/90">세르카 계승</span>
                                          )}
                                          {eq.convertedToSerka && !isKazerosToSerkaConversion && (
                                            <span className="text-[10px] text-amber-400/90">세르카 환산</span>
                                          )}
                                        </button>
                                        {targetLevelProgressionIndex === idx && progressionSteps.length > 0 && (
                                          <>
                                            <div className="fixed inset-0 z-10" aria-hidden onClick={() => setTargetLevelProgressionIndex(null)} />
                                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-20 min-w-[180px] max-w-[90vw] rounded-lg border border-gray-600 bg-gray-800 py-2.5 px-3 shadow-xl">
                                              <div className="text-xs font-semibold text-purple-200 mb-1.5">{eq.type} 재련 진행 과정</div>
                                              <ul className="space-y-1 text-xs text-gray-300">
                                                {progressionSteps.map((step, i) => (
                                                  <li key={i} className={step === '세르카 계승' ? 'text-amber-400 font-medium' : ''}>
                                                    {step}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()
                                )}
                              </td>
                              {viewMode === 'efficiency' && (<>
                              <td className="px-1 sm:px-3 py-1.5 sm:py-3 text-right border-b border-gray-800 align-top min-w-0">
                                {eq.craftValue != null || eq.enhancedCraftValue != null ? (
                                  <div className="space-y-1 sm:space-y-1.5">
                                    {eq.craftValue != null && (
                                      <div className="break-words">
                                        <div className="text-yellow-300 font-medium text-[10px] sm:text-sm">
                                          {formatNumberWithSignificantDigits(eq.craftValue)}<span className="sm:hidden"> G</span><span className="hidden sm:inline"> 골드</span>
                                        </div>
                                        {eq.craftItemName && (
                                          <>
                                            <div className="sm:hidden flex items-center gap-1 mt-0.5 justify-end">
                                              <button type="button" onClick={() => setMobileItemTooltip({ title: eq.craftItemName!, lines: eq.craftMarketPrice != null ? [`거래소: ${formatNumberWithSignificantDigits(eq.craftMarketPrice)} 골드`] : [] })} className="flex-shrink-0" aria-label={eq.craftItemName}>
                                                <ItemIcon name={eq.craftItemName} size="sm" className="w-5 h-5 sm:w-8 sm:h-8" />
                                              </button>
                                            </div>
                                            <div className="hidden sm:block text-[10px] sm:text-xs text-gray-400 mt-0.5 break-words">{eq.craftItemName}</div>
                                            {eq.craftMarketPrice != null && (
                                              <div className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-0.5">거래소: {formatNumberWithSignificantDigits(eq.craftMarketPrice)} 골드</div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                    {eq.enhancedCraftValue != null && (
                                      <div className={eq.craftValue != null ? 'pt-1 sm:pt-1.5 border-t border-gray-700' : ''}>
                                        <div className="text-amber-300 font-medium text-[10px] sm:text-sm">
                                          {formatNumberWithSignificantDigits(eq.enhancedCraftValue)}<span className="sm:hidden"> G</span><span className="hidden sm:inline"> 골드</span>
                                        </div>
                                        {eq.enhancedCraftItemName && (
                                          <>
                                            <div className="sm:hidden flex items-center gap-1 mt-0.5 justify-end">
                                              <button type="button" onClick={() => setMobileItemTooltip({ title: eq.enhancedCraftItemName!, lines: eq.enhancedCraftMarketPrice != null ? [`거래소: ${formatNumberWithSignificantDigits(eq.enhancedCraftMarketPrice)} 골드`] : [] })} className="relative flex-shrink-0" aria-label={eq.enhancedCraftItemName}>
                                                <ItemIcon name={eq.enhancedCraftItemName} size="sm" className="w-5 h-5 sm:w-8 sm:h-8" />
                                                <span className="absolute -top-0.5 -right-0.5 text-[8px] leading-none text-amber-400" aria-hidden>▲</span>
                                              </button>
                                            </div>
                                            <div className="hidden sm:block text-[10px] sm:text-xs text-gray-400 mt-0.5 break-words">{eq.enhancedCraftItemName}</div>
                                            {eq.enhancedCraftMarketPrice != null && (
                                              <div className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-0.5">거래소: {formatNumberWithSignificantDigits(eq.enhancedCraftMarketPrice)} 골드</div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-1 sm:px-3 py-1.5 sm:py-3 text-right border-b border-gray-800 align-top min-w-0">
                                {eq.breathValue != null ? (
                                  <div className="break-words">
                                    <div className="text-orange-300 font-medium text-[10px] sm:text-sm">
                                      {formatNumberWithSignificantDigits(eq.breathValue)}<span className="sm:hidden"> G</span><span className="hidden sm:inline"> 골드</span>
                                    </div>
                                    {eq.breathItemName && (
                                      <>
                                        <div className="sm:hidden flex items-center gap-1 mt-0.5 justify-end">
                                          <button type="button" onClick={() => setMobileItemTooltip({ title: eq.breathItemName!, lines: eq.breathMarketPrice != null ? [`거래소: ${formatNumberWithSignificantDigits(eq.breathMarketPrice)} 골드`] : [] })} className="flex-shrink-0" aria-label={eq.breathItemName}>
                                            <ItemIcon name={eq.breathItemName} size="sm" className="w-5 h-5 sm:w-8 sm:h-8" />
                                          </button>
                                        </div>
                                        <div className="hidden sm:block text-[10px] sm:text-xs text-gray-400 mt-0.5 break-words">{eq.breathItemName}</div>
                                        {eq.breathMarketPrice != null && (
                                          <div className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-0.5">거래소: {formatNumberWithSignificantDigits(eq.breathMarketPrice)} 골드</div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-1 sm:px-3 py-1.5 sm:py-3 text-right border-b border-gray-800 align-top min-w-0">
                                {eq.breakthroughValue != null ? (
                                  <div>
                                    <div className="text-green-300 font-medium text-[10px] sm:text-sm">
                                      {formatNumberWithSignificantDigits(eq.breakthroughValue)}<span className="sm:hidden"> G</span><span className="hidden sm:inline"> 골드</span>
                                    </div>
                                    <div className="sm:hidden flex items-center gap-1 mt-0.5 justify-end">
                                      <ItemIcon name={eq.isSerkaEquipment ? '전이 돌파석' : '순환 돌파석'} size="sm" className="w-5 h-5 flex-shrink-0" />
                                    </div>
                                    <div className="hidden sm:block text-[10px] sm:text-xs text-gray-400 mt-0.5">
                                      {eq.isSerkaEquipment ? '전이 돌파석' : '순환 돌파석'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              </>)}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={viewMode === 'efficiency' ? 6 : 3} className="px-2 sm:px-4 py-8 text-center text-gray-400 text-sm">
                              장비 정보를 불러올 수 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {viewMode === 'target-level' && appliedTargetLevel != null && equipmentWithValues.length > 0 && (
                    <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/50 flex flex-wrap items-center gap-4 text-sm">
                      <span className="text-gray-300">
                        현재 아이템 레벨 평균:{' '}
                        <span className="font-medium text-white">
                          {currentAvgItemLevel != null
                            ? currentAvgItemLevel.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                            : '-'}
                        </span>
                      </span>
                      <span className="text-gray-300">
                        목표 아이템 레벨 평균:{' '}
                        <span className="font-medium text-purple-300">{appliedTargetLevel}</span>
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* 모바일: 아이템 툴팁 (아이콘 터치 시) */}
      {mobileItemTooltip && (
        <div className="fixed inset-0 z-50 sm:hidden" aria-modal="true" role="dialog" aria-label="아이템 상세">
          <button type="button" className="absolute inset-0 bg-black/50 focus:outline-none" onClick={() => setMobileItemTooltip(null)} aria-label="닫기" />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-xl bg-gray-800 border border-gray-700 border-b-0 shadow-2xl p-4 max-h-[60vh] overflow-y-auto">
            <h4 className="text-sm font-semibold text-white mb-2 break-keep">{mobileItemTooltip.title}</h4>
            <ul className="space-y-1 text-xs text-gray-300">
              {mobileItemTooltip.lines.map((line, i) => (
                <li key={i} className="break-keep">{line}</li>
              ))}
            </ul>
            <button type="button" className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg" onClick={() => setMobileItemTooltip(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  weaponStages: RefiningStage[];
  armorStages: RefiningStage[];
  weaponStagesSerka: RefiningStage[];
  armorStagesSerka: RefiningStage[];
  marketInfo: Record<string, MarketItemInfo>;
  sillingUnitPrice: number;
  valueDbMap?: Record<string, ValueDbEntry>;
  silverCashValue?: number | null;
  initialRates?: { exchange: number | null; discord: number | null };
  initialCrystalGoldRate?: number | null;
};

export default function CharacterSimulationClient({ weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, marketInfo, sillingUnitPrice, valueDbMap = {}, silverCashValue = null, initialRates, initialCrystalGoldRate }: Props) {
  return (
    <CharacterSimulation
      weaponStages={weaponStages}
      armorStages={armorStages}
      weaponStagesSerka={weaponStagesSerka}
      armorStagesSerka={armorStagesSerka}
      marketInfo={marketInfo}
      sillingUnitPrice={sillingUnitPrice}
      valueDbMap={valueDbMap}
      silverCashValue={silverCashValue}
      initialRates={initialRates}
      initialCrystalGoldRate={initialCrystalGoldRate}
    />
  );
}
