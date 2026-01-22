export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '아크 패스 선택 가이드 - 껨산기',
  description: '아크패스 보상 선택지를 추천합니다.',
};
import { promises as fs } from 'fs';
import path from 'path';
import ArkpassGuideClient from './client';
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

async function parseEtcList(crystalGoldRate: number | null): Promise<EtcListItem[]> {
  try {
    const fileContents = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = fileContents.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const dataLines = lines.slice(1);
    const items: EtcListItem[] = [];
    
    for (const line of dataLines) {
      const match = line.match(/^"?([^",]+)"?,([^,]*),([^,]*),([^,]*)/);
      if (!match) continue;
      
      const itemName = match[1].trim();
      const crystalStr = match[2].trim();
      const goldStr = match[3].trim();
      const cashStr = match[4].trim();
      
      const originalCrystal = crystalStr ? parseFloat(crystalStr) : null;
      const originalGold = goldStr ? parseFloat(goldStr) : null;
      const cash = cashStr ? parseFloat(cashStr) : null;
      
      let crystal = originalCrystal;
      let gold = originalGold;
      
      if (crystalGoldRate !== null) {
        if (crystal !== null && gold === null) {
          gold = (crystal * crystalGoldRate) / 100;
        }
      }
      
      items.push({
        itemName,
        crystal,
        gold,
        cash,
        originalCrystal,
        originalGold,
      });
    }
    
    return items;
  } catch (error) {
    console.error('etc_list.csv 파싱 오류:', error);
    return [];
  }
}

async function getCrystalGoldRate(): Promise<number | null> {
  try {
    // 먼저 Supabase에서 최신 환율 가져오기 시도
    if (supabase) {
      const { data, error } = await supabase
        .from('crystal_exchange_rates')
        .select('exchange')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if (!error && data && data.exchange) {
        return Number(data.exchange);
      }
    }
    
    // Supabase에서 가져오지 못하면 로컬 파일에서 가져오기 (fallback)
    const fileContents = await fs.readFile(CRYSTAL_GOLD_DATA_FILE, 'utf-8');
    const data = JSON.parse(fileContents);
    const rates = data.exchangeRates || [];
    if (rates.length > 0) {
      // exchangeRates 배열의 마지막 항목의 exchange 값 사용
      const latestRate = rates[rates.length - 1];
      if (latestRate && typeof latestRate.exchange === 'number' && latestRate.exchange > 0) {
        return latestRate.exchange;
      }
    }
    return null;
  } catch (error) {
    console.error('crystal-gold-rates.json 읽기 오류:', error);
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

async function getSavedArkpassGuides() {
  if (!supabase) {
    console.log('Supabase가 설정되지 않았습니다.');
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('saved_arkpass_guides')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase 에러:', error);
      return [];
    }
    // pass_period를 start_date, end_date로 변환 (기존 데이터 호환성)
    const normalizedData = (data || []).map((item: any) => {
      if (item.pass_period && (!item.start_date || !item.end_date)) {
        const period = item.pass_period;
        const match = period.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*~\s*(\d{4}[.-]\d{2}[.-]\d{2})/);
        if (match) {
          item.start_date = match[1].replace(/\./g, '-');
          item.end_date = match[2].replace(/\./g, '-');
        } else {
          item.start_date = item.start_date || '';
          item.end_date = item.end_date || '';
        }
      }
      return {
        ...item,
        start_date: item.start_date || '',
        end_date: item.end_date || '',
      };
    });
    return normalizedData;
  } catch (error) {
    console.error('아크패스 가이드 조회 실패:', error);
    return [];
  }
}

export default async function ArkpassGuidePage() {
  const [crystalGoldRate, discordRate, etcListItems, initialSavedGuides] = await Promise.all([
    getCrystalGoldRate(),
    getLatestDiscordRate(),
    parseEtcList(await getCrystalGoldRate()),
    getSavedArkpassGuides(),
  ]);

  return (
    <ArkpassGuideClient
      crystalGoldRate={crystalGoldRate}
      discordRate={discordRate}
      etcListItems={etcListItems}
      initialSavedGuides={initialSavedGuides}
    />
  );
}

