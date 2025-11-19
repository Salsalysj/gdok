import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase: any = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// 메모리 캐시
let cachedCircularBreakthrough: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6시간

/**
 * Supabase에서 순환 돌파석 가치 조회 (단계 상관 없이 가장 높은 5개의 평균)
 */
export async function getCircularBreakthroughValue(): Promise<number> {
  // 메모리 캐시 확인
  const now = Date.now();
  if (cachedCircularBreakthrough !== null && now - cacheTimestamp < CACHE_DURATION) {
    return cachedCircularBreakthrough;
  }

  if (!supabase) {
    console.warn('Supabase client not initialized. Returning default value.');
    return 0;
  }

  try {
    // Supabase에서 데이터 조회
    const { data, error } = await supabase
      .from('circular_breakthrough_values')
      .select('*');

    if (error) {
      console.error('Supabase query error:', error);
      return 0;
    }

    if (!data || data.length === 0) {
      console.warn('No circular breakthrough data found in Supabase.');
      return 0;
    }

    // 무기와 방어구 모든 값 중에서 가장 높은 5개의 평균 계산
    const allValues: number[] = [];
    
    // 무기 값 추가
    data.forEach((row: any) => {
      if (row.weapon_value != null && row.weapon_value > 0) {
        allValues.push(row.weapon_value);
      }
    });
    
    // 방어구 값 추가
    data.forEach((row: any) => {
      if (row.armor_value != null && row.armor_value > 0) {
        allValues.push(row.armor_value);
      }
    });

    // 내림차순 정렬 후 상위 5개 선택
    const top5Values = allValues
      .sort((a: number, b: number) => b - a)
      .slice(0, 5);

    const average =
      top5Values.length > 0
        ? top5Values.reduce((sum: number, val: number) => sum + val, 0) / top5Values.length
        : 0;

    // 메모리 캐시 업데이트
    cachedCircularBreakthrough = average;
    cacheTimestamp = now;

    return average;
  } catch (error) {
    console.error('Error fetching circular breakthrough values:', error);
    return 0;
  }
}

