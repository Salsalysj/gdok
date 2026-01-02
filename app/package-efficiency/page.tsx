export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import PackageEfficiencyClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { supabase } from '@/app/utils/supabase';

async function getSavedPackages() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('saved_packages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return [];
    }

    return data || [];
  } catch (error: any) {
    console.error('패키지 조회 실패:', error);
    return [];
  }
}

export default async function PackageEfficiencyPage() {
  const [valueDbData, contentRewardsResult, savedPackages] = await Promise.all([
    getValueDbData(),
    getContentRewardsData(undefined),
    getSavedPackages(),
  ]);
  
  const { data: contentRewards } = contentRewardsResult;
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as any[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as any[]) || [];
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as any[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as any[]) || [];
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
      hell1Stages={hell1Stages}
      hell2Stages={hell2Stages}
      narakStages={narakStages}
      narak1Stages={narak1Stages}
      narak2Stages={narak2Stages}
      initialSavedPackages={savedPackages}
    />
  );
}



