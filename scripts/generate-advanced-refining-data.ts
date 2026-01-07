// 10만번 시뮬레이션 결과 생성 스크립트
import { writeFileSync } from 'fs';
import { runSimulation, type GearType } from '../lib/advancedRefining';

type SimulationData = {
  gearType: GearType;
  strategy: {
    normalBreath: boolean;
    normalCraft: boolean;
    ancestorBreath: boolean;
    ancestorCraft: boolean;
  };
  result: {
    expectedAttempts: number;
    normalTurns: number;
    ancestorTurns: number;
    freeTurns: number;
    materialBreakdown: { [key: string]: number };
  };
};

const ITERATIONS = 100000;

function generateAllStrategies() {
  const strategies: Array<{
    normalBreath: boolean;
    normalCraft: boolean;
    ancestorBreath: boolean;
    ancestorCraft: boolean;
  }> = [];

  for (let nb = 0; nb <= 1; nb++) {
    for (let nc = 0; nc <= 1; nc++) {
      for (let ab = 0; ab <= 1; ab++) {
        for (let ac = 0; ac <= 1; ac++) {
          // 조건 필터링:
          // - ancestorBreath가 True일 때만 normalBreath가 True일 수 있음
          // - ancestorCraft가 True일 때만 normalCraft가 True일 수 있음
          if (nb === 1 && ab === 0) {
            // normalBreath가 true인데 ancestorBreath가 false인 경우 제외
            continue;
          }
          if (nc === 1 && ac === 0) {
            // normalCraft가 true인데 ancestorCraft가 false인 경우 제외
            continue;
          }
          
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

  return strategies;
}

async function generateSimulationData() {
  console.log('상급 재련 시뮬레이션 데이터 생성 시작...');
  console.log(`각 시나리오당 ${ITERATIONS.toLocaleString()}번 시뮬레이션 실행...\n`);

  const gearTypes: GearType[] = ['무기', '방어구'];
  const strategies = generateAllStrategies();
  const allResults: SimulationData[] = [];

  for (const gearType of gearTypes) {
    console.log(`\n${gearType} 시뮬레이션 시작...`);
    
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const progress = ((i + 1) / strategies.length * 100).toFixed(1);
      
      console.log(`  [${i + 1}/${strategies.length}] (${progress}%) 진행 중...`);
      console.log(`    전략: 일반턴(숨결:${strategy.normalBreath}, 야금술:${strategy.normalCraft}), 선조턴(숨결:${strategy.ancestorBreath}, 야금술:${strategy.ancestorCraft})`);
      
      const result = runSimulation(
        gearType,
        strategy.normalBreath,
        strategy.normalCraft,
        strategy.ancestorBreath,
        strategy.ancestorCraft,
        ITERATIONS
      );

      allResults.push({
        gearType,
        strategy,
        result: {
          expectedAttempts: result.expectedAttempts,
          normalTurns: result.normalTurns,
          ancestorTurns: result.ancestorTurns,
          freeTurns: result.freeTurns,
          materialBreakdown: result.materialBreakdown,
        },
      });
    }
  }

  // JSON 파일로 저장
  const outputPath = 'lib/advancedRefiningData.json';
  const outputData = {
    iterations: ITERATIONS,
    generatedAt: new Date().toISOString(),
    data: allResults,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
  
  console.log(`\n✅ 시뮬레이션 완료!`);
  console.log(`   총 ${allResults.length}개 시나리오 × ${ITERATIONS.toLocaleString()}번 = ${(allResults.length * ITERATIONS).toLocaleString()}번 시뮬레이션`);
  console.log(`   결과 저장: ${outputPath}`);
}

generateSimulationData().catch(console.error);


