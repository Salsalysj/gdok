// 상재3, 4 시뮬레이션 결과 생성 스크립트
// 새로운 선조의 가호 시스템 적용

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type GearType = '무기' | '방어구';

// 상재3, 4 전용 선조의 가호 효과
type AncestorEffect = 
  | 'galatur'      // 갈라투르의 망치: 경험치 5배 (일반), 7배 (강화)
  | 'gellar'       // 겔라르의 칼: 경험치 3배 (일반), 5배 (강화)
  | 'kuhoombar'    // 쿠훔바르의 모루: 경험치 +30 & 스택 재충전 (일반), +80 & 스택 재충전 (강화)
  | 'temer'        // 테메르의 정: 경험치 +10 & 무료턴 (일반), +30 & 무료턴 (강화)
  | 'naber'        // 나베르의 송곳: 스택 재충전 & 강화 플래그 (일반 전용)
  | 'eber';        // 에베르의 끌: 경험치 10~100 랜덤 (일반), 110~200 랜덤 (강화)

interface SimulationStrategy {
  normalTurn: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
  ancestorTurn: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
  enhancedAncestorTurn: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
}

interface SimulationResult {
  expectedAttempts: number;
  normalTurns: number;
  ancestorTurns: number;
  enhancedAncestorTurns: number;
  freeTurns: number;
  materialBreakdown: { [key: string]: number };
}

// 기본 경험치 획득 확률
const EXP_10_PROBABILITY = 0.80; // 80%
const EXP_20_PROBABILITY = 0.15; // 15%
const EXP_40_PROBABILITY = 0.05; // 5%

// 재료 수량 (상재3 무기)
const MATERIALS_WEAPON_LEVEL3 = {
  destructionStone: 1200,
  breakthroughStone: 25,
  fusionMaterial: 28,
  fragment: 11500,
  silver: 55000,
  gold: 3000,
  breath: 20,
  craftsmanship: 1,
};

// 재료 수량 (상재3 방어구)
const MATERIALS_ARMOR_LEVEL3 = {
  guardianStone: 1000,
  breakthroughStone: 18,
  fusionMaterial: 17,
  fragment: 7000,
  silver: 44000,
  gold: 2000,
  breath: 20,
  craftsmanship: 1,
};

// 재료 수량 (상재4 무기)
const MATERIALS_WEAPON_LEVEL4 = {
  destructionStone: 1400,
  breakthroughStone: 32,
  fusionMaterial: 30,
  fragment: 13000,
  silver: 70000,
  gold: 4000,
  breath: 20,
  craftsmanship: 1,
};

// 재료 수량 (상재4 방어구)
const MATERIALS_ARMOR_LEVEL4 = {
  guardianStone: 1000,
  breakthroughStone: 18,
  fusionMaterial: 17,
  fragment: 7000,
  silver: 44000,
  gold: 2000,
  breath: 20,
  craftsmanship: 1,
};

// 일반 선조의 가호 효과 확률 (상재3, 4)
const NORMAL_ANCESTOR_EFFECTS = [
  { effect: 'galatur' as AncestorEffect, probability: 0.125 },
  { effect: 'gellar' as AncestorEffect, probability: 0.25 },
  { effect: 'kuhoombar' as AncestorEffect, probability: 0.125 },
  { effect: 'temer' as AncestorEffect, probability: 0.25 },
  { effect: 'naber' as AncestorEffect, probability: 0.125 },
  { effect: 'eber' as AncestorEffect, probability: 0.125 },
];

// 강화 선조의 가호 효과 확률
const ENHANCED_ANCESTOR_EFFECTS = [
  { effect: 'galatur' as AncestorEffect, probability: 0.20 },
  { effect: 'gellar' as AncestorEffect, probability: 0.20 },
  { effect: 'kuhoombar' as AncestorEffect, probability: 0.20 },
  { effect: 'temer' as AncestorEffect, probability: 0.20 },
  { effect: 'eber' as AncestorEffect, probability: 0.20 },
];

function selectAncestorEffect(isEnhanced: boolean): AncestorEffect {
  const effects = isEnhanced ? ENHANCED_ANCESTOR_EFFECTS : NORMAL_ANCESTOR_EFFECTS;
  const random = Math.random();
  let cumulative = 0;
  
  for (const { effect, probability } of effects) {
    cumulative += probability;
    if (random < cumulative) {
      return effect;
    }
  }
  
  return effects[effects.length - 1].effect;
}

// 기본 경험치 획득 (재련 1회당)
function getBaseExp(): number {
  const random = Math.random();
  if (random < EXP_10_PROBABILITY) {
    return 10;
  } else if (random < EXP_10_PROBABILITY + EXP_20_PROBABILITY) {
    return 20;
  } else {
    return 40;
  }
}

// 선조의 가호 효과를 기본 경험치에 적용
function applyAncestorEffect(effect: AncestorEffect, isEnhanced: boolean, baseExp: number): number {
  switch (effect) {
    case 'galatur':
      return baseExp * (isEnhanced ? 7 : 5);
    case 'gellar':
      return baseExp * (isEnhanced ? 5 : 3);
    case 'kuhoombar':
      return baseExp + (isEnhanced ? 80 : 30);
    case 'temer':
      return baseExp + (isEnhanced ? 30 : 10);
    case 'naber':
      return baseExp; // 나베르는 경험치 변화 없음
    case 'eber':
      // 에베르는 기본 경험치를 무시하고 랜덤 경험치 획득
      const min = isEnhanced ? 110 : 10;
      const max = isEnhanced ? 200 : 100;
      return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

function simulateRefinement(
  gearType: GearType,
  strategy: SimulationStrategy,
  level: 3 | 4,
  maxAttempts: number = 10000
): SimulationResult {
  let totalExp = 0;
  const targetExp = 1000; // 상재 레벨 완성에 필요한 경험치
  let attempts = 0;
  let normalTurns = 0;
  let ancestorTurns = 0;
  let enhancedAncestorTurns = 0;
  let freeTurns = 0;
  let ancestorStack = 0;
  let nextIsFreeTurn = false;
  let nextIsEnhancedAncestor = false;
  
  // 레벨과 장비 타입에 따라 재료 선택
  let materials: any;
  if (level === 3) {
    materials = gearType === '무기' ? MATERIALS_WEAPON_LEVEL3 : MATERIALS_ARMOR_LEVEL3;
  } else {
    materials = gearType === '무기' ? MATERIALS_WEAPON_LEVEL4 : MATERIALS_ARMOR_LEVEL4;
  }
  const materialUsage: { [key: string]: number } = {
    [gearType === '무기' ? '운명의 파괴석' : '운명의 수호석']: 0,
    '운명의 돌파석': 0,
    '아비도스 융화 재료': 0,
    '운명의 파편': 0,
    '실링': 0,
    '골드': 0,
    [gearType === '무기' ? '용암의 숨결' : '빙하의 숨결']: 0,
    [gearType === '무기' ? '장인의 야금술 : 1단계' : '장인의 재봉술 : 1단계']: 0,
  };
  
  while (totalExp < targetExp && attempts < maxAttempts) {
    attempts++;
    
    // 현재 턴 타입 결정
    let currentTurnType: 'normal' | 'ancestor' | 'enhancedAncestor' | 'free' = 'normal';
    let currentStrategy = strategy.normalTurn;
    
    if (nextIsFreeTurn) {
      currentTurnType = 'free';
      freeTurns++;
      nextIsFreeTurn = false;
      currentStrategy = strategy.normalTurn; // 무료턴은 일반턴과 동일한 전략 사용
    } else if (ancestorStack >= 6) {
      if (nextIsEnhancedAncestor) {
        currentTurnType = 'enhancedAncestor';
        enhancedAncestorTurns++;
        currentStrategy = strategy.enhancedAncestorTurn;
        nextIsEnhancedAncestor = false;
      } else {
        currentTurnType = 'ancestor';
        ancestorTurns++;
        currentStrategy = strategy.ancestorTurn;
      }
      ancestorStack = 0;
    } else {
      currentTurnType = 'normal';
      normalTurns++;
      currentStrategy = strategy.normalTurn;
    }
    
    // 재료 소비 (무료턴이 아닐 경우)
    if (currentTurnType !== 'free') {
      if (gearType === '무기') {
        materialUsage['운명의 파괴석'] += materials.destructionStone;
      } else {
        materialUsage['운명의 수호석'] += materials.guardianStone;
      }
      materialUsage['운명의 돌파석'] += materials.breakthroughStone;
      materialUsage['아비도스 융화 재료'] += materials.fusionMaterial;
      materialUsage['운명의 파편'] += materials.fragment;
      materialUsage['실링'] += materials.silver;
      materialUsage['골드'] += materials.gold;
    }
    
    // 보조재료 소비
    if (currentStrategy.useBreath) {
      if (gearType === '무기') {
        materialUsage['용암의 숨결'] += materials.breath;
      } else {
        materialUsage['빙하의 숨결'] += materials.breath;
      }
    }
    if (currentStrategy.useCraftsmanship) {
      if (gearType === '무기') {
        materialUsage['장인의 야금술 : 1단계'] += materials.craftsmanship;
      } else {
        materialUsage['장인의 재봉술 : 1단계'] += materials.craftsmanship;
      }
    }
    
    // 경험치 획득
    let expGain = 0;
    
    if (currentTurnType === 'ancestor' || currentTurnType === 'enhancedAncestor') {
      // 선조의 가호 턴: 기본 경험치 획득 후 선조의 가호 효과 적용
      const baseExp = getBaseExp();
      const effect = selectAncestorEffect(currentTurnType === 'enhancedAncestor');
      expGain = applyAncestorEffect(effect, currentTurnType === 'enhancedAncestor', baseExp);
      totalExp += expGain;
      
      // 특수 효과 처리
      if (effect === 'kuhoombar') {
        ancestorStack = 6; // 스택 재충전
      }
      if (effect === 'temer') {
        nextIsFreeTurn = true;
      }
      if (effect === 'naber' && currentTurnType === 'ancestor') {
        ancestorStack = 6; // 스택 재충전
        nextIsEnhancedAncestor = true;
      }
    } else {
      // 일반 턴 또는 무료 턴: 기본 경험치만 획득
      expGain = getBaseExp();
      totalExp += expGain;
    }
    
    // 선조의 가호 스택 증가 (선조턴/강화선조턴이 아닐 경우 항상 증가)
    if (currentTurnType !== 'ancestor' && currentTurnType !== 'enhancedAncestor') {
      ancestorStack++;
    }
  }
  
  return {
    expectedAttempts: attempts,
    normalTurns,
    ancestorTurns,
    enhancedAncestorTurns,
    freeTurns,
    materialBreakdown: materialUsage,
  };
}

function runSimulations(iterations: number, level: 3 | 4) {
  console.log(`상재${level} 시뮬레이션 시작 (${iterations}회)...`);
  
  const gearTypes: GearType[] = ['무기', '방어구'];
  
  // 11가지 시나리오 정의
  const strategies: SimulationStrategy[] = [
    // 1-8: 숨결 조합 (야금술/재봉술 없음)
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: false } },
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: true, useCraftsmanship: false } },
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: true, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: false } },
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: true, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: true, useCraftsmanship: false } },
    { normalTurn: { useBreath: true, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: false } },
    { normalTurn: { useBreath: true, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: true, useCraftsmanship: false } },
    { normalTurn: { useBreath: true, useCraftsmanship: false }, ancestorTurn: { useBreath: true, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: false } },
    { normalTurn: { useBreath: true, useCraftsmanship: false }, ancestorTurn: { useBreath: true, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: true, useCraftsmanship: false } },
    // 9-11: 야금술/재봉술 조합 (숨결 없음)
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: false }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: true } },
    { normalTurn: { useBreath: false, useCraftsmanship: false }, ancestorTurn: { useBreath: false, useCraftsmanship: true }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: true } },
    { normalTurn: { useBreath: false, useCraftsmanship: true }, ancestorTurn: { useBreath: false, useCraftsmanship: true }, enhancedAncestorTurn: { useBreath: false, useCraftsmanship: true } },
  ];
  
  const allResults: any[] = [];
  
  for (const gearType of gearTypes) {
    console.log(`\n${gearType} 시뮬레이션 중...`);
    
    for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
      const strategy = strategies[strategyIndex];
      console.log(`  시나리오 ${strategyIndex + 1}/${strategies.length}...`);
      
      let totalAttempts = 0;
      let totalNormalTurns = 0;
      let totalAncestorTurns = 0;
      let totalEnhancedAncestorTurns = 0;
      let totalFreeTurns = 0;
      const totalMaterials: { [key: string]: number } = {};
      
      for (let i = 0; i < iterations; i++) {
        const result = simulateRefinement(gearType, strategy, level);
        totalAttempts += result.expectedAttempts;
        totalNormalTurns += result.normalTurns;
        totalAncestorTurns += result.ancestorTurns;
        totalEnhancedAncestorTurns += result.enhancedAncestorTurns;
        totalFreeTurns += result.freeTurns;
        
        for (const [material, amount] of Object.entries(result.materialBreakdown)) {
          totalMaterials[material] = (totalMaterials[material] || 0) + amount;
        }
      }
      
      allResults.push({
        gearType,
        strategy: {
          normalBreath: strategy.normalTurn.useBreath,
          normalCraft: strategy.normalTurn.useCraftsmanship,
          ancestorBreath: strategy.ancestorTurn.useBreath,
          ancestorCraft: strategy.ancestorTurn.useCraftsmanship,
          enhancedAncestorBreath: strategy.enhancedAncestorTurn.useBreath,
          enhancedAncestorCraft: strategy.enhancedAncestorTurn.useCraftsmanship,
        },
        result: {
          expectedAttempts: totalAttempts / iterations,
          normalTurns: totalNormalTurns / iterations,
          ancestorTurns: totalAncestorTurns / iterations,
          enhancedAncestorTurns: totalEnhancedAncestorTurns / iterations,
          freeTurns: totalFreeTurns / iterations,
          materialBreakdown: Object.fromEntries(
            Object.entries(totalMaterials).map(([k, v]) => [k, v / iterations])
          ),
        },
      });
    }
  }
  
  const output = {
    level,
    iterations,
    generatedAt: new Date().toISOString(),
    data: allResults,
  };
  
  const outputPath = path.join(__dirname, '..', 'lib', `advancedRefiningData-level${level}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ 결과 저장 완료: ${outputPath}`);
}

// 실행
const iterations = 100000;
console.log('상재3, 4 시뮬레이션 데이터 생성 시작\n');

runSimulations(iterations, 3);
runSimulations(iterations, 4);

console.log('\n모든 시뮬레이션 완료!');

