'use server';

import { createClient } from '@supabase/supabase-js';

type CachedMarketData = {
  lastUpdated: string;
  data: any;
};

// Supabase 클라이언트 (서비스 키 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// 인메모리 캐시 (6시간)
let inMemoryCache: { data: CachedMarketData; timestamp: number } | null = null;
const MEMORY_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6시간

/**
 * Supabase에서 시장 캐시 데이터를 읽어옵니다.
 * 인메모리 캐시를 먼저 확인하여 성능을 최적화합니다.
 */
export async function getMarketCache(): Promise<CachedMarketData | null> {
  // 1. 인메모리 캐시 확인 (가장 빠름 - 밀리초 단위)
  if (inMemoryCache && Date.now() - inMemoryCache.timestamp < MEMORY_CACHE_DURATION) {
    return inMemoryCache.data;
  }

  // 2. Supabase에서 가져오기
  if (!supabase) {
    console.warn('Supabase not configured for market cache');
    return null;
  }

  try {
    const { data: result, error } = await supabase
      .from('market_cache')
      .select('data, last_updated')
      .eq('cache_key', 'main_market_data')
      .single<{ data: any; last_updated: string }>();

    if (error) {
      console.error('Market cache read error:', error);
      return null;
    }

    if (!result) {
      return null;
    }

    const cacheData = {
      lastUpdated: result.last_updated,
      data: result.data,
    };

    // 3. 인메모리 캐시에 저장 (다음 요청을 위해)
    inMemoryCache = {
      data: cacheData,
      timestamp: Date.now(),
    };

    return cacheData;
  } catch (error) {
    console.error('Failed to read market cache from Supabase:', error);
    return null;
  }
}

/**
 * Supabase에 시장 캐시 데이터를 저장합니다.
 * 인메모리 캐시도 함께 업데이트합니다.
 */
export async function setMarketCache(cacheData: CachedMarketData): Promise<boolean> {
  if (!supabase) {
    console.warn('Supabase not configured for market cache');
    return false;
  }

  try {
    const { error } = await (supabase as any)
      .from('market_cache')
      .upsert({
        cache_key: 'main_market_data',
        data: cacheData.data,
        last_updated: cacheData.lastUpdated,
      }, {
        onConflict: 'cache_key',
      });

    if (error) {
      console.error('Market cache write error:', error);
      return false;
    }

    // Supabase 업데이트 성공 시 인메모리 캐시도 업데이트
    inMemoryCache = {
      data: cacheData,
      timestamp: Date.now(),
    };

    return true;
  } catch (error) {
    console.error('Failed to write market cache to Supabase:', error);
    return false;
  }
}

