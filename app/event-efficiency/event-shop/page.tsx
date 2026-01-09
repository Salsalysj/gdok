export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '이벤트 상점 - 껨산기',
  description: '로스트아크 이벤트 상점 교환 효율을 계산하고 최적의 교환 아이템을 추천합니다.',
};

import EventShopClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function getSavedEventShops() {
  if (!supabase) {
    console.log('[getSavedEventShops] Supabase가 설정되지 않았습니다.');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('saved_event_shops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getSavedEventShops] Supabase 에러:', error);
      return [];
    }

    console.log('[getSavedEventShops] 조회된 이벤트 상점 수:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('[getSavedEventShops] 첫 번째 이벤트 상점:', {
        id: data[0].id,
        shop_name: data[0].shop_name,
        has_shop_data: !!data[0].shop_data
      });
    }

    return data || [];
  } catch (error: any) {
    console.error('[getSavedEventShops] 이벤트 상점 조회 실패:', error);
    return [];
  }
}

export default async function EventShopPage() {
  const [valueDbData, contentRewardsResult, savedShops] = await Promise.all([
    getValueDbData(),
    getContentRewardsData(undefined),
    getSavedEventShops(),
  ]);
  
  const { data: contentRewards } = contentRewardsResult;
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as any[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as any[]) || [];
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as any[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as any[]) || [];
  const narakStages = (contentRewards['나락']?.['나락3'] as any[]) || [];

  return (
    <EventShopClient
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
      initialSavedShops={savedShops}
    />
  );
}

