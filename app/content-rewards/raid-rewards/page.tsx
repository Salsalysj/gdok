export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '레이드 보상 | 클리어 골드·더보기 비용 - 껨산기',
  description: '카제로스 레이드, 에픽 레이드, 그림자 레이드의 클리어 보상·더보기 보상·클리어 골드·더보기 골드·더보기 비용을 한눈에 확인. 에기르, 세르카, 1막·2막·3막·4막 보상과 골드 정보.',
  keywords: [
    '레이드 보상', '카제로스 레이드', '에픽 레이드', '그림자 레이드',
    '클리어 보상', '더보기 보상', '클리어 골드', '더보기 골드', '더보기 비용',
    '에기르 보상', '에기르 골드', '세르카 보상', '세르카 골드',
    '베히모스 보상', '베히모스 골드',
    '서막 보상', '1막 보상', '2막 보상', '3막 보상', '4막 보상', '종막 보상',
    '로스트아크 레이드 보상', '로스트아크 레이드 골드',
  ],
};

import RaidRewardsClient from './client';
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

export default async function RaidRewardsPage() {
  // 가치계산DB 데이터 가져오기
  const valueDbData = await getValueDbData();
  const valueDbEntryMap = valueDbData.entryMap;
  
  // raid-rewards.json 읽기
  const raidRewardsPath = path.join(process.cwd(), 'data', 'raid-rewards.json');
  const raidRewardsData = JSON.parse(fs.readFileSync(raidRewardsPath, 'utf-8'));
  
  // raid-rewards-1730.json 읽기
  const raidRewards1730Path = path.join(process.cwd(), 'data', 'raid-rewards-1730.json');
  let raidRewards1730Data;
  try {
    raidRewards1730Data = JSON.parse(fs.readFileSync(raidRewards1730Path, 'utf-8'));
  } catch (error) {
    console.error('raid-rewards-1730.json 로드 실패:', error);
    raidRewards1730Data = raidRewardsData; // 실패 시 기본 데이터 사용
  }
  
  // 환율 데이터 가져오기
  const rates = await getRates();
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: '레이드 보상 | 클리어 골드·더보기 비용 - 껨산기',
    description: '카제로스 레이드, 에픽 레이드, 그림자 레이드의 클리어 보상·더보기 보상·클리어 골드·더보기 골드·더보기 비용을 한눈에 확인. 에기르, 세르카, 1막·2막·3막·4막 보상과 골드 정보.',
    url: 'https://www.gcalc.kr/content-rewards/raid-rewards',
    keywords: '레이드 보상, 카제로스 레이드, 에픽 레이드, 그림자 레이드, 클리어 보상, 더보기 보상, 클리어 골드, 더보기 골드, 더보기 비용, 에기르 보상, 에기르 골드, 세르카 보상, 세르카 골드, 베히모스 보상, 서막 보상, 1막 보상, 2막 보상, 3막 보상, 4막 보상, 종막 보상',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RaidRewardsClient 
        data={raidRewardsData} 
        data1730={raidRewards1730Data}
        valueDbEntryMap={valueDbEntryMap} 
        rates={rates} 
      />
    </>
  );
}
