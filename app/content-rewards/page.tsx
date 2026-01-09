export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '컨텐츠 보상 - 껨산기',
  description: '쿠르잔 전선, 혼돈의 균열, 할의 모래시계, 가디언 토벌, 에브니 큐브 등 컨텐츠 보상 가치 계산',
};

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
