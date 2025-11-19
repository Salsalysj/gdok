import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Cron secret 체크
const CRON_SECRET = process.env.CRON_SECRET;

type MaterialItem = {
  name: string;
  quantity: number;
};

type UpgradeStage = {
  level: number;
  baseSuccessRate: number;
  materials: MaterialItem[];
  expMaterial?: MaterialItem;
  gold: number;
  silverCost?: number;
  maxBonus?: number;
  additionalBonusOnSuccess?: number;
  additionalBonusOnFail?: number;
  options?: {
    availableBreath: boolean;
    availableMetallurgy: boolean;
    availableSpecialMetallurgy: boolean;
  };
};

type MarketInfo = {
  [itemName: string]: {
    unitPrice: number;
  };
};

// 재련 로직 복제
function calculateOptimalStrategy(
  stage: UpgradeStage,
  marketInfo: MarketInfo,
  breathUsed: boolean = false,
  metallurgyUsed: boolean = false
): { expectedCost: number; expectedTries: number; strategy: string } {
  const baseSuccessRate = stage.baseSuccessRate / 100;
  let bonusOnFail = stage.additionalBonusOnFail || 0;
  let bonusOnSuccess = stage.additionalBonusOnSuccess || 0;

  if (breathUsed) {
    bonusOnFail += 0.2;
    bonusOnSuccess -= 0.2;
  }

  if (metallurgyUsed) {
    bonusOnSuccess += 0.1;
    bonusOnFail -= 0.1;
  }

  let successRate = baseSuccessRate;
  let tryCount = 0;
  let totalCost = 0;
  let artisanEnergy = 0;
  const maxBonus = (stage.maxBonus || 100) / 100;

  while (successRate < 1) {
    tryCount++;
    const materialsCost = stage.materials.reduce((sum, mat) => {
      const info = marketInfo[mat.name] || { unitPrice: 0 };
      return sum + mat.quantity * info.unitPrice;
    }, 0);
    const expMaterialCost = stage.expMaterial
      ? (marketInfo[stage.expMaterial.name] || { unitPrice: 0 }).unitPrice * stage.expMaterial.quantity
      : 0;
    totalCost += materialsCost + expMaterialCost + stage.gold;

    const failProb = 1 - successRate;
    artisanEnergy += failProb * 0.00465;

    if (artisanEnergy >= 1) break;

    successRate = Math.min(baseSuccessRate + artisanEnergy * bonusOnFail, baseSuccessRate + maxBonus);
  }

  const expectedCost = totalCost;
  const expectedTries = tryCount;
  let strategy = 'No Materials';
  if (breathUsed) strategy = 'With Breath';
  if (metallurgyUsed) strategy = 'With Metallurgy';

  return { expectedCost, expectedTries, strategy };
}

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

export async function POST(request: Request) {
  try {
    // CRON_SECRET 검증
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Supabase 클라이언트 초기화
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase configuration is missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 시장 데이터 가져오기
    const { data: marketCacheData, error: marketError } = await supabase
      .from('market_cache')
      .select('data')
      .eq('cache_key', 'market-data')
      .single();

    if (marketError || !marketCacheData) {
      console.error('Failed to fetch market data from Supabase:', marketError);
      return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
    }

    const marketData = marketCacheData.data;
    const allMarketItems = [
      ...(marketData.tier4Results || []),
      ...(marketData.tier3Results || []),
      ...(marketData.gemResults || []),
      ...(marketData.otherResults || []),
    ];

    const marketInfo: MarketInfo = {};
    for (const item of allMarketItems) {
      const name = item.displayName || item.Name || '';
      const price = item.CurrentMinPrice || item.RecentPrice || 0;
      if (name && price) {
        marketInfo[name] = { unitPrice: price };
      }
    }

    // upgrade1.csv, upgrade2.csv 읽기
    const upgrade1Path = path.join(process.cwd(), 'upgrade1.csv');
    const upgrade2Path = path.join(process.cwd(), 'upgrade2.csv');

    const upgrade1Data = await fs.readFile(upgrade1Path, 'utf-8');
    const upgrade2Data = await fs.readFile(upgrade2Path, 'utf-8');

    const parseCSV = (csvData: string): UpgradeStage[] => {
      const lines = csvData.trim().split('\n').slice(1);
      return lines.map((line) => {
        const parts = line.split(',');
        return {
          level: parseInt(parts[0]),
          baseSuccessRate: parseFloat(parts[1]),
          materials: [], // 간소화: 실제로는 파싱 필요
          gold: 0,
        };
      });
    };

    const weaponStages = parseCSV(upgrade1Data);
    const armorStages = parseCSV(upgrade2Data);

    // 각 레벨별 순환 돌파석 가치 계산
    const allLevels = Array.from(new Set([...weaponStages.map((s) => s.level), ...armorStages.map((s) => s.level)])).sort(
      (a, b) => a - b
    );

    const values = allLevels.map((level) => {
      const weaponStage = weaponStages.find((s) => s.level === level);
      const armorStage = armorStages.find((s) => s.level === level);

      let weaponValue: number | null = null;
      let armorValue: number | null = null;

      if (weaponStage) {
        const { expectedCost } = calculateOptimalStrategy(weaponStage, marketInfo);
        const expInfo = weaponStage.expMaterial ? marketInfo[weaponStage.expMaterial.name] || { unitPrice: 0 } : null;
        const expMaterialCost = weaponStage.expMaterial && expInfo ? expInfo.unitPrice * weaponStage.expMaterial.quantity : 0;

        const refiningCost = expectedCost - expMaterialCost;
        const baseSuccessRate = weaponStage.baseSuccessRate / 100;
        const stoneCount = getBreakthroughStoneCount(level, 'weapon');

        if (stoneCount > 0) {
          weaponValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }

      if (armorStage) {
        const { expectedCost } = calculateOptimalStrategy(armorStage, marketInfo);
        const expInfo = armorStage.expMaterial ? marketInfo[armorStage.expMaterial.name] || { unitPrice: 0 } : null;
        const expMaterialCost = armorStage.expMaterial && expInfo ? expInfo.unitPrice * armorStage.expMaterial.quantity : 0;

        const refiningCost = expectedCost - expMaterialCost;
        const baseSuccessRate = armorStage.baseSuccessRate / 100;
        const stoneCount = getBreakthroughStoneCount(level, 'armor');

        if (stoneCount > 0) {
          armorValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }

      return { level, weaponValue, armorValue };
    });

    // Supabase에 저장 (기존 데이터 삭제 후 삽입)
    await supabase.from('circular_breakthrough_values').delete().neq('id', 0);

    const { error: insertError } = await supabase.from('circular_breakthrough_values').insert(
      values.map((v) => ({
        level: v.level,
        weapon_value: v.weaponValue,
        armor_value: v.armorValue,
      }))
    );

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: values.length });
  } catch (error) {
    console.error('Error calculating and saving circular breakthrough values:', error);
    return NextResponse.json({ error: 'Failed to calculate and save circular breakthrough values' }, { status: 500 });
  }
}

