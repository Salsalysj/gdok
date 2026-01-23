import { promises as fs } from 'fs';
import path from 'path';
import { getMarketCache } from './marketCache';
import { getContentRewardsData } from './contentRewards';

const P_LISTS_FILE = path.join(process.cwd(), 'p_lists.csv');
const P_LIST_FILE_ALT = path.join(process.cwd(), 'p_list.csv');
const ETC_LIST_FILE = path.join(process.cwd(), 'etc_list.csv');
const RATES_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');
const CSV_REWARDS_FILE = path.join(process.cwd(), 'data', 'csv-rewards.json');
const VALUE_DB_EXPLANATION_FILE = path.join(process.cwd(), 'value-db-explanation.csv');

type EtcListItem = {
  crystal: number | null;
  gold: number | null;
  cash: number | null;
};

export type ValueDbEntry = {
  itemName: string;
  unitType: '크리스탈' | '골드' | '현금' | null;
  unitValue: number | null;
  note?: string;
};

type Stage = {
  stage: string;
  rewards: { itemName: string; quantity: number; price?: number | null; category?: string }[];
};

async function getItemList(): Promise<string[]> {
  let items: string[] = [];
  try {
    const content = await fs.readFile(P_LISTS_FILE, 'utf-8');
    items = items.concat(content.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch {}
  try {
    const contentAlt = await fs.readFile(P_LIST_FILE_ALT, 'utf-8');
    items = items.concat(contentAlt.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch {}
  
  // 에브니 큐브 입장권 이름 정규화: 공백을 표준화
  const normalizedItems = items.map(item => {
    // "에브니 큐브 입장권(XXX)" 형식을 "에브니 큐브 입장권 (XXX)" 형식으로 정규화
    return item.replace(/에브니 큐브 입장권\s*\(/g, '에브니 큐브 입장권 (');
  });
  
  return Array.from(new Set(normalizedItems.filter(Boolean)));
}

async function getEtcListData(): Promise<Map<string, EtcListItem>> {
  try {
    const content = await fs.readFile(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const itemMap = new Map<string, EtcListItem>();
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map((col) => col.trim());
      if (columns.length < 4) continue;
      const itemName = columns[0];
      const crystal = columns[1] === '' ? null : parseFloat(columns[1]);
      const gold = columns[2] === '' ? null : parseFloat(columns[2]);
      const cash = columns[3] === '' ? null : parseFloat(columns[3]);
      itemMap.set(itemName, { crystal, gold, cash });
    }
    return itemMap;
  } catch {
    return new Map();
  }
}

async function getLatestCrystalGoldRate(): Promise<number | null> {
  try {
    // 먼저 Supabase에서 최신 환율 가져오기 시도
    const { supabase } = await import('../app/utils/supabase');
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
    const data = await fs.readFile(RATES_FILE, 'utf-8');
    const json = JSON.parse(data);
    const rates = json.exchangeRates || [];
    if (rates.length === 0) return null;
    return rates[rates.length - 1].exchange || null;
  } catch {
    return null;
  }
}

type MarketItem = { displayName?: string; Name?: string; CurrentMinPrice?: number; RecentPrice?: number; Grade?: string; BundleCount?: number };
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
        const bundlePrice = (it as any).CurrentMinPrice || (it as any).RecentPrice || 0;
        if (!name || bundlePrice <= 0) continue;
        
        // 운명의 파괴석, 운명의 수호석, 운명의 파괴석 결정, 운명의 수호석 결정은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정') {
          unitPrice = bundleCount > 0 ? bundlePrice / bundleCount : bundlePrice;
        } else {
          unitPrice = bundlePrice;
        }
        
        if (!(name in map) || unitPrice < map[name]) map[name] = unitPrice;
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
  } catch {
    return null;
  }
}

async function getCubeStageTotals(
  etcListData: Map<string, EtcListItem>,
  marketPriceMap: Record<string, number>
): Promise<{ totals: Record<string, number>; rewards: Record<string, { itemName: string; quantity: number }[]> }> {
  const cubeStageTotals: Record<string, number> = {};
  const cubeStageRewards: Record<string, { itemName: string; quantity: number }[]> = {};
  try {
    const csvRaw = await fs.readFile(CSV_REWARDS_FILE, 'utf-8');
    const csvJson = JSON.parse(csvRaw);
    const cube = csvJson['에브니 큐브'] || {};
    for (const tier of Object.keys(cube)) {
      for (const stage of cube[tier] as any[]) {
        const stageName: string = stage.stage || stage.name || '';
        const rewards: { itemName: string; quantity: number }[] = stage.rewards || [];
        cubeStageRewards[stageName] = rewards; // 원본 보상 데이터 저장
        let sum = 0;
        for (const r of rewards) {
          const name = r.itemName as string;
          const qty = Number(r.quantity) || 0;
          let unit = 0;
          const etc = etcListData.get(name);
          if (etc && etc.gold != null) unit = etc.gold;
          else if (marketPriceMap[name] != null) unit = marketPriceMap[name];
          if (unit > 0 && qty > 0) sum += unit * qty;
        }
        if (sum > 0) cubeStageTotals[stageName] = sum;
      }
    }
  } catch {}
  return { totals: cubeStageTotals, rewards: cubeStageRewards };
}

function sumCategory(rewards: any[]) {
  return rewards.reduce((sum, reward) => sum + ((reward.price || 0) * (reward.quantity || 0)), 0);
}

function computeStageExpectedValue(stage: Stage, isNarak: boolean = false): number | null {
  if (!stage || !stage.rewards || stage.rewards.length === 0) return null;
  const grouped: Record<string, any[]> = {};
  stage.rewards.forEach((reward) => {
    const category = reward.category || '기본';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(reward);
  });
  const categories = Object.keys(grouped);
  if (categories.length === 0) return null;
  
  if (isNarak) {
    // 나락: 기본 보상 없음, 모든 카테고리 중 3개를 랜덤 추출 후 최고가 선택
    if (categories.length >= 3) {
      // 모든 3개 조합 생성
      const combinations: string[][] = [];
      for (let i = 0; i < categories.length; i++) {
        for (let j = i + 1; j < categories.length; j++) {
          for (let k = j + 1; k < categories.length; k++) {
            combinations.push([categories[i], categories[j], categories[k]]);
          }
        }
      }
      // 각 조합의 최고값 계산
      const maxValues = combinations.map((combo) => {
        const comboTotals = combo.map((cat) => sumCategory(grouped[cat] || []));
        return Math.max(...comboTotals);
      });
      // 기대값 = 모든 최고값의 평균
      return maxValues.reduce((sum, val) => sum + val, 0) / (maxValues.length || 1);
    } else if (categories.length > 0) {
      // 카테고리가 3개 미만이면 모든 카테고리의 최고값
      const categoryValues = categories.map((cat) => sumCategory(grouped[cat] || []));
      return Math.max(...categoryValues);
    }
    return null;
  } else {
    // 지옥: 기본 보상 + 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
    const baseCategory =
      categories.find((cat) => cat.includes('기본')) ||
      categories.find((cat) => cat.includes('보상 상자')) ||
      categories[0];
    const otherCategories = categories.filter((cat) => cat !== baseCategory);
    
    // 기본 보상 가치 계산 (풍요 시 10배 기대값 고려: 100% + 90% = 190%)
    const baseValue = sumCategory(grouped[baseCategory] || []);
    const baseRewardValue = baseValue * 1.9; // 기본 보상 상자는 190% 반영 (100% 기본 + 90% 풍요 기대값)
    
    if (otherCategories.length === 0) return baseRewardValue;

    if (otherCategories.length >= 3) {
      const combinations: string[][] = [];
      for (let i = 0; i < otherCategories.length; i++) {
        for (let j = i + 1; j < otherCategories.length; j++) {
          for (let k = j + 1; k < otherCategories.length; k++) {
            combinations.push([otherCategories[i], otherCategories[j], otherCategories[k]]);
          }
        }
      }
      const maxValues = combinations.map((combo) => {
        const comboTotals = combo.map((cat) => sumCategory(grouped[cat] || []));
        return Math.max(...comboTotals);
      });
      const expectedSelection =
        maxValues.reduce((sum, val) => sum + val, 0) / (maxValues.length || 1);
      return baseRewardValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseRewardValue + maxOther;
    }
  }
}

function calculateGemPriceByGrade(
  gemGrade: '영웅' | '희귀' | '고급',
  marketData: any
): number | null {
  if (!marketData) return null;
  const gemNames = [
    '질서의 젬 : 불변',
    '질서의 젬 : 견고',
    '질서의 젬 : 안정',
    '혼돈의 젬 : 침식',
    '혼돈의 젬 : 왜곡',
    '혼돈의 젬 : 붕괴',
  ];
  const allItems = [
    ...(marketData.tier4Results || []),
    ...(marketData.tier3Results || []),
    ...(marketData.gemResults || []),
    ...(marketData.otherResults || []),
    ...(marketData.relicEngravingResults || []),
  ];
  const prices: number[] = [];
  for (const gemName of gemNames) {
    const gem = allItems.find((item: MarketItem) => {
      const name = (item.displayName || item.Name || '').trim();
      const grade = item.Grade || '';
      return name === gemName && grade === gemGrade;
    });
    if (gem) {
      const price = gem.CurrentMinPrice || gem.RecentPrice;
      if (price && price > 0) prices.push(price);
    }
  }
  if (prices.length === 0) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function calculateRelicEngravingAverage(marketData: any): number | null {
  const relics = marketData?.relicEngravingResults || [];
  const prices = relics
    .map((item: any) => item.CurrentMinPrice || item.RecentPrice || 0)
    .filter((value: number) => value > 0);
  if (prices.length === 0) return null;
  return prices.reduce((sum: number, value: number) => sum + value, 0) / prices.length;
}

// 1레벨 보석 가격 계산 (에브니 큐브와 동일한 방식)
function calculateGemPrice(gemType: '3T' | '4T', marketPriceMap: Record<string, number>): number | null {
  const fearGem = marketPriceMap['5레벨 겁화의 보석'];
  const fireGem = marketPriceMap['5레벨 작열의 보석'];
  if (!fearGem || !fireGem) return null;
  if (gemType === '4T') {
    return (fearGem + fireGem) / 162;
  }
  const tier4Unit = (fearGem + fireGem) / 162;
  return tier4Unit / 9;
}

// 8레벨 보석 (4T) 가격 계산
function calculateLevel8GemPrice(marketPriceMap: Record<string, number>): number | null {
  const fearGem = marketPriceMap['8레벨 겁화의 보석'];
  const fireGem = marketPriceMap['8레벨 작열의 보석'];
  if (!fearGem || !fireGem) return null;
  return (fearGem + fireGem) / 2;
}

function buildStageValueOverrides(hell1Stages: Stage[], hell2Stages: Stage[], hell3Stages: Stage[], narak1Stages: Stage[], narak2Stages: Stage[], narak3Stages: Stage[]) {
  const findStageValue = (stages: Stage[], stageName: string, isNarak: boolean = false) => {
    const stage = stages?.find((s) => s.stage === stageName);
    return stage ? computeStageExpectedValue(stage, isNarak) : null;
  };

  return {
    '전설 지옥 열쇠 I': findStageValue(hell1Stages, '7단계', false),
    '전설 지옥 열쇠 II': findStageValue(hell2Stages, '7단계', false),
    '전설 지옥 열쇠 III': findStageValue(hell3Stages, '7단계', false),
    '영웅 지옥 열쇠 I': findStageValue(hell1Stages, '6단계', false),
    '영웅 지옥 열쇠 II': findStageValue(hell2Stages, '6단계', false),
    '영웅 지옥 열쇠 III': findStageValue(hell3Stages, '6단계', false),
    '희귀 지옥 열쇠 I': findStageValue(hell1Stages, '5단계', false),
    '희귀 지옥 열쇠 II': findStageValue(hell2Stages, '5단계', false),
    '희귀 지옥 열쇠 III': findStageValue(hell3Stages, '5단계', false),
    '전설 나락의 화염 열쇠 I': findStageValue(narak1Stages, '2단계', true),
    '전설 나락의 화염 열쇠 II': findStageValue(narak2Stages, '2단계', true),
    '전설 나락의 화염 열쇠 III': findStageValue(narak3Stages, '2단계', true),
    '전설 나락의 서리 열쇠 I': findStageValue(narak1Stages, '2단계', true),
    '전설 나락의 서리 열쇠 II': findStageValue(narak2Stages, '2단계', true),
    '전설 나락의 서리 열쇠 III': findStageValue(narak3Stages, '2단계', true),
  } as Record<string, number | null>;
}

function buildKurzanStageTotals(kurzanData: Record<string, Stage[] | undefined>) {
  const totals: Record<string, number | null> = {};
  const rewards: Record<string, { itemName: string; quantity: number; price?: number | null }[]> = {};
  Object.entries(kurzanData || {}).forEach(([level, stages]) => {
    if (!stages) return;
    stages.forEach((stage) => {
      const key = `${level} ${stage.stage}`;
      const stageRewards = stage.rewards || [];
      rewards[key] = stageRewards; // 원본 보상 데이터 저장
      const total = stageRewards.reduce(
        (sum: number, reward) => sum + ((reward.price || 0) * (reward.quantity || 0)),
        0
      );
      totals[key] = total ?? null;
    });
  });
  return { totals, rewards };
}

async function calculateAbilityStoneKitPrice(crystalGoldRate: number | null): Promise<number | null> {
  if (!crystalGoldRate || crystalGoldRate <= 0) return null;
  // 가치 (골드) = 8.5 * 9 크리스탈 * (크리->골드 환전) + 100골드
  // 크리->골드 환전율: crystalGoldRate는 100크리당 골드이므로 1크리당은 crystalGoldRate / 100
  const crystalAmount = 8.5 * 9; // 76.5크리스탈
  const crystalToGoldRate = crystalGoldRate / 100; // 1크리당 골드
  const peonGoldValue = crystalAmount * crystalToGoldRate;
  // 총 가격 = 페온 골드 가치 + 100골드
  return peonGoldValue + 100;
}

function calculateRelicEngravingSelectionPrice(marketData: any): number | null {
  if (!marketData) return null;
  const relics = marketData.relicEngravingResults || [];
  if (relics.length === 0) return null;
  const prices = relics
    .map((item: any) => item.CurrentMinPrice || item.RecentPrice || 0)
    .filter((value: number) => value > 0);
  if (prices.length === 0) return null;
  return Math.max(...prices);
}

async function buildManualOverrides(
  stageValueOverrides: Record<string, number | null>,
  kurzanStageTotals: Record<string, number | null>,
  crystalGoldRate: number | null,
  marketData: any,
  etcListDataObj: Record<string, EtcListItem>,
  marketPriceMap: Record<string, number>
): Promise<Record<string, ValueDbEntry>> {
  const base: Record<string, ValueDbEntry> = {
    '정련된 혼돈의 돌(무기)': { itemName: '정련된 혼돈의 돌(무기)', unitType: '골드', unitValue: 800 },
    '정련된 혼돈의 돌(방어구)': { itemName: '정련된 혼돈의 돌(방어구)', unitType: '골드', unitValue: 300 },
    '전설 카드팩 (확률)': { itemName: '전설 카드팩 (확률)', unitType: '크리스탈', unitValue: 500 },
    '고결한 혼돈의 돌(무기) (품질 90기준)': { itemName: '고결한 혼돈의 돌(무기) (품질 90기준)', unitType: '골드', unitValue: 117647 },
    '고결한 혼돈의 돌(무기) (품질 95기준)': { itemName: '고결한 혼돈의 돌(무기) (품질 95기준)', unitType: '골드', unitValue: 266667 },
    '고결한 혼돈의 돌(방어구) (품질 90기준)': { itemName: '고결한 혼돈의 돌(방어구) (품질 90기준)', unitType: '골드', unitValue: 44118 },
    '고결한 혼돈의 돌(방어구) (품질 95기준)': { itemName: '고결한 혼돈의 돌(방어구) (품질 95기준)', unitType: '골드', unitValue: 100000 },
  };

  // 크리스탈: 골드 환율을 사용하여 골드 단위로 변환
  // crystalGoldRate는 100크리스탈당 골드이므로, 1크리스탈당 골드는 crystalGoldRate / 100
  if (crystalGoldRate != null && crystalGoldRate > 0) {
    base['크리스탈'] = {
      itemName: '크리스탈',
      unitType: '골드',
      unitValue: crystalGoldRate / 100,
      note: '100크리당 골드 환율 기준',
    };
  } else {
    base['크리스탈'] = {
      itemName: '크리스탈',
      unitType: '골드',
      unitValue: null,
      note: '크리스탈 골드 환율 정보 없음',
    };
  }

  const stageNotes: Record<string, string> = {
    '전설 지옥 열쇠 I': '지옥1 7단계 기대값',
    '전설 지옥 열쇠 II': '지옥2 7단계 기대값',
    '전설 지옥 열쇠 III': '지옥3 7단계 기대값',
    '영웅 지옥 열쇠 I': '지옥1 6단계 기대값',
    '영웅 지옥 열쇠 II': '지옥2 6단계 기대값',
    '영웅 지옥 열쇠 III': '지옥3 6단계 기대값',
    '희귀 지옥 열쇠 I': '지옥1 5단계 기대값',
    '희귀 지옥 열쇠 II': '지옥2 5단계 기대값',
    '희귀 지옥 열쇠 III': '지옥3 5단계 기대값',
    '전설 나락의 화염 열쇠 I': '나락1 2단계 기대값',
    '전설 나락의 화염 열쇠 II': '나락2 2단계 기대값',
    '전설 나락의 화염 열쇠 III': '나락3 2단계 기대값',
    '전설 나락의 서리 열쇠 I': '나락1 2단계 기대값',
    '전설 나락의 서리 열쇠 II': '나락2 2단계 기대값',
    '전설 나락의 서리 열쇠 III': '나락3 2단계 기대값',
  };

  Object.entries(stageValueOverrides).forEach(([name, value]) => {
    base[name] = {
      itemName: name,
      unitType: '골드',
      unitValue: value ?? null,
      note: stageNotes[name],
    };
  });

  Object.entries(kurzanStageTotals).forEach(([stageName, value]) => {
    if (value == null) return;
    if (stageName.includes('1730') && stageName.includes('심연의 역류 I')) {
      base['공명의 기운 회복 비약'] = {
        itemName: '공명의 기운 회복 비약',
        unitType: '골드',
        unitValue: value,
        note: stageName,
      };
      base['휴식 게이지 회복 비약'] = {
        itemName: '휴식 게이지 회복 비약',
        unitType: '골드',
        unitValue: value,
        note: stageName,
      };
    }
  });

  // 지옥 탭 계산 로직과 동일한 항목들 추가
  // 어빌리티 스톤 키트 (지옥)
  if (crystalGoldRate) {
    const abilityStoneKitPrice = await calculateAbilityStoneKitPrice(crystalGoldRate);
    if (abilityStoneKitPrice != null) {
      base['어빌리티 스톤 키트 (지옥)'] = {
        itemName: '어빌리티 스톤 키트 (지옥)',
        unitType: '골드',
        unitValue: abilityStoneKitPrice,
        note: '페온 9개(8.5크리스탈/개) + 100골드',
      };
    }
  }

  // 순환 돌파석 (market_cache에서 가져오기)
  const marketCache = await getMarketCache();
  const circularBreakthroughPrice = marketCache?.data?.circularBreakthroughValue || null;
  if (circularBreakthroughPrice != null && circularBreakthroughPrice > 0) {
    base['순환 돌파석'] = {
      itemName: '순환 돌파석',
      unitType: '골드',
      unitValue: circularBreakthroughPrice,
      note: '재련 효율 상위 5개 평균',
    };
  }

  // 전이 돌파석 (market_cache에서 가져오기)
  const transitionBreakthroughPrice = marketCache?.data?.transitionBreakthroughValue || null;
  if (transitionBreakthroughPrice != null && transitionBreakthroughPrice > 0) {
    base['전이 돌파석'] = {
      itemName: '전이 돌파석',
      unitType: '골드',
      unitValue: transitionBreakthroughPrice,
      note: '재련 효율 상위 5개 평균',
    };
  }

  // 고대 팔찌 (지옥)
  base['고대 팔찌 (지옥)'] = {
    itemName: '고대 팔찌 (지옥)',
    unitType: '골드',
    unitValue: 1500,
  };

  // 유물 각인서 선택 (resolveEntry에서도 처리하지만 명시적으로 추가)
  const relicSelectionPrice = calculateRelicEngravingSelectionPrice(marketData);
  if (relicSelectionPrice != null) {
    base['유물 각인서 선택'] = {
      itemName: '유물 각인서 선택',
      unitType: '골드',
      unitValue: relicSelectionPrice,
      note: '43종 중 최고가',
    };
  }

  // 정련된 운명의 돌
  base['정련된 운명의 돌'] = {
    itemName: '정련된 운명의 돌',
    unitType: '골드',
    unitValue: 1000,
  };

  // 전설 카드 선택팩 (단위: 골드, 가치 입력 가능)
  // etc_list.csv에서 골드 값이 있으면 사용, 없으면 null로 설정하여 나중에 입력 가능하도록
  const legendaryCardSelection = etcListDataObj['전설 카드 선택팩'];
  base['전설 카드 선택팩'] = {
    itemName: '전설 카드 선택팩',
    unitType: '골드',
    unitValue: legendaryCardSelection?.gold ?? null,
  };

  // 카드경험치 1당 계산 (메넬리크의 서 현금 가격 / 9000을 먼저 계산한 뒤 현금->골드 환율 적용)
  const menelik = etcListDataObj['메넬리크의 서'];
  let cardExpPerUnit: number | null = null;
  let cardExpUnitType: '크리스탈' | '골드' | '현금' | null = null;
  
  if (menelik) {
    // 현금 가격이 있으면 먼저 현금 단위로 계산 (메넬리크의 서 현금 가격 / 9000)
    if (menelik.cash != null && menelik.cash > 0) {
      const cardExpPerUnitCash = menelik.cash / 9000;
      
      // 현금->골드 환율 적용
      if (crystalGoldRate) {
        const cashToGoldRate = crystalGoldRate / 2750; // exchange / 2750
        cardExpPerUnit = cardExpPerUnitCash * cashToGoldRate;
        cardExpUnitType = '골드';
      } else {
        // 환율이 없으면 현금 단위로 표시
        cardExpPerUnit = cardExpPerUnitCash;
        cardExpUnitType = '현금';
      }
    }
    // 골드 가격이 있으면 그대로 사용
    else if (menelik.gold != null && menelik.gold > 0) {
      cardExpPerUnit = menelik.gold / 9000;
      cardExpUnitType = '골드';
    }
  }
  
  // etc_list에 없으면 marketPriceMap에서 찾기 (골드 단위)
  if (cardExpPerUnit == null) {
    const menelikPrice = marketPriceMap['메넬리크의 서'];
    if (menelikPrice != null && menelikPrice > 0) {
      cardExpPerUnit = menelikPrice / 9000;
      cardExpUnitType = '골드';
    }
  }
  
  // cardExpPerUnit이 null이어도 항목은 추가 (나중에 resolveEntry에서 처리 가능하도록)
  base['카드경험치 1당'] = {
    itemName: '카드경험치 1당',
    unitType: cardExpUnitType,
    unitValue: cardExpPerUnit,
    note: cardExpPerUnit != null 
      ? (cardExpUnitType === '현금' 
          ? '메넬리크의 서 현금 가격 / 9000 (환율 정보 없음)'
          : '메넬리크의 서 현금 가격 / 9000 → 골드 환산')
      : '메넬리크의 서 정보 없음',
  };

  return base;
}

function resolveEntry(
  itemName: string,
  manualOverrides: Record<string, ValueDbEntry>,
  etcListDataObj: Record<string, EtcListItem>,
  marketPriceMap: Record<string, number>,
  marketData: any,
  cubeStageTotals: Record<string, number>,
  crystalGoldRate: number | null
): ValueDbEntry {
  if (manualOverrides[itemName]) {
    return manualOverrides[itemName];
  }

  // 순환 돌파석 명시적 처리 (unitType이 항상 '골드'로 설정되도록)
  if (itemName === '순환 돌파석') {
    // manualOverrides에 있으면 그것을 사용 (이미 unitType: '골드'로 설정됨)
    if (manualOverrides[itemName]) {
      return manualOverrides[itemName];
    }
    // manualOverrides에 없으면 기본값 반환 (unitType은 '골드'로 설정)
    return {
      itemName: '순환 돌파석',
      unitType: '골드',
      unitValue: null,
      note: '재련 효율 상위 5개 평균',
    };
  }

  // 전이 돌파석 명시적 처리 (unitType이 항상 '골드'로 설정되도록)
  if (itemName === '전이 돌파석') {
    // manualOverrides에 있으면 그것을 사용 (이미 unitType: '골드'로 설정됨)
    if (manualOverrides[itemName]) {
      return manualOverrides[itemName];
    }
    // manualOverrides에 없으면 기본값 반환 (unitType은 '골드'로 설정)
    return {
      itemName: '전이 돌파석',
      unitType: '골드',
      unitValue: null,
      note: '재련 효율 상위 5개 평균',
    };
  }

  // 어빌리티 스톤 키트 (지옥) 명시적 처리
  if (itemName === '어빌리티 스톤 키트 (지옥)') {
    if (crystalGoldRate) {
      const crystalAmount = 8.5 * 9; // 76.5크리스탈
      const crystalToGoldRate = crystalGoldRate / 100; // 1크리당 골드
      const peonGoldValue = crystalAmount * crystalToGoldRate;
      const totalValue = peonGoldValue + 100;
      return {
        itemName: '어빌리티 스톤 키트 (지옥)',
        unitType: '골드',
        unitValue: totalValue,
        note: '페온 9개(8.5크리스탈/개) + 100골드',
      };
    }
    // crystalGoldRate가 없으면 기본값 반환
    return {
      itemName: '어빌리티 스톤 키트 (지옥)',
      unitType: '골드',
      unitValue: null,
      note: '크리스탈 환율 정보 없음',
    };
  }

  // 질서의 젬 / 혼돈의 젬 등급별 처리
  const gemGradeMatch = itemName.match(/^(질서의 젬 : (?:불변|견고|안정)|혼돈의 젬 : (?:침식|왜곡|붕괴))\s*\(([^)]+)\)$/);
  if (gemGradeMatch) {
    const baseGemName = gemGradeMatch[1];
    const grade = gemGradeMatch[2];
    
    if (grade === '고급' || grade === '희귀' || grade === '영웅') {
      const allItems = [
        ...(marketData?.tier4Results || []),
        ...(marketData?.tier3Results || []),
        ...(marketData?.gemResults || []),
        ...(marketData?.otherResults || []),
        ...(marketData?.relicEngravingResults || []),
      ];
      
      const gem = allItems.find((item: MarketItem) => {
        const name = (item.displayName || item.Name || '').trim();
        const itemGrade = item.Grade || '';
        return name === baseGemName && itemGrade === grade;
      });
      
      if (gem) {
        const price = gem.CurrentMinPrice || gem.RecentPrice;
        if (price != null && price > 0) {
          return {
            itemName,
            unitType: '골드',
            unitValue: price,
          };
        }
      }
    }
  }

  if (itemName.startsWith('에브니 큐브 입장권')) {
    // 지옥교환 항목 처리: 전설 지옥 열쇠 ÷ 10
    const hellExchangeMatch = itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
    if (hellExchangeMatch) {
      const cubeStage = hellExchangeMatch[1]; // 1해금, 2해금, 3해금, 4해금
      let hellKeyName: string | null = null;
      
      // 해금 단계에 따라 전설 지옥 열쇠 매핑
      if (cubeStage === '1해금' || cubeStage === '2해금') {
        hellKeyName = '전설 지옥 열쇠 I';
      } else if (cubeStage === '3해금') {
        hellKeyName = '전설 지옥 열쇠 II';
      } else if (cubeStage === '4해금') {
        hellKeyName = '전설 지옥 열쇠 III';
      }
      
      if (hellKeyName) {
        const hellKeyEntry = manualOverrides[hellKeyName];
        if (hellKeyEntry && hellKeyEntry.unitValue != null && hellKeyEntry.unitValue > 0) {
          return {
            itemName,
            unitType: '골드',
            unitValue: hellKeyEntry.unitValue / 10,
            note: `${hellKeyName} ÷ 10`,
          };
        }
      }
      // 전설 지옥 열쇠 값을 찾지 못한 경우
      return { itemName, unitType: '골드', unitValue: null, note: `${hellKeyName || '전설 지옥 열쇠'} 값 없음` };
    }
    
    // 일반 에브니 큐브 입장권 처리
    const match = itemName.match(/\(([^)]+)\)/);
    const key = match ? match[1] : '';
    if (key && cubeStageTotals[key] != null) {
      return { itemName, unitType: '골드', unitValue: cubeStageTotals[key], note: key };
    }
    // cubeStageTotals에 없으면 null 반환 (etcListDataObj나 marketPriceMap에서 찾지 않음)
    return { itemName, unitType: null, unitValue: null };
  }

  if (itemName === '고급 젬') {
    const price = calculateGemPriceByGrade('고급', marketData);
    if (price != null) return { itemName, unitType: '골드', unitValue: price };
  }
  if (itemName === '희귀 젬') {
    const price = calculateGemPriceByGrade('희귀', marketData);
    if (price != null) return { itemName, unitType: '골드', unitValue: price };
  }
  if (itemName === '영웅 젬') {
    const price = calculateGemPriceByGrade('영웅', marketData);
    if (price != null) return { itemName, unitType: '골드', unitValue: price };
  }

  if (itemName === '유물 각인서 랜덤' || itemName === '유물 각인서 랜덤 주머니') {
    const avg = calculateRelicEngravingAverage(marketData);
    if (avg != null) return { itemName, unitType: '골드', unitValue: avg };
  }

  if (itemName === '유물 각인서 선택' || itemName === '유물 각인서 선택 주머니') {
    const price = calculateRelicEngravingSelectionPrice(marketData);
    if (price != null) return { itemName, unitType: '골드', unitValue: price, note: '43종 중 최고가' };
  }

  // 1레벨 보석 (4T): 에브니 큐브와 동일한 계산 방식 사용
  if (itemName === '1레벨 보석 (4T)') {
    const price = calculateGemPrice('4T', marketPriceMap);
    if (price != null) {
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: price,
        note: '5레벨 겁화의 보석 + 5레벨 작열의 보석 / 162'
      };
    }
  }

  // 8레벨 보석 (4T): 8레벨 겁화의 보석 + 8레벨 작열의 보석 / 2
  if (itemName === '8레벨 보석 (4T)') {
    const price = calculateLevel8GemPrice(marketPriceMap);
    if (price != null) {
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: price,
        note: '8레벨 겁화의 보석 + 8레벨 작열의 보석 / 2'
      };
    }
  }

  // 운명의 파편: 운명의 파편 주머니(소) 가치 / 1000
  if (itemName === '운명의 파편') {
    // 먼저 etcListDataObj에서 '운명의 파편 주머니(소)' 찾기
    const shardPouch = etcListDataObj['운명의 파편 주머니(소)'];
    if (shardPouch && shardPouch.gold != null && shardPouch.gold > 0) {
      const shardPrice = shardPouch.gold / 1000;
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: shardPrice,
        note: '운명의 파편 주머니(소) / 1000'
      };
    }
    // etcListDataObj에 없으면 marketPriceMap에서 찾기
    const shardPouchPrice = marketPriceMap['운명의 파편 주머니(소)'];
    if (shardPouchPrice != null && shardPouchPrice > 0) {
      const shardPrice = shardPouchPrice / 1000;
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: shardPrice,
        note: '운명의 파편 주머니(소) / 1000'
      };
    }
  }

  // 운명의 파편 1개당: 운명의 파편 주머니(소) 가치 / 1000
  if (itemName === '운명의 파편 1개당') {
    // 먼저 etcListDataObj에서 '운명의 파편 주머니(소)' 찾기
    const shardPouch = etcListDataObj['운명의 파편 주머니(소)'];
    if (shardPouch && shardPouch.gold != null && shardPouch.gold > 0) {
      const shardPrice = shardPouch.gold / 1000;
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: shardPrice,
        note: '운명의 파편 주머니(소) / 1000'
      };
    }
    // etcListDataObj에 없으면 marketPriceMap에서 찾기
    const shardPouchPrice = marketPriceMap['운명의 파편 주머니(소)'];
    if (shardPouchPrice != null && shardPouchPrice > 0) {
      const shardPrice = shardPouchPrice / 1000;
      return { 
        itemName, 
        unitType: '골드', 
        unitValue: shardPrice,
        note: '운명의 파편 주머니(소) / 1000'
      };
    }
  }

  // 크리스탈 항목은 manualOverrides에서 처리되므로 여기서는 건너뛰기
  if (itemName === '크리스탈') {
    // manualOverrides에서 처리되므로 여기서는 null 반환 (manualOverrides가 우선)
    return { itemName, unitType: null, unitValue: null };
  }

  const etc = etcListDataObj[itemName];
  if (etc) {
    // 크리스탈 단위인 경우 골드로 변환
    if (etc.crystal != null) {
      if (crystalGoldRate != null && crystalGoldRate > 0) {
        // crystalGoldRate는 100크리스탈당 골드이므로, etc.crystal 크리스탈을 골드로 변환
        const goldValue = (etc.crystal * crystalGoldRate) / 100;
        return { itemName, unitType: '골드', unitValue: goldValue };
      } else {
        // 환율 정보가 없으면 null 반환
        return { itemName, unitType: '골드', unitValue: null };
      }
    }
    if (etc.gold != null) return { itemName, unitType: '골드', unitValue: etc.gold };
    if (etc.cash != null) return { itemName, unitType: '현금', unitValue: etc.cash };
  }

  const market = marketPriceMap[itemName];
  if (market != null && market > 0) {
    return { itemName, unitType: '골드', unitValue: market };
  }

  // 장인의 야금술/재봉술 3단계, 4단계 계산 (API 데이터가 없을 때)
  // 2단계 가치를 찾는 헬퍼 함수
  const getStage2Price = (itemType: '야금술' | '재봉술'): number | null => {
    const stage2ItemName = `장인의 ${itemType} : 2단계`;
    // manualOverrides에서 확인
    const stage2Manual = manualOverrides[stage2ItemName];
    if (stage2Manual && stage2Manual.unitValue != null && stage2Manual.unitValue > 0) {
      return stage2Manual.unitValue;
    }
    // marketPriceMap에서 확인
    const stage2Market = marketPriceMap[stage2ItemName];
    if (stage2Market != null && stage2Market > 0) {
      return stage2Market;
    }
    // etcListDataObj에서 확인
    const stage2Etc = etcListDataObj[stage2ItemName];
    if (stage2Etc && stage2Etc.gold != null && stage2Etc.gold > 0) {
      return stage2Etc.gold;
    }
    return null;
  };

  // 3단계 가치를 찾는 헬퍼 함수
  const getStage3Price = (itemType: '야금술' | '재봉술'): number | null => {
    const stage3ItemName = `장인의 ${itemType} : 3단계`;
    // manualOverrides에서 확인
    const stage3Manual = manualOverrides[stage3ItemName];
    if (stage3Manual && stage3Manual.unitValue != null && stage3Manual.unitValue > 0) {
      return stage3Manual.unitValue;
    }
    // marketPriceMap에서 확인
    const stage3Market = marketPriceMap[stage3ItemName];
    if (stage3Market != null && stage3Market > 0) {
      return stage3Market;
    }
    // etcListDataObj에서 확인
    const stage3Etc = etcListDataObj[stage3ItemName];
    if (stage3Etc && stage3Etc.gold != null && stage3Etc.gold > 0) {
      return stage3Etc.gold;
    }
    // 2단계로부터 계산
    const stage2Price = getStage2Price(itemType);
    if (stage2Price != null && stage2Price > 0) {
      return stage2Price * 2.5;
    }
    return null;
  };

  // 야금술/재봉술 3단계/4단계는 가치 계산하지 않음
  if (itemName === '장인의 야금술 : 3단계' || itemName === '장인의 야금술 : 4단계') {
    return { itemName, unitType: null, unitValue: null };
  }

  if (itemName === '장인의 재봉술 : 3단계' || itemName === '장인의 재봉술 : 4단계') {
    return { itemName, unitType: null, unitValue: null };
  }

  return { itemName, unitType: null, unitValue: null };
}

export type ValueDbData = {
  itemList: string[];
  etcListDataObj: Record<string, EtcListItem>;
  crystalGoldRate: number | null;
  marketPriceMap: Record<string, number>;
  marketData: any;
  cubeStageTotals: Record<string, number>;
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>; // 큐브 단계별 원본 보상 데이터
  stageValueOverrides: Record<string, number | null>;
  kurzanStageTotals: Record<string, number | null>;
  kurzanStageRewards: Record<string, { itemName: string; quantity: number; price?: number | null; cubeStageRewards?: { itemName: string; quantity: number; price?: number | null }[] }[]>; // 쿠르잔 단계별 원본 보상 데이터
  entries: ValueDbEntry[];
  entryMap: Record<string, ValueDbEntry>;
  hellStages: Stage[]; // 지옥3 stages (기존 호환성 유지)
  hell1Stages: Stage[];
  hell2Stages: Stage[];
  narakStages: Stage[]; // 나락3 stages (기존 호환성 유지)
  narak1Stages: Stage[];
  narak2Stages: Stage[];
  explanationMap: Record<string, string>;
};

async function getExplanationMap(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(VALUE_DB_EXPLANATION_FILE, 'utf-8');
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      return {};
    }

    const explanationMap: Record<string, string> = {};
    
    // 헤더 스킵하고 데이터 행 처리
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // CSV 파싱: 쉼표로 분리하되, 따옴표 안의 쉼표는 무시
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());
      
      if (cols.length >= 2) {
        const itemName = cols[0].replace(/^"|"$/g, ''); // 따옴표 제거
        const explanation = cols[1].replace(/^"|"$/g, ''); // 따옴표 제거
        
        // 계산 방법이 비어있지 않은 경우만 추가
        if (explanation && explanation.trim()) {
          explanationMap[itemName] = explanation.trim();
        }
      }
    }
    
    return explanationMap;
  } catch (error) {
    console.error('Failed to load value-db-explanation.csv:', error);
    return {};
  }
}

export async function getValueDbData(): Promise<ValueDbData> {
  const itemList = await getItemList();
  const etcListMap = await getEtcListData();
  const etcListDataObj = Object.fromEntries(etcListMap);
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const marketPriceMap = await getMarketPriceMap();
  const marketData = await getMarketData();
  const { totals: cubeStageTotals, rewards: cubeStageRewards } = await getCubeStageTotals(etcListMap, marketPriceMap);
  const explanationMap = await getExplanationMap();
  const { data: contentRewards } = await getContentRewardsData(undefined); // 순환 참조 방지를 위해 undefined 전달
  const hell1Stages = (contentRewards['지옥']?.['지옥1'] as Stage[]) || [];
  const hell2Stages = (contentRewards['지옥']?.['지옥2'] as Stage[]) || [];
  const hell3Stages = (contentRewards['지옥']?.['지옥3'] as Stage[]) || [];
  const narak1Stages = (contentRewards['나락']?.['나락1'] as Stage[]) || [];
  const narak2Stages = (contentRewards['나락']?.['나락2'] as Stage[]) || [];
  const narak3Stages = (contentRewards['나락']?.['나락3'] as Stage[]) || [];
  const stageValueOverrides = buildStageValueOverrides(hell1Stages, hell2Stages, hell3Stages, narak1Stages, narak2Stages, narak3Stages);
  const kurzanStages = contentRewards['쿠르잔 전선'] || {};
  const { totals: kurzanStageTotals, rewards: kurzanStageRewards } = buildKurzanStageTotals(kurzanStages as Record<string, Stage[] | undefined>);
  const manualOverrides = await buildManualOverrides(stageValueOverrides, kurzanStageTotals, crystalGoldRate, marketData, etcListDataObj, marketPriceMap);

  // 새로 추가된 항목들을 명시적으로 포함
  const additionalItems = [
    '어빌리티 스톤 키트 (지옥)',
    '순환 돌파석',
    '전이 돌파석',
    '고대 팔찌 (지옥)',
    '유물 각인서 선택',
    '유물 각인서 랜덤',
    '젬 가공 초기화권',
    '정련된 운명의 돌',
    '카드경험치 1당',
    '운명의 파편 1개당',
    '장인의 야금술 : 3단계',
    '장인의 재봉술 : 3단계',
    '장인의 야금술 : 4단계',
    '장인의 재봉술 : 4단계',
    '질서의 젬 : 불변 (고급)',
    '질서의 젬 : 불변 (희귀)',
    '질서의 젬 : 불변 (영웅)',
    '질서의 젬 : 견고 (고급)',
    '질서의 젬 : 견고 (희귀)',
    '질서의 젬 : 견고 (영웅)',
    '질서의 젬 : 안정 (고급)',
    '질서의 젬 : 안정 (희귀)',
    '질서의 젬 : 안정 (영웅)',
    '혼돈의 젬 : 침식 (고급)',
    '혼돈의 젬 : 침식 (희귀)',
    '혼돈의 젬 : 침식 (영웅)',
    '혼돈의 젬 : 왜곡 (고급)',
    '혼돈의 젬 : 왜곡 (희귀)',
    '혼돈의 젬 : 왜곡 (영웅)',
    '혼돈의 젬 : 붕괴 (고급)',
    '혼돈의 젬 : 붕괴 (희귀)',
    '혼돈의 젬 : 붕괴 (영웅)',
  ];

  // etc_list.csv의 모든 항목도 포함
  const etcListItemNames = Object.keys(etcListDataObj);

  const itemSet = new Set([...itemList, ...Object.keys(manualOverrides), ...additionalItems, ...etcListItemNames]);
  itemSet.add('__manual__');
  const combinedItemList = Array.from(itemSet);

  const entries = combinedItemList
    .filter((name) => !!name && name !== '__manual__')
    .map((name) =>
      resolveEntry(name, manualOverrides, etcListDataObj, marketPriceMap, marketData, cubeStageTotals, crystalGoldRate)
    )
    // 중복 제거: 같은 itemName이면 우선순위에 따라 하나만 유지
    .reduce<ValueDbEntry[]>((acc, entry) => {
      const existing = acc.find(e => e.itemName === entry.itemName);
      if (!existing) {
        acc.push(entry);
      } else {
        // 에브니 큐브 입장권인 경우: note가 있는 것(전체 보상합계)을 우선
        if (entry.itemName.startsWith('에브니 큐브 입장권')) {
          // entry.note가 있으면 cubeStageTotals에서 온 것 (전체 보상합계) - 우선
          if (entry.note && !existing.note) {
            const index = acc.indexOf(existing);
            acc[index] = entry;
          }
          // 둘 다 note가 있거나 둘 다 없으면 unitValue가 있는 것을 우선
          else if (entry.unitValue != null && !existing.unitValue) {
            const index = acc.indexOf(existing);
            acc[index] = entry;
          }
          // 둘 다 unitValue가 있으면 note가 있는 것을 우선 (이미 위에서 처리했지만 안전장치)
          else if (entry.unitValue != null && existing.unitValue != null) {
            if (entry.note && !existing.note) {
              const index = acc.indexOf(existing);
              acc[index] = entry;
            }
          }
        } else {
          // 다른 항목: unitValue가 있는 것을 우선
          if (!existing.unitValue && entry.unitValue != null) {
            const index = acc.indexOf(existing);
            acc[index] = entry;
          }
        }
      }
      return acc;
    }, [])
    .sort((a, b) => {
      // 카테고리 정의
      const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
      const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '운명의 파편 주머니(소)', '운명의 파편 주머니(중)', '운명의 파편 주머니(대)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
      const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

      // 카테고리 인덱스 (화폐: 0, 성장재료: 1, 카드: 2, 기타: 3)
      const getCategoryIndex = (itemName: string): number => {
        if (currencyItems.includes(itemName)) return 0;
        if (growthItems.includes(itemName)) return 1;
        if (cardItems.includes(itemName)) return 2;
        return 3;
      };

      const aCategory = getCategoryIndex(a.itemName);
      const bCategory = getCategoryIndex(b.itemName);

      // 카테고리가 다르면 카테고리 순서대로 정렬
      if (aCategory !== bCategory) {
        return aCategory - bCategory;
      }

      // 같은 카테고리 내에서 정렬
      if (aCategory === 0) {
        // 화폐: 지정된 순서대로
        return currencyItems.indexOf(a.itemName) - currencyItems.indexOf(b.itemName);
      } else if (aCategory === 1) {
        // 성장 재료: 지정된 순서대로
        return growthItems.indexOf(a.itemName) - growthItems.indexOf(b.itemName);
      } else if (aCategory === 2) {
        // 카드: 지정된 순서대로
        return cardItems.indexOf(a.itemName) - cardItems.indexOf(b.itemName);
      } else {
        // 기타: ㄱ~ㅎ 순서로 정렬
        return a.itemName.localeCompare(b.itemName, 'ko');
      }
    });

  // entryMap 생성 시 중복 제거: 같은 itemName이면 우선순위에 따라 하나만 유지
  const entryMap = entries.reduce<Record<string, ValueDbEntry>>((acc, entry) => {
    const existing = acc[entry.itemName];
    if (!existing) {
      acc[entry.itemName] = entry;
    } else {
      // 에브니 큐브 입장권인 경우: note가 있는 것(전체 보상합계)을 우선
      if (entry.itemName.startsWith('에브니 큐브 입장권')) {
        if (entry.note && !existing.note) {
          acc[entry.itemName] = entry; // 전체 보상합계 우선
        } else if (!entry.note && existing.note) {
          // 기존 것이 전체 보상합계면 유지
        } else if (entry.unitValue != null && !existing.unitValue) {
          acc[entry.itemName] = entry;
        }
      } else {
        // 다른 항목: unitValue가 있는 것을 우선
        if (entry.unitValue != null && !existing.unitValue) {
          acc[entry.itemName] = entry;
        }
      }
    }
    return acc;
  }, {});
  
  // entryMap을 기반으로 중복 제거된 entries 재생성 (정렬 유지)
  const uniqueEntries = Object.values(entryMap).sort((a, b) => {
    if (!a.unitType && !b.unitType) return a.itemName.localeCompare(b.itemName);
    if (!a.unitType) return 1;
    if (!b.unitType) return -1;
    if (a.unitType === b.unitType) return a.itemName.localeCompare(b.itemName);
    const order: ('크리스탈' | '골드' | '현금')[] = ['크리스탈', '골드', '현금'];
    return order.indexOf(a.unitType!) - order.indexOf(b.unitType!);
  });

  return {
    itemList: combinedItemList,
    etcListDataObj,
    crystalGoldRate,
    marketPriceMap,
    marketData,
    cubeStageTotals,
    cubeStageRewards,
    stageValueOverrides,
    kurzanStageTotals,
    kurzanStageRewards,
    entries: uniqueEntries,
    entryMap,
    hellStages: hell3Stages, // 기존 호환성을 위해 지옥3 stages 유지
    hell1Stages,
    hell2Stages,
    narakStages: narak3Stages, // 기존 호환성을 위해 나락3 stages 유지
    narak1Stages,
    narak2Stages,
    explanationMap,
  };
}

