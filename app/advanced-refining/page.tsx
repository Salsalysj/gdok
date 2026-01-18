export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '상급 재련 - 껨산기',
  description: '로스트아크 상급 재련 효율을 계산하고 최적의 재련 전략을 제시합니다.',
};

import { Suspense } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import AdvancedRefiningClient from './client';
import { getValueDbData } from '@/lib/valueDb';

async function getSilverCashValue(): Promise<number | null> {
  try {
    const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    
    console.log('[서버] etc_list.csv 읽기 시작, 총 라인 수:', lines.length);
    
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map((col) => col.trim());
      if (columns.length < 4) continue;
      const itemName = columns[0];
      const cash = columns[3] === '' ? null : parseFloat(columns[3]);
      
      if (itemName === '실링') {
        console.log('[서버] 실링 발견:', { itemName, cash, columns });
        if (cash != null) {
          console.log('[서버] 실링 현금 단가 반환:', cash);
          return cash;
        }
      }
    }
    console.log('[서버] 실링을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('[서버] etc_list.csv를 읽을 수 없습니다:', error);
    return null;
  }
}

async function getLatestRates(): Promise<{ exchange: number | null; discord: number | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  // exchange는 Supabase의 crystal_exchange_rates에서 가져오기
  let exchange: number | null = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('crystal_exchange_rates')
        .select('exchange')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      if (data?.exchange) {
        exchange = Number(data.exchange);
      }
    } catch (err) {
      // 데이터가 없거나 오류 발생 시 무시
    }
  }

  // discord는 Supabase의 discord_exchange_rates에서 가져오기
  let discord: number | null = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('discord_exchange_rates')
        .select('discord')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      if (data?.discord) {
        discord = Number(data.discord);
      }
    } catch (err) {
      // 데이터가 없거나 오류 발생 시 무시
    }
  }

  return { exchange, discord };
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  try {
    // Supabase에서 먼저 시도
    try {
      const { supabase } = await import('../utils/supabase');
      if (supabase) {
        const { data, error } = await supabase
          .from('crystal_exchange_rates')
          .select('exchange')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
        
        if (!error && data && data.exchange) {
          console.log('[서버] Supabase에서 크리스탈-골드 환율:', data.exchange);
          return Number(data.exchange);
        }
      }
    } catch (supabaseError) {
      console.log('[서버] Supabase 조회 실패, 파일에서 읽기 시도');
    }
    
    // Supabase에서 가져오지 못하면 로컬 파일에서 가져오기
    const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
    const content = await fs.readFile(RATES_FILE, 'utf-8');
    const data = JSON.parse(content);
    const list = data?.exchangeRates || [];
    if (list.length === 0) {
      console.log('[서버] 환율 데이터가 없음');
      return null;
    }
    
    // 날짜순 정렬
    const sorted = [...list].sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    // exchange가 0이 아닌 최신 데이터 찾기
    const latestWithExchange = sorted.find((item: any) => item.exchange && item.exchange > 0);
    
    if (latestWithExchange) {
      console.log('[서버] 파일에서 크리스탈-골드 환율:', latestWithExchange.exchange);
      return latestWithExchange.exchange;
    }
    
    console.log('[서버] 유효한 크리스탈-골드 환율을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('[서버] 크리스탈-골드 환율 읽기 실패:', error);
    return null;
  }
}

export default async function AdvancedRefiningPage() {
  const [
    valueDbData,
    silverCashValue,
    rates,
    crystalGoldRate
  ] = await Promise.all([
    getValueDbData(),
    getSilverCashValue(),
    getLatestRates(),
    getLatestCrystalGoldRate(),
  ]);

  const valueDbMap = valueDbData.entryMap;

  console.log('[서버] 환율 정보:', { rates, crystalGoldRate });

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 p-8">
        <div>
          <div className="text-center py-12">
            <div className="text-white">로딩 중...</div>
          </div>
        </div>
      </div>
    }>
      <AdvancedRefiningClient 
        valueDbMap={valueDbMap} 
        silverCashValue={silverCashValue}
        initialRates={rates}
        initialCrystalGoldRate={crystalGoldRate}
      />
    </Suspense>
  );
}

