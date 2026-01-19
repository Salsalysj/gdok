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

export default async function BoxSelectorPage() {
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  const { data: contentRewards } = await getContentRewardsData(valueDbEntryMap);
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as any[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as any[]) || [];
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as any[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as any[]) || [];
  const narakStages = (contentRewards['나락']?.['나락3'] as any[]) || [];

  const initialSavedBoxSelectors = await getSavedBoxSelectors();

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
      initialSavedBoxSelectors={initialSavedBoxSelectors}
    />
  );
}
