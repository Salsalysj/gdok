export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import ContentRewardsClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';

export default async function ContentRewardsPage() {
  const { data, rates } = await getContentRewardsData();
  return <ContentRewardsClient data={data} rates={rates} />;
}
