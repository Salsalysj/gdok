export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '혈석 상점 - 껨산기',
  description: '로스트아크 혈석 상점 교환 효율을 계산하고 최적의 교환 아이템을 추천합니다.',
};

import BloodstoneShopClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function getSavedShops() {
  if (!supabase) {
    console.log('[getSavedShops] Supabase가 설정되지 않았습니다.');
    return [];
  }

  try {
    // 캐시 비활성화를 위해 현재 시간을 쿼리 파라미터로 추가
    const { data, error } = await supabase
      .from('saved_bloodstone_shops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getSavedShops] Supabase 에러:', error);
      return [];
    }

    console.log('[getSavedShops] 조회된 상점 수:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('[getSavedShops] 첫 번째 상점:', {
        id: data[0].id,
        shop_name: data[0].shop_name,
        has_shop_data: !!data[0].shop_data
      });
    }

    return data || [];
  } catch (error: any) {
    console.error('[getSavedShops] 상점 조회 실패:', error);
    return [];
  }
}

export default async function BloodstoneShopPage() {
  const [valueDbData, contentRewardsResult, savedShops] = await Promise.all([
    getValueDbData(),
    getContentRewardsData(undefined),
    getSavedShops(),
  ]);
  
  console.log('[BloodstoneShopPage] 전달할 savedShops:', {
    count: savedShops.length,
    firstShop: savedShops[0] ? {
      id: savedShops[0].id,
      shop_name: savedShops[0].shop_name,
      has_shop_data: !!savedShops[0].shop_data
    } : null
  });
  
  const { data: contentRewards } = contentRewardsResult;
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as any[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as any[]) || [];
  const hellStages = (contentRewards['지옥']?.['지옥3'] as any[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as any[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as any[]) || [];
  const narakStages = (contentRewards['나락']?.['나락3'] as any[]) || [];

  return (
    <BloodstoneShopClient
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

