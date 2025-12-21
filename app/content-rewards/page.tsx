export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ContentRewardsClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';
import { getValueDbData } from '@/lib/valueDb';

export default async function ContentRewardsPage() {
  // 가치계산DB 데이터 가져오기
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  const { data, rates } = await getContentRewardsData(valueDbEntryMap);
  return <ContentRewardsClient data={data} rates={rates} valueDbEntryMap={valueDbEntryMap} />;
}
