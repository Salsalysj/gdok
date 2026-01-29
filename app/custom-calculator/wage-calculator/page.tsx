import { readFile } from 'fs/promises';
import path from 'path';
import WageCalculatorPageContent from './WageCalculatorPageContent';
import { getContentRewardsData } from '@/lib/contentRewards';
import { getValueDbData } from '@/lib/valueDb';

export const metadata = {
  title: '시급 계산기 - 껨산기',
  description: '전선/균열, 큐브/모래시계, 가디언, 레이드, 필드보스/카오스게이트 보상 합계',
};

export default async function WageCalculatorPage() {
  const valueDbData = await getValueDbData();
  const { data: contentRewardsData, rates } = await getContentRewardsData(valueDbData.entryMap);

  const raidRewardsPath = path.join(process.cwd(), 'data', 'raid-rewards.json');
  const raidData = JSON.parse(await readFile(raidRewardsPath, 'utf-8'));

  const contentData = {
    '쿠르잔 전선': contentRewardsData['쿠르잔 전선'],
    '에브니 큐브': contentRewardsData['에브니 큐브'],
    '가디언 토벌': contentRewardsData['가디언 토벌'],
    '필드보스': contentRewardsData['필드보스'],
    '카오스게이트': contentRewardsData['카오스게이트'],
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <WageCalculatorPageContent
          contentData={contentData}
          raidData={raidData}
          valueDbEntryMap={valueDbData.entryMap}
          rates={rates ?? { exchange: null, discord: null }}
        />
      </div>
    </div>
  );
}
