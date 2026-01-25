export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '내 캐릭터 시뮬레이션 - 껨산기',
  description: '로스트아크 캐릭터의 장비 재련 효율을 분석합니다.',
};

import { promises as fs } from 'fs';
import path from 'path';
import CharacterSimulationClient from './client';
import { getMarketCache } from '@/lib/marketCache';

const UPGRADE_FILE_WEAPON = path.join(process.cwd(), 'upgrade1.csv');
const UPGRADE_FILE_ARMOR = path.join(process.cwd(), 'upgrade2.csv');
const UPGRADE_FILE_WEAPON_SERKA = path.join(process.cwd(), 'upgrade3.csv');
const UPGRADE_FILE_ARMOR_SERKA = path.join(process.cwd(), 'upgrade4.csv');

// 무기용 상수
const OPTIONAL_METALLURGY_ITEMS_WEAPON = [
  '야금술 : 업화 [11-14]',
  '야금술 : 업화 [15-18]',
  '야금술 : 업화 [19-20]',
];

const ENHANCED_METALLURGY_ITEM_WEAPON = '강화 야금술 : 업화 [19-20]';

const BASE_MATERIALS_WEAPON = [
  '운명의 파괴석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

const EXP_MATERIAL = '운명의 파편 (경험치)';
const BREATH_ITEM_WEAPON = '용암의 숨결';
const BREATH_ITEM_ARMOR = '빙하의 숨결';
const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';
const BASE_SUCCESS_RATE = '기본 성공률';

// 방어구용 상수
const OPTIONAL_METALLURGY_ITEMS_ARMOR = [
  '재봉술 : 업화 [11-14]',
  '재봉술 : 업화 [15-18]',
  '재봉술 : 업화 [19-20]',
];

const ENHANCED_METALLURGY_ITEM_ARMOR = '강화 재봉술 : 업화 [19-20]';

const BASE_MATERIALS_ARMOR = [
  '운명의 수호석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

// 세르카 장비용 상수
const BASE_MATERIALS_WEAPON_SERKA = [
  '운명의 파괴석 결정',
  '위대한 운명의 돌파석',
  '상급 아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

const BASE_MATERIALS_ARMOR_SERKA = [
  '운명의 수호석 결정',
  '위대한 운명의 돌파석',
  '상급 아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

export type MarketItemInfo = {
  unitPrice: number;
  icon?: string | null;
};

export type RefiningStage = {
  level: number;
  itemLevel: number | null;
  expMaterial: { name: string; quantity: number } | null;
  baseMaterials: { name: string; quantity: number }[];
  breathMaterial: { name: string; quantity: number } | null;
  metallurgyMaterial: { name: string; quantity: number } | null;
  enhancedMetallurgyMaterial: { name: string; quantity: number } | null;
  goldCost: number;
  silverCost: number;
  baseSuccessRate: number;
};

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = Number(value.replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

async function parseUpgradeCsv(filePath: string, fileName: string) {
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

async function getSilverCashValue(): Promise<number | null> {
  try {
    const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map((col) => col.trim());
      if (columns.length < 4) continue;
      const itemName = columns[0];
      const cash = columns[3] === '' ? null : parseFloat(columns[3]);
      
      if (itemName === '실링') {
        if (cash != null) {
          return cash;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('[서버] etc_list.csv를 읽을 수 없습니다:', error);
    return null;
  }
}

async function getMarketInfoMap(): Promise<{ infoMap: Record<string, MarketItemInfo>; lastUpdated: string | null; silverCashValue: number | null }> {
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

    const silverCashValue = await getSilverCashValue();

    return { infoMap, lastUpdated: cacheResult?.lastUpdated || null, silverCashValue };
  } catch (error) {
    console.error('시장 캐시 데이터를 읽을 수 없습니다:', error);
    return { infoMap: { [GOLD_ITEM]: { unitPrice: 1, icon: null }, [SILVER_ITEM]: { unitPrice: 0, icon: null } }, lastUpdated: null, silverCashValue: null };
  }
}

function createStages(
  levels: number[],
  rowMap: Record<string, number[]>,
  baseMaterials: string[],
  breathItem: string,
  optionalMetallurgyItems: string[],
  enhancedMetallurgyItem?: string
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

    let enhancedMetallurgyMaterial: { name: string; quantity: number } | null = null;
    if ((level === 19 || level === 20) && enhancedMetallurgyItem) {
      const enhancedQty = rowMap[enhancedMetallurgyItem]?.[idx] ?? 0;
      if (enhancedQty > 0) {
        enhancedMetallurgyMaterial = { name: enhancedMetallurgyItem, quantity: enhancedQty };
      }
    }

    const goldCost = rowMap[GOLD_ITEM]?.[idx] ?? 0;
    const silverCost = rowMap[SILVER_ITEM]?.[idx] ?? 0;
    const baseSuccessRate = rowMap[BASE_SUCCESS_RATE]?.[idx] ?? 0;
    const itemLevel = rowMap['아이템 레벨']?.[idx] ?? null;

    return {
      level,
      itemLevel: itemLevel != null ? itemLevel : null,
      expMaterial: expQty > 0 ? { name: EXP_MATERIAL, quantity: expQty } : null,
      baseMaterials: baseMaterialsList,
      breathMaterial,
      metallurgyMaterial,
      enhancedMetallurgyMaterial,
      goldCost,
      silverCost,
      baseSuccessRate,
    };
  });
}

export default async function CharacterSimulationPage() {
  const [
    weaponData,
    armorData,
    weaponDataSerka,
    armorDataSerka,
    { infoMap, lastUpdated, silverCashValue },
  ] = await Promise.all([
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON_SERKA, 'upgrade3.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR_SERKA, 'upgrade4.csv'),
    getMarketInfoMap(),
  ]);

  const weaponStages = createStages(
    weaponData.levels,
    weaponData.rowMap,
    BASE_MATERIALS_WEAPON,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON,
    ENHANCED_METALLURGY_ITEM_WEAPON
  );

  const armorStages = createStages(
    armorData.levels,
    armorData.rowMap,
    BASE_MATERIALS_ARMOR,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR,
    ENHANCED_METALLURGY_ITEM_ARMOR
  );

  const weaponStagesSerka = createStages(
    weaponDataSerka.levels,
    weaponDataSerka.rowMap,
    BASE_MATERIALS_WEAPON_SERKA,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON,
    ENHANCED_METALLURGY_ITEM_WEAPON
  );

  const armorStagesSerka = createStages(
    armorDataSerka.levels,
    armorDataSerka.rowMap,
    BASE_MATERIALS_ARMOR_SERKA,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR,
    ENHANCED_METALLURGY_ITEM_ARMOR
  );

  return (
    <CharacterSimulationClient
      weaponStages={weaponStages}
      armorStages={armorStages}
      weaponStagesSerka={weaponStagesSerka}
      armorStagesSerka={armorStagesSerka}
      marketInfo={infoMap}
      sillingUnitPrice={silverCashValue ?? 0}
    />
  );
}
