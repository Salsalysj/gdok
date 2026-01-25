'use client';

import { useMemo, useState, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { RefiningStage, MarketItemInfo } from './page';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';

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

function CharacterSimulation({ weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, marketInfo, sillingUnitPrice }: { weaponStages: RefiningStage[]; armorStages: RefiningStage[]; weaponStagesSerka: RefiningStage[]; armorStagesSerka: RefiningStage[]; marketInfo: Record<string, MarketItemInfo>; sillingUnitPrice: number }) {
  const [characterName, setCharacterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [characterData, setCharacterData] = useState<CharacterArmory | null>(null);
  const [rosterCharacters, setRosterCharacters] = useState<RosterCharacter[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // 원정대 캐릭터 목록 불러오기
  const loadRoster = async (name: string) => {
    if (!name.trim()) return;
    
    try {
      setLoadingRoster(true);
      const res = await fetch(`/api/character/roster?characterName=${encodeURIComponent(name.trim())}`);
      const data = await res.json();
      
      if (res.ok && Array.isArray(data)) {
        const characterPromises = data.map(async (char: any) => {
          const characterName = char.CharacterName || char.characterName;
          if (!characterName) {
            const itemLevel = char.ItemAvgLevel
              || char.ItemLevel 
              || char.ItemMaxLevel 
              || char.itemAvgLevel
              || char.itemLevel
              || char.itemMaxLevel
              || char.CharacterItemLevel
              || char.characterItemLevel
              || '?';
            
            return {
              CharacterName: characterName,
              CharacterClassName: char.CharacterClassName || char.characterClassName,
              ItemAvgLevel: char.ItemAvgLevel || char.itemAvgLevel || itemLevel,
              ItemLevel: char.ItemLevel || char.itemLevel || itemLevel,
              ItemMaxLevel: char.ItemMaxLevel || char.itemMaxLevel,
              ServerName: char.ServerName || char.serverName,
            };
          }
          
          try {
            const detailRes = await fetch('/api/character/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterName }),
            });
            
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const armoryProfile = detailData.ArmoryProfile || {};
              
              const latestItemAvgLevel = armoryProfile.ItemAvgLevel 
                || armoryProfile.ItemLevel
                || detailData.ItemAvgLevel
                || detailData.ItemLevel
                || detailData.ItemMaxLevel
                || detailData.itemAvgLevel
                || detailData.itemLevel
                || detailData.itemMaxLevel
                || null;
              
              const itemLevel = latestItemAvgLevel
                || char.ItemAvgLevel
                || char.ItemLevel
                || char.ItemMaxLevel
                || char.itemAvgLevel
                || char.itemLevel
                || char.itemMaxLevel
                || '?';
              
              return {
                CharacterName: characterName,
                CharacterClassName: char.CharacterClassName || char.characterClassName,
                ItemAvgLevel: armoryProfile.ItemAvgLevel || latestItemAvgLevel || itemLevel,
                ItemLevel: armoryProfile.ItemLevel || detailData.ItemLevel || detailData.itemLevel || itemLevel,
                ItemMaxLevel: armoryProfile.ItemMaxLevel || detailData.ItemMaxLevel || detailData.itemMaxLevel,
                ServerName: char.ServerName || char.serverName,
              };
            }
          } catch (err) {
            console.warn(`캐릭터 ${characterName} 상세 정보 조회 실패:`, err);
          }
          
          const itemLevel = char.ItemAvgLevel
            || char.ItemLevel 
            || char.ItemMaxLevel 
            || char.itemAvgLevel
            || char.itemLevel
            || char.itemMaxLevel
            || char.CharacterItemLevel
            || char.characterItemLevel
            || '?';
          
          return {
            CharacterName: characterName,
            CharacterClassName: char.CharacterClassName || char.characterClassName,
            ItemAvgLevel: char.ItemAvgLevel || char.itemAvgLevel || itemLevel,
            ItemLevel: char.ItemLevel || char.itemLevel || itemLevel,
            ItemMaxLevel: char.ItemMaxLevel || char.itemMaxLevel,
            ServerName: char.ServerName || char.serverName,
          };
        });
        
        const characters = await Promise.all(characterPromises);
        setRosterCharacters(characters);
      } else {
        setRosterCharacters([]);
      }
    } catch (err) {
      console.error('원정대 정보 조회 실패:', err);
      setRosterCharacters([]);
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleSearch = async (searchName?: string) => {
    const nameToSearch = searchName || characterName.trim();
    if (!nameToSearch) {
      setError('캐릭터명을 입력해주세요.');
      return;
    }

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
        loadRoster(nameToSearch);
      } else {
        setError(data.error || '캐릭터를 찾을 수 없습니다.');
        setCharacterData(null);
        setRosterCharacters([]);
      }
    } catch (err) {
      setError('캐릭터 검색 중 오류가 발생했습니다.');
      setCharacterData(null);
      setRosterCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterSelect = (selectedName: string) => {
    setCharacterName(selectedName);
    handleSearch(selectedName);
  };

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
        return {
          ...eq,
          type,
          level,
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
      unitPrice: sillingUnitPrice,
      icon: marketInfo['실링']?.icon || FALLBACK_ICON[SILVER_ITEM] || null,
    };
    return adjusted;
  }, [marketInfo, adjustPrice, sillingUnitPrice]);

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
      const isSerkaEquipment = eq.Name?.includes('운명의 전율') || false;
      const stages = isWeapon 
        ? (isSerkaEquipment ? weaponStagesSerka : weaponStages)
        : (isSerkaEquipment ? armorStagesSerka : armorStages);
      const targetLevel = eq.level != null ? eq.level + 1 : null;
      const stage = targetLevel != null ? stages.find(s => s.level === targetLevel) : null;
      
      if (!stage || eq.level == null || targetLevel == null) {
        return {
          ...eq,
          craftValue: null,
          breathValue: null,
          breakthroughValue: null,
          targetLevel: targetLevel,
        };
      }

      const { materialValueAnalysis } = calculateOptimalStrategy(stage, adjustedMarketInfo);
      
      const craftValue = materialValueAnalysis?.metallurgy?.actualValuePerItem ?? null;
      const craftItemName = stage.metallurgyMaterial?.name || null;
      const craftMarketPrice = craftItemName ? (adjustedMarketInfo[craftItemName]?.unitPrice ?? null) : null;
      
      const enhancedCraftValue = materialValueAnalysis?.enhancedMetallurgy?.actualValuePerItem ?? null;
      const enhancedCraftItemName = stage.enhancedMetallurgyMaterial?.name || null;
      const enhancedCraftMarketPrice = enhancedCraftItemName ? (adjustedMarketInfo[enhancedCraftItemName]?.unitPrice ?? null) : null;
      
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
        targetLevel,
        isSerkaEquipment,
      };
    });
  }, [sortedEquipment, weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, adjustedMarketInfo, refreshKey]);

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

  return (
    <div className="min-h-screen bg-gray-950 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6 md:mb-10 px-4 sm:px-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1 sm:mb-2">내 캐릭터 시뮬레이션</h1>
        <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 whitespace-normal break-words">캐릭터명을 입력하여 착용 중인 장비의 재련 단계를 확인할 수 있습니다.</p>
      </div>

      <div className="space-y-8 px-4 sm:px-0">
        {/* 검색 입력 */}
        <div className="bg-gray-900/70 rounded-xl border border-gray-700 p-6 space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleSearch();
                }
              }}
              placeholder="캐릭터명을 입력하세요"
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? '검색 중...' : '검색'}
            </button>
          </div>
          
          {rosterCharacters.length > 0 && (
            <div>
              <label className="block text-sm text-gray-300 mb-2">내 원정대 캐릭터</label>
              <select
                value={characterName}
                onChange={(e) => handleCharacterSelect(e.target.value)}
                disabled={loading || loadingRoster}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">캐릭터 선택</option>
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
          )}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        {characterData && (
          <>
            {hasTier3Equipment ? (
              <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-6 text-center">
                <p className="text-yellow-300 text-lg font-semibold">
                  내 캐릭터 시뮬레이션은 전 부위 4티어 장비를 착용 시에만 제공 가능합니다
                </p>
              </div>
            ) : (
              <>
                {/* 요약 정보 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">요약 정보</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">아이템</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">실제 가치</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">거래소 가격</th>
                          <th className="px-4 py-3 text-center font-medium border-b border-gray-700">비교</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryValues.craftItems.length > 0 && summaryValues.craftItems.map((item, idx) => {
                          const isProfitable = item.marketPrice != null && item.value > item.marketPrice;
                          const isLoss = item.marketPrice != null && item.value < item.marketPrice;
                          return (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                              <td className="px-4 py-3 text-gray-300 border-b border-gray-800">{item.name}</td>
                              <td className="px-4 py-3 text-right text-yellow-300 font-medium border-b border-gray-800">
                                {formatNumberWithSignificantDigits(item.value)} 골드
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                                {item.marketPrice != null 
                                  ? `${formatNumberWithSignificantDigits(item.marketPrice)} 골드`
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-center border-b border-gray-800">
                                {item.marketPrice != null ? (
                                  isProfitable ? (
                                    <span className="text-green-400 font-medium">사는 게 이득</span>
                                  ) : isLoss ? (
                                    <span className="text-red-400 font-medium">사는 게 손해</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className={summaryValues.craftItems.length % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                          <td className="px-4 py-3 text-gray-300 border-b border-gray-800">용암의 숨결</td>
                          <td className="px-4 py-3 text-right text-blue-300 font-medium border-b border-gray-800">
                            {summaryValues.lavaBreathValue != null 
                              ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathValue)} 골드`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                            {summaryValues.lavaBreathMarketPrice != null 
                              ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathMarketPrice)} 골드`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center border-b border-gray-800">
                            {summaryValues.lavaBreathValue != null && summaryValues.lavaBreathMarketPrice != null ? (
                              summaryValues.lavaBreathValue > summaryValues.lavaBreathMarketPrice ? (
                                <span className="text-green-400 font-medium">사는 게 이득</span>
                              ) : summaryValues.lavaBreathValue < summaryValues.lavaBreathMarketPrice ? (
                                <span className="text-red-400 font-medium">사는 게 손해</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                        <tr className={(summaryValues.craftItems.length + 1) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                          <td className="px-4 py-3 text-gray-300 border-b border-gray-800">빙하의 숨결</td>
                          <td className="px-4 py-3 text-right text-purple-300 font-medium border-b border-gray-800">
                            {summaryValues.iceBreathValue != null 
                              ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathValue)} 골드`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                            {summaryValues.iceBreathMarketPrice != null 
                              ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathMarketPrice)} 골드`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center border-b border-gray-800">
                            {summaryValues.iceBreathValue != null && summaryValues.iceBreathMarketPrice != null ? (
                              summaryValues.iceBreathValue > summaryValues.iceBreathMarketPrice ? (
                                <span className="text-green-400 font-medium">사는 게 이득</span>
                              ) : summaryValues.iceBreathValue < summaryValues.iceBreathMarketPrice ? (
                                <span className="text-red-400 font-medium">사는 게 손해</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                        {summaryValues.circularBreakthroughValue != null && (
                          <tr className={(summaryValues.craftItems.length + 3) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">순환 돌파석</td>
                            <td className="px-4 py-3 text-right text-green-300 font-medium border-b border-gray-800">
                              {formatNumberWithSignificantDigits(summaryValues.circularBreakthroughValue)} 골드
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">-</td>
                            <td className="px-4 py-3 text-center border-b border-gray-800">
                              {summaryValues.circularBreakthroughBestEquipment ? (
                                <span className="text-gray-300">
                                  {summaryValues.circularBreakthroughBestEquipment.replace(/\s*\+\d+.*$/, '').trim()} 부위에 우선 사용
                                </span>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        )}
                        {summaryValues.transitionBreakthroughValue != null && (
                          <tr className={(summaryValues.craftItems.length + 4) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">전이 돌파석</td>
                            <td className="px-4 py-3 text-right text-green-300 font-medium border-b border-gray-800">
                              {formatNumberWithSignificantDigits(summaryValues.transitionBreakthroughValue)} 골드
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">-</td>
                            <td className="px-4 py-3 text-center border-b border-gray-800">
                              {summaryValues.transitionBreakthroughBestEquipment ? (
                                <span className="text-gray-300">
                                  {summaryValues.transitionBreakthroughBestEquipment.replace(/\s*\+\d+.*$/, '').trim()} 부위에 우선 사용
                                </span>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 장비 표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">장비 부위</th>
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">장비명</th>
                          <th className="px-4 py-3 text-center font-medium border-b border-gray-700">목표 재련 단계</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">야금/재봉 가치</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">숨결 가치</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">돌파석 가치</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentWithValues.length > 0 ? (
                          equipmentWithValues.map((eq, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                              <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                                {eq.type}
                              </td>
                              <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                                <div className="flex items-center gap-2">
                                  {eq.Icon && (
                                    <img src={eq.Icon} alt={eq.Name} className="w-6 h-6 object-contain" />
                                  )}
                                  <span>{eq.Name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-blue-300 font-medium border-b border-gray-800">
                                {eq.targetLevel != null ? `+${eq.targetLevel}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right border-b border-gray-800">
                                {eq.craftValue != null || eq.enhancedCraftValue != null ? (
                                  <div className="space-y-2">
                                    {eq.craftValue != null && (
                                      <div>
                                        <div className="text-yellow-300 font-medium">
                                          {formatNumberWithSignificantDigits(eq.craftValue)} 골드
                                        </div>
                                        {eq.craftItemName && (
                                          <div className="text-xs text-gray-400 mt-1">
                                            {eq.craftItemName}
                                          </div>
                                        )}
                                        {eq.craftMarketPrice != null && (
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            거래소: {formatNumberWithSignificantDigits(eq.craftMarketPrice)} 골드
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {eq.enhancedCraftValue != null && (
                                      <div className={eq.craftValue != null ? 'pt-2 border-t border-gray-700' : ''}>
                                        <div className="text-amber-300 font-medium">
                                          {formatNumberWithSignificantDigits(eq.enhancedCraftValue)} 골드
                                        </div>
                                        {eq.enhancedCraftItemName && (
                                          <div className="text-xs text-gray-400 mt-1">
                                            {eq.enhancedCraftItemName}
                                          </div>
                                        )}
                                        {eq.enhancedCraftMarketPrice != null && (
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            거래소: {formatNumberWithSignificantDigits(eq.enhancedCraftMarketPrice)} 골드
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right border-b border-gray-800">
                                {eq.breathValue != null ? (
                                  <div>
                                    <div className="text-orange-300 font-medium">
                                      {formatNumberWithSignificantDigits(eq.breathValue)} 골드
                                    </div>
                                    {eq.breathItemName && (
                                      <div className="text-xs text-gray-400 mt-1">
                                        {eq.breathItemName}
                                      </div>
                                    )}
                                    {eq.breathMarketPrice != null && (
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        거래소: {formatNumberWithSignificantDigits(eq.breathMarketPrice)} 골드
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right border-b border-gray-800">
                                {eq.breakthroughValue != null ? (
                                  <div>
                                    <div className="text-green-300 font-medium">
                                      {formatNumberWithSignificantDigits(eq.breakthroughValue)} 골드
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      {eq.isSerkaEquipment ? '전이 돌파석' : '순환 돌파석'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                              장비 정보를 불러올 수 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
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
};

export default function CharacterSimulationClient({ weaponStages, armorStages, weaponStagesSerka, armorStagesSerka, marketInfo, sillingUnitPrice }: Props) {
  return (
    <CharacterSimulation
      weaponStages={weaponStages}
      armorStages={armorStages}
      weaponStagesSerka={weaponStagesSerka}
      armorStagesSerka={armorStagesSerka}
      marketInfo={marketInfo}
      sillingUnitPrice={sillingUnitPrice}
    />
  );
}
