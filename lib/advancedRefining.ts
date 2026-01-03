// 상급 재련 데이터 및 계산 로직

export type GearType = '무기' | '방어구';
export type RefiningLevel = '상재1' | '상재2' | '상재3' | '상재4';

export interface RefiningMaterial {
  name: string;
  amount: number;
  isOptional?: boolean;
}

export interface RefiningCost {
  materials: RefiningMaterial[];
  totalGoldValue?: number;
}

export interface SimulationResult {
  expectedAttempts: number;
  normalTurns: number;
  ancestorTurns: number;
  enhancedAncestorTurns?: number; // 상재3, 4 전용
  freeTurns: number;
  totalCost: number;
  materialBreakdown: { [key: string]: number };
}

export interface OptimalStrategy {
  normalTurn: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
  ancestorTurn: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
  enhancedAncestorTurn?: {
    useBreath: boolean;
    useCraftsmanship: boolean;
  };
}

// 상재1 무기 재련 재료
export const SANG_JAE_1_WEAPON_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 파괴석', amount: 600 },
  { name: '운명의 돌파석', amount: 16 },
  { name: '아비도스 융화 재료', amount: 25 },
  { name: '운명의 파편', amount: 5000 },
  { name: '실링', amount: 31500 },
  { name: '골드', amount: 1125 },
  { name: '용암의 숨결', amount: 12, isOptional: true },
  { name: '장인의 야금술 : 1단계', amount: 1, isOptional: true },
];

// 상재1 방어구 재련 재료
export const SANG_JAE_1_ARMOR_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 수호석', amount: 500 },
  { name: '운명의 돌파석', amount: 12 },
  { name: '아비도스 융화 재료', amount: 15 },
  { name: '운명의 파편', amount: 3000 },
  { name: '실링', amount: 28500 },
  { name: '골드', amount: 950 },
  { name: '빙하의 숨결', amount: 12, isOptional: true },
  { name: '장인의 재봉술 : 1단계', amount: 1, isOptional: true },
];

// 상재2 무기 재련 재료
export const SANG_JAE_2_WEAPON_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 파괴석', amount: 1100 },
  { name: '운명의 돌파석', amount: 22 },
  { name: '아비도스 융화 재료', amount: 27 },
  { name: '운명의 파편', amount: 10000 },
  { name: '실링', amount: 50000 },
  { name: '골드', amount: 2500 },
  { name: '용암의 숨결', amount: 18, isOptional: true },
  { name: '장인의 야금술 : 2단계', amount: 1, isOptional: true },
];

// 상재2 방어구 재련 재료
export const SANG_JAE_2_ARMOR_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 수호석', amount: 900 },
  { name: '운명의 돌파석', amount: 16 },
  { name: '아비도스 융화 재료', amount: 16 },
  { name: '운명의 파편', amount: 6000 },
  { name: '실링', amount: 40000 },
  { name: '골드', amount: 1800 },
  { name: '빙하의 숨결', amount: 18, isOptional: true },
  { name: '장인의 재봉술 : 2단계', amount: 1, isOptional: true },
];

// 상재3 무기 재련 재료
export const SANG_JAE_3_WEAPON_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 파괴석', amount: 1200 },
  { name: '운명의 돌파석', amount: 25 },
  { name: '아비도스 융화 재료', amount: 28 },
  { name: '운명의 파편', amount: 11500 },
  { name: '실링', amount: 55000 },
  { name: '골드', amount: 3000 },
  { name: '용암의 숨결', amount: 20, isOptional: true },
  { name: '장인의 야금술 : 3단계', amount: 1, isOptional: true },
];

// 상재3 방어구 재련 재료
export const SANG_JAE_3_ARMOR_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 수호석', amount: 1000 },
  { name: '운명의 돌파석', amount: 18 },
  { name: '아비도스 융화 재료', amount: 17 },
  { name: '운명의 파편', amount: 7000 },
  { name: '실링', amount: 44000 },
  { name: '골드', amount: 2000 },
  { name: '빙하의 숨결', amount: 20, isOptional: true },
  { name: '장인의 재봉술 : 3단계', amount: 1, isOptional: true },
];

// 상재4 무기 재련 재료
export const SANG_JAE_4_WEAPON_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 파괴석', amount: 1400 },
  { name: '운명의 돌파석', amount: 32 },
  { name: '아비도스 융화 재료', amount: 30 },
  { name: '운명의 파편', amount: 13000 },
  { name: '실링', amount: 70000 },
  { name: '골드', amount: 4000 },
  { name: '용암의 숨결', amount: 20, isOptional: true },
  { name: '장인의 야금술 : 4단계', amount: 1, isOptional: true },
];

// 상재4 방어구 재련 재료
export const SANG_JAE_4_ARMOR_MATERIALS: RefiningMaterial[] = [
  { name: '운명의 수호석', amount: 1000 },
  { name: '운명의 돌파석', amount: 18 },
  { name: '아비도스 융화 재료', amount: 17 },
  { name: '운명의 파편', amount: 7000 },
  { name: '실링', amount: 44000 },
  { name: '골드', amount: 2000 },
  { name: '빙하의 숨결', amount: 20, isOptional: true },
  { name: '장인의 재봉술 : 4단계', amount: 1, isOptional: true },
];

// 레벨과 장비 타입에 따른 재료 목록 반환
export function getMaterialsForLevel(level: RefiningLevel, gearType: GearType): RefiningMaterial[] {
  if (level === '상재1') {
    return gearType === '무기' ? SANG_JAE_1_WEAPON_MATERIALS : SANG_JAE_1_ARMOR_MATERIALS;
  } else if (level === '상재2') {
    return gearType === '무기' ? SANG_JAE_2_WEAPON_MATERIALS : SANG_JAE_2_ARMOR_MATERIALS;
  } else if (level === '상재3') {
    return gearType === '무기' ? SANG_JAE_3_WEAPON_MATERIALS : SANG_JAE_3_ARMOR_MATERIALS;
  } else if (level === '상재4') {
    return gearType === '무기' ? SANG_JAE_4_WEAPON_MATERIALS : SANG_JAE_4_ARMOR_MATERIALS;
  }
  return gearType === '무기' ? SANG_JAE_1_WEAPON_MATERIALS : SANG_JAE_1_ARMOR_MATERIALS;
}

// 경험치 확률 계산
export function calculateExpProbabilities(useBreath: boolean, useCraftsmanship: boolean) {
  let prob10 = 0.8;
  let prob20 = 0.15;
  let prob40 = 0.05;

  if (useBreath) {
    prob20 += 0.15;
    prob40 += 0.15;
    prob10 -= 0.30;
  }

  if (useCraftsmanship) {
    prob20 += 0.30;
    prob40 += 0.20;
    prob10 -= 0.50;
  }

  // 확률 정규화 (음수 방지)
  prob10 = Math.max(0, prob10);
  const total = prob10 + prob20 + prob40;
  
  return {
    prob10: prob10 / total,
    prob20: prob20 / total,
    prob40: prob40 / total,
    expectedExp: (prob10 * 10 + prob20 * 20 + prob40 * 40) / total,
  };
}

// 선조의 가호 효과 적용
export function applyAncestorBlessing(baseExp: number): {
  expectedExp: number;
  freeTurnProb: number;
  extraStackProb: number;
} {
  // 갈라투르 15%: 5배
  // 겔라르 35%: 3배
  // 쿠훔바르 15%: +30
  // 테메르 35%: +10, 무료턴
  
  const galatour = 0.15 * (baseExp * 5);
  const gellar = 0.35 * (baseExp * 3);
  const kuhoombar = 0.15 * (baseExp + 30);
  const temer = 0.35 * (baseExp + 10);
  
  return {
    expectedExp: galatour + gellar + kuhoombar + temer,
    freeTurnProb: 0.35, // 테메르 확률
    extraStackProb: 0.15, // 쿠훔바르 확률 (6스택 재충전)
  };
}

// 몬테카를로 시뮬레이션
export function runSimulation(
  gearType: GearType,
  useBreathNormal: boolean,
  useCraftsmanshipNormal: boolean,
  useBreathAncestor: boolean,
  useCraftsmanshipAncestor: boolean,
  iterations: number = 10000
): SimulationResult {
  const targetExp = 1000; // 10단계 = 경험치 1000
  
  let totalAttempts = 0;
  let totalNormalTurns = 0;
  let totalAncestorTurns = 0;
  let totalFreeTurns = 0;
  
  const materialUsage: { [key: string]: number } = {};
  const baseMaterials = gearType === '무기' ? SANG_JAE_1_WEAPON_MATERIALS : SANG_JAE_1_ARMOR_MATERIALS;
  
  baseMaterials.forEach(mat => {
    materialUsage[mat.name] = 0;
  });
  
  for (let iter = 0; iter < iterations; iter++) {
    let currentExp = 0;
    let ancestorStack = 0;
    let nextTurnFree = false;
    let attempts = 0;
    let normalTurns = 0;
    let ancestorTurns = 0;
    let freeTurns = 0;
    
    while (currentExp < targetExp) {
      attempts++;
      
      const isAncestorTurn = ancestorStack >= 6;
      const useBreath = isAncestorTurn ? useBreathAncestor : useBreathNormal;
      const useCraftsmanship = isAncestorTurn ? useCraftsmanshipAncestor : useCraftsmanshipNormal;
      
      // 재료 소모
      if (!nextTurnFree) {
        baseMaterials.forEach(mat => {
          if (mat.isOptional) {
            if (mat.name.includes('숨결') && useBreath) {
              materialUsage[mat.name] += mat.amount;
            } else if ((mat.name.includes('야금술') || mat.name.includes('재봉술')) && useCraftsmanship) {
              materialUsage[mat.name] += mat.amount;
            }
          } else {
            materialUsage[mat.name] += mat.amount;
          }
        });
      }
      
      // 경험치 획득
      const expProbs = calculateExpProbabilities(useBreath, useCraftsmanship);
      const rand = Math.random();
      let gainedExp = 0;
      
      if (rand < expProbs.prob10) {
        gainedExp = 10;
      } else if (rand < expProbs.prob10 + expProbs.prob20) {
        gainedExp = 20;
      } else {
        gainedExp = 40;
      }
      
      // 선조의 가호 적용
      if (isAncestorTurn) {
        ancestorTurns++;
        const blessingRand = Math.random();
        
        if (blessingRand < 0.15) {
          // 갈라투르: 5배
          gainedExp *= 5;
        } else if (blessingRand < 0.50) {
          // 겔라르: 3배
          gainedExp *= 3;
        } else if (blessingRand < 0.65) {
          // 쿠훔바르: +30, 6스택 재충전
          gainedExp += 30;
          ancestorStack = 6;
        } else {
          // 테메르: +10, 다음 턴 무료
          gainedExp += 10;
          nextTurnFree = true;
          freeTurns++;
        }
        
        ancestorStack = 0;
      } else {
        if (nextTurnFree) {
          // 무료턴은 별도 카운트
          nextTurnFree = false;
        } else {
          normalTurns++;
        }
        ancestorStack++;
      }
      
      currentExp += gainedExp;
    }
    
    totalAttempts += attempts;
    totalNormalTurns += normalTurns;
    totalAncestorTurns += ancestorTurns;
    totalFreeTurns += freeTurns;
  }
  
  // 평균 계산
  const result: SimulationResult = {
    expectedAttempts: totalAttempts / iterations,
    normalTurns: totalNormalTurns / iterations,
    ancestorTurns: totalAncestorTurns / iterations,
    freeTurns: totalFreeTurns / iterations,
    totalCost: 0,
    materialBreakdown: {},
  };
  
  // 재료 평균 사용량
  Object.keys(materialUsage).forEach(key => {
    result.materialBreakdown[key] = materialUsage[key] / iterations;
  });
  
  return result;
}

// 최적 전략 찾기 (4가지 조합)
export function findOptimalStrategy(gearType: GearType): {
  strategy: OptimalStrategy;
  result: SimulationResult;
} {
  const strategies: Array<{
    normalBreath: boolean;
    normalCraft: boolean;
    ancestorBreath: boolean;
    ancestorCraft: boolean;
  }> = [];
  
  // 모든 조합 생성
  for (let nb = 0; nb <= 1; nb++) {
    for (let nc = 0; nc <= 1; nc++) {
      for (let ab = 0; ab <= 1; ab++) {
        for (let ac = 0; ac <= 1; ac++) {
          strategies.push({
            normalBreath: !!nb,
            normalCraft: !!nc,
            ancestorBreath: !!ab,
            ancestorCraft: !!ac,
          });
        }
      }
    }
  }
  
  let bestStrategy = strategies[0];
  let bestResult = runSimulation(
    gearType,
    bestStrategy.normalBreath,
    bestStrategy.normalCraft,
    bestStrategy.ancestorBreath,
    bestStrategy.ancestorCraft,
    5000
  );
  
  // 임시로 골드 비용만 계산 (실제로는 가치계산DB 참조 필요)
  let bestCost = bestResult.materialBreakdown['골드'] || 0;
  
  for (let i = 1; i < strategies.length; i++) {
    const strategy = strategies[i];
    const result = runSimulation(
      gearType,
      strategy.normalBreath,
      strategy.normalCraft,
      strategy.ancestorBreath,
      strategy.ancestorCraft,
      5000
    );
    
    const cost = result.materialBreakdown['골드'] || 0;
    
    if (cost < bestCost) {
      bestCost = cost;
      bestStrategy = strategy;
      bestResult = result;
    }
  }
  
  return {
    strategy: {
      normalTurn: {
        useBreath: bestStrategy.normalBreath,
        useCraftsmanship: bestStrategy.normalCraft,
      },
      ancestorTurn: {
        useBreath: bestStrategy.ancestorBreath,
        useCraftsmanship: bestStrategy.ancestorCraft,
      },
    },
    result: bestResult,
  };
}

