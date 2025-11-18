export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { promises as fs } from 'fs';
import path from 'path';
import PackageEfficiencyClient from './client';
import { getMarketCache } from '@/lib/marketCache';

const P_LISTS_FILE = path.join(process.cwd(), 'p_lists.csv');
const P_LIST_FILE_ALT = path.join(process.cwd(), 'p_list.csv'); // 호환: 단수 파일명도 지원
const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
const CSV_REWARDS_FILE = path.join(process.cwd(), 'data', 'csv-rewards.json');

async function getItemList(): Promise<string[]> {
  try {
    let items: string[] = [];
    try {
      const content = await fs.readFile(P_LISTS_FILE, 'utf-8');
      items = items.concat(content.split('\n').map(line => line.trim()).filter(line => line.length > 0));
    } catch {}
    try {
      // 보조 파일명도 읽어와 합치기
      const contentAlt = await fs.readFile(P_LIST_FILE_ALT, 'utf-8');
      items = items.concat(contentAlt.split('\n').map(line => line.trim()).filter(line => line.length > 0));
    } catch {}
    // 중복 제거
    const set = new Set(items.filter(Boolean));
    return Array.from(set);
  } catch (error) {
    console.error('p_lists.csv 읽기 실패:', error);
    return [];
  }
}

async function getEtcListData(): Promise<Map<string, { crystal: number | null; gold: number | null; cash: number | null }>> {
  try {
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const itemMap = new Map<string, { crystal: number | null; gold: number | null; cash: number | null }>();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split(',').map(col => col.trim());
      if (columns.length < 4) continue;
      
      const itemName = columns[0];
      const crystal = columns[1] === '' ? null : parseFloat(columns[1]);
      const gold = columns[2] === '' ? null : parseFloat(columns[2]);
      const cash = columns[3] === '' ? null : parseFloat(columns[3]);
      
      itemMap.set(itemName, { crystal, gold, cash });
    }
    
    return itemMap;
  } catch (error) {
    console.error('etc_list.csv 읽기 실패:', error);
    return new Map();
  }
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  try {
    const data = await fs.readFile(RATES_FILE, 'utf-8');
    const json = JSON.parse(data);
    const rates = json.exchangeRates || [];
    if (rates.length > 0) {
      const latest = rates[rates.length - 1];
      return latest.exchange || null;
    }
    return null;
  } catch (error) {
    console.error('골드 환율 조회 실패:', error);
    return null;
  }
}

type MarketItem = { displayName?: string; Name?: string; CurrentMinPrice?: number; RecentPrice?: number };
async function getMarketPriceMap(): Promise<Record<string, number>> {
  try {
    const cached = await getMarketCache();
    const data = cached?.data || {};
    const buckets: MarketItem[][] = [
      data.tier4Results || [],
      data.tier3Results || [],
      data.gemResults || [],
      data.otherResults || [],
      data.relicEngravingResults || [],
    ];
    const map: Record<string, number> = {};
    for (const bucket of buckets) {
      for (const it of bucket) {
        const name = (it as any).displayName || (it as any).Name;
        const price = (it as any).CurrentMinPrice || (it as any).RecentPrice || 0;
        if (name && price > 0) {
          // 가장 낮은 가격을 우선 저장
          if (!(name in map) || price < map[name]) map[name] = price;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function getMarketData() {
  try {
    const cached = await getMarketCache();
    return cached?.data || null;
  } catch (error) {
    return null;
  }
}

export default async function PackageEfficiencyPage() {
  const itemList = await getItemList();
  const etcListData = await getEtcListData();
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const marketPriceMap = await getMarketPriceMap();
  const marketData = await getMarketData();

  // 에브니 큐브 단계별 합계(골드) 계산 (단순 매칭: etc/market 가격 합산)
  const cubeStageTotals: Record<string, number> = {};
  try {
    const csvRaw = await fs.readFile(CSV_REWARDS_FILE, 'utf-8');
    const csvJson = JSON.parse(csvRaw);
    const cube = csvJson['에브니 큐브'] || {};
    const tiers = Object.keys(cube);
    for (const tier of tiers) {
      for (const stage of cube[tier] as any[]) {
        const stageName: string = stage.stage || stage.name || '';
        const rewards: { itemName: string; quantity: number }[] = stage.rewards || [];
        let sum = 0;
        for (const r of rewards) {
          const name = r.itemName as string;
          const qty = Number(r.quantity) || 0;
          // 가격 찾기: etc_list > marketPriceMap
          let unit = 0;
          const etc = (Object.fromEntries(etcListData) as any)[name];
          if (etc && etc.gold != null) unit = etc.gold;
          else if (marketPriceMap[name] != null) unit = marketPriceMap[name];
          if (unit > 0 && qty > 0) sum += unit * qty;
        }
        if (sum > 0) {
          // 스테이지명에 괄호 텍스트 추출 (예: "에브니 큐브 (4금제)" -> 4금제)
          // 여기서는 원 스테이지명이 예: 4금제/5금제/1해금...
          cubeStageTotals[stageName] = sum;
        }
      }
    }
  } catch {}

  return (
    <PackageEfficiencyClient
      itemList={itemList}
      etcListData={Object.fromEntries(etcListData)}
      crystalGoldRate={crystalGoldRate}
      marketPriceMap={marketPriceMap}
      marketData={marketData}
      cubeStageTotals={cubeStageTotals}
    />
  );
}

