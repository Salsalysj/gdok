export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '상자 선택 도우미 - 껨산기',
  description: '선택 상자 속 아이템들의 가치를 계산하여 최적의 결과를 알려주는 도구',
};

import BoxSelectorClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { createClient } from '@supabase/supabase-js';
import { parseUpgradeCsv, getMarketInfoMap, createStages } from '../../value-db/page';
import { 
  UPGRADE_FILE_WEAPON, 
  UPGRADE_FILE_ARMOR,
  BASE_MATERIALS_WEAPON,
  BASE_MATERIALS_ARMOR,
  BREATH_ITEM_WEAPON,
  BREATH_ITEM_ARMOR,
  OPTIONAL_METALLURGY_ITEMS_WEAPON,
  OPTIONAL_METALLURGY_ITEMS_ARMOR,
} from '../../value-db/page';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function getSavedBoxSelectors() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('saved_box_selectors')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 99999); // 모든 데이터를 가져오기 위해 큰 범위 설정

    if (error) {
      console.error('저장된 상자 선택 도우미 조회 실패:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('상자 선택 도우미 조회 중 오류:', error);
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

export default async function BoxSelectorPage() {
  const [
    valueDbData,
    contentRewardsResult,
    initialSavedBoxSelectors,
    weaponData,
    armorData,
    weaponDataSerka,
    armorDataSerka,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    getContentRewardsData(undefined),
    getSavedBoxSelectors(),
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
    <BoxSelectorClient
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
      initialSavedBoxSelectors={initialSavedBoxSelectors}
    />
  );
}
