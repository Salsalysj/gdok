/**
 * 로스트아크 전설 등급 아바타 최저가 수집 스크립트
 * 
 * 사용 방법:
 * tsx scripts/collect-legendary-avatar-prices.ts
 * 
 * 또는 package.json에 스크립트 추가 후:
 * npm run collect-avatar-prices
 */

import * as fs from 'fs';
import * as path from 'path';

// .env.local 파일에서 API 키 읽기
let apiKey = '';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/LOSTARK_API_KEY\s*=\s*(.+)/);
    if (match) {
      apiKey = match[1].trim().replace(/^["']|["']$/g, ''); // 따옴표 제거
      // BOM 및 공백 제거
      apiKey = apiKey.replace(/\uFEFF/g, '').trim();
    }
  }
  
  // .env.local에서 못 찾으면 환경변수에서 시도
  if (!apiKey) {
    const rawKey = process.env.LOSTARK_API_KEY;
    apiKey = typeof rawKey === 'string' ? rawKey.replace(/\uFEFF/g, '').trim() : '';
  }
} catch (error) {
  console.error('환경변수 읽기 오류:', error instanceof Error ? error.message : '알 수 없는 오류');
}

if (!apiKey) {
  console.error('❌ LOSTARK_API_KEY를 .env.local 파일 또는 환경변수에서 찾을 수 없습니다.');
  process.exit(1);
}

// 로스트아크 직업 목록
// CharacterClass 파라미터에 사용되는 값
const characterClasses = [
  '버서커',
  '디스트로이어',
  '워로드',
  '홀리나이트',
  '아르카나',
  '서머너',
  '바드',
  '소서리스',
  '블레이드',
  '데모닉',
  '리퍼',
  '슬레이어',
  '호크아이',
  '데빌헌터',
  '블래스터',
  '스카우터',
  '인파이팅',
  '스트라이커',
  '브레이커',
  '기공사',
  '건슬링어',
  '아르데타인',
  '스페셜리스트',
];

// 부위 목록
const avatarParts = ['무기', '머리', '상의', '하의'];

// 부위별 검색 키워드 (아바타 이름에 포함될 수 있는 키워드)
const partKeywords: Record<string, string[]> = {
  '무기': ['무기', '웨폰'],
  '머리': ['머리', '헤드', '모자', '투구'],
  '상의': ['상의', '상체', '코트'],
  '하의': ['하의', '하체', '바지'],
};

interface AvatarPrice {
  part: string;
  job: string;
  minPrice: number;
}

/**
 * 경매장 API에서 아이템 검색
 * 부위별로 검색하거나 전체 검색 가능
 */
async function searchAuctionItems(
  characterClass: string,
  partKeyword: string = '',
  pageNo: number = 0
): Promise<any> {
  try {
    // 전설 등급 아바타 검색
    const response = await fetch(
      'https://developer-lostark.game.onstove.com/auctions/items',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'BUY_PRICE',
          CategoryCode: 0, // 모든 카테고리 검색 (아바타는 보통 20000번대 카테고리)
          CharacterClass: characterClass,
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: 0,
          ItemGrade: '전설', // 전설 등급
          ItemName: partKeyword, // 부위 키워드로 검색
          PageNo: pageNo,
          SortCondition: 'ASC', // 가격 오름차순 (최저가)
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '알 수 없는 오류');
      throw new Error(`API 요청 실패: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`검색 오류 (${characterClass}, ${partKeyword}):`, error);
    return null;
  }
}

/**
 * 아이템 이름에서 부위 추출
 */
function extractPartFromItemName(itemName: string): string | null {
  const lowerName = itemName.toLowerCase();
  
  for (const [part, keywords] of Object.entries(partKeywords)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return part;
      }
    }
  }
  
  return null;
}

/**
 * 전설 등급 아바타 최저가 수집
 */
async function collectAvatarPrices(): Promise<AvatarPrice[]> {
  const results: AvatarPrice[] = [];
  
  console.log('🚀 전설 등급 아바타 최저가 수집을 시작합니다...\n');

  // 방법 1: 부위별로 직접 검색
  for (const job of characterClasses) {
    console.log(`📋 ${job} 직업 아바타 검색 중...`);
    
    const jobResults: Map<string, number> = new Map(); // 부위별 최저가 저장
    
    // 각 부위별로 검색
    for (const part of avatarParts) {
      const keywords = partKeywords[part];
      let minPrice = Infinity;
      
      // 부위의 각 키워드로 검색하여 최저가 찾기
      for (const keyword of keywords) {
        const data = await searchAuctionItems(job, keyword, 0);
        
        if (data && data.Items && data.Items.length > 0) {
          // 전설 등급이고 해당 부위 키워드가 포함된 아이템 찾기
          for (const item of data.Items) {
            if ((item.Grade === '전설' || item.Grade === 'Legendary')) {
              const itemName = item.Name || '';
              const buyPrice = item.AuctionInfo?.BuyPrice || 0;
              
              // 아이템 이름에 키워드가 포함되고 부위가 일치하는지 확인
              if (buyPrice > 0 && itemName.includes(keyword)) {
                // 부위가 정확히 일치하는지 재확인
                const extractedPart = extractPartFromItemName(itemName);
                if (extractedPart === part && buyPrice < minPrice) {
                  minPrice = buyPrice;
                }
              }
            }
          }
        }
        
        // API 요청 제한 방지를 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 최저가를 찾았으면 저장
      if (minPrice !== Infinity) {
        jobResults.set(part, minPrice);
        console.log(`  ✅ ${part}: ${minPrice.toLocaleString()} 골드`);
      }
    }
    
    // 결과 저장
    for (const [part, minPrice] of jobResults.entries()) {
      results.push({
        part,
        job,
        minPrice,
      });
    }
    
    if (jobResults.size === 0) {
      console.log(`  ⚠️  결과 없음`);
    }
    
    console.log('');
  }
  
  return results;
}

/**
 * CSV 파일로 저장
 */
function saveToCSV(results: AvatarPrice[], outputPath: string): void {
  // 부위 순서대로 정렬
  const partOrder = ['무기', '머리', '상의', '하의'];
  const sortedResults = results.sort((a, b) => {
    const partDiff = partOrder.indexOf(a.part) - partOrder.indexOf(b.part);
    if (partDiff !== 0) return partDiff;
    return a.job.localeCompare(b.job, 'ko');
  });
  
  // CSV 헤더
  const csvRows = ['부위,직업,최저가'];
  
  // 데이터 행 추가
  for (const result of sortedResults) {
    csvRows.push(`${result.part},${result.job},${result.minPrice}`);
  }
  
  // 파일 저장
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');
  console.log(`\n✅ CSV 파일이 저장되었습니다: ${outputPath}`);
  console.log(`📊 총 ${sortedResults.length}개의 데이터가 수집되었습니다.`);
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    const results = await collectAvatarPrices();
    
    if (results.length === 0) {
      console.log('⚠️  수집된 데이터가 없습니다.');
      return;
    }
    
    // 출력 파일 경로
    const outputPath = path.join(process.cwd(), 'legendary-avatar-prices.csv');
    saveToCSV(results, outputPath);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();

