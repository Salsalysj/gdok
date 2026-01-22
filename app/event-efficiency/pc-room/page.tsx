export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'PC방 효율 - 껨산기',
  description: '로스트아크 PC방 이벤트 효율과 시급을 계산합니다.',
};
import { promises as fs } from 'fs';
import path from 'path';
import EventEfficiencyClient from '../client';
import { getKurzanStageSummaries } from '@/lib/contentRewards';
import { getMarketCache } from '@/lib/marketCache';
import { supabase } from '@/app/utils/supabase';

const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
const CRYSTAL_GOLD_DATA_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
  originalCrystal: number | null;
  originalGold: number | null;
};

type ItemDetail = {
  Id?: number;
  Name?: string;
  displayName?: string;
  Grade?: string;
  Icon?: string;
  BundleCount?: number;
  TradeRemainCount?: number | null;
  YDayAvgPrice?: number;
  RecentPrice?: number;
  CurrentMinPrice?: number;
  source?: string;
  tier?: string;
  grade?: string;
};

type CachedMarketData = {
  lastUpdated: string;
  data: {
    tier4Results: ItemDetail[];
    tier3Results: ItemDetail[];
    gemResults: ItemDetail[];
    otherResults: ItemDetail[];
    relicEngravingResults: ItemDetail[];
  };
};

async function parseEtcList(crystalGoldRate: number | null): Promise<EtcListItem[]> {
  try {
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const items: EtcListItem[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split(',').map(col => col.trim());
      
      if (columns.length < 4) continue;
      
      const itemName = columns[0];
      const crystalStr = columns[1];
      const goldStr = columns[2];
      const cashStr = columns[3];
      
      const crystal = crystalStr === '' ? null : parseFloat(crystalStr);
      const gold = goldStr === '' ? null : parseFloat(goldStr);
      const cash = cashStr === '' ? null : parseFloat(cashStr);
      
      let finalGold = gold;
      
      if (crystal !== null && crystalGoldRate !== null && gold === null) {
        finalGold = (crystal * crystalGoldRate) / 100;
      }
      
      items.push({
        itemName,
        crystal,
        gold: finalGold,
        cash,
        originalCrystal: crystal,
        originalGold: gold,
      });
    }
    
    return items;
  } catch (error) {
    console.error('etc_list.csv 파싱 실패:', error);
    return [];
  }
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  if (!supabase) {
    console.error('Supabase 클라이언트가 초기화되지 않았습니다.');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('crystal_exchange_rates')
      .select('exchange')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Supabase 환율 조회 실패:', error);
      }
      return null;
    }

    return data?.exchange ?? null;
  } catch (err) {
    console.error('Supabase 환율 조회 중 오류:', err);
    return null;
  }
}

type LocalCrystalGoldData = {
  exchangeRates?: {
    date: string;
    exchange: number;
    discord?: number;
  }[];
};

async function getLatestDiscordRate(): Promise<number | null> {
  if (!supabase) {
    return null;
  }

  try {
    const { data } = await supabase
      .from('discord_exchange_rates')
      .select('discord')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    
    if (data?.discord) {
      return Number(data.discord);
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getSavedEventEfficiency() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('saved_event_efficiency')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return [];
    }

    return data || [];
  } catch (error: any) {
    console.error('이벤트 효율 조회 실패:', error);
    return [];
  }
}

export default async function PCRoomEventPage() {
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const [etcListItems, marketCache, discordRate, kurzanStages, savedEventEfficiency] = await Promise.all([
    parseEtcList(crystalGoldRate),
    getMarketCache(),
    getLatestDiscordRate(),
    getKurzanStageSummaries(),
    getSavedEventEfficiency(),
  ]);
  
  return (
    <EventEfficiencyClient 
      etcListItems={etcListItems} 
      crystalGoldRate={crystalGoldRate}
      marketCache={marketCache}
      discordRate={discordRate}
      kurzanStages={kurzanStages}
      initialSavedEventEfficiency={savedEventEfficiency}
    />
  );
}

