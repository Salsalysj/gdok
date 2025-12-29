export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ValueDBClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { promises as fs } from 'fs';
import path from 'path';
import { getMarketCache } from '@/lib/marketCache';
import type { MarketItemInfo } from '../refining-simulation/page';

export const UPGRADE_FILE_WEAPON = path.join(process.cwd(), 'upgrade1.csv');
export const UPGRADE_FILE_ARMOR = path.join(process.cwd(), 'upgrade2.csv');

export const OPTIONAL_METALLURGY_ITEMS_WEAPON = [
  '야금술 : 업화 [11-14]',
  '야금술 : 업화 [15-18]',
  '야금술 : 업화 [19-20]',
];

export const BASE_MATERIALS_WEAPON = [
  '운명의 파괴석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

const EXP_MATERIAL = '운명의 파편 (경험치)';
export const BREATH_ITEM_WEAPON = '용암의 숨결';
export const BREATH_ITEM_ARMOR = '빙하의 숨결';
const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';
const BASE_SUCCESS_RATE = '기본 성공률';

export const OPTIONAL_METALLURGY_ITEMS_ARMOR = [
  '재봉술 : 업화 [11-14]',
  '재봉술 : 업화 [15-18]',
  '재봉술 : 업화 [19-20]',
];

export const BASE_MATERIALS_ARMOR = [
  '운명의 수호석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = Number(value.replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

export async function parseUpgradeCsv(filePath: string, fileName: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    throw new Error(`${fileName} 파일이 비어있습니다.`);
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

export async function getMarketInfoMap(): Promise<Record<string, MarketItemInfo>> {
  try {
    const cacheResult = await getMarketCache();
    const cachedData = cacheResult?.data || {};
    const buckets = [
      cachedData.tier4Results || [],
      cachedData.tier3Results || [],
      cachedData.gemResults || [],
      cachedData.otherResults || [],
      cachedData.relicEngravingResults || [],
    ];

  const infoMap: Record<string, MarketItemInfo> = {};

  for (const bucket of buckets) {
    for (const item of bucket) {
      const name = item?.displayName || item?.Name;
      const pricePerBundle = item?.CurrentMinPrice || item?.RecentPrice || 0;
      const bundleCount = item?.BundleCount || 1;
      if (!name || !pricePerBundle || pricePerBundle <= 0) continue;
      const unitPrice = bundleCount > 0 ? pricePerBundle / bundleCount : pricePerBundle;
      if (!(name in infoMap) || unitPrice < infoMap[name].unitPrice) {
        infoMap[name] = {
          unitPrice,
          icon: item?.Icon ?? null,
        };
      }
    }
  }

  if (infoMap['운명의 파편 주머니(소)']) {
    const shardSource = infoMap['운명의 파편 주머니(소)'];
    const shardUnit = shardSource.unitPrice / 1000;
    infoMap['운명의 파편'] = {
      unitPrice: shardUnit,
      icon: shardSource.icon,
    };
    infoMap[EXP_MATERIAL] = {
      unitPrice: shardUnit,
      icon: shardSource.icon,
    };
  }

  if (!infoMap['운명의 돌파석'] || infoMap['운명의 돌파석'].unitPrice === 0) {
    let breakthroughIcon: string | null = null;
    for (const bucket of buckets) {
      for (const item of bucket) {
        const name = item?.displayName || item?.Name;
        if (name === '운명의 돌파석') {
          breakthroughIcon = item?.Icon ?? null;
          break;
        }
      }
      if (breakthroughIcon) break;
    }
    
    infoMap['운명의 돌파석'] = {
      unitPrice: infoMap['운명의 돌파석']?.unitPrice ?? 0,
      icon: breakthroughIcon,
    };
  }

  infoMap[GOLD_ITEM] = { unitPrice: 1, icon: null };
  infoMap[SILVER_ITEM] = { unitPrice: 0, icon: null };

  return infoMap;
  } catch (error) {
    console.error('시장 캐시 데이터를 읽을 수 없습니다:', error);
    return { [GOLD_ITEM]: { unitPrice: 1, icon: null }, [SILVER_ITEM]: { unitPrice: 0, icon: null } };
  }
}

export type RefiningStage = {
  level: number;
  expMaterial: { name: string; quantity: number } | null;
  baseMaterials: { name: string; quantity: number }[];
  breathMaterial: { name: string; quantity: number } | null;
  metallurgyMaterial: { name: string; quantity: number } | null;
  goldCost: number;
  silverCost: number;
  baseSuccessRate: number;
};

export function createStages(
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

export default async function ValueDBPage() {
  const [
    valueDbData,
    weaponData,
    armorData,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    getMarketInfoMap(),
  ]);

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

  return <ValueDBClient />;
}


