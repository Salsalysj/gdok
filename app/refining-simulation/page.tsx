export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '재련 효율 - 껨산기',
  description: '로스트아크 장비 재련의 효율을 시뮬레이션하고 최적의 전략을 제시합니다.',
};

import { promises as fs } from 'fs';
import path from 'path';
import RefiningSimulationClient from './client';
import { getMarketCache } from '@/lib/marketCache';

const UPGRADE_FILE_WEAPON = path.join(process.cwd(), 'upgrade1.csv');
const UPGRADE_FILE_ARMOR = path.join(process.cwd(), 'upgrade2.csv');

// 무기용 상수
const OPTIONAL_METALLURGY_ITEMS_WEAPON = [
  '야금술 : 업화 [11-14]',
  '야금술 : 업화 [15-18]',
  '야금술 : 업화 [19-20]',
];

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

const BASE_MATERIALS_ARMOR = [
  '운명의 수호석',
  '운명의 돌파석',
  '아비도스 융화 재료',
  '운명의 파편',
  '실링',
];

export type MarketItemInfo = {
  unitPrice: number;
  icon?: string | null;
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
    
    console.log('[서버] etc_list.csv 읽기 시작, 총 라인 수:', lines.length);
    
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map((col) => col.trim());
      if (columns.length < 4) continue;
      const itemName = columns[0];
      const cash = columns[3] === '' ? null : parseFloat(columns[3]);
      
      if (itemName === '실링') {
        console.log('[서버] 실링 발견:', { itemName, cash, columns });
        if (cash != null) {
          console.log('[서버] 실링 현금 단가 반환:', cash);
          return cash;
        }
      }
    }
    console.log('[서버] 실링을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('[서버] etc_list.csv를 읽을 수 없습니다:', error);
    return null;
  }
}

async function getLatestRates(): Promise<{ exchange: number | null; discord: number | null }> {
  try {
    const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
    const content = await fs.readFile(RATES_FILE, 'utf-8');
    const data = JSON.parse(content);
    const list = data?.exchangeRates || [];
    if (list.length === 0) return { exchange: null, discord: null };
    
    // 날짜순 정렬
    const sorted = [...list].sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    // exchange가 0이 아닌 최신 데이터 찾기
    const latestWithExchange = sorted.find((item: any) => item.exchange && item.exchange > 0);
    const latestWithDiscord = sorted.find((item: any) => item.discord && item.discord > 0);
    
    return { 
      exchange: latestWithExchange?.exchange ?? null, 
      discord: latestWithDiscord?.discord ?? null 
    };
  } catch (error) {
    console.error('[서버] 환율 데이터 읽기 실패:', error);
    return { exchange: null, discord: null };
  }
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  try {
    // Supabase에서 먼저 시도
    try {
      const { supabase } = await import('../utils/supabase');
      if (supabase) {
        const { data, error } = await supabase
          .from('crystal_exchange_rates')
          .select('exchange')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
        
        if (!error && data && data.exchange) {
          console.log('[서버] Supabase에서 크리스탈-골드 환율:', data.exchange);
          return Number(data.exchange);
        }
      }
    } catch (supabaseError) {
      console.log('[서버] Supabase 조회 실패, 파일에서 읽기 시도');
    }
    
    // Supabase에서 가져오지 못하면 로컬 파일에서 가져오기
    const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
    const content = await fs.readFile(RATES_FILE, 'utf-8');
    const data = JSON.parse(content);
    const list = data?.exchangeRates || [];
    if (list.length === 0) {
      console.log('[서버] 환율 데이터가 없음');
      return null;
    }
    
    // 날짜순 정렬
    const sorted = [...list].sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    // exchange가 0이 아닌 최신 데이터 찾기
    const latestWithExchange = sorted.find((item: any) => item.exchange && item.exchange > 0);
    
    if (latestWithExchange) {
      console.log('[서버] 파일에서 크리스탈-골드 환율:', latestWithExchange.exchange);
      return latestWithExchange.exchange;
    }
    
    console.log('[서버] 유효한 크리스탈-골드 환율을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('[서버] 크리스탈-골드 환율 읽기 실패:', error);
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

    // 운명의 돌파석이 market_cache에 없거나 가격이 0인 경우 기본값 설정
    if (!infoMap['운명의 돌파석'] || infoMap['운명의 돌파석'].unitPrice === 0) {
      // market_cache에서 다시 찾아보기 (가격이 0이어도 아이콘은 가져올 수 있음)
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
      
      // 기본값 설정 (가격은 0이어도 아이콘은 표시)
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

export default async function RefiningSimulationPage() {
  const [
    weaponData,
    armorData,
    { infoMap, lastUpdated, silverCashValue },
    rates,
    crystalGoldRate
  ] = await Promise.all([
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    getMarketInfoMap(),
    getLatestRates(),
    getLatestCrystalGoldRate(),
  ]);

  console.log('[서버] 환율 정보:', { rates, crystalGoldRate });

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

  return (
    <RefiningSimulationClient
      weaponStages={weaponStages}
      armorStages={armorStages}
      marketInfo={infoMap}
      lastUpdated={lastUpdated}
      silverCashValue={silverCashValue}
      initialRates={rates}
      initialCrystalGoldRate={crystalGoldRate}
    />
  );
}
