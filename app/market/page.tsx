export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';
import path from 'path';
import MarketPageClient from './client';
import { getMarketCache, setMarketCache } from '@/lib/marketCache';

const ITEM_SAMPLE_FILE = path.join(process.cwd(), 'item sample.csv');
const MARKET_ITEMS_FILE = path.join(process.cwd(), 'data', 'market-items.json');
const FEATURED_ITEMS_FILE = path.join(process.cwd(), 'data', 'featured-items.json');
const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');

type ItemStats = {
  Date: string;
  AvgPrice: number;
  TradeCount: number;
};

type ItemDetail = {
  Id?: number;
  Name?: string;
  displayName?: string;
  Grade?: string;
  Icon?: string;
  BundleCount?: number;
  TradeRemainCount?: number | null;
  YDayAvgPrice?: number;
  RecentPrice?: number;
  CurrentMinPrice?: number;
  Stats?: ItemStats[];
  source?: string;
  tier?: string;
  grade?: string;
};

type MarketItemConfig = {
  id: number;
  name: string;
  tier: string;
  type: string;
};

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
};

// item sample.csv에서 티어4 아이템 리스트 읽기
async function getTier4ItemsFromSample(): Promise<MarketItemConfig[]> {
  try {
    const content = await fs.readFile(ITEM_SAMPLE_FILE, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const tier4Items: MarketItemConfig[] = [];
    let idCounter = 1;
    
    for (const line of lines) {
      const columns = line.split(',').map(col => col.trim());
      if (columns.length < 2) continue;
      
      const itemName = columns[0];
      const tier = columns[1];
      
      if (tier === '티어4') {
        tier4Items.push({
          id: idCounter++,
          name: itemName,
          tier: '티어4',
          type: 'market',
        });
      }
    }
    
    return tier4Items;
  } catch (error) {
    console.error('item sample.csv 파싱 실패:', error);
    return [];
  }
}

async function getMarketItems(): Promise<{
  tier4: MarketItemConfig[];
  tier3: MarketItemConfig[];
  gem: MarketItemConfig[];
  other: MarketItemConfig[];
}> {
  try {
    // 티어4는 item sample.csv에서 읽기
    const tier4Items = await getTier4ItemsFromSample();
    
    // 나머지는 기존 JSON 파일에서 읽기
    const data = await fs.readFile(MARKET_ITEMS_FILE, 'utf-8');
    const jsonData = JSON.parse(data);
    
    return {
      tier4: tier4Items,
      tier3: jsonData.tier3 || [],
      gem: jsonData.gem || [],
      other: jsonData.other || [],
    };
  } catch (error) {
    // JSON 파일이 없거나 오류가 발생하면 티어4만 item sample.csv에서 읽기
    const tier4Items = await getTier4ItemsFromSample();
    return {
      tier4: tier4Items,
      tier3: [],
      gem: [],
      other: [],
    };
  }
}

async function parseEtcList(crystalGoldRate: number | null): Promise<EtcListItem[]> {
  try {
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // 첫 번째 줄은 헤더이므로 스킵
    const items: EtcListItem[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split(',').map(col => col.trim());
      
      if (columns.length < 4) continue;
      
      const itemName = columns[0];
      const crystalStr = columns[1];
      const goldStr = columns[2];
      const cashStr = columns[3];
      
      // 값 파싱 (빈 문자열이면 null)
      const crystal = crystalStr === '' ? null : parseFloat(crystalStr);
      const gold = goldStr === '' ? null : parseFloat(goldStr);
      const cash = cashStr === '' ? null : parseFloat(cashStr);
      
      let finalGold = gold;
      let finalCash = cash;
      
      // 크리스탈이 있고 골드가 비어있으면 크리스탈→골드 환산
      if (crystal !== null && crystalGoldRate !== null && gold === null) {
        finalGold = (crystal * crystalGoldRate) / 100; // 100크리당 골드 환율 사용
      }
      
      items.push({
        itemName,
        crystal,
        gold: finalGold,
        cash: finalCash,
      });
    }
    
    return items;
  } catch (error) {
    console.error('etc_list.csv 파싱 실패:', error);
    return [];
  }
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  try {
    const ratesFile = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
    const data = await fs.readFile(ratesFile, 'utf-8');
    const json = JSON.parse(data);
    const rates = json.exchangeRates || [];
    if (rates.length > 0) {
      // 가장 최근 환율 반환
      const latest = rates[rates.length - 1];
      return latest.exchange || null;
    }
    return null;
  } catch (error) {
    console.error('골드 환율 조회 실패:', error);
    return null;
  }
}

// Lost Ark API는 아이템 ID로 직접 조회하는 엔드포인트가 없으므로
// 아이템 이름으로 검색하여 시세 정보를 가져옵니다

async function fetchItemDetailWithGrades(
  itemName: string,
  apiKey: string,
  type: string = 'market'
): Promise<ItemDetail[]> {
  // 동일한 이름의 아이템이 등급별로 여러개 있을 수 있으므로 모든 등급을 반환
  const result = await fetchItemDetail(itemName, apiKey, type);
  if (!result) return [];
  
  // 등급 정보와 함께 반환
  return [result];
}

async function fetchItemDetail(itemName: string, apiKey: string, type: string = 'market'): Promise<ItemDetail | null> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const endpoint = type === 'auction' ? '/auctions/items' : '/markets/items';
    
    // 경매장 보석 검색의 경우 CategoryCode와 ItemTier를 다르게 설정
    const isGem = type === 'auction';
    
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Sort: isGem ? 'BUY_PRICE' : 'GRADE', // 보석은 BUY_PRICE 정렬
        CategoryCode: isGem ? 210000 : 50000, // 보석은 210000 카테고리
        CharacterClass: '',
        ItemLevelMin: 0,
        ItemLevelMax: 0,
        ItemGradeQuality: 0,
        ItemTier: isGem ? 4 : 0, // 보석은 Tier 4
        ItemGrade: '',
        ItemName: itemName,
        PageNo: isGem ? 0 : 1, // 보석은 PageNo 0부터
        SortCondition: 'ASC',
      }),
      cache: 'no-store',
    });
    
    if (!res.ok) {
      console.error(`API 호출 실패 (${itemName}, ${type}): ${res.status} ${res.statusText}`);
      return null;
    }
    
    const data = await res.json();
    
    // 응답 구조: { Items: [...] }
    if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0) {
      // 경매장 보석의 경우: 동일한 이름의 보석들 중 최저가 선택
      if (isGem) {
        console.log(`보석 검색 디버그 - 검색어: ${itemName}, 결과 수: ${data.Items.length}`);
        
        // 검색 결과 로그 (처음 3개만)
        if (data.Items.length > 0) {
          console.log('보석 검색 결과 샘플:', data.Items.slice(0, 3).map((item: any) => ({
            Name: item.Name,
            BuyPrice: item.AuctionInfo?.BuyPrice,
            AuctionInfo: item.AuctionInfo
          })));
        }
        
        // BuyPrice가 있는 모든 항목 필터링 (세부 옵션 무시)
        const itemsWithPrice = data.Items.filter((item: any) => {
          const buyPrice = item.AuctionInfo?.BuyPrice;
          return buyPrice && buyPrice > 0;
        });
        
        if (itemsWithPrice.length > 0) {
          // BuyPrice 기준으로 정렬하여 최저가 선택
          itemsWithPrice.sort((a: any, b: any) => 
            (a.AuctionInfo?.BuyPrice || 999999999) - (b.AuctionInfo?.BuyPrice || 999999999)
          );
          
          const cheapestItem = itemsWithPrice[0];
          const buyPrice = cheapestItem.AuctionInfo?.BuyPrice || 0;
          
          console.log(`보석 검색 성공: ${itemName}, 선택된 보석: ${cheapestItem.Name}, 가격: ${buyPrice}`);
          
          return {
            Id: cheapestItem.Id,
            Name: cheapestItem.Name,
            Grade: cheapestItem.Grade,
            Icon: cheapestItem.Icon,
            BundleCount: 1,
            TradeRemainCount: null,
            YDayAvgPrice: buyPrice,
            RecentPrice: buyPrice,
            CurrentMinPrice: buyPrice,
          } as ItemDetail;
        } else {
          // BuyPrice가 없는 경우 로그 출력
          console.error(`보석 가격 정보 없음: ${itemName}, 응답 구조:`, JSON.stringify(data.Items[0], null, 2));
          
          // 첫 번째 항목이라도 반환 (가격은 0)
          const item = data.Items[0];
          return {
            Id: item.Id,
            Name: item.Name,
            Grade: item.Grade,
            Icon: item.Icon,
            BundleCount: 1,
            TradeRemainCount: null,
            YDayAvgPrice: 0,
            RecentPrice: 0,
            CurrentMinPrice: 0,
          } as ItemDetail;
        }
      }
      
      // 일반 거래소 아이템: 동일한 이름이라도 등급별로 모두 반환
      // 등급별로 그룹화하지 않고 모든 항목을 반환하도록 변경
      // (하지만 첫 번째만 반환하고, 실제로는 상위 컴포넌트에서 처리)
      const item = data.Items[0] as ItemDetail;
      
      // 같은 이름의 다른 등급 아이템들도 확인
      const sameNameItems = data.Items.filter((i: any) => 
        i.Name === itemName || i.Name?.includes(itemName)
      );
      
      // 등급별로 분리하여 모두 반환하는 것은 상위 컴포넌트에서 처리
      // 여기서는 첫 번째 항목만 반환 (실제로는 여러 등급이 있을 수 있음)
      return item;
    }
    
    console.error(`검색 결과 없음: ${itemName} (${type}), 응답:`, JSON.stringify(data, null, 2));
    return null;
  } catch (error) {
    console.error(`아이템 ${itemName} fetch 오류 (${type}):`, error);
    return null;
  }
}

function normalizeKey(value: string | undefined | null): string {
  return typeof value === 'string' ? value.replace(/\uFEFF/g, '').trim() : '';
}

function formatPrice(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '-';
  return n.toLocaleString('ko-KR');
}

// 딜레이 함수
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchItemDetailsForConfig(
  items: MarketItemConfig[],
  apiKey: string
): Promise<(ItemDetail & { displayName: string; source?: string; tier: string; grade?: string })[]> {
  const allResults: (ItemDetail & { displayName: string; source?: string; tier: string; grade?: string })[] = [];

  console.log(`\n📦 ${items.length}개 아이템 처리 시작...`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      console.log(`[${i + 1}/${items.length}] 처리 중: ${item.name} (${item.type})...`);
      
      // 동일한 이름의 모든 등급을 가져오기
      const results = await fetchAllGradesForItem(item.name, apiKey, item.type);
      
      if (results.length === 0) {
        console.warn(`⚠️  결과 없음: ${item.name} (${item.type})`);
      } else {
        console.log(`✅ ${item.name}: ${results.length}개 등급 발견`);
      }
      
      // 각 등급별로 결과 추가
      for (const result of results) {
        allResults.push({
          ...result,
          displayName: item.name,
          source: item.type === 'auction' ? '경매장' : '거래소',
          tier: item.tier,
          grade: result.Grade,
        });
      }
      
      // API Rate Limit 방지를 위해 호출 사이에 딜레이 추가
      // 경매장의 경우 더 긴 딜레이 필요 (429 에러가 많이 발생)
      if (item.type === 'auction') {
        await delay(2000); // 경매장: 2초 딜레이
      } else {
        await delay(1000); // 거래소: 1초 딜레이
      }
    } catch (error) {
      console.error(`❌ 아이템 ${item.name} fetch 실패:`, error);
    }
  }

  // 중복 제거: displayName과 grade 조합으로 고유성 확인
  const uniqueMap = new Map<string, ItemDetail & { displayName: string; source?: string; tier: string; grade?: string }>();
  allResults.forEach((result) => {
    // displayName과 grade 조합으로 고유 키 생성
    const key = `${result.displayName}::${result.grade || result.Grade}`;
    
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, result);
    } else {
      // 이미 존재하면, 더 낮은 가격의 것으로 교체
      const existing = uniqueMap.get(key)!;
      const existingPrice = existing.CurrentMinPrice || 0;
      const newPrice = result.CurrentMinPrice || 0;
      
      if (newPrice > 0 && (existingPrice === 0 || newPrice < existingPrice)) {
        uniqueMap.set(key, result);
      }
    }
  });
  
  const uniqueResults = Array.from(uniqueMap.values());
  console.log(`\n✅ 총 ${uniqueResults.length}개 결과 수집 완료 (중복 제거 전: ${allResults.length}개)\n`);
  return uniqueResults;
}

// 동일한 이름의 모든 등급 아이템 가져오기
async function fetchAllGradesForItem(
  itemName: string,
  apiKey: string,
  type: string
): Promise<ItemDetail[]> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const endpoint = type === 'auction' ? '/auctions/items' : '/markets/items';
    const isAuction = type === 'auction';
    
    // 보석 아이템인지 확인 (이름에 "보석" 또는 "젬" 포함)
    const isGem = isAuction && (itemName.includes('보석') || itemName.includes('젬'));
    
    // 알려진 등급 키워드 목록
    const gradeKeywords = ['유물', '고대', '전설', '영웅', '희귀', '일반', '고급'];
    
    // 괄호 안의 내용 추출
    const gradeMatch = itemName.match(/\(([^)]+)\)/);
    const bracketContent = gradeMatch ? gradeMatch[1] : null;
    
    // 괄호 안의 내용이 등급 키워드인 경우에만 등급으로 처리
    const isGradeInBracket = bracketContent && gradeKeywords.includes(bracketContent);
    const targetGrade = isGradeInBracket ? bracketContent : null;
    
    // 등급 키워드인 경우에만 괄호 제거, 아니면 원본 이름 사용
    const cleanItemName = isGradeInBracket ? itemName.replace(/\([^)]*\)/g, '').trim() : itemName;
    
    if (targetGrade) {
      console.log(`  🔍 검색: "${cleanItemName}" (등급 필터: "${targetGrade}")`);
    }
    
    // 거래소 아이템의 경우: 먼저 CategoryCode: 50000으로 시도, 실패하면 CategoryCode: 0으로 재시도
    let res: Response;
    let data: any = null;
    
    if (!isAuction) {
      // 거래소: 먼저 기본 카테고리로 시도
      res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: 50000, // 먼저 기본 카테고리로 검색
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: cleanItemName, // 괄호 제거된 이름으로 검색
          PageNo: 1,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
      
      if (res.ok) {
        data = await res.json();
        // 결과가 있으면 사용, 없으면 CategoryCode: 0으로 재시도
        if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
          // CategoryCode: 0으로 재시도
          res = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              Sort: 'GRADE',
              CategoryCode: 0, // 모든 카테고리 검색
              CharacterClass: '',
              ItemTier: 0,
              ItemGrade: '',
              ItemName: cleanItemName, // 괄호 제거된 이름으로 검색
              PageNo: 1,
              SortCondition: 'ASC',
            }),
            cache: 'no-store',
          });
          
          if (res.ok) {
            data = await res.json();
          }
        }
      } else {
        // 첫 요청 실패 시 CategoryCode: 0으로 재시도
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Sort: 'GRADE',
            CategoryCode: 0, // 모든 카테고리 검색
            CharacterClass: '',
            ItemTier: 0,
            ItemGrade: '',
            ItemName: cleanItemName, // 괄호 제거된 이름으로 검색
            PageNo: 1,
            SortCondition: 'ASC',
          }),
          cache: 'no-store',
        });
        
        if (res.ok) {
          data = await res.json();
        }
      }
    } else {
      // 경매장: 기존 로직 유지
      res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: isGem ? 'BUY_PRICE' : 'BUY_PRICE',
          CategoryCode: isGem ? 210000 : 0,
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: isGem ? 4 : 4,
          ItemGrade: '',
          ItemName: itemName,
          PageNo: isGem ? 0 : 0,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
    }
    
    // 경매장 일반 아이템 검색 실패 시 보석으로 재시도
    if (isAuction && !isGem && res.ok) {
      data = await res.json();
      if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
        // 보석 파라미터로 재시도
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Sort: 'BUY_PRICE',
            CategoryCode: 210000,
            CharacterClass: '',
            ItemLevelMin: 0,
            ItemLevelMax: 0,
            ItemGradeQuality: 0,
            ItemTier: 4,
            ItemGrade: '',
            ItemName: itemName,
            PageNo: 0,
            SortCondition: 'ASC',
          }),
          cache: 'no-store',
        });
        if (res.ok) {
          data = await res.json();
        }
      }
    }
    
    // 429 에러 (Rate Limit) 발생 시 여러 번 재시도 (최대 5회)
    let retryCount = 0;
    const maxRetries = 5;
    while (res.status === 429 && retryCount < maxRetries) {
      const waitTime = Math.min(2000 * Math.pow(2, retryCount), 10000); // 2초, 4초, 8초, 10초(최대)까지 증가
      console.warn(`Rate Limit (429) 발생 (${itemName}), ${waitTime/1000}초 후 재시도 (${retryCount + 1}/${maxRetries})...`);
      await delay(waitTime);
      
      // 재시도
      res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: isGem ? 'BUY_PRICE' : (isAuction ? 'BUY_PRICE' : 'GRADE'),
          CategoryCode: isGem ? 210000 : (isAuction ? 0 : 50000), // 거래소는 먼저 기본 카테고리로 시도
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: isGem ? 4 : (isAuction ? 4 : 0), // 거래소는 모든 티어에서 검색
          ItemGrade: '',
          ItemName: itemName.trim(),
          PageNo: isGem ? 0 : (isAuction ? 0 : 1),
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
      
      if (res.ok) {
        // 성공 시 data 파싱
        data = await res.json();
        break;
      }
      
      retryCount++;
    }
    
    if (!res.ok) {
      if (res.status === 429) {
        console.error(`API 재시도 실패 (${itemName}): Rate Limit 지속 (${maxRetries}회 시도 후 실패)`);
      } else {
        console.error(`API 호출 실패 (${itemName}): ${res.status}`);
      }
      return [];
    }
    
    if (!data) {
      data = await res.json();
    }
    
    if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
      console.warn(`검색 결과 없음: ${itemName} (${type}, CategoryCode: ${isGem ? 210000 : (isAuction ? 0 : '')})`);
      return [];
    }
    
    console.log(`✅ 아이템 검색 성공: ${itemName} (${type}) - ${data.Items.length}개 결과`);
    
    // 경매장 아이템 처리
    if (isAuction) {
      const itemsWithPrice = data.Items.filter((item: any) => {
        const buyPrice = item.AuctionInfo?.BuyPrice;
        return buyPrice && buyPrice > 0;
      });
      
      if (itemsWithPrice.length > 0) {
        // 등급별로 그룹화하여 각 등급의 최저가 반환
        const gradeGroups: { [grade: string]: any } = {};
        itemsWithPrice.forEach((item: any) => {
          const grade = item.Grade || '기타';
          if (!gradeGroups[grade] || (item.AuctionInfo?.BuyPrice || 999999999) < (gradeGroups[grade].AuctionInfo?.BuyPrice || 999999999)) {
            gradeGroups[grade] = item;
          }
        });
        
        return Object.values(gradeGroups).map((item: any) => ({
          Id: item.Id,
          Name: item.Name,
          Grade: item.Grade,
          Icon: item.Icon,
          BundleCount: 1,
          TradeRemainCount: null,
          YDayAvgPrice: 0, // 경매장은 전일평균가 없음
          RecentPrice: item.AuctionInfo?.BuyPrice || 0,
          CurrentMinPrice: item.AuctionInfo?.BuyPrice || 0,
        } as ItemDetail));
      }
      
      return [];
    }
    
    // 거래소: 등급별로 그룹화하여 각 등급별 항목 반환
    let itemsToProcess = data.Items;
    
    // 특정 등급이 지정되어 있으면 해당 등급만 필터링
    if (targetGrade) {
      itemsToProcess = data.Items.filter((item: any) => item.Grade === targetGrade);
      console.log(`  ✅ 등급 "${targetGrade}" 필터링 결과: ${itemsToProcess.length}개`);
      
      if (itemsToProcess.length === 0) {
        console.warn(`  ⚠️  등급 "${targetGrade}"의 아이템을 찾을 수 없음`);
        return [];
      }
    }
    
    const gradeGroups: { [grade: string]: ItemDetail } = {};
    itemsToProcess.forEach((item: any) => {
      const grade = item.Grade || '기타';
      // 같은 등급이 이미 있으면, 더 낮은 가격의 것으로 교체
      if (!gradeGroups[grade] || (item.CurrentMinPrice || 0) < (gradeGroups[grade].CurrentMinPrice || 0)) {
        gradeGroups[grade] = item as ItemDetail;
      }
    });
    
    const results = Object.values(gradeGroups);
    console.log(`  ✅ 최종 결과: ${results.length}개 등급`);
    return results;
  } catch (error) {
    console.error(`fetchAllGradesForItem 오류 (${itemName}):`, error);
    return [];
  }
}

// 특정 각인서 가져오기 (원한 각인서 등)
async function fetchSpecificEngraving(itemName: string, apiKey: string): Promise<(ItemDetail & { displayName: string; source?: string; tier: string; grade?: string }) | null> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    
    // 여러 카테고리에서 검색 시도
    const categoryCodes = [70000, 0];
    
    for (const categoryCode of categoryCodes) {
      const res = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: categoryCode,
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: 0,
          ItemGrade: '',
          ItemName: itemName,
          PageNo: 1,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0) {
          // 정확한 이름 매칭 또는 포함하는 첫 번째 결과 반환
          const matchedItem = data.Items.find((item: any) => 
            item.Name === itemName || item.Name?.includes(itemName)
          ) || data.Items[0];
          
          return {
            Id: matchedItem.Id,
            Name: matchedItem.Name,
            Grade: matchedItem.Grade,
            Icon: matchedItem.Icon,
            BundleCount: matchedItem.BundleCount || 1,
            TradeRemainCount: matchedItem.TradeRemainCount,
            YDayAvgPrice: matchedItem.YDayAvgPrice || 0,
            RecentPrice: matchedItem.RecentPrice || 0,
            CurrentMinPrice: matchedItem.CurrentMinPrice || 0,
            displayName: matchedItem.Name,
            source: '거래소',
            tier: '특별 아이템',
            grade: matchedItem.Grade,
          } as ItemDetail & { displayName: string; source?: string; tier: string; grade?: string };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`${itemName} 가져오기 오류:`, error);
    return null;
  }
}

// 유물 각인서 가져오기
async function fetchRelicEngravings(apiKey: string): Promise<(ItemDetail & { displayName: string; source?: string; tier: string; grade?: string })[]> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const allEngravings: (ItemDetail & { displayName: string; source?: string; tier: string; grade?: string })[] = [];
    
    // CategoryCode 40000의 유물 등급으로 모든 아이템 가져오기 (ItemName 필터 없이)
    // 여러 페이지 확인 (모든 각인서를 가져오기 위해 충분히 많은 페이지 확인)
    for (let pageNo = 1; pageNo <= 100; pageNo++) {
      const res = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'PRICE',
          CategoryCode: 40000, // CategoryCode 40000 (각인서 카테고리)
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: 0,
          ItemGrade: '유물', // 유물 등급만 필터링
          ItemName: '', // 빈 문자열로 카테고리 내 모든 아이템 검색
          PageNo: pageNo,
          SortCondition: 'DESC', // 가격 내림차순
        }),
        cache: 'no-store',
      });
      
      if (!res.ok) {
        if (pageNo === 1) {
          console.error('CategoryCode 40000 첫 페이지 검색 실패:', res.status);
          break;
        }
        break; // 더 이상 페이지가 없으면 중단
      }
      
      const data = await res.json();
      
      if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
        break; // 결과가 없으면 중단
      }
      
      // CategoryCode 40000에서 유물 등급 아이템 모두 가져오기 (모두 각인서)
      const relicItems = data.Items
        .filter((item: any) => item.Grade === '유물')
        .map((item: any) => ({
          Id: item.Id,
          Name: item.Name,
          Grade: item.Grade,
          Icon: item.Icon,
          BundleCount: item.BundleCount || 1,
          TradeRemainCount: item.TradeRemainCount,
          YDayAvgPrice: item.YDayAvgPrice || 0,
          RecentPrice: item.RecentPrice || 0,
          CurrentMinPrice: item.CurrentMinPrice || 0,
          displayName: item.Name,
          source: '거래소',
          tier: '유물 각인서',
          grade: item.Grade,
        } as ItemDetail & { displayName: string; source?: string; tier: string; grade?: string }));
      
      allEngravings.push(...relicItems);
      
      console.log(`페이지 ${pageNo}: ${relicItems.length}개의 유물 각인서 발견 (전체 ${data.Items.length}개)`);
      
      // 페이지당 아이템 수가 적으면 마지막 페이지로 판단
      // Lost Ark API는 보통 페이지당 10개를 반환하므로, 10개 미만이면 마지막 페이지
      if (data.Items.length < 10) {
        console.log(`페이지 ${pageNo}에서 마지막 페이지 확인 (결과 ${data.Items.length}개)`);
        break;
      }
    }
    
    console.log(`총 ${allEngravings.length}개의 유물 각인서 수집됨`);
    
    // 중복 제거: 같은 Id나 같은 Name+Grade 조합은 하나만 유지
    // 각인서는 같은 이름이라도 다른 옵션이 있을 수 있으므로 Id 기준으로 중복 제거
    const uniqueEngravingsById: { [id: string]: typeof allEngravings[0] } = {};
    const uniqueEngravingsByName: { [key: string]: typeof allEngravings[0] } = {};
    
    allEngravings.forEach((item) => {
      // Id 기준 중복 제거
      if (item.Id) {
        const idKey = String(item.Id);
        if (!uniqueEngravingsById[idKey]) {
          uniqueEngravingsById[idKey] = item;
        }
      }
      
      // Name 기준으로는 최저가만 유지 (같은 이름의 다른 옵션은 모두 표시하기 위해 Id 기준만 사용)
      // 대신 같은 이름의 경우를 위해 별도로 처리하지 않음
    });
    
    // Id 기준으로 중복 제거된 항목들 사용
    const finalEngravings = Object.values(uniqueEngravingsById);
    
    console.log(`중복 제거 후 ${finalEngravings.length}개의 고유 유물 각인서`);
    
    // 가격 기준 내림차순 정렬
    return finalEngravings.sort((a, b) => {
      const priceA = a.CurrentMinPrice || 0;
      const priceB = b.CurrentMinPrice || 0;
      return priceB - priceA; // 내림차순
    });
  } catch (error) {
    console.error('유물 각인서 가져오기 오류:', error);
    return [];
  }
}

type CachedMarketData = {
  lastUpdated: string;
  data: {
    tier4Results: ItemDetail[];
    tier3Results: ItemDetail[];
    gemResults: ItemDetail[];
    otherResults: ItemDetail[];
    relicEngravingResults: ItemDetail[];
    wishEngraving: ItemDetail | null;
  };
};

// readCache 함수는 getMarketCache로 대체됨

export default async function MarketPage() {
  const apiKey = normalizeKey(process.env.LOSTARK_API_KEY);
  if (!apiKey) {
    return (
      <div className="min-h-screen p-8 text-red-300">
        환경변수 LOSTARK_API_KEY가 설정되지 않았습니다.
      </div>
    );
  }

  // 캐시 확인
  const cached = await getMarketCache();
  const now = new Date();
  let shouldUseCache = false;

  if (cached) {
    const lastUpdated = new Date(cached.lastUpdated);
    const diffMinutes = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
    
    // 캐시가 유효한지 확인 (10분 이내이고, 데이터가 실제로 있는지)
    const hasData = cached.data && (
      (cached.data.tier4Results && cached.data.tier4Results.length > 0) ||
      (cached.data.tier3Results && cached.data.tier3Results.length > 0) ||
      (cached.data.gemResults && cached.data.gemResults.length > 0) ||
      (cached.data.otherResults && cached.data.otherResults.length > 0) ||
      (cached.data.relicEngravingResults && cached.data.relicEngravingResults.length > 0)
    );
    
    // 10분 이내이고 데이터가 있으면 캐시 사용
    if (diffMinutes < 10 && hasData) {
      shouldUseCache = true;
    }
  }

  // 캐시 사용 가능하면 캐시 데이터 반환
  if (shouldUseCache && cached) {
    // 캐시 데이터를 클라이언트가 기대하는 형식으로 변환 (displayName 보장)
    const transformItems = (items: ItemDetail[]): (ItemDetail & { displayName: string })[] => {
      return items.map(item => ({
        ...item,
        displayName: item.displayName || item.Name || '',
      }));
    };
    
    // 백그라운드에서 캐시 업데이트 체크 (10분 지났는지 확인하고 필요시 업데이트)
    // 서버에서 non-blocking 방식으로 처리하려면 별도 함수 호출
    // 하지만 여기서는 사용자가 페이지를 보는 데 지연이 없도록 캐시를 먼저 반환
    const crystalGoldRate = await getLatestCrystalGoldRate();
    const etcListItems = await parseEtcList(crystalGoldRate);
    
    return (
      <MarketPageClient
        tier4Items={transformItems(cached.data.tier4Results || [])}
        tier3Items={transformItems(cached.data.tier3Results || [])}
        gemItems={transformItems(cached.data.gemResults || [])}
        relicEngravingItems={transformItems(cached.data.relicEngravingResults || [])}
        otherItems={transformItems(cached.data.otherResults || [])}
        etcListItems={etcListItems}
        crystalGoldRate={crystalGoldRate}
      />
    );
  }

  // 캐시가 없거나 오래된 경우, 직접 데이터 가져오기 시도
  // 실패하면 기존 캐시 사용
  let tier4Results: ItemDetail[] = [];
  let tier3Results: ItemDetail[] = [];
  let gemResults: ItemDetail[] = [];
  let otherResults: ItemDetail[] = [];
  let relicEngravingResults: ItemDetail[] = [];

  try {
    const marketItemsData = await getMarketItems();
    console.log('주요 아이템 시세 데이터 가져오기 시작...');
    
    try {
      const [t4, t3, g, o] = await Promise.all([
        fetchItemDetailsForConfig(marketItemsData.tier4, apiKey),
        fetchItemDetailsForConfig(marketItemsData.tier3, apiKey),
        fetchItemDetailsForConfig(marketItemsData.gem, apiKey),
        fetchItemDetailsForConfig(marketItemsData.other, apiKey),
      ]);
      tier4Results = t4;
      tier3Results = t3;
      gemResults = g;
      otherResults = o;
    } catch (error) {
      console.error('아이템 데이터 가져오기 실패, 기존 캐시 사용:', error);
      if (cached) {
        tier4Results = cached.data.tier4Results || [];
        tier3Results = cached.data.tier3Results || [];
        gemResults = cached.data.gemResults || [];
        otherResults = cached.data.otherResults || [];
      }
    }
    
    try {
      relicEngravingResults = await fetchRelicEngravings(apiKey);
    } catch (error) {
      console.error('유물 각인서 데이터 가져오기 실패, 기존 캐시 사용:', error);
      if (cached) {
        relicEngravingResults = cached.data.relicEngravingResults || [];
      }
    }
    
    // 데이터 검증: 빈 결과가 너무 많으면 기존 캐시 사용
    const hasValidData = (
      tier4Results.length > 0 || tier3Results.length > 0 || 
      gemResults.length > 0 || relicEngravingResults.length > 0
    );
    
    // 기존 캐시가 있고, 새 데이터가 거의 비어있으면 기존 캐시 사용
    if (cached && !hasValidData) {
      console.warn('새 데이터가 비어있어 기존 캐시 사용');
      tier4Results = cached.data.tier4Results || [];
      tier3Results = cached.data.tier3Results || [];
      gemResults = cached.data.gemResults || [];
      otherResults = cached.data.otherResults || [];
      relicEngravingResults = cached.data.relicEngravingResults || [];
    } else {
      // 새 데이터가 있으면 캐시 저장
      const cacheData: CachedMarketData = {
        lastUpdated: now.toISOString(),
        data: {
          tier4Results: tier4Results.length > 0 ? tier4Results : (cached?.data.tier4Results || []),
          tier3Results: tier3Results.length > 0 ? tier3Results : (cached?.data.tier3Results || []),
          gemResults: gemResults.length > 0 ? gemResults : (cached?.data.gemResults || []),
          otherResults: otherResults.length > 0 ? otherResults : (cached?.data.otherResults || []),
          relicEngravingResults: relicEngravingResults.length > 0 ? relicEngravingResults : (cached?.data.relicEngravingResults || []),
          wishEngraving: null,
        },
      };

      // 캐시 저장은 Supabase를 통해 비동기로 수행 (블로킹 안 함)
      setMarketCache(cacheData).catch(console.error);
    }

    console.log('주요 아이템 시세 데이터 가져오기 완료');
    console.log(`티어4: ${tier4Results.length}개, 티어3: ${tier3Results.length}개, 보석: ${gemResults.length}개, 기타: ${otherResults.length}개, 유물 각인서: ${relicEngravingResults.length}개`);
  } catch (error) {
    console.error('데이터 가져오기 전체 실패, 기존 캐시 사용:', error);
    
    // 전체 실패 시 기존 캐시 사용
    if (cached) {
      tier4Results = cached.data.tier4Results || [];
      tier3Results = cached.data.tier3Results || [];
      gemResults = cached.data.gemResults || [];
      otherResults = cached.data.otherResults || [];
      relicEngravingResults = cached.data.relicEngravingResults || [];
    }
  }

  // 데이터를 클라이언트가 기대하는 형식으로 변환 (displayName 보장)
  const transformItems = (items: ItemDetail[]): (ItemDetail & { displayName: string })[] => {
    return items.map(item => ({
      ...item,
      displayName: item.displayName || item.Name || '',
    }));
  };

  // etc_list.csv 파싱 및 크리스탈→골드 환산
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const etcListItems = await parseEtcList(crystalGoldRate);

  return (
    <MarketPageClient
      tier4Items={transformItems(tier4Results)}
      tier3Items={transformItems(tier3Results)}
      gemItems={transformItems(gemResults)}
      relicEngravingItems={transformItems(relicEngravingResults)}
      otherItems={transformItems(otherResults)}
      etcListItems={etcListItems}
      crystalGoldRate={crystalGoldRate}
    />
  );
}


