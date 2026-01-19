export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '더보기 추천 - 껨산기',
  description: '더보기를 통한 이득률이 20% 이상인 관문들만 자동으로 추천합니다.',
};

import RecommendedClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function getRates() {
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

export default async function RecommendedPage() {
  // 가치계산DB 데이터 가져오기
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  // raid-rewards.json 읽기
  const raidRewardsPath = path.join(process.cwd(), 'data', 'raid-rewards.json');
  const raidRewardsData = JSON.parse(fs.readFileSync(raidRewardsPath, 'utf-8'));
  
  // 환율 데이터 가져오기
  const rates = await getRates();
  
  return (
    <RecommendedClient 
      data={raidRewardsData} 
      valueDbEntryMap={valueDbEntryMap} 
      rates={rates} 
    />
  );
}
