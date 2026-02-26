export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '필드보스 / 카오스게이트 보상 - 껨산기',
  description: '필보와 카게의 보상 가치 계산',
};

import BossGateClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';
import { getValueDbData } from '@/lib/valueDb';

export default async function BossGatePage() {
  // 가치계산DB 데이터 가져오기
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  const { data, rates } = await getContentRewardsData(valueDbEntryMap);
  
  // 필드보스와 카오스게이트 데이터만 필터링
  const filteredData = {
    '필드보스': data['필드보스'],
    '카오스게이트': data['카오스게이트'],
  };
  
  return <BossGateClient data={filteredData} rates={rates} valueDbEntryMap={valueDbEntryMap} />;
}
