import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_FILE = path.join(process.cwd(), 'data', 'cached-market-data.json');
const ITEM_SAMPLE_FILE = path.join(process.cwd(), 'item sample.csv');

type ItemStats = {
  Date: string;
  AvgPrice: number;
  TradeCount: number;
};

type ItemDetail = {
  Id: number;
  Name: string;
  Grade?: string;
  Icon?: string;
  BundleCount?: number;
  TradeRemainCount?: number | null;
  YDayAvgPrice: number;
  RecentPrice: number;
  CurrentMinPrice: number;
  Stats?: ItemStats[];
  displayName?: string;
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

function normalizeKey(key: string | undefined): string {
  if (!key) return '';
  return String(key).replace(/\uFEFF/g, '').trim();
}

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
  const MARKET_ITEMS_FILE = path.join(process.cwd(), 'data', 'market-items.json');
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

async function fetchAllGradesForItemDetail(itemName: string, apiKey: string, type: string = 'market'): Promise<ItemDetail[]> {
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
    
    let res: Response;
    let data: any = null;
    
    if (!isAuction) {
      // 거래소: 먼저 CategoryCode: 50000으로 시도
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
          ItemName: cleanItemName,
          PageNo: 1,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
      
      if (res.ok) {
        data = await res.json();
        // 결과가 없으면 CategoryCode: 0으로 재시도
        if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
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
              ItemName: cleanItemName,
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
            ItemName: cleanItemName,
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
          ItemName: isAuction ? itemName : cleanItemName, // 경매장은 원본, 거래소는 cleanItemName
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
    
    if (!res.ok || !data) return [];
    
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
          const buyPrice = item.AuctionInfo?.BuyPrice || 999999999;
          
          // 해당 등급의 기존 아이템보다 가격이 낮으면 업데이트
          if (!gradeGroups[grade] || buyPrice < (gradeGroups[grade].AuctionInfo?.BuyPrice || 999999999)) {
            gradeGroups[grade] = item;
          }
        });
        
        // 각 등급별 최저가 아이템 반환
        return Object.values(gradeGroups).map((item: any) => ({
          Id: item.Id,
          Name: item.Name,
          Grade: item.Grade,
          Icon: item.Icon,
          BundleCount: item.BundleCount || 1,
          TradeRemainCount: item.TradeRemainCount,
          YDayAvgPrice: 0, // 경매장은 전일평균가 없음
          RecentPrice: item.AuctionInfo?.BuyPrice || 0,
          CurrentMinPrice: item.AuctionInfo?.BuyPrice || 0,
        }));
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
    console.error(`아이템 검색 오류 (${itemName}, ${type}):`, error);
    return [];
  }
}

async function fetchAllGradesForItem(
  itemConfig: MarketItemConfig,
  apiKey: string
): Promise<ItemDetail[]> {
  const results = await fetchAllGradesForItemDetail(itemConfig.name, apiKey, itemConfig.type);
  if (results.length === 0) return [];
  
  // 모든 등급의 결과를 반환
  return results.map(result => ({
    ...result,
    displayName: result.Name || itemConfig.name,
    source: itemConfig.type === 'auction' ? '경매장' : '거래소',
    tier: itemConfig.tier,
    grade: result.Grade,
  }));
}

// 딜레이 함수
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchItemDetailsForConfig(
  items: MarketItemConfig[],
  apiKey: string
): Promise<ItemDetail[]> {
  const allResults: ItemDetail[] = [];
  
  // 순차 처리로 Rate Limit 방지 (page.tsx와 동일)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const results = await fetchAllGradesForItem(item, apiKey);
      allResults.push(...results);
      
      // API Rate Limit 방지를 위해 호출 사이에 딜레이 추가
      // 경매장의 경우 더 긴 딜레이 필요 (429 에러가 많이 발생)
      if (item.type === 'auction') {
        await delay(2000); // 경매장: 2초 딜레이
      } else {
        await delay(1000); // 거래소: 1초 딜레이
      }
    } catch (error) {
      console.error(`아이템 ${item.name} fetch 실패:`, error);
    }
  }
  
  // 중복 제거: displayName과 grade 조합으로 고유성 확인
  const uniqueMap = new Map<string, ItemDetail>();
  allResults.forEach((result) => {
    // displayName과 grade 조합으로 고유 키 생성
    const key = `${result.displayName || result.Name}::${result.grade || result.Grade}`;
    
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
  
  return Array.from(uniqueMap.values());
}

async function fetchRelicEngravings(apiKey: string): Promise<ItemDetail[]> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const allEngravings: ItemDetail[] = [];
    
    for (let pageNo = 1; pageNo <= 100; pageNo++) {
      let res = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'PRICE',
          CategoryCode: 40000,
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: 0,
          ItemGrade: '유물',
          ItemName: '',
          PageNo: pageNo,
          SortCondition: 'DESC',
        }),
        cache: 'no-store',
      });
      
      // 429 에러 (Rate Limit) 발생 시 여러 번 재시도 (최대 5회)
      let retryCount = 0;
      const maxRetries = 5;
      while (res.status === 429 && retryCount < maxRetries) {
        const waitTime = Math.min(2000 * Math.pow(2, retryCount), 10000); // 2초, 4초, 8초, 10초(최대)까지 증가
        console.warn(`Rate Limit (429) 발생 (유물 각인서 페이지 ${pageNo}), ${waitTime/1000}초 후 재시도 (${retryCount + 1}/${maxRetries})...`);
        await delay(waitTime);
        
        // 재시도
        res = await fetch(`${baseUrl}/markets/items`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Sort: 'PRICE',
            CategoryCode: 40000,
            CharacterClass: '',
            ItemLevelMin: 0,
            ItemLevelMax: 0,
            ItemGradeQuality: 0,
            ItemTier: 0,
            ItemGrade: '유물',
            ItemName: '',
            PageNo: pageNo,
            SortCondition: 'DESC',
          }),
          cache: 'no-store',
        });
        
        if (res.ok) {
          break;
        }
        
        retryCount++;
      }
      
      if (!res.ok) {
        if (pageNo === 1) {
          console.error('CategoryCode 40000 첫 페이지 검색 실패:', res.status);
          break;
        }
        break;
      }
      
      const data = await res.json();
      
      // 페이지 간 딜레이 추가
      if (pageNo < 100) {
        await delay(1000); // 페이지 간 1초 딜레이
      }
      
      if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
        break;
      }
      
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
        } as ItemDetail));
      
      allEngravings.push(...relicItems);
      
      if (data.Items.length < 10) {
        break;
      }
    }
    
    const uniqueEngravingsById: { [id: string]: ItemDetail } = {};
    
    allEngravings.forEach((item) => {
      if (item.Id) {
        const idKey = String(item.Id);
        if (!uniqueEngravingsById[idKey]) {
          uniqueEngravingsById[idKey] = item;
        }
      }
    });
    
    const finalEngravings = Object.values(uniqueEngravingsById);
    
    return finalEngravings.sort((a, b) => {
      const priceA = a.CurrentMinPrice || 0;
      const priceB = b.CurrentMinPrice || 0;
      return priceB - priceA;
    });
  } catch (error) {
    console.error('유물 각인서 가져오기 오류:', error);
    return [];
  }
}

async function fetchSpecificEngraving(itemName: string, apiKey: string): Promise<ItemDetail | null> {
  try {
    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const categoryCodes = [40000, 0, 50000];
    
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
          ItemTier: 0,
          ItemGrade: '',
          ItemName: itemName,
          PageNo: 1,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });
      
      if (!res.ok) continue;
      
      const data = await res.json();
      
      if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0) {
        const matchedItem = data.Items.find((item: any) => 
          item.Name === itemName || item.Name?.includes(itemName)
        );
        
        if (matchedItem) {
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
            tier: '각인서',
            grade: matchedItem.Grade,
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('특정 각인서 검색 오류:', error);
    return null;
  }
}

async function readCache(): Promise<CachedMarketData | null> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function writeCache(data: CachedMarketData): Promise<void> {
  const dataDir = path.dirname(CACHE_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  // 먼저 기존 캐시 읽기 (실패해도 기존 데이터 유지하기 위해)
  const existingCache = await readCache();
  
  try {
    const apiKey = normalizeKey(process.env.LOSTARK_API_KEY);
    if (!apiKey) {
      // 기존 캐시가 있으면 반환
      if (existingCache) {
        return NextResponse.json({
          message: 'API Key 미설정, 기존 캐시 데이터 반환',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const now = new Date();
    
    // 캐시가 있고 10분 이내이면 캐시 반환
    if (existingCache) {
      const lastUpdated = new Date(existingCache.lastUpdated);
      const diffMinutes = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
      
      if (diffMinutes < 10) {
        return NextResponse.json({
          message: '캐시 데이터 반환 (갱신 불필요)',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }
    }

    // 캐시가 없거나 10분 이상 지났으면 업데이트 시도
    console.log('캐시 업데이트 시작...');
    
    let marketItemsData;
    let tier4Results: ItemDetail[] = [];
    let tier3Results: ItemDetail[] = [];
    let gemResults: ItemDetail[] = [];
    let otherResults: ItemDetail[] = [];
    let relicEngravingResults: ItemDetail[] = [];
    
    try {
      marketItemsData = await getMarketItems();
      
      // 각 데이터 가져오기를 시도하고, 실패하면 기존 캐시에서 가져옴
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
        // 기존 캐시에서 가져오기
        if (existingCache) {
          tier4Results = existingCache.data.tier4Results || [];
          tier3Results = existingCache.data.tier3Results || [];
          gemResults = existingCache.data.gemResults || [];
          otherResults = existingCache.data.otherResults || [];
        }
      }
      
      try {
        relicEngravingResults = await fetchRelicEngravings(apiKey);
      } catch (error) {
        console.error('유물 각인서 데이터 가져오기 실패, 기존 캐시 사용:', error);
        if (existingCache) {
          relicEngravingResults = existingCache.data.relicEngravingResults || [];
        }
      }

      // 데이터 검증: 빈 결과가 너무 많으면 기존 캐시 사용
      const hasValidData = (
        tier4Results.length > 0 || tier3Results.length > 0 || 
        gemResults.length > 0 || relicEngravingResults.length > 0
      );
      
      // 기존 캐시가 있고, 새 데이터가 거의 비어있으면 기존 캐시 사용
      if (existingCache && !hasValidData) {
        console.warn('새 데이터가 비어있어 기존 캐시 유지');
        return NextResponse.json({
          message: '기존 캐시 유지 (새 데이터 없음)',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }

      const cacheData: CachedMarketData = {
        lastUpdated: now.toISOString(),
        data: {
          tier4Results: tier4Results.length > 0 ? tier4Results : (existingCache?.data.tier4Results || []),
          tier3Results: tier3Results.length > 0 ? tier3Results : (existingCache?.data.tier3Results || []),
          gemResults: gemResults.length > 0 ? gemResults : (existingCache?.data.gemResults || []),
          otherResults: otherResults.length > 0 ? otherResults : (existingCache?.data.otherResults || []),
          relicEngravingResults: relicEngravingResults.length > 0 ? relicEngravingResults : (existingCache?.data.relicEngravingResults || []),
          wishEngraving: null,
        },
      };

      await writeCache(cacheData);
      console.log('캐시 업데이트 완료');

      return NextResponse.json({
        message: '캐시 업데이트 완료',
        cached: false,
        lastUpdated: cacheData.lastUpdated,
        data: cacheData.data,
      });
    } catch (updateError) {
      console.error('캐시 업데이트 중 오류:', updateError);
      
      // 오류 발생 시 기존 캐시 반환
      if (existingCache) {
        console.log('기존 캐시 데이터 반환 (업데이트 실패)');
        return NextResponse.json({
          message: '기존 캐시 데이터 반환 (업데이트 실패)',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }
      
      throw updateError;
    }
  } catch (error) {
    console.error('캐시 업데이트 오류:', error);
    
    // 기존 캐시가 있으면 반환
    if (existingCache) {
      return NextResponse.json({
        message: '기존 캐시 데이터 반환 (오류 발생)',
        cached: true,
        lastUpdated: existingCache.lastUpdated,
        data: existingCache.data,
      });
    }
    
    return NextResponse.json(
      { error: '캐시 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST 요청으로 강제 업데이트
export async function POST(request: NextRequest) {
  // 먼저 기존 캐시 읽기
  const existingCache = await readCache();
  
  try {
    const apiKey = normalizeKey(process.env.LOSTARK_API_KEY);
    if (!apiKey) {
      if (existingCache) {
        return NextResponse.json({
          message: 'API Key 미설정, 기존 캐시 데이터 반환',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    console.log('강제 캐시 업데이트 시작...');
    
    let marketItemsData;
    let tier4Results: ItemDetail[] = [];
    let tier3Results: ItemDetail[] = [];
    let gemResults: ItemDetail[] = [];
    let otherResults: ItemDetail[] = [];
    let relicEngravingResults: ItemDetail[] = [];
    
    try {
      marketItemsData = await getMarketItems();
      
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
        if (existingCache) {
          tier4Results = existingCache.data.tier4Results || [];
          tier3Results = existingCache.data.tier3Results || [];
          gemResults = existingCache.data.gemResults || [];
          otherResults = existingCache.data.otherResults || [];
        }
      }
      
      try {
        relicEngravingResults = await fetchRelicEngravings(apiKey);
      } catch (error) {
        console.error('유물 각인서 데이터 가져오기 실패, 기존 캐시 사용:', error);
        if (existingCache) {
          relicEngravingResults = existingCache.data.relicEngravingResults || [];
        }
      }

      // 데이터 검증: 빈 결과가 너무 많으면 기존 캐시 사용
      const hasValidData = (
        tier4Results.length > 0 || tier3Results.length > 0 || 
        gemResults.length > 0 || relicEngravingResults.length > 0
      );
      
      if (existingCache && !hasValidData) {
        console.warn('새 데이터가 비어있어 기존 캐시 유지');
        return NextResponse.json({
          message: '기존 캐시 유지 (새 데이터 없음)',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }

      const cacheData: CachedMarketData = {
        lastUpdated: new Date().toISOString(),
        data: {
          tier4Results: tier4Results.length > 0 ? tier4Results : (existingCache?.data.tier4Results || []),
          tier3Results: tier3Results.length > 0 ? tier3Results : (existingCache?.data.tier3Results || []),
          gemResults: gemResults.length > 0 ? gemResults : (existingCache?.data.gemResults || []),
          otherResults: otherResults.length > 0 ? otherResults : (existingCache?.data.otherResults || []),
          relicEngravingResults: relicEngravingResults.length > 0 ? relicEngravingResults : (existingCache?.data.relicEngravingResults || []),
          wishEngraving: null,
        },
      };

      await writeCache(cacheData);
      console.log('강제 캐시 업데이트 완료');

      return NextResponse.json({
        message: '캐시 업데이트 완료',
        lastUpdated: cacheData.lastUpdated,
        data: cacheData.data,
      });
    } catch (updateError) {
      console.error('캐시 업데이트 중 오류:', updateError);
      
      if (existingCache) {
        console.log('기존 캐시 데이터 반환 (업데이트 실패)');
        return NextResponse.json({
          message: '기존 캐시 데이터 반환 (업데이트 실패)',
          cached: true,
          lastUpdated: existingCache.lastUpdated,
          data: existingCache.data,
        });
      }
      
      throw updateError;
    }
  } catch (error) {
    console.error('캐시 업데이트 오류:', error);
    
    if (existingCache) {
      return NextResponse.json({
        message: '기존 캐시 데이터 반환 (오류 발생)',
        cached: true,
        lastUpdated: existingCache.lastUpdated,
        data: existingCache.data,
      });
    }
    
    return NextResponse.json(
      { error: '캐시 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

