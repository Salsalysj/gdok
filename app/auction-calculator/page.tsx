import { getMarketCache } from '@/lib/marketCache';
import AuctionCalculatorClient from './client';

export const metadata = {
  title: '경매 계산기 - 껨산기',
  description: '로스트아크 경매 입찰 최적가를 계산하세요. (쌀산기)',
};

export default async function AuctionCalculatorPage() {
  // 거래소 데이터 가져오기
  const cacheResult = await getMarketCache();
  const cachedData = cacheResult?.data || {};

  const tier4Results = cachedData.tier4Results || [];
  const tier3Results = cachedData.tier3Results || [];
  const otherResults = cachedData.otherResults || [];
  const relicEngravingResults = cachedData.relicEngravingResults || [];

  // 1) 모든 유물 각인서 (유물 등급, 유물 각인서 티어)
  const relicEngravings = relicEngravingResults.filter((item: any) => {
    const grade = item?.Grade || item?.grade;
    const tier = item?.tier;
    return grade === '유물' && tier === '유물 각인서';
  });

  // 2) 모든 야금술 / 재봉술
  const craftBuckets = [...tier4Results, ...tier3Results, ...otherResults];
  const craftsmanshipItems = craftBuckets.filter((item: any) => {
    const name: string = item?.displayName || item?.Name || '';
    return name.includes('업화') || name.includes('장인의');
  });

  // 3) 합치고, 이름 기준으로 중복 제거
  const combined = [...relicEngravings, ...craftsmanshipItems];
  const seen = new Set<string>();
  const uniqueItems = combined.filter((item) => {
    const key: string = item?.displayName || item?.Name || '';
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 4) 클라이언트에서 사용하는 형태로 매핑 + 이름순 정렬
  const marketData = uniqueItems
    .map((item: any) => ({
      Name: (item.displayName || item.Name || '') as string,
      Grade: (item.Grade || item.grade) as string | undefined,
      CurrentMinPrice: item.CurrentMinPrice as number | undefined,
      RecentPrice: item.RecentPrice as number | undefined,
      Icon: item.Icon as string | undefined,
    }))
    .filter((item) => item.Name)
    .sort((a, b) => a.Name.localeCompare(b.Name, 'ko-KR'));

  return <AuctionCalculatorClient marketData={marketData} />;
}
