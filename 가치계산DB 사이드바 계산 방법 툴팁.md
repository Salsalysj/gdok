# 가치계산DB 사이드바 계산 방법 툴팁
_Exported on 2026. 1. 7. at 18시 51분 54초 GMT+9 from Cursor (2.2.44)_

---

**User**

가치계산DB 사이드바의 항목 옆에 물음표를 표시하고 클릭 시 계산 방법이 클릭한 곳에서 작은 툴팁카드 형태로 보이게끔 해줘. 

각 항목별 계산 방법은 서버 시작할 때마다 value-db-explanation.csv 를 참고해서 구현해줘.
계산 방법 column이 비어있는 경우 물음표는 표시하지 마.

---

**Cursor**


관련 파일 확인 중입니다.



CSV 파일과 서버 시작 시 로드 로직 확인 중입니다.



`layout.tsx`와 `valueDb.ts` 확인 중입니다.



`ValueDbData` 타입 확인 중입니다.



CSV 파일 읽기 방식 확인 중입니다. 필요한 변경 작업을 시작합니다.



작업 시작: CSV 파일 로드 및 툴팁 기능 추가.



CSV 파일 로드 및 파싱 함수 추가 중입니다.


```typescript
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
        
        // 운명의 파괴석, 운명의 수호석은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석') {
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
    const baseValue = sumCategory(grouped[baseCategory] || []);
    if (otherCategories.length === 0) return baseValue;

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
      return baseValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseValue + maxOther;
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
    if (stageName.includes('네프타 2')) {
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

  if (itemName.startsWith('에브니 큐브 입장권')) {
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
};

export async function getValueDbData(): Promise<ValueDbData> {
  const itemList = await getItemList();
  const etcListMap = await getEtcListData();
  const etcListDataObj = Object.fromEntries(etcListMap);
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const marketPriceMap = await getMarketPriceMap();
  const marketData = await getMarketData();
  const { totals: cubeStageTotals, rewards: cubeStageRewards } = await getCubeStageTotals(etcListMap, marketPriceMap);
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
  };
}


```


ValueDbData 타입에 explanationMap 추가 및 CSV 파싱 함수 구현 중입니다.


```typescript
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
        
        // 운명의 파괴석, 운명의 수호석은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석') {
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
    const baseValue = sumCategory(grouped[baseCategory] || []);
    if (otherCategories.length === 0) return baseValue;

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
      return baseValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseValue + maxOther;
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
    if (stageName.includes('네프타 2')) {
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

  if (itemName.startsWith('에브니 큐브 입장권')) {
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

export async function getValueDbData(): Promise<ValueDbData> {
  const itemList = await getItemList();
  const etcListMap = await getEtcListData();
  const etcListDataObj = Object.fromEntries(etcListMap);
  const crystalGoldRate = await getLatestCrystalGoldRate();
  const marketPriceMap = await getMarketPriceMap();
  const marketData = await getMarketData();
  const { totals: cubeStageTotals, rewards: cubeStageRewards } = await getCubeStageTotals(etcListMap, marketPriceMap);
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
  };
}


```


CSV 파싱 함수 추가 및 `getValueDbData`에서 `explanationMap` 생성 중입니다.


```typescript
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
        
        // 운명의 파괴석, 운명의 수호석은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석') {
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
    const baseValue = sumCategory(grouped[baseCategory] || []);
    if (otherCategories.length === 0) return baseValue;

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
      return baseValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseValue + maxOther;
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
    if (stageName.includes('네프타 2')) {
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

  if (itemName.startsWith('에브니 큐브 입장권')) {
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
  };
}


```


`getValueDbData`의 return 문에 `explanationMap` 추가 중입니다.



`getValueDbData`에서 `explanationMap` 로드 및 반환 추가 중입니다.


```typescript
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
        
        // 운명의 파괴석, 운명의 수호석은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석') {
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
    const baseValue = sumCategory(grouped[baseCategory] || []);
    if (otherCategories.length === 0) return baseValue;

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
      return baseValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseValue + maxOther;
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
    if (stageName.includes('네프타 2')) {
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

  if (itemName.startsWith('에브니 큐브 입장권')) {
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
  };
}


```

```typescript
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
        
        // 운명의 파괴석, 운명의 수호석은 100개 묶음이므로 단가로 변환
        const bundleCount = (it as any).BundleCount || 1;
        let unitPrice = bundlePrice;
        if (name === '운명의 파괴석' || name === '운명의 수호석') {
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
    const baseValue = sumCategory(grouped[baseCategory] || []);
    if (otherCategories.length === 0) return baseValue;

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
      return baseValue + expectedSelection;
    } else {
      const otherValues = otherCategories.map((cat) => sumCategory(grouped[cat] || []));
      const maxOther = Math.max(...otherValues);
      return baseValue + maxOther;
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
    if (stageName.includes('네프타 2')) {
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

  if (itemName.startsWith('에브니 큐브 입장권')) {
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


```


`layout.tsx`에서 `explanationMap`을 `ValueDbProvider`에 전달 중입니다.


```typescriptreact
import type { Metadata } from 'next'
import './globals.css'
import Navigation from './components/Navigation'
import { PriceOverrideProvider } from './contexts/PriceOverrideContext'
import { ValueDbProvider } from './contexts/ValueDbContext'
import ValueDBSidebar from './components/ValueDBSidebar'
import { getValueDbData } from '@/lib/valueDb'
import { parseUpgradeCsv, getMarketInfoMap, createStages } from './value-db/page'
import { 
  UPGRADE_FILE_WEAPON, 
  UPGRADE_FILE_ARMOR,
  BASE_MATERIALS_WEAPON,
  BASE_MATERIALS_ARMOR,
  BREATH_ITEM_WEAPON,
  BREATH_ITEM_ARMOR,
  OPTIONAL_METALLURGY_ITEMS_WEAPON,
  OPTIONAL_METALLURGY_ITEMS_ARMOR,
} from './value-db/page'

export const metadata: Metadata = {
  title: '껨산기 by 스누껨독',
  description: '로스트아크 효율 계산 도구 (컨텐츠 보상, 과금 효율, 재련 효율, 이벤트 효율, 골드 환율)',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  other: {
    'naver-site-verification': '8f08231fdf313560e91a3a0594db9fc420681267',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [
    valueDbData,
    weaponData,
    armorData,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    getMarketInfoMap(),
  ]);

  const weaponStages = createStages(
    weaponData.levels,
    weaponData.rowMap,
    BASE_MATERIALS_WEAPON,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON
  );

  const armorStages = createStages(
    armorData.levels,
    armorData.rowMap,
    BASE_MATERIALS_ARMOR,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR
  );

  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PriceOverrideProvider>
          <ValueDbProvider
            entries={valueDbData.entries}
            cubeStageRewards={valueDbData.cubeStageRewards}
            kurzanStageRewards={valueDbData.kurzanStageRewards}
            marketPriceMap={valueDbData.marketPriceMap}
            etcListData={valueDbData.etcListDataObj}
            weaponStages={weaponStages}
            armorStages={armorStages}
            marketInfo={marketInfo}
            hellStages={valueDbData.hellStages}
            hell1Stages={valueDbData.hell1Stages}
            hell2Stages={valueDbData.hell2Stages}
            narakStages={valueDbData.narakStages}
            narak1Stages={valueDbData.narak1Stages}
            narak2Stages={valueDbData.narak2Stages}
            valueDbEntryMap={new Map(Object.entries(valueDbData.entryMap))}
            cubeStageTotals={valueDbData.cubeStageTotals}
            explanationMap={valueDbData.explanationMap}
          >
            <Navigation />
            <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
              <div className="hidden lg:block w-96 flex-shrink-0">
                <ValueDBSidebar />
              </div>
              <div className="flex-1 overflow-y-auto min-w-0">
                {children}
              </div>
            </div>
          </ValueDbProvider>
        </PriceOverrideProvider>
      </body>
    </html>
  )
}


```


`ValueDBSidebar.tsx`에 물음표 아이콘과 툴팁 UI 추가 중입니다.



`ValueDBSidebar.tsx`에 물음표 아이콘과 툴팁 추가 중입니다.


```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 툴팁 */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 max-w-xs text-xs text-gray-200 pointer-events-auto"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y + 10}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold text-white mb-1">{tooltip.itemName}</div>
          <div className="text-gray-300 whitespace-pre-wrap">{tooltip.explanation}</div>
        </div>
      )}
    </div>
  );
}


```


작업 완료. 린터 오류 없음. 마지막으로 todo 업데이트 중입니다.



작업 완료. 가치계산DB 사이드바에 물음표 아이콘과 툴팁 기능을 추가했습니다.

## 구현 내용

1. **CSV 파일 로드**: `value-db-explanation.csv` 파일을 서버 시작 시 로드하도록 `getValueDbData()` 함수에 추가했습니다.

2. **데이터 구조 업데이트**:
   - `ValueDbData` 타입에 `explanationMap` 필드 추가
   - CSV 파싱 함수 `getExplanationMap()` 구현 (계산 방법이 비어있는 항목은 제외)

3. **Context 전달**: `layout.tsx`에서 `explanationMap`을 `ValueDbProvider`에 전달하도록 수정했습니다.

4. **UI 구현**:
   - 각 항목 옆에 물음표(?) 아이콘 추가 (계산 방법이 있는 경우만 표시)
   - 물음표 클릭 시 클릭한 위치 근처에 툴팁 카드 표시
   - 툴팁에는 항목명과 계산 방법 표시
   - 외부 클릭 시 툴팁 자동 닫기

계산 방법이 있는 항목에만 물음표가 표시되며, 클릭하면 해당 항목의 계산 방법이 툴팁으로 표시됩니다.

---

**User**

툴팁카드위치는 물음표 오른쪽에 나오게 해줘

---

**Cursor**


툴팁 카드가 물음표 오른쪽에 표시되도록 위치 조정 중입니다.



툴팁이 물음표 오른쪽에 표시되도록 위치 수정 중입니다.


```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.right + 8, // 물음표 오른쪽에 8px 여백
        y: rect.top, // 물음표와 같은 높이
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 툴팁 */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 max-w-xs text-xs text-gray-200 pointer-events-auto"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y + 10}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold text-white mb-1">{tooltip.itemName}</div>
          <div className="text-gray-300 whitespace-pre-wrap">{tooltip.explanation}</div>
        </div>
      )}
    </div>
  );
}


```

```typescriptreact
'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type TooltipState = {
  itemName: string;
  explanation: string;
  x: number;
  y: number;
} | null;

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries, explanationMap } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결', '장인의 야금술 : 3단계 (실제가치)', '장인의 재봉술 : 3단계 (실제가치)', '장인의 야금술 : 4단계 (실제가치)', '장인의 재봉술 : 4단계 (실제가치)', '유물 각인서 선택', '유물 각인서 랜덤', '젬 가공 초기화권'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
      }
    };

    if (tooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tooltip]);

  const handleQuestionClick = (e: React.MouseEvent<HTMLButtonElement>, itemName: string) => {
    e.stopPropagation();
    const explanation = explanationMap?.[itemName];
    if (explanation) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        itemName,
        explanation,
        x: rect.right + 8, // 물음표 오른쪽에 8px 여백
        y: rect.top, // 물음표와 같은 높이
      });
    }
  };

  const hasExplanation = (itemName: string): boolean => {
    return !!(explanationMap?.[itemName] && explanationMap[itemName].trim());
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.cardSetGraduated}
              onChange={(e) => setState((prev) => ({ ...prev, cardSetGraduated: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드 세트 졸업</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreSilver}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreSilver: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>실링 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreDestructionGuardStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreDestructionGuardStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파괴석/수호석 미반영</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>
                        <div className="flex items-center gap-1">
                          <span>{entry.itemName}</span>
                          {hasExplanation(entry.itemName) && (
                            <button
                              onClick={(e) => handleQuestionClick(e, entry.itemName)}
                              className="text-gray-400 hover:text-blue-400 transition-colors text-xs leading-none"
                              aria-label="계산 방법 보기"
                            >
                              ?
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 툴팁 */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 max-w-xs text-xs text-gray-200 pointer-events-auto"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div className="font-semibold text-white mb-1">{tooltip.itemName}</div>
          <div className="text-gray-300 whitespace-pre-wrap">{tooltip.explanation}</div>
        </div>
      )}
    </div>
  );
}


```


수정 완료. 툴팁 카드가 물음표 오른쪽에 표시되도록 변경했습니다.

## 변경 사항

1. **위치 계산**: 물음표 버튼의 `rect.right`를 기준으로 오른쪽에 8px 여백을 두고 표시
2. **높이**: 물음표와 같은 높이(`rect.top`)에 표시
3. **정렬**: `transform: 'translateX(-50%)'` 제거로 왼쪽 정렬이 아닌 오른쪽 정렬로 표시

이제 물음표를 클릭하면 툴팁이 물음표 오른쪽에 표시됩니다.

