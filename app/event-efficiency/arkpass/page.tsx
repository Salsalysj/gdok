export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const fileContents = await fs.readFile(CRYSTAL_GOLD_DATA_FILE, 'utf-8');
    const data = JSON.parse(fileContents);
    if (data && typeof data.crystalGoldRate === 'number') {
      return data.crystalGoldRate;
    }
    return null;
  } catch (error) {
    console.error('crystal-gold-rates.json 읽기 오류:', error);
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
    return data || [];
  } catch (error) {
    console.error('아크패스 가이드 조회 실패:', error);
    return [];
  }
}

export default async function ArkpassGuidePage() {
  const [crystalGoldRate, etcListItems, initialSavedGuides] = await Promise.all([
    getCrystalGoldRate(),
    parseEtcList(await getCrystalGoldRate()),
    getSavedArkpassGuides(),
  ]);

  return (
    <ArkpassGuideClient
      crystalGoldRate={crystalGoldRate}
      etcListItems={etcListItems}
      initialSavedGuides={initialSavedGuides}
    />
  );
}

