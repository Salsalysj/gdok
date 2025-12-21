import { NextRequest, NextResponse } from 'next/server';
import { getMarketCache, setMarketCache } from '@/lib/marketCache';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPGRADE_FILE_WEAPON = path.join(process.cwd(), 'upgrade1.csv');
const UPGRADE_FILE_ARMOR = path.join(process.cwd(), 'upgrade2.csv');

const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';
const EXP_MATERIAL = '운명의 파편 (경험치)';
const BASE_SUCCESS_RATE = '기본 성공률';

const BASE_MATERIALS_WEAPON = [
  '운명의 파괴석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

const BASE_MATERIALS_ARMOR = [
  '운명의 수호석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

type RefiningStage = {
  level: number;
  expMaterial: { name: string; quantity: number } | null;
  baseMaterials: { name: string; quantity: number }[];
  breathMaterial: { name: string; quantity: number } | null;
  metallurgyMaterial: { name: string; quantity: number } | null;
  goldCost: number;
  silverCost: number;
  baseSuccessRate: number;
};

type MarketItemInfo = {
  unitPrice: number;
  icon?: string | null;
};

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = Number(value.replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

async function parseUpgradeCsv(filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error('파일이 비어있습니다.');
  }

  const headerColumns = lines[0].split(',').map(col => col.trim());
  const levels = headerColumns.slice(1).map(col => Number(col));

  const rowMap: Record<string, number[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(col => col.trim());
    if (cols.length === 0) continue;
    const key = cols[0];
    if (!key) continue;
    rowMap[key] = cols.slice(1).map(value => toNumber(value));
  }

  return { levels, rowMap };
}

function createStages(
  levels: number[],
  rowMap: Record<string, number[]>,
  baseMaterials: string[],
  breathItem: string,
  optionalMetallurgyItems: string[]
): RefiningStage[] {
  return levels.map((level, idx) => {
    const expQty = rowMap[EXP_MATERIAL]?.[idx] ?? 0;
    const baseMaterialsList = baseMaterials.map(name => ({
      name,
      quantity: rowMap[name]?.[idx] ?? 0,
    }));

    const breathQty = rowMap[breathItem]?.[idx] ?? 0;
    const breathMaterial = breathQty > 0 ? { name: breathItem, quantity: breathQty } : null;

    let metallurgyMaterial: { name: string; quantity: number } | null = null;
    for (const metallurgyName of optionalMetallurgyItems) {
      const qty = rowMap[metallurgyName]?.[idx] ?? 0;
      if (qty > 0) {
        metallurgyMaterial = { name: metallurgyName, quantity: qty };
        break;
      }
    }

    const goldCost = rowMap[GOLD_ITEM]?.[idx] ?? 0;
    const silverCost = rowMap[SILVER_ITEM]?.[idx] ?? 0;
    const baseSuccessRate = rowMap[BASE_SUCCESS_RATE]?.[idx] ?? 0;

    return {
      level,
      expMaterial: expQty > 0 ? { name: EXP_MATERIAL, quantity: expQty } : null,
      baseMaterials: baseMaterialsList,
      breathMaterial,
      metallurgyMaterial,
      goldCost,
      silverCost,
      baseSuccessRate,
    };
  });
}

function calculateBreakthroughValue(
  stage: RefiningStage,
  marketInfo: Record<string, MarketItemInfo>
): number | null {
  const getUnitInfo = (name: string): MarketItemInfo => marketInfo[name] || { unitPrice: 0, icon: null };

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

export async function POST(request: NextRequest) {
  try {
    // 기존 캐시 읽기
    const existingCache = await getMarketCache();
    if (!existingCache) {
      return NextResponse.json(
        { error: '캐시 데이터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // marketInfo 생성
    const cachedData = existingCache.data;
    const buckets = [
      cachedData.tier4Results || [],
      cachedData.tier3Results || [],
      cachedData.gemResults || [],
      cachedData.otherResults || [],
      cachedData.relicEngravingResults || [],
    ];

    const marketInfo: Record<string, MarketItemInfo> = {};

    for (const bucket of buckets) {
      for (const item of bucket) {
        const name = item?.displayName || item?.Name;
        const pricePerBundle = item?.CurrentMinPrice || item?.RecentPrice || 0;
        const bundleCount = item?.BundleCount || 1;
        if (!name || !pricePerBundle || pricePerBundle <= 0) continue;
        const unitPrice = bundleCount > 0 ? pricePerBundle / bundleCount : pricePerBundle;
        if (!(name in marketInfo) || unitPrice < marketInfo[name].unitPrice) {
          marketInfo[name] = {
            unitPrice,
            icon: item?.Icon ?? null,
          };
        }
      }
    }

    // 운명의 파편 가격 설정
    // 운명의 파편은 운명의 파편 주머니(소)에서 계산되므로, 주머니 가격이 조정되면 파편 가격도 조정됨
    if (marketInfo['운명의 파편 주머니(소)']) {
      const shardSource = marketInfo['운명의 파편 주머니(소)'];
      // 주머니 가격이 0이면 파편 가격도 0 (파편 미반영)
      const shardUnit = shardSource.unitPrice > 0 ? shardSource.unitPrice / 1000 : 0;
      marketInfo['운명의 파편'] = {
        unitPrice: shardUnit,
        icon: shardSource.icon,
      };
      marketInfo[EXP_MATERIAL] = {
        unitPrice: shardUnit,
        icon: shardSource.icon,
      };
    }

    marketInfo[GOLD_ITEM] = { unitPrice: 1, icon: null };
    marketInfo[SILVER_ITEM] = { unitPrice: 0, icon: null };

    // upgrade CSV 파일 읽기
    const weaponData = await parseUpgradeCsv(UPGRADE_FILE_WEAPON);
    const armorData = await parseUpgradeCsv(UPGRADE_FILE_ARMOR);

    const OPTIONAL_METALLURGY_ITEMS_WEAPON = [
      '야금술 : 업화 [11-14]',
      '야금술 : 업화 [15-18]',
      '야금술 : 업화 [19-20]',
    ];

    const BREATH_ITEM_WEAPON = '용암의 숨결';
    const BREATH_ITEM_ARMOR = '빙하의 숨결';

    const OPTIONAL_METALLURGY_ITEMS_ARMOR = [
      '재봉술 : 업화 [11-14]',
      '재봉술 : 업화 [15-18]',
      '재봉술 : 업화 [19-20]',
    ];

    const weaponStages = createStages(
      weaponData.levels,
      weaponData.rowMap,
      BASE_MATERIALS_WEAPON,
      BREATH_ITEM_WEAPON,
      OPTIONAL_METALLURGY_ITEMS_WEAPON
    );

    const armorStages = createStages(
      armorData.levels,
      armorData.rowMap,
      BASE_MATERIALS_ARMOR,
      BREATH_ITEM_ARMOR,
      OPTIONAL_METALLURGY_ITEMS_ARMOR
    );

    // 모든 무기와 방어구 스테이지에서 순환 돌파석 가치 계산
    const allBreakthroughValues: number[] = [];
    
    [...weaponStages, ...armorStages].forEach(stage => {
      const value = calculateBreakthroughValue(stage, marketInfo);
      if (value != null && value > 0 && isFinite(value)) {
        allBreakthroughValues.push(value);
      }
    });

    // 상위 5개의 평균 계산
    let circularBreakthroughValue: number | null = null;
    if (allBreakthroughValues.length > 0) {
      const sorted = allBreakthroughValues.sort((a, b) => b - a);
      const top5 = sorted.slice(0, 5);
      const average = top5.reduce((sum, val) => sum + val, 0) / top5.length;
      if (isFinite(average) && average > 0) {
        circularBreakthroughValue = average;
      }
    }

    // market_cache에 순환 돌파석 가치 저장
    const updatedCache = {
      lastUpdated: existingCache.lastUpdated,
      data: {
        ...cachedData,
        circularBreakthroughValue,
      },
    };

    const success = await setMarketCache(updatedCache);
    if (!success) {
      return NextResponse.json(
        { error: '캐시 업데이트 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: '순환 돌파석 가치 업데이트 완료',
      circularBreakthroughValue,
    });
  } catch (error) {
    console.error('순환 돌파석 가치 계산 오류:', error);
    return NextResponse.json(
      { error: '순환 돌파석 가치 계산 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

