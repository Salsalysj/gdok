export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import HellClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';

export default async function HellPage() {
  const { data, rates } = await getContentRewardsData();
  const hellData = data['지옥'];
  return <HellClient data={hellData} rates={rates} />;
}

