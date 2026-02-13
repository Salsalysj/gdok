export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '제작 재료 교환 - 껨산기',
  description: '로스트아크 제작 재료 교환 효율을 계산하고 최적의 교환 아이템을 추천합니다.',
};

import CraftMaterialsClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { parseUpgradeCsv, getMarketInfoMap, createStages } from '../value-db/page';
import {
  UPGRADE_FILE_WEAPON,
  UPGRADE_FILE_ARMOR,
  BASE_MATERIALS_WEAPON,
  BASE_MATERIALS_ARMOR,
  BREATH_ITEM_WEAPON,
  BREATH_ITEM_ARMOR,
  OPTIONAL_METALLURGY_ITEMS_WEAPON,
  OPTIONAL_METALLURGY_ITEMS_ARMOR,
} from '../value-db/page';
import path from 'path';
import { promises as fs } from 'fs';

const CRAFT_MATERIAL_EXCHANGES_JSON = path.join(process.cwd(), 'data', 'craft-material-exchanges.json');

async function getSavedExchangesFromJson(): Promise<Array<{ id: string; shop_name: string; created_at: string; updated_at: string; shop_data?: any }>> {
  try {
    const raw = await fs.readFile(CRAFT_MATERIAL_EXCHANGES_JSON, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((row: any, index: number) => ({
      id: row.id ?? String(index),
      shop_name: row.shop_name ?? '',
      created_at: row.created_at ?? '',
      updated_at: row.updated_at ?? '',
      shop_data: row.shop_data,
    }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.error('[getSavedExchangesFromJson] 읽기 실패:', e);
    return [];
  }
}

const UPGRADE_FILE_WEAPON_SERKA = path.join(process.cwd(), 'upgrade3.csv');
const UPGRADE_FILE_ARMOR_SERKA = path.join(process.cwd(), 'upgrade4.csv');

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

export default async function CraftMaterialsPage() {
  const [
    valueDbData,
    contentRewardsResult,
    savedExchanges,
    weaponData,
    armorData,
    weaponDataSerka,
    armorDataSerka,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    getContentRewardsData(undefined),
    getSavedExchangesFromJson(),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON_SERKA, 'upgrade3.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR_SERKA, 'upgrade4.csv'),
    getMarketInfoMap(),
  ]);

  const { data: contentRewards } = contentRewardsResult;
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as any[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as any[]) || [];
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as any[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as any[]) || [];
  const narakStages = (contentRewards['나락']?.['나락3'] as any[]) || [];

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

  const weaponStagesSerka = createStages(
    weaponDataSerka.levels,
    weaponDataSerka.rowMap,
    BASE_MATERIALS_WEAPON_SERKA,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON
  );

  const armorStagesSerka = createStages(
    armorDataSerka.levels,
    armorDataSerka.rowMap,
    BASE_MATERIALS_ARMOR_SERKA,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR
  );

  return (
    <CraftMaterialsClient
      itemList={valueDbData.itemList}
      etcListData={valueDbData.etcListDataObj}
      crystalGoldRate={valueDbData.crystalGoldRate}
      marketPriceMap={valueDbData.marketPriceMap}
      marketData={valueDbData.marketData}
      cubeStageTotals={valueDbData.cubeStageTotals}
      cubeStageRewards={valueDbData.cubeStageRewards}
      valueDbMap={valueDbData.entryMap}
      hellStages={hellStages}
      hell1Stages={hell1Stages}
      hell2Stages={hell2Stages}
      narakStages={narakStages}
      narak1Stages={narak1Stages}
      narak2Stages={narak2Stages}
      weaponStages={weaponStages}
      armorStages={armorStages}
      weaponStagesSerka={weaponStagesSerka}
      armorStagesSerka={armorStagesSerka}
      marketInfo={marketInfo}
      initialSavedShops={savedExchanges}
    />
  );
}
