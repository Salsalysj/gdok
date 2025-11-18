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

/**
 * Supabase에서 시장 캐시 데이터를 읽어옵니다.
 */
export async function getMarketCache(): Promise<CachedMarketData | null> {
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

    return {
      lastUpdated: result.last_updated,
      data: result.data,
    };
  } catch (error) {
    console.error('Failed to read market cache from Supabase:', error);
    return null;
  }
}

/**
 * Supabase에 시장 캐시 데이터를 저장합니다.
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

    return true;
  } catch (error) {
    console.error('Failed to write market cache to Supabase:', error);
    return false;
  }
}

