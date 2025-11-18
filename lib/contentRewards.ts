'use server';

import { readFile } from 'fs/promises';
import path from 'path';
import { getMarketCache } from './marketCache';

const REWARDS_FILE = path.join(process.cwd(), 'data', 'content-rewards.json');
const CSV_REWARDS_FILE = path.join(process.cwd(), 'data', 'csv-rewards.json');
const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  cubeStageRewards?: RewardItem[];
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

async function getMarketData(): Promise<any> {
  const cached = await getMarketCache();
  return cached?.data ?? null;
}

async function getLatestRates(): Promise<Rates> {
  const data = await readJson<{ exchangeRates?: { date: string; exchange: number; discord?: number }[] }>(RATES_FILE);
  const list = data?.exchangeRates || [];
  if (list.length === 0) return { exchange: null, discord: null };
  const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
  return { exchange: latest?.exchange ?? null, discord: latest?.discord ?? null };
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

async function calculateCardExpPrice(marketData: any, rates: Rates): Promise<number | null> {
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
  const gemNames = [
    '질서의 젬 : 불변',
    '질서의 젬 : 견고',
    '질서의 젬 : 안정',
    '혼돈의 젬 : 침식',
    '혼돈의 젬 : 왜곡',
    '혼돈의 젬 : 붕괴',
  ];
  const prices: number[] = [];
  for (const gemName of gemNames) {
    const gem = allItems.find((item) => (item.displayName || item.Name || '').trim() === gemName && item.Grade === gemGrade);
    if (gem) {
      const price = gem.CurrentMinPrice || gem.RecentPrice;
      if (price && price > 0) prices.push(price);
    }
  }
  if (prices.length === 0) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

async function processCubeStages(
  csvRewards: any,
  marketData: any,
  rates: Rates
): Promise<{ totals: Record<string, number>; rewardsMap: Record<string, RewardItem[]> }> {
  const totals: Record<string, number> = {};
  const rewardsMap: Record<string, RewardItem[]> = {};

  const tiers = ['티어3', '티어4'];
  for (const tier of tiers) {
    const stages = csvRewards['에브니 큐브']?.[tier];
    if (!stages) continue;
    for (const stage of stages) {
      const processedRewards = await Promise.all(
        stage.rewards.map(async (reward: RewardItem) => {
          let finalName = reward.itemName;
          if (finalName === '1레벨 보석 (3T)' || finalName === '1레벨 보석 (4T)') {
            const gemType = finalName.includes('4T') ? '4T' : '3T';
            const price = calculateGemPrice(gemType, marketData);
            return { itemName: finalName, quantity: reward.quantity, price };
          }
          if (finalName === '카드 경험치') {
            const price = await calculateCardExpPrice(marketData, rates);
            return { itemName: finalName, quantity: reward.quantity, price };
          }
          if (finalName === '실링') {
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
      // eponaCubeMapping의 역매핑을 사용하여 큐브 타입으로도 저장
      const cubeType = Object.entries(eponaCubeMapping).find(([stageName]) => stageName === stage.stage)?.[1];
      if (cubeType) {
        rewardsMap[cubeType] = processedRewards;
      }
    }
  }

  return { totals, rewardsMap };
}

async function processRewardForKurzan(
  reward: RewardItem,
  stage: Stage,
  marketData: any,
  csvRewards: any,
  cubeTotals: Record<string, number>,
  cubeRewardsMap: Record<string, RewardItem[]>,
  rates: Rates
): Promise<RewardItem> {
  let finalItemName = reward.itemName;

  if (chaosDungeonStages.includes(stage.stage) && reward.itemName === '1레벨 보석 (4T)') {
    finalItemName = '1레벨 보석 (3T)';
  }

  if (reward.itemName === '에브니 큐브' || reward.itemName.startsWith('에브니 큐브')) {
    const cubeType = eponaCubeMapping[stage.stage];
    finalItemName = cubeType ? `에브니 큐브 입장권 (${cubeType})` : '에브니 큐브 입장권';
    let cubePrice: number | null = null;
    // 스테이지 이름 또는 큐브 타입으로 보상 목록 찾기
    const cubeStageRewards = cubeRewardsMap[stage.stage] || (cubeType ? cubeRewardsMap[cubeType] : null) || null;

    if (cubeType) {
      const stageKeyTier4 = `티어4_${cubeType}`;
      const stageKeyTier3 = `티어3_${cubeType}`;
      cubePrice = cubeTotals[stageKeyTier4] ?? cubeTotals[stageKeyTier3] ?? null;
    }

    return {
      itemName: finalItemName,
      quantity: 0.1,
      price: cubePrice,
      cubeStageRewards: cubeStageRewards || undefined,
    };
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
    const price = await calculateCardExpPrice(marketData, rates);
    return { itemName: finalItemName, quantity: reward.quantity, price };
  }

  const price = findItemPrice(finalItemName, marketData);
  return { itemName: finalItemName, quantity: reward.quantity, price };
}

export type EnrichedContentRewardsResult = {
  data: ContentRewards;
  rates: Rates;
};

// 결과 캐싱 (6시간)
let cachedContentRewards: { result: EnrichedContentRewardsResult; timestamp: number } | null = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6시간

export async function getContentRewardsData(): Promise<EnrichedContentRewardsResult> {
  // 캐시가 유효하면 반환
  if (cachedContentRewards && Date.now() - cachedContentRewards.timestamp < CACHE_DURATION) {
    return cachedContentRewards.result;
  }
  
  const contentRewards = await getContentRewards();
  const csvRewards = await getCSVRewards();
  const marketData = await getMarketData();
  const rates = await getLatestRates();

  const enrichedData: ContentRewards = {};
  let chaosDungeonData: ContentData = {};
  let kurzanData: ContentData = {};

  const { totals: eponaCubeStageTotals, rewardsMap: eponaCubeRewardsMap } = await processCubeStages(csvRewards, marketData, rates);

  const eponaCubeData: ContentData = {};
  if (csvRewards['에브니 큐브']) {
    for (const tier of Object.keys(csvRewards['에브니 큐브'])) {
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
                const price = await calculateCardExpPrice(marketData, rates);
                return { itemName: finalItemName, quantity: reward.quantity, price };
              }
              if (finalItemName === '실링') {
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
    if (contentType === '에브니 큐브') continue;

    if (contentType === '카던&전선') {
      for (const [level, stages] of Object.entries(levels)) {
        const chaosStages: Stage[] = [];
        const kurzanStages: Stage[] = [];

        for (const stage of stages) {
          const processedRewards = await Promise.all(
            stage.rewards.map((reward) =>
              processRewardForKurzan(reward, stage, marketData, csvRewards, eponaCubeStageTotals, eponaCubeRewardsMap, rates)
            )
          );

          const processedStage = { ...stage, rewards: processedRewards };
          if (chaosDungeonStages.includes(stage.stage)) {
            chaosStages.push(processedStage);
          } else {
            kurzanStages.push(processedStage);
          }
        }

        if (chaosStages.length > 0) {
          chaosDungeonData[level] = chaosStages;
        }
        if (kurzanStages.length > 0) {
          kurzanData[level] = kurzanStages;
        }
      }

      if (Object.keys(chaosDungeonData).length > 0) {
        enrichedData['카오스 던전'] = chaosDungeonData;
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
                const price = await calculateCardExpPrice(marketData, rates);
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

  const result = { data: enrichedData, rates };
  
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
  const { data } = await getContentRewardsData();
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

