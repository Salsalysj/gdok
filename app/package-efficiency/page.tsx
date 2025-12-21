export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import PackageEfficiencyClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';

export default async function PackageEfficiencyPage() {
  const valueDbData = await getValueDbData();
  const { data: contentRewards } = await getContentRewardsData(undefined);
  
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narakStages = (contentRewards['나락']?.['나락3'] as any[]) || [];

  return (
    <PackageEfficiencyClient
      itemList={valueDbData.itemList}
      etcListData={valueDbData.etcListDataObj}
      crystalGoldRate={valueDbData.crystalGoldRate}
      marketPriceMap={valueDbData.marketPriceMap}
      marketData={valueDbData.marketData}
      cubeStageTotals={valueDbData.cubeStageTotals}
      cubeStageRewards={valueDbData.cubeStageRewards}
      valueDbMap={valueDbData.entryMap}
      hellStages={hellStages}
      narakStages={narakStages}
    />
  );
}



