export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0; // 항상 최신 데이터 가져오기
export const metadata = {
  title: '과금 효율 - 껨산기',
  description: '로스트아크 과금 패키지 상품의 효율을 계산합니다.',
};
import PackageEfficiencyClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import { getContentRewardsData } from '@/lib/contentRewards';
import { supabase } from '@/app/utils/supabase';

async function getSavedPackages() {
  if (!supabase) {
    return [];
  }

  try {
    // Supabase는 기본적으로 1000개까지만 반환하므로, 명시적으로 큰 limit 설정
    const { data, error, count } = await supabase
      .from('saved_packages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(10000); // 충분히 큰 값으로 설정

    if (error) {
      console.error('Supabase 에러:', error);
      console.error('에러 상세:', JSON.stringify(error, null, 2));
      return [];
    }

    // 실제 반환된 개수와 전체 개수 비교
    if (count != null && data && data.length < count) {
      console.warn(`⚠️ 패키지 일부만 반환됨: ${data.length}/${count}개`);
    }

    console.log(`✅ 패키지 조회 성공: ${data?.length || 0}개 (전체: ${count || 'N/A'}개)`);
    return data || [];
  } catch (error: any) {
    console.error('패키지 조회 실패:', error);
    console.error('에러 상세:', error.message, error.stack);
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



