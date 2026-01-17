export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '레이드 보상 - 껨산기',
  description: '에픽 레이드, 카제로스 레이드, 그림자 레이드 보상 가치 계산',
};

import RaidRewardsClient from './client';
import { getValueDbData } from '@/lib/valueDb';
import fs from 'fs';
import path from 'path';

async function getRates() {
  try {
    const ratesPath = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
    const ratesData = JSON.parse(fs.readFileSync(ratesPath, 'utf-8'));
    return {
      exchange: ratesData.exchange || null,
      discord: ratesData.discord || null,
    };
  } catch (error) {
    console.error('환율 데이터 로드 실패:', error);
    return { exchange: null, discord: null };
  }
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
  
  return (
    <RaidRewardsClient 
      data={raidRewardsData} 
      data1730={raidRewards1730Data}
      valueDbEntryMap={valueDbEntryMap} 
      rates={rates} 
    />
  );
}
