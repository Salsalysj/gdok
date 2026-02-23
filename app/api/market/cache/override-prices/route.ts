import { NextRequest, NextResponse } from 'next/server';
import { getMarketCache, setMarketCache } from '@/lib/marketCache';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type OverrideRequest = {
  items: string[]; // 0골드로 설정할 아이템 이름 목록
  setToZero?: boolean; // true면 0으로 설정, false면 원래 가격 복원 (기본값: true)
};

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * market_cache에서 특정 아이템들의 가격을 0으로 설정하거나 원래 가격으로 복원
 */
export async function POST(request: NextRequest) {
  try {
    const body: OverrideRequest = await request.json();
    const { items, setToZero = true } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: '아이템 목록이 필요합니다.' },
        { status: 400 }
      );
    }

    // 기존 캐시 읽기
    const existingCache = await getMarketCache();
    if (!existingCache) {
      return NextResponse.json(
        { error: '캐시 데이터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 모든 결과 배열에서 해당 아이템들의 가격 처리
    const data = existingCache.data;
    const resultArrays = [
      data.tier4Results || [],
      data.tier3Results || [],
      data.gemResults || [],
      data.otherResults || [],
      data.relicEngravingResults || [],
    ];

    let updatedCount = 0;
    
    // 운명의 파편은 market_cache에 직접 저장되지 않고 운명의 파편 주머니(소)에서 계산되므로,
    // 운명의 파편을 처리할 때 운명의 파편 주머니(소)도 함께 처리
    const processedItems = [...items];
    if (items.includes('운명의 파편') && !items.includes('운명의 파편 주머니(소)')) {
      processedItems.push('운명의 파편 주머니(소)');
    }
    if (items.includes('명예의 파편') && !items.includes('명예의 파편 주머니(대)')) {
      processedItems.push('명예의 파편 주머니(대)');
    }
    
    if (setToZero) {
      // 가격을 0으로 설정하고 원본 가격을 별도로 저장
      for (const resultArray of resultArrays) {
        for (const item of resultArray) {
          const itemName = item.Name || item.displayName || '';
          if (processedItems.includes(itemName)) {
            // 원본 가격이 저장되어 있지 않으면 현재 가격을 원본으로 저장
            if (!item._originalPrice) {
              item._originalPrice = item.CurrentMinPrice || item.RecentPrice || 0;
            }
            item.CurrentMinPrice = 0;
            item.RecentPrice = 0;
            item.YDayAvgPrice = 0;
            updatedCount++;
          }
        }
      }
    } else {
      // 원래 가격 복원
      for (const resultArray of resultArrays) {
        for (const item of resultArray) {
          const itemName = item.Name || item.displayName || '';
          if (processedItems.includes(itemName)) {
            // 원본 가격이 저장되어 있으면 복원
            if (item._originalPrice != null && item._originalPrice > 0) {
              item.CurrentMinPrice = item._originalPrice;
              item.RecentPrice = item._originalPrice;
              item.YDayAvgPrice = item._originalPrice;
              // 원본 가격 정보 제거 (선택사항)
              delete item._originalPrice;
              updatedCount++;
            } else {
              // 원본 가격이 없으면 외부 API에서 다시 가져오기
              // 이 경우 해당 아이템만 다시 조회해야 하지만, 
              // 간단하게 market_cache 전체를 갱신하는 것이 더 확실함
              // 여기서는 원본 가격이 없으면 복원하지 않음
              console.warn(`원본 가격 정보 없음: ${itemName}`);
            }
          }
        }
      }
      
      // 원본 가격이 없는 아이템이 있으면 market_cache를 다시 갱신
      // 하지만 이것은 시간이 오래 걸리므로, 일단 저장된 원본 가격만 복원
    }

    // 업데이트된 캐시 저장
    const updatedCache = {
      lastUpdated: existingCache.lastUpdated,
      data: {
        ...data,
        tier4Results: resultArrays[0],
        tier3Results: resultArrays[1],
        gemResults: resultArrays[2],
        otherResults: resultArrays[3],
        relicEngravingResults: resultArrays[4],
      },
    };

    const success = await setMarketCache(updatedCache);
    if (!success) {
      return NextResponse.json(
        { error: '캐시 업데이트 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: setToZero ? '가격 오버라이드 완료' : '가격 복원 완료',
      updatedCount,
    });
  } catch (error) {
    console.error('가격 오버라이드 오류:', error);
    return NextResponse.json(
      { error: '가격 오버라이드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * market_cache에서 특정 아이템들의 가격 오버라이드 해제 (원래 가격 복원)
 * 실제로는 market_cache를 다시 갱신해야 하므로, 이 API는 단순히 캐시를 무효화하거나
 * 원본 데이터를 다시 가져와야 합니다.
 */
export async function DELETE(request: NextRequest) {
  try {
    // 가격 오버라이드를 해제하려면 market_cache를 다시 갱신해야 합니다.
    // 이는 /api/market/cache/update를 호출하는 것으로 처리할 수 있습니다.
    return NextResponse.json({
      message: '가격 오버라이드 해제를 위해서는 캐시를 다시 갱신하세요.',
    });
  } catch (error) {
    console.error('가격 오버라이드 해제 오류:', error);
    return NextResponse.json(
      { error: '가격 오버라이드 해제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

