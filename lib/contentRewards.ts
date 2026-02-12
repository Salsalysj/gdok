'use server';

import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getMarketCache } from './marketCache';

// Supabase 클라이언트 생성 (서버 사이드에서는 서비스 키 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const REWARDS_FILE = path.join(process.cwd(), 'data', 'content-rewards.json');
const CSV_REWARDS_FILE = path.join(process.cwd(), 'data', 'csv-rewards.json');
const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
const HELL1_CSV_FILE = path.join(process.cwd(), 'hell1.csv');
const HELL2_CSV_FILE = path.join(process.cwd(), 'hell2.csv');
const HELL3_CSV_FILE = path.join(process.cwd(), 'hell3.csv');
const NARAK1_CSV_FILE = path.join(process.cwd(), 'narak1.csv');
const NARAK2_CSV_FILE = path.join(process.cwd(), 'narak2.csv');
const NARAK3_CSV_FILE = path.join(process.cwd(), 'narak3.csv');

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  cubeStageRewards?: RewardItem[];
  category?: string; // 지옥3 카테고리
  selectionComponents?: { itemName: string; quantity: number; price: number | null; totalValue: number }[]; // 선택 상자 구성품
  selectedComponent?: { itemName: string; quantity: number; price: number | null; totalValue: number }; // 선택된 구성품
};

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type ContentData = {
  [level: string]: Stage[];
};

type ContentRewards = {
  [content: string]: ContentData | undefined;
};

type MarketItem = {
  Id?: number;
  Name?: string;
  displayName?: string;
  Grade?: string;
  CurrentMinPrice?: number;
  RecentPrice?: number;
};

type Rates = {
  exchange: number | null;
  discord: number | null;
};

const eponaCubeMapping: { [stage: string]: string } = {
  '천공 1단계': '4금제',
  '천공 2단계': '4금제',
  '계몽 1단계': '5금제',
  '계몽 2단계': '5금제',
  '아비도스 1작전': '1해금',
  '아비도스 2작전': '1해금',
  '아비도스 3작전': '2해금',
  '네프타 1작전': '3해금',
  '네프타 2작전': '4해금',
  '심연의 역류 I': '모래시계 1',
};

const itemNameMapping: { [original: string]: string } = {
  '정제된 파괴강석': '운명의 파괴석',
  '정제된 수호강석': '운명의 수호석',
  '찬란한 명예의 돌파석': '운명의 돌파석',
};

const stagesNeedingItemRename = [
  '아비도스 1작전',
  '아비도스 2작전',
  '아비도스 3작전',
  '네프타 1작전',
  '네프타 2작전',
];

const chaosDungeonStages = ['천공 1단계', '천공 2단계', '계몽 1단계', '계몽 2단계'];

const itemsWithBundlePrice = [
  '정제된 파괴강석',
  '정제된 수호강석',
  '운명의 파괴석',
  '운명의 수호석',
  '운명의 파괴석 결정',
  '운명의 수호석 결정',
];

const GEM_SELECTION_CANDIDATE_NAMES = [
  '질서의 젬 : 불변',
  '질서의 젬 : 견고',
  '질서의 젬 : 안정',
  '혼돈의 젬 : 침식',
  '혼돈의 젬 : 왜곡',
  '혼돈의 젬 : 붕괴',
];

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const data = await readFile(file, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function getContentRewards(): Promise<ContentRewards> {
  return (await readJson<ContentRewards>(REWARDS_FILE)) || {};
}

let etcListCache: EtcListItem[] | null = null;

async function getEtcListItems(): Promise<EtcListItem[]> {
  if (etcListCache) return etcListCache;
  try {
    const content = await readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const items: EtcListItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((col) => col.trim());
      if (cols.length < 4) continue;
      const [itemName, crystalStr, goldStr, cashStr] = cols;
      items.push({
        itemName,
        crystal: crystalStr === '' ? null : parseFloat(crystalStr),
        gold: goldStr === '' ? null : parseFloat(goldStr),
        cash: cashStr === '' ? null : parseFloat(cashStr),
      });
    }
    etcListCache = items;
    return items;
  } catch {
    return [];
  }
}

async function getCSVRewards(): Promise<any> {
  return (await readJson<any>(CSV_REWARDS_FILE)) || {};
}

// 공통 CSV 파싱 함수
async function parseHellNarakCSV(filePath: string, contentName: string): Promise<{ [key: string]: Stage[] }> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return {};

    // 헤더 파싱
    const header = lines[0].split(',').map((col) => col.trim());
    const stageColumns = header.slice(2); // 0단계, 1단계, ..., 10단계

    // 각 단계별로 보상 수집
    const stagesMap: { [stage: string]: RewardItem[] } = {};
    stageColumns.forEach((stage) => {
      stagesMap[stage] = [];
    });

    // 데이터 행 파싱
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((col) => col.trim());
      if (cols.length < 3) continue;

      const category = cols[0];
      const itemName = cols[1];
      
      // 각 단계별 수량 파싱
      stageColumns.forEach((stage, idx) => {
        const quantityStr = cols[idx + 2] || '';
        const quantity = quantityStr ? parseFloat(quantityStr) : 0;
        
        if (quantity > 0) {
          if (!stagesMap[stage]) {
            stagesMap[stage] = [];
          }
          stagesMap[stage].push({
            itemName,
            quantity,
            category, // 카테고리 정보 추가
          });
        }
      });
    }

    // Stage 배열로 변환
    const stages: Stage[] = stageColumns.map((stage) => ({
      stage,
      rewards: stagesMap[stage] || [],
    }));

    return { [contentName]: stages };
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error);
    return {};
  }
}

async function parseHell1CSV(): Promise<{ '지옥1'?: Stage[] }> {
  return parseHellNarakCSV(HELL1_CSV_FILE, '지옥1');
}

async function parseHell2CSV(): Promise<{ '지옥2'?: Stage[] }> {
  return parseHellNarakCSV(HELL2_CSV_FILE, '지옥2');
}

async function parseHell3CSV(): Promise<{ '지옥3'?: Stage[] }> {
  return parseHellNarakCSV(HELL3_CSV_FILE, '지옥3');
}

async function parseNarak1CSV(): Promise<{ '나락1'?: Stage[] }> {
  return parseHellNarakCSV(NARAK1_CSV_FILE, '나락1');
}

async function parseNarak2CSV(): Promise<{ '나락2'?: Stage[] }> {
  return parseHellNarakCSV(NARAK2_CSV_FILE, '나락2');
}

async function parseNarak3CSV(): Promise<{ '나락3'?: Stage[] }> {
  return parseHellNarakCSV(NARAK3_CSV_FILE, '나락3');
}

async function getMarketData(): Promise<any> {
  const cached = await getMarketCache();
  return cached?.data ?? null;
}

// 순환 돌파석 가치 계산: market_cache에서 가져오기
async function calculateCircularBreakthroughStoneValue(marketData: any): Promise<number | null> {
  try {
    const marketCache = await getMarketCache();
    const circularBreakthroughValue = marketCache?.data?.circularBreakthroughValue || null;
    if (circularBreakthroughValue != null && circularBreakthroughValue > 0) {
      return circularBreakthroughValue;
    }
    return null;
  } catch (error) {
    console.error('Error calculating circular breakthrough stone value:', error);
    return null;
  }
}

async function getLatestRates(): Promise<Rates> {
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

  return { 
    exchange, 
    discord 
  };
}

function flattenMarketItems(marketData: any): MarketItem[] {
  if (!marketData) return [];
  return [
    ...(marketData.tier4Results || []),
    ...(marketData.tier3Results || []),
    ...(marketData.gemResults || []),
    ...(marketData.otherResults || []),
    ...(marketData.relicEngravingResults || []),
  ];
}

function findItemPrice(itemName: string, marketData: any): number | null {
  const allItems = flattenMarketItems(marketData);
  const matchExact = allItems.find((item) => {
    const name = (item.displayName || item.Name || '').trim();
    return name === itemName;
  });

  const item =
    matchExact ||
    allItems.find((item) => {
      const displayName = (item.displayName || item.Name || '').replace(/\([^)]*\)/g, '').trim();
      const target = itemName.replace(/\([^)]*\)/g, '').trim();
      return displayName === target;
    });

  if (!item) return null;

  const price = item.CurrentMinPrice || item.RecentPrice || null;
  if (!price) return null;

  if (itemsWithBundlePrice.includes(itemName)) {
    return price / 100;
  }

  return price;
}

function calculateGemPrice(gemType: '3T' | '4T', marketData: any): number | null {
  if (!marketData) return null;
  const fearGem = findItemPrice('5레벨 겁화의 보석', marketData);
  const fireGem = findItemPrice('5레벨 작열의 보석', marketData);
  if (!fearGem || !fireGem) return null;
  if (gemType === '4T') {
    return (fearGem + fireGem) / 162;
  }
  const tier4Unit = (fearGem + fireGem) / 162;
  return tier4Unit / 9;
}

function calculateFragmentPrice(fragmentType: '명예의 파편' | '운명의 파편', marketData: any): number | null {
  if (!marketData) return null;
  if (fragmentType === '명예의 파편') {
    const pouchPrice = findItemPrice('명예의 파편 주머니(대)', marketData);
    return pouchPrice ? pouchPrice / 1500 : null;
  }
  const pouchPrice = findItemPrice('운명의 파편 주머니(소)', marketData);
  return pouchPrice ? pouchPrice / 1000 : null;
}

async function calculateCardExpPrice(
  marketData: any, 
  rates: Rates,
  valueDbEntryMap?: Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>
): Promise<number | null> {
  // 가치계산DB에서 '카드경험치 1당' 찾기 (우선순위 1)
  if (valueDbEntryMap) {
    const cardExpEntry = valueDbEntryMap['카드경험치 1당'];
    if (cardExpEntry && cardExpEntry.unitValue != null && cardExpEntry.unitValue > 0) {
      return cardExpEntry.unitValue;
    }
  }

  // 기존 로직 (fallback)
  const cashToGoldRate =
    rates.exchange && rates.exchange > 0
      ? rates.exchange / 2750
      : rates.discord && rates.discord > 0
        ? 100 / rates.discord
        : null;
  const etcItems = await getEtcListItems();
  const menelik = etcItems.find((item) => item.itemName === '메넬리크의 서');
  if (menelik) {
    if (menelik.cash && menelik.cash > 0 && cashToGoldRate) {
      return (menelik.cash / 9000) * cashToGoldRate;
    }
    if (menelik.gold && menelik.gold > 0) {
      return menelik.gold / 9000;
    }
  }

  const menelikMarketPrice = findItemPrice('메넬리크의 서', marketData);
  return menelikMarketPrice ? menelikMarketPrice / 9000 : null;
}

function calculateGemPriceByGrade(gemGrade: '영웅' | '희귀' | '고급', marketData: any): number | null {
  const allItems = flattenMarketItems(marketData);
  const prices: number[] = [];
  for (const gemName of GEM_SELECTION_CANDIDATE_NAMES) {
    const gem = allItems.find((item) => (item.displayName || item.Name || '').trim() === gemName && item.Grade === gemGrade);
    if (gem) {
      const price = gem.CurrentMinPrice || gem.RecentPrice;
      if (price && price > 0) prices.push(price);
    }
  }
  if (prices.length === 0) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function calculateGemSelectionBoxPrice(
  gemGrade: '희귀' | '영웅',
  marketData: any
): { price: number | null; gemName: string } {
  const allItems = flattenMarketItems(marketData);
  let maxPrice = 0;
  let maxPriceGemName = '';
  for (const gemName of GEM_SELECTION_CANDIDATE_NAMES) {
    const gem = allItems.find(
      (item) => (item.displayName || item.Name || '').trim() === gemName && item.Grade === gemGrade
    );
    if (gem) {
      const price = gem.CurrentMinPrice || gem.RecentPrice || 0;
      if (price > maxPrice) {
        maxPrice = price;
        maxPriceGemName = gemName;
      }
    }
  }
  return { price: maxPrice > 0 ? maxPrice : null, gemName: maxPriceGemName };
}

// 질서/혼돈 젬 선택 상자 전용: 해당 계열(질서/혼돈) 3종 중 최고가
function calculateGemSelectionBoxPriceByType(
  gemGrade: '희귀' | '영웅',
  marketData: any,
  type: '질서' | '혼돈'
): { price: number | null; gemName: string } {
  const allItems = flattenMarketItems(marketData);
  const targetNames =
    type === '질서'
      ? GEM_SELECTION_CANDIDATE_NAMES.filter((name) => name.startsWith('질서의 젬'))
      : GEM_SELECTION_CANDIDATE_NAMES.filter((name) => name.startsWith('혼돈의 젬'));

  let maxPrice = 0;
  let maxPriceGemName = '';
  for (const gemName of targetNames) {
    const gem = allItems.find(
      (item) => (item.displayName || item.Name || '').trim() === gemName && item.Grade === gemGrade
    );
    if (gem) {
      const price = gem.CurrentMinPrice || gem.RecentPrice || 0;
      if (price > maxPrice) {
        maxPrice = price;
        maxPriceGemName = gemName;
      }
    }
  }

  return { price: maxPrice > 0 ? maxPrice : null, gemName: maxPriceGemName };
}

function calculateRelicEngravingAverage(marketData: any): number | null {
  const relics = marketData?.relicEngravingResults || [];
  const prices = relics
    .map((item: any) => item.CurrentMinPrice || item.RecentPrice || 0)
    .filter((price: number) => price > 0);
  if (prices.length === 0) return null;
  const sum = prices.reduce((acc: number, cur: number) => acc + cur, 0);
  return sum / prices.length;
}

async function processCubeStages(
  csvRewards: any,
  marketData: any,
  rates: Rates,
  valueDbEntryMap?: Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>
): Promise<{ totals: Record<string, number>; rewardsMap: Record<string, RewardItem[]> }> {
  const totals: Record<string, number> = {};
  const rewardsMap: Record<string, RewardItem[]> = {};

  const processStages = async (stages: any[], tier: string) => {
    if (!stages) {
      console.log('[processCubeStages] processStages: stages is null/undefined');
      return;
    }
    console.log(`[processCubeStages] processStages called with tier: ${tier}, stages count: ${stages.length}`);
    for (const stage of stages) {
      console.log(`[processCubeStages] Processing stage: ${stage.stage}`);
      const processedRewards = await Promise.all(
        stage.rewards.map(async (reward: RewardItem) => {
          let finalName = reward.itemName;
          if (finalName === '1레벨 보석 (3T)' || finalName === '1레벨 보석 (4T)') {
            const gemType = finalName.includes('4T') ? '4T' : '3T';
            const price = calculateGemPrice(gemType, marketData);
            return { itemName: finalName, quantity: reward.quantity, price };
          }
          if (finalName === '카드 경험치') {
            const price = await calculateCardExpPrice(marketData, rates, valueDbEntryMap);
            return { itemName: finalName, quantity: reward.quantity, price };
          }
          if (finalName === '실링') {
            // 실링 가격 변환은 클라이언트 사이드에서 처리 (디코기준 스위치 반영)
            // 서버에서는 price를 null로 설정하여 클라이언트에서 처리하도록 함
            return { itemName: finalName, quantity: reward.quantity, price: null };
          }
          const price = findItemPrice(finalName, marketData);
          return { itemName: finalName, quantity: reward.quantity, price };
        })
      );

      const stageTotal = processedRewards.reduce((sum, r) => sum + ((r.price || 0) * (r.quantity || 0)), 0);
      const stageKey = `${tier}_${stage.stage}`;
      totals[stageKey] = stageTotal;
      // rewardsMap의 키를 스테이지 이름과 큐브 타입 모두로 저장
      rewardsMap[stage.stage] = processedRewards;
      console.log(`[processCubeStages] Saved to rewardsMap[${stage.stage}], rewards count: ${processedRewards.length}`);
      // eponaCubeMapping의 역매핑을 사용하여 큐브 타입으로도 저장
      const cubeType = Object.entries(eponaCubeMapping).find(([stageName]) => stageName === stage.stage)?.[1];
      if (cubeType) {
        rewardsMap[cubeType] = processedRewards;
        console.log(`[processCubeStages] Also saved to rewardsMap[${cubeType}]`);
      }
    }
  };

  // 에브니 큐브 티어4 처리
  console.log('[processCubeStages] csvRewards keys:', Object.keys(csvRewards || {}));
  console.log('[processCubeStages] csvRewards[에브니 큐브]:', csvRewards['에브니 큐브'] ? Object.keys(csvRewards['에브니 큐브']) : 'null');
  
  // csv-rewards.json 구조: "에브니 큐브" > "에브니 큐브" 배열에 티어4 데이터가 있음
  const eponaCubeTier4Stages = csvRewards['에브니 큐브']?.['에브니 큐브'];
  console.log(`[processCubeStages] Processing 에브니 큐브 (티어4), stages:`, eponaCubeTier4Stages ? `${eponaCubeTier4Stages.length} stages` : 'null');
  if (eponaCubeTier4Stages && Array.isArray(eponaCubeTier4Stages)) {
    await processStages(eponaCubeTier4Stages, '티어4');
  }

  // 할의 모래시계 처리 (모래시계 1 등)
  const hourglassStages = csvRewards['에브니 큐브']?.['할의 모래시계'];
  console.log('[processCubeStages] 할의 모래시계:', hourglassStages ? `${hourglassStages.length} stages` : 'null');
  if (hourglassStages && Array.isArray(hourglassStages)) {
    await processStages(hourglassStages, '티어4');
  }

  // 디버깅: rewardsMap 키 목록 출력
  console.log('[processCubeStages] rewardsMap keys:', Object.keys(rewardsMap));
  console.log('[processCubeStages] rewardsMap sample:', {
    '1해금': rewardsMap['1해금']?.length,
    '2해금': rewardsMap['2해금']?.length,
    '3해금': rewardsMap['3해금']?.length,
    '4해금': rewardsMap['4해금']?.length,
    '모래시계 1': rewardsMap['모래시계 1']?.length,
  });

  return { totals, rewardsMap };
}

async function processRewardForKurzan(
  reward: RewardItem,
  stage: Stage,
  marketData: any,
  csvRewards: any,
  cubeTotals: Record<string, number>,
  cubeRewardsMap: Record<string, RewardItem[]>,
  rates: Rates,
  valueDbEntryMap?: Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>
): Promise<RewardItem> {
  let finalItemName = reward.itemName;

  if (chaosDungeonStages.includes(stage.stage) && reward.itemName === '1레벨 보석 (4T)') {
    finalItemName = '1레벨 보석 (3T)';
  }

  if (reward.itemName === '에브니 큐브' || reward.itemName.startsWith('에브니 큐브')) {
    const cubeType = eponaCubeMapping[stage.stage];
    finalItemName = cubeType ? `에브니 큐브 입장권 (${cubeType})` : '에브니 큐브 입장권';
    let cubePrice: number | null = null;
    // 큐브 타입으로 보상 목록 찾기 (cubeRewardsMap의 키는 stage.stage 또는 cubeType)
    const cubeStageRewards = cubeType ? cubeRewardsMap[cubeType] || null : null;

    // 디버깅 로그
    console.log('[processRewardForKurzan] 에브니 큐브 입장권:', {
      stage: stage.stage,
      cubeType,
      cubeRewardsMapKeys: Object.keys(cubeRewardsMap),
      foundRewards: cubeStageRewards ? cubeStageRewards.length : null,
    });

    if (cubeType) {
      const stageKeyTier4 = `티어4_${cubeType}`;
      cubePrice = cubeTotals[stageKeyTier4] ?? null;
      console.log('[processRewardForKurzan] 가격:', {
        stageKeyTier4,
        cubePrice,
        cubeTotalsKeys: Object.keys(cubeTotals),
      });
    }

    return {
      itemName: finalItemName,
      quantity: reward.quantity,
      price: cubePrice,
      cubeStageRewards: cubeStageRewards || undefined,
    };
  }

  // 시련의 모래 (n단계) → 모래시계 n 보상 매칭
  if (reward.itemName.startsWith('시련의 모래')) {
    const match = reward.itemName.match(/시련의 모래\s*\((\d+)단계\)/);
    if (match) {
      const step = match[1];
      const hourglassType = `모래시계 ${step}`;
      let hourglassPrice: number | null = null;
      // 모래시계 n의 보상 목록 찾기
      const hourglassStageRewards = cubeRewardsMap[hourglassType] || null;

      // 디버깅 로그
      console.log('[processRewardForKurzan] 시련의 모래:', {
        rewardItemName: reward.itemName,
        step,
        hourglassType,
        cubeRewardsMapKeys: Object.keys(cubeRewardsMap),
        foundRewards: hourglassStageRewards ? hourglassStageRewards.length : null,
      });

      if (hourglassType) {
        const stageKeyTier4 = `티어4_${hourglassType}`;
        hourglassPrice = cubeTotals[stageKeyTier4] ?? null;
        console.log('[processRewardForKurzan] 시련의 모래 가격:', {
          stageKeyTier4,
          hourglassPrice,
          cubeTotalsKeys: Object.keys(cubeTotals),
        });
      }

      return {
        itemName: reward.itemName,
        quantity: reward.quantity,
        price: hourglassPrice,
        cubeStageRewards: hourglassStageRewards || undefined,
      };
    }
  }

  if (finalItemName === '1레벨 보석 (4T)' || finalItemName === '1레벨 보석 (3T)') {
    const gemType = finalItemName.includes('4T') ? '4T' : '3T';
    const price = calculateGemPrice(gemType as '3T' | '4T', marketData);
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  if (finalItemName === '파편') {
    const fragmentType = chaosDungeonStages.includes(stage.stage) ? '명예의 파편' : '운명의 파편';
    finalItemName = fragmentType;
    const price = calculateFragmentPrice(fragmentType === '명예의 파편' ? '명예의 파편' : '운명의 파편', marketData);
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  if (stagesNeedingItemRename.includes(stage.stage) && itemNameMapping[reward.itemName]) {
    finalItemName = itemNameMapping[reward.itemName];
  }

  if (finalItemName === '영웅 젬' || finalItemName === '희귀 젬' || finalItemName === '고급 젬') {
    const grade = finalItemName.replace(' 젬', '') as '영웅' | '희귀' | '고급';
    const price = calculateGemPriceByGrade(grade, marketData);
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  if (finalItemName === '카드 경험치') {
    const price = await calculateCardExpPrice(marketData, rates, valueDbEntryMap);
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  // 고대 팔찌: 1500골드 고정
  if (finalItemName === '고대 팔찌') {
    return { itemName: finalItemName, quantity: reward.quantity, price: 1500 };
  }

  // 정련된 운명의 돌: 1000골드 고정
  if (finalItemName === '정련된 운명의 돌') {
    return { itemName: finalItemName, quantity: reward.quantity, price: 1000 };
  }

  // 고급~영웅 젬 상자: 고급80% + 희귀15% + 영웅5%
  if (finalItemName === '고급~영웅 젬 상자' || finalItemName === '고급~영웅 젬 랜덤 상자') {
    const advancedAvg = calculateGemPriceByGrade('고급', marketData);
    const rareAvg = calculateGemPriceByGrade('희귀', marketData);
    const heroicAvg = calculateGemPriceByGrade('영웅', marketData);
    if (!advancedAvg && !rareAvg && !heroicAvg) {
      return { itemName: finalItemName, quantity: reward.quantity, price: null };
    }
    const price =
      (advancedAvg ?? 0) * 0.8 + (rareAvg ?? 0) * 0.15 + (heroicAvg ?? 0) * 0.05;
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  // 희귀~영웅 젬 랜덤 상자: 희귀 평균 * 0.9 + 영웅 평균 * 0.1
  if (
    finalItemName === '희귀~영웅 젬 상자' ||
    finalItemName === '희귀~영웅 젬 랜덤 상자'
  ) {
    const rareAvg = calculateGemPriceByGrade('희귀', marketData);
    const heroicAvg = calculateGemPriceByGrade('영웅', marketData);
    if (!rareAvg && !heroicAvg) {
      return { itemName: finalItemName, quantity: reward.quantity, price: null };
    }
    const price = (rareAvg ?? 0) * 0.9 + (heroicAvg ?? 0) * 0.1;
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  // 희귀/영웅 젬 선택 상자: 해당 등급 젬 6종 중 최고가
  if (finalItemName === '희귀 젬 선택 상자' || finalItemName === '영웅 젬 선택 상자') {
    const grade: '희귀' | '영웅' = finalItemName.includes('영웅') ? '영웅' : '희귀';
    const { price, gemName } = calculateGemSelectionBoxPrice(grade, marketData);
    if (price) {
      return {
        itemName: gemName ? `${finalItemName} (${gemName})` : finalItemName,
        quantity: reward.quantity,
        price,
      };
    }
    return { itemName: finalItemName, quantity: reward.quantity, price: null };
  }

  if (finalItemName === '유물 각인서 랜덤' || finalItemName === '유물 각인서 랜덤 주머니') {
    const avgPrice = calculateRelicEngravingAverage(marketData);
    return { itemName: finalItemName, quantity: reward.quantity, price: avgPrice };
  }

  // 귀속 골드: 골드와 1:1 동일한 가치
  if (finalItemName === '귀속 골드') {
    return { itemName: finalItemName, quantity: reward.quantity, price: 1 };
  }

  // 실링: 클라이언트 사이드에서 가격 변환 처리 (디코기준 스위치 반영)
  if (finalItemName === '실링') {
    // 서버에서는 price를 null로 설정하여 클라이언트에서 처리하도록 함
    return { itemName: finalItemName, quantity: reward.quantity, price: null };
  }

  const price = findItemPrice(finalItemName, marketData);
  return { itemName: finalItemName, quantity: reward.quantity, price };
}

export type EnrichedContentRewardsResult = {
  data: ContentRewards;
  rates: Rates;
  eponaCubeStageTotals: Record<string, number>;
  eponaCubeRewardsMap: Record<string, RewardItem[]>;
};

// 결과 캐싱 (6시간)
let cachedContentRewards: { result: EnrichedContentRewardsResult; timestamp: number } | null = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6시간

export async function getContentRewardsData(
  valueDbEntryMap?: Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>
): Promise<EnrichedContentRewardsResult> {
  // 캐시가 유효하면 반환
  if (cachedContentRewards && Date.now() - cachedContentRewards.timestamp < CACHE_DURATION) {
    return cachedContentRewards.result;
  }
  
  const contentRewards = await getContentRewards();
  const csvRewards = await getCSVRewards();
  const marketData = await getMarketData();
  const rates = await getLatestRates();

  const enrichedData: ContentRewards = {};
  let kurzanData: ContentData = {};

  // 지옥 데이터 처리
  const hellData = contentRewards['지옥'] || {};
  const narakData = contentRewards['나락'] || {};
  
  // CSV 파일 파싱
  const [hell1CSVData, hell2CSVData, hell3CSVData, narak1CSVData, narak2CSVData, narak3CSVData] = await Promise.all([
    parseHell1CSV(),
    parseHell2CSV(),
    parseHell3CSV(),
    parseNarak1CSV(),
    parseNarak2CSV(),
    parseNarak3CSV(),
  ]);
  
  const processedHellData: { '지옥1'?: Stage[]; '지옥2'?: Stage[]; '지옥3'?: Stage[] } = {};
  const processedNarakData: { '나락1'?: Stage[]; '나락2'?: Stage[]; '나락3'?: Stage[] } = {};
  
  // 보상 처리 공통 함수
  const processRewards = async (rewards: RewardItem[]): Promise<RewardItem[]> => {
    return Promise.all(
      rewards.map(async (reward) => {
        if (reward.itemName === '카드 경험치') {
          const price = await calculateCardExpPrice(marketData, rates);
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price,
            category: reward.category 
          };
        }
        // 어빌리티 스톤 키트: 가치계산DB의 '어빌리티 스톤 키트 (지옥)' 가격 사용
        if (reward.itemName === '어빌리티 스톤 키트' || reward.itemName.includes('어빌리티 스톤 키트')) {
          let price: number | null = null;
          // 가치계산DB에서 '어빌리티 스톤 키트 (지옥)' 가격 가져오기
          if (valueDbEntryMap && valueDbEntryMap['어빌리티 스톤 키트 (지옥)']) {
            const abilityStoneKitEntry = valueDbEntryMap['어빌리티 스톤 키트 (지옥)'];
            if (abilityStoneKitEntry.unitValue != null) {
              price = abilityStoneKitEntry.unitValue;
            }
          }
          // 가치계산DB에 없으면 기존 로직 사용 (fallback)
          if (price == null && rates && rates.exchange && rates.exchange > 0) {
            // 페온 9개 = 9 * 8.5 = 76.5크리스탈
            // 76.5크리스탈을 골드로 환산: (76.5 / 100) * exchange
            const peonGoldValue = (76.5 / 100) * rates.exchange;
            // 총 가격 = 페온 골드 가치 + 100골드
            price = peonGoldValue + 100;
          }
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price,
            category: reward.category 
          };
        }
        // 운명의 파편: 운명의 파편 주머니(소) / 1000
        if (reward.itemName === '운명의 파편') {
          const price = calculateFragmentPrice('운명의 파편', marketData);
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price,
            category: reward.category 
          };
        }
        // 순환 돌파석: 클라이언트에서 재계산하므로 null로 설정
        if (reward.itemName === '순환 돌파석') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: null, // 클라이언트에서 재계산됨
            category: reward.category 
          };
        }
        // 전이 돌파석: 클라이언트에서 재계산하므로 null로 설정
        if (reward.itemName === '전이 돌파석') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: null, // 클라이언트에서 재계산됨
            category: reward.category 
          };
        }
        // 고대 팔찌: 1500골드 고정
        if (reward.itemName === '고대 팔찌') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: 1500,
            category: reward.category 
          };
        }
        // 정련된 운명의 돌: 1000골드 고정
        if (reward.itemName === '정련된 운명의 돌') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: 1000,
            category: reward.category 
          };
        }
        // 정련된 혼돈의 돌(무기), 정련된 혼돈의 돌(방어구): 1000골드 고정
        if (reward.itemName === '정련된 혼돈의 돌(무기)' || reward.itemName === '정련된 혼돈의 돌(방어구)') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: 1000,
            category: reward.category 
          };
        }
        if (reward.itemName === '고급~영웅 젬 상자' || reward.itemName === '고급~영웅 젬 랜덤 상자') {
          const advancedAvg = calculateGemPriceByGrade('고급', marketData);
          const rareAvg = calculateGemPriceByGrade('희귀', marketData);
          const heroicAvg = calculateGemPriceByGrade('영웅', marketData);
          if (!advancedAvg && !rareAvg && !heroicAvg) {
            return {
              itemName: reward.itemName,
              quantity: reward.quantity,
              price: null,
              category: reward.category,
            };
          }
          const price =
            (advancedAvg ?? 0) * 0.8 + (rareAvg ?? 0) * 0.15 + (heroicAvg ?? 0) * 0.05;
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price,
            category: reward.category,
          };
        }
        if (
          reward.itemName === '희귀~영웅 젬 상자' ||
          reward.itemName === '희귀~영웅 젬 랜덤 상자'
        ) {
          const rareAvg = calculateGemPriceByGrade('희귀', marketData);
          const heroicAvg = calculateGemPriceByGrade('영웅', marketData);
          if (!rareAvg && !heroicAvg) {
            return {
              itemName: reward.itemName,
              quantity: reward.quantity,
              price: null,
              category: reward.category,
            };
          }
          const price = (rareAvg ?? 0) * 0.9 + (heroicAvg ?? 0) * 0.1;
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price,
            category: reward.category,
          };
        }
        // 희귀 질서/혼돈 젬 선택 상자: 해당 계열 3종 중 최고가
        if (reward.itemName === '희귀 질서의 젬 선택 상자' || reward.itemName === '희귀 혼돈의 젬 선택 상자') {
          const type: '질서' | '혼돈' = reward.itemName.includes('질서') ? '질서' : '혼돈';
          const { price, gemName } = calculateGemSelectionBoxPriceByType('희귀', marketData, type);
          if (price) {
            return {
              itemName: gemName ? `${reward.itemName} (${gemName})` : reward.itemName,
              quantity: reward.quantity,
              price,
              category: reward.category,
            };
          }
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: null,
            category: reward.category,
          };
        }
        // 희귀/영웅 젬 선택 상자: 해당 등급 젬 6종 중 최고가
        if (reward.itemName === '희귀 젬 선택 상자' || reward.itemName === '영웅 젬 선택 상자') {
          const grade: '희귀' | '영웅' = reward.itemName.includes('영웅') ? '영웅' : '희귀';
          const { price, gemName } = calculateGemSelectionBoxPrice(grade, marketData);
          if (price) {
            return {
              itemName: gemName ? `${reward.itemName} (${gemName})` : reward.itemName,
              quantity: reward.quantity,
              price,
              category: reward.category,
            };
          }
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: null,
            category: reward.category,
          };
        }
        // 귀속 골드: 골드와 1:1 동일한 가치
        if (reward.itemName === '귀속 골드') {
          return { 
            itemName: reward.itemName, 
            quantity: reward.quantity, 
            price: 1,
            category: reward.category 
          };
        }
        if (reward.itemName === '유물 각인서 랜덤' || reward.itemName === '유물 각인서 랜덤 주머니') {
          const avgPrice = calculateRelicEngravingAverage(marketData);
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: avgPrice,
            category: reward.category,
          };
        }
        // 유물 팔찌: 500골드 고정
        if (reward.itemName === '유물 팔찌') {
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: 500,
            category: reward.category,
          };
        }
        // 낙원 전설~고대 장비: 1000골드 고정
        if (reward.itemName === '낙원 전설~고대 장비') {
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: 1000,
            category: reward.category,
          };
        }
        // 전설~고대 복원석: 1000골드 고정
        if (reward.itemName === '전설~고대 복원석') {
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: 1000,
            category: reward.category,
          };
        }
        // 전설~고대 공명석: 1000골드 고정
        if (reward.itemName === '전설~고대 공명석') {
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: 1000,
            category: reward.category,
          };
        }
        // 8레벨 보석 (4T): 8레벨 겁화의 보석 + 8레벨 작열의 보석 / 2
        if (reward.itemName === '8레벨 보석 (4T)') {
          let price: number | null = null;
          
          // 가치계산DB에서 가격 확인
          if (valueDbEntryMap && valueDbEntryMap['8레벨 보석 (4T)']) {
            const entry = valueDbEntryMap['8레벨 보석 (4T)'];
            if (entry.unitType === '골드' && entry.unitValue != null && entry.unitValue > 0) {
              price = entry.unitValue;
            }
          }
          
          // 가치계산DB에 없으면 직접 계산
          if (price == null) {
            const fearGem = findItemPrice('8레벨 겁화의 보석', marketData);
            const fireGem = findItemPrice('8레벨 작열의 보석', marketData);
            if (fearGem != null && fireGem != null) {
              price = (fearGem + fireGem) / 2;
            }
          }
          
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price,
            category: reward.category,
          };
        }
        // 상급재련 보조 선택 상자: 구성품 중 최고가 선택
        // 구성품: 장인의 재봉술 1단계 x5, 장인의 야금술 1단계 x5, 장인의 재봉술 2단계 x3, 장인의 야금술 2단계 x3
        if (reward.itemName === '상급재련 보조 선택 상자') {
          const components = [
            { itemName: '장인의 재봉술 : 1단계', quantity: 5 },
            { itemName: '장인의 야금술 : 1단계', quantity: 5 },
            { itemName: '장인의 재봉술 : 2단계', quantity: 3 },
            { itemName: '장인의 야금술 : 2단계', quantity: 3 },
          ];
          
          // 각 구성품의 가격 계산 (가치계산DB 우선, 없으면 거래소 API)
          const componentData: { itemName: string; quantity: number; price: number | null; totalValue: number }[] = [];
          for (const component of components) {
            let price: number | null = null;
            
            // 가치계산DB에서 가격 확인
            if (valueDbEntryMap && valueDbEntryMap[component.itemName]) {
              const entry = valueDbEntryMap[component.itemName];
              if (entry.unitType === '골드' && entry.unitValue != null && entry.unitValue > 0) {
                price = entry.unitValue;
              }
            }
            
            // 가치계산DB에 없으면 거래소 API에서 확인
            if (price == null) {
              price = findItemPrice(component.itemName, marketData);
            }
            
            const totalValue = (price ?? 0) * component.quantity;
            componentData.push({
              itemName: component.itemName,
              quantity: component.quantity,
              price: price,
              totalValue: totalValue,
            });
          }
          
          // 가장 높은 가격 선택
          const selectedComponent = componentData.length > 0 
            ? componentData.reduce((max, comp) => comp.totalValue > max.totalValue ? comp : max)
            : null;
          
          const maxPrice = selectedComponent ? selectedComponent.totalValue : null;
          
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price: maxPrice,
            category: reward.category,
            selectionComponents: componentData,
            selectedComponent: selectedComponent || undefined,
          };
        }
        // 실링: etcListData에서 가격 가져오기 (현금 단위를 골드로 변환)
        if (reward.itemName === '실링') {
          let price: number | null = null;
          // 가치계산DB에서 실링 가격 확인 (우선순위 1)
          if (valueDbEntryMap && valueDbEntryMap['실링']) {
            const silverEntry = valueDbEntryMap['실링'];
            if (silverEntry.unitType === '골드' && silverEntry.unitValue != null) {
              price = silverEntry.unitValue;
            } else if (silverEntry.unitType === '현금' && silverEntry.unitValue != null) {
              // 현금 단위인 경우 골드로 변환
              const cashToGoldRate = rates.exchange && rates.exchange > 0
                ? rates.exchange / 2750
                : rates.discord && rates.discord > 0
                  ? 100 / rates.discord
                  : null;
              if (cashToGoldRate) {
                price = silverEntry.unitValue * cashToGoldRate;
              }
            }
          }
          // 가치계산DB에 없으면 etcListData에서 가져오기
          if (price == null) {
            const etcItems = await getEtcListItems();
            const silverItem = etcItems.find((item) => item.itemName === '실링');
            if (silverItem?.cash != null && silverItem.cash > 0) {
              // 현금 단위를 골드로 변환
              const cashToGoldRate = rates.exchange && rates.exchange > 0
                ? rates.exchange / 2750
                : rates.discord && rates.discord > 0
                  ? 100 / rates.discord
                  : null;
              if (cashToGoldRate) {
                price = silverItem.cash * cashToGoldRate;
              }
            } else if (silverItem?.gold != null && silverItem.gold > 0) {
              price = silverItem.gold;
            }
          }
          return {
            itemName: reward.itemName,
            quantity: reward.quantity,
            price,
            category: reward.category,
          };
        }
        const price = findItemPrice(reward.itemName, marketData);
        return { 
          itemName: reward.itemName, 
          quantity: reward.quantity, 
          price,
          category: reward.category 
        };
      })
    );
  };
  
  // CSV 데이터 처리 공통 함수
  const processCSVData = async (csvData: { [key: string]: Stage[] }, dataKey: string): Promise<Stage[]> => {
    if (!csvData[dataKey]) return [];
    return Promise.all(
      csvData[dataKey].map(async (stage) => {
        const processedRewards = await processRewards(stage.rewards);
        return { ...stage, rewards: processedRewards };
      })
    );
  };
  
  // 지옥1, 지옥2, 지옥3 처리
  if (hell1CSVData['지옥1']) {
    processedHellData['지옥1'] = await processCSVData(hell1CSVData, '지옥1');
  }
  if (hell2CSVData['지옥2']) {
    processedHellData['지옥2'] = await processCSVData(hell2CSVData, '지옥2');
  }
  if (hell3CSVData['지옥3']) {
    processedHellData['지옥3'] = await processCSVData(hell3CSVData, '지옥3');
  }
  
  // 나락1, 나락2, 나락3 처리
  if (narak1CSVData['나락1']) {
    processedNarakData['나락1'] = await processCSVData(narak1CSVData, '나락1');
  }
  if (narak2CSVData['나락2']) {
    processedNarakData['나락2'] = await processCSVData(narak2CSVData, '나락2');
  }
  if (narak3CSVData['나락3']) {
    processedNarakData['나락3'] = await processCSVData(narak3CSVData, '나락3');
  }
  

  (enrichedData as any)['지옥'] = processedHellData;
  (enrichedData as any)['나락'] = processedNarakData;

  const { totals: eponaCubeStageTotals, rewardsMap: eponaCubeRewardsMap } = await processCubeStages(csvRewards, marketData, rates, valueDbEntryMap);

  const eponaCubeData: ContentData = {};
  if (csvRewards['에브니 큐브']) {
    for (const tier of Object.keys(csvRewards['에브니 큐브'])) {
      // 티어3 제외
      if (tier === '티어3') continue;
      eponaCubeData[tier] = await Promise.all(
        csvRewards['에브니 큐브'][tier].map(async (stage: Stage) => {
          const processedRewards = await Promise.all(
            stage.rewards.map(async (reward) => {
              let finalItemName = reward.itemName;
              if (finalItemName === '1레벨 보석 (3T)' || finalItemName === '1레벨 보석 (4T)') {
                const gemType = finalItemName.includes('4T') ? '4T' : '3T';
                const price = calculateGemPrice(gemType, marketData);
                return { itemName: finalItemName, quantity: reward.quantity, price };
              }
              if (finalItemName === '카드 경험치') {
                const price = await calculateCardExpPrice(marketData, rates, valueDbEntryMap);
                return { itemName: finalItemName, quantity: reward.quantity, price };
              }
          if (finalItemName === '실링') {
            // 실링 가격 변환은 클라이언트 사이드에서 처리 (디코기준 스위치 반영)
            // 서버에서는 price를 null로 설정하여 클라이언트에서 처리하도록 함
            return { itemName: finalItemName, quantity: reward.quantity, price: null };
          }
              const price = findItemPrice(finalItemName, marketData);
              return { itemName: finalItemName, quantity: reward.quantity, price };
            })
          );
          return {
            ...stage,
            rewards: processedRewards,
          };
        })
      );
    }
    enrichedData['에브니 큐브'] = eponaCubeData;
  }

  for (const [contentType, levels] of Object.entries(contentRewards)) {
    if (!levels) continue;
    if (contentType === '에브니 큐브' || contentType === '지옥' || contentType === '나락') continue;

    if (contentType === '카던&전선') {
      // 비활성화된 레벨 목록 (업데이트 필요)
      const disabledLevels: string[] = [];
      
      for (const [level, stages] of Object.entries(levels)) {
        // 비활성화된 레벨은 건너뛰기
        if (disabledLevels.includes(level)) {
          continue;
        }
        
        const kurzanStages: Stage[] = [];

        for (const stage of stages) {
          // 카오스 던전 스테이지는 건너뛰기
          if (chaosDungeonStages.includes(stage.stage)) {
            continue;
          }

          const processedRewards = await Promise.all(
            stage.rewards.map((reward) =>
              processRewardForKurzan(reward, stage, marketData, csvRewards, eponaCubeStageTotals, eponaCubeRewardsMap, rates, valueDbEntryMap)
            )
          );

          // 쿠르잔 전선에서 1레벨 보석(4T) 제거
          const filteredRewards = processedRewards.filter(reward => reward.itemName !== '1레벨 보석 (4T)');

          const processedStage = { ...stage, rewards: filteredRewards };
          kurzanStages.push(processedStage);
        }

        if (kurzanStages.length > 0) {
          kurzanData[level] = kurzanStages;
        }
      }

      if (Object.keys(kurzanData).length > 0) {
        enrichedData['쿠르잔 전선'] = kurzanData;
      }
      continue;
    }

    const contentData: ContentData = {};
    for (const [level, stages] of Object.entries(levels)) {
      contentData[level] = await Promise.all(
        stages.map(async (stage) => {
          const processedRewards = await Promise.all(
            stage.rewards.map(async (reward) => {
              if (reward.itemName === '카드 경험치') {
                const price = await calculateCardExpPrice(marketData, rates, valueDbEntryMap);
                return { itemName: reward.itemName, quantity: reward.quantity, price };
              }
              // 고대 팔찌: 1500골드 고정
              if (reward.itemName === '고대 팔찌') {
                return { itemName: reward.itemName, quantity: reward.quantity, price: 1500 };
              }
              // 정련된 운명의 돌: 1000골드 고정
              if (reward.itemName === '정련된 운명의 돌') {
                return { itemName: reward.itemName, quantity: reward.quantity, price: 1000 };
              }
              // 희귀~영웅 젬 랜덤 상자: 희귀 평균 * 0.9 + 영웅 평균 * 0.1
              if (
                reward.itemName === '희귀~영웅 젬 상자' ||
                reward.itemName === '희귀~영웅 젬 랜덤 상자' ||
                reward.itemName === '고급~영웅 젬 랜덤 상자'
              ) {
                const rareAvg = calculateGemPriceByGrade('희귀', marketData);
                const heroicAvg = calculateGemPriceByGrade('영웅', marketData);
                if (!rareAvg && !heroicAvg) {
                  return { itemName: reward.itemName, quantity: reward.quantity, price: null };
                }
                const price = (rareAvg ?? 0) * 0.9 + (heroicAvg ?? 0) * 0.1;
                return { itemName: reward.itemName, quantity: reward.quantity, price };
              }
              // 희귀/영웅 젬 선택 상자: 해당 등급 젬 6종 중 최고가
              if (reward.itemName === '희귀 젬 선택 상자' || reward.itemName === '영웅 젬 선택 상자') {
                const grade: '희귀' | '영웅' = reward.itemName.includes('영웅') ? '영웅' : '희귀';
                const { price, gemName } = calculateGemSelectionBoxPrice(grade, marketData);
                if (price) {
                  return {
                    itemName: gemName ? `${reward.itemName} (${gemName})` : reward.itemName,
                    quantity: reward.quantity,
                    price,
                  };
                }
                return { itemName: reward.itemName, quantity: reward.quantity, price: null };
              }
              // 귀속 골드: 골드와 1:1 동일한 가치
              if (reward.itemName === '귀속 골드') {
                return { itemName: reward.itemName, quantity: reward.quantity, price: 1 };
              }
              // 1레벨 보석 처리
              if (reward.itemName === '1레벨 보석 (3T)' || reward.itemName === '1레벨 보석 (4T)') {
                const gemType = reward.itemName.includes('4T') ? '4T' : '3T';
                const price = calculateGemPrice(gemType as '3T' | '4T', marketData);
                return { itemName: reward.itemName, quantity: reward.quantity, price };
              }
              // 젬 아이템 처리
              if (reward.itemName === '영웅 젬' || reward.itemName === '희귀 젬' || reward.itemName === '고급 젬') {
                const grade = reward.itemName.replace(' 젬', '') as '영웅' | '희귀' | '고급';
                const price = calculateGemPriceByGrade(grade, marketData);
                return { itemName: reward.itemName, quantity: reward.quantity, price };
              }
              const price = findItemPrice(reward.itemName, marketData);
              return { itemName: reward.itemName, quantity: reward.quantity, price };
            })
          );
          return { ...stage, rewards: processedRewards };
        })
      );
    }

    enrichedData[contentType] = contentData;
  }

  const result: EnrichedContentRewardsResult = { 
    data: enrichedData, 
    rates, 
    eponaCubeStageTotals, 
    eponaCubeRewardsMap 
  };
  
  // 결과 캐싱
  cachedContentRewards = { result, timestamp: Date.now() };
  
  return result;
}

export type KurzanStageSummary = {
  level: string;
  stage: string;
  totalGold: number;
  breakthroughValue: number;
  fragmentValue: number;
  cardExpValue: number;
};

export async function getKurzanStageSummaries(): Promise<KurzanStageSummary[]> {
  const { data } = await getContentRewardsData(undefined); // 순환 참조 방지를 위해 undefined 전달
  const kurzanData = data['쿠르잔 전선'];
  if (!kurzanData) return [];

  const summaries: KurzanStageSummary[] = [];
  for (const [level, stages] of Object.entries(kurzanData)) {
    stages.forEach((stage) => {
      let breakthroughValue = 0;
      let fragmentValue = 0;
      let cardExpValue = 0;
      const total = stage.rewards.reduce((sum, reward) => {
        // 에브니 큐브 입장권의 경우 cubeStageRewards의 개별 보상 가치를 합산
        if (reward.cubeStageRewards && reward.cubeStageRewards.length > 0) {
          const rewardQuantity = reward.quantity || 0;
          const cubeTotal = reward.cubeStageRewards.reduce((cubeSum, cubeReward) => {
            const cubeValue = (cubeReward.price || 0) * (cubeReward.quantity || 0);
            // 에브니 큐브 입장권 수량(0.1)을 곱해서 실제 가치 반영
            if (cubeReward.itemName === '운명의 돌파석') {
              breakthroughValue += cubeValue * rewardQuantity;
            } else if (cubeReward.itemName === '운명의 파편' || cubeReward.itemName === '명예의 파편') {
              fragmentValue += cubeValue * rewardQuantity;
            } else if (cubeReward.itemName === '카드 경험치') {
              cardExpValue += cubeValue * rewardQuantity;
            }
            return cubeSum + cubeValue;
          }, 0);
          return sum + cubeTotal * rewardQuantity;
        }
        
        // 일반 보상의 경우
        const value = (reward.price || 0) * (reward.quantity || 0);
        if (reward.itemName === '운명의 돌파석') {
          breakthroughValue += value;
        } else if (reward.itemName === '운명의 파편' || reward.itemName === '명예의 파편') {
          fragmentValue += value;
        } else if (reward.itemName === '카드 경험치') {
          cardExpValue += value;
        }
        return sum + value;
      }, 0);
      summaries.push({
        level,
        stage: stage.stage,
        totalGold: total,
        breakthroughValue,
        fragmentValue,
        cardExpValue,
      });
    });
  }

  summaries.sort((a, b) => Number(a.level) - Number(b.level));
  return summaries;
}

