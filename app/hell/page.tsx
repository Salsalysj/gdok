export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


import HellClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';
import { getValueDbData } from '@/lib/valueDb';
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

export default async function HellPage() {
  // 가치계산DB 데이터 가져오기
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  const [
    contentRewardsResult,
    weaponData,
    armorData,
    marketInfo
  ] = await Promise.all([
    getContentRewardsData(valueDbEntryMap),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    getMarketInfoMap(),
  ]);
  
  const { data, rates } = contentRewardsResult;
  const hellData = data['지옥'] || {};
  const narakData = data['나락'] || {};
  const combinedData = { ...hellData, ...narakData };

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
    <HellClient 
      data={combinedData} 
      rates={rates} 
      valueDbEntries={valueDbData.entries}
      weaponStages={weaponStages}
      armorStages={armorStages}
      marketInfo={marketInfo}
    />
  );
}

