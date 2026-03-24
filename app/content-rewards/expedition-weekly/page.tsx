export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '원정대 주간 수익 - 껨산기',
  description: '원정대 캐릭터 검색 및 입장 가능 콘텐츠(전선·균열, 큐브·모래시계, 레이드) 확인',
};

import { promises as fs } from 'fs';
import path from 'path';
import ExpeditionWeeklyClient from './client';
import { getContentRewardsData } from '@/lib/contentRewards';
import { getValueDbData } from '@/lib/valueDb';

export type RewardDetail = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isTradable: boolean;
};

export type ContentEntry = {
  minLevel: number;
  name: string;
  tradableValue: number;
  totalValue: number;
  weeklyCount: number;
  rewardDetails?: RewardDetail[];
};

export type ExpeditionWeeklyData = {
  frontRift: ContentEntry[];
  cubeHourglass: ContentEntry[];
  guardian: ContentEntry[];
  raids: ContentEntry[];
};

// 거래가능 아이템 판별 (골드, 1레벨 보석 (4T), 야금술/재봉술 종류만 거래 가능, 나머지는 귀속)
const TRADABLE_ITEMS = new Set(['골드', '1레벨 보석 (4T)']);

function isTradable(name: string): boolean {
  return (
    TRADABLE_ITEMS.has(name) ||
    name.startsWith('야금술') ||
    name.startsWith('재봉술') ||
    name.startsWith('장인의 야금술') ||
    name.startsWith('장인의 재봉술')
  );
}

async function loadContentEntryRequirements(): Promise<{ base: ExpeditionWeeklyData }> {
  const contentPath = path.join(process.cwd(), 'data', 'content-rewards.json');
  const raidPath = path.join(process.cwd(), 'data', 'raid-rewards.json');

  const [contentRaw, raidRaw] = await Promise.all([
    fs.readFile(contentPath, 'utf-8').catch(() => '{}'),
    fs.readFile(raidPath, 'utf-8').catch(() => '{}'),
  ]);

  const content = JSON.parse(contentRaw) as Record<string, Record<string, { stage: string }[]>>;
  const raid = JSON.parse(raidRaw) as Record<string, Record<string, Record<string, { level?: string }>>>;

  const frontRift: Omit<ContentEntry, 'tradableValue' | 'totalValue' | 'weeklyCount'>[] = [];
  const kadan = content['카던&전선'];
  if (kadan && typeof kadan === 'object') {
    const levels = Object.keys(kadan).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    for (const lv of levels) {
      const stages = kadan[String(lv)];
      if (Array.isArray(stages)) {
        for (const s of stages) {
          if (s?.stage) frontRift.push({ minLevel: lv, name: s.stage });
        }
      }
    }
  }

  const cubeHourglass: Omit<ContentEntry, 'tradableValue' | 'totalValue' | 'weeklyCount'>[] = [
    { minLevel: 1640, name: '큐브 1해금' },
    { minLevel: 1680, name: '큐브 2해금' },
    { minLevel: 1700, name: '큐브 3해금' },
    { minLevel: 1720, name: '큐브 4해금' },
    { minLevel: 1730, name: '모래시계 1' },
    { minLevel: 1730, name: '모래시계 2' },
  ];

  const guardian: Omit<ContentEntry, 'tradableValue' | 'totalValue' | 'weeklyCount'>[] = [];
  const guardianData = content['가디언 토벌'];
  if (guardianData && typeof guardianData === 'object') {
    const levels = Object.keys(guardianData).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    for (const lv of levels) {
      const stages = guardianData[String(lv)];
      if (Array.isArray(stages)) {
        for (const s of stages) {
          if (s?.stage) guardian.push({ minLevel: lv, name: s.stage });
        }
      }
    }
  }

  const raids: Omit<ContentEntry, 'tradableValue' | 'totalValue' | 'weeklyCount'>[] = [];
  if (raid && typeof raid === 'object') {
    for (const [raidCategory, raidsByName] of Object.entries(raid)) {
      if (!raidsByName || typeof raidsByName !== 'object') continue;
      for (const [raidName, difficulties] of Object.entries(raidsByName)) {
        if (!difficulties || typeof difficulties !== 'object') continue;
        for (const [diff, data] of Object.entries(difficulties)) {
          const levelStr = data?.level;
          if (levelStr) {
            const minLevel = parseInt(levelStr, 10);
            if (!isNaN(minLevel)) {
              raids.push({ minLevel, name: `${raidName} ${diff}` });
            }
          }
        }
      }
    }
  }
  raids.sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name));

  return { base: { frontRift: frontRift as any, cubeHourglass: cubeHourglass as any, guardian: guardian as any, raids: raids as any } };
}

export default async function ExpeditionWeeklyPage() {
  const valueDbData = await getValueDbData();
  const { data: contentRewardsData } = await getContentRewardsData(valueDbData.entryMap);

  const { base: entryData } = await loadContentEntryRequirements();

  // 전선&균열: 쿠르잔 전선 데이터에서 해당 단계 찾기 (원정대 주간 수익 전용: 에브니 큐브 입장권·시련의 모래 제외, 큐브&모래시계 열에 따로 있음)
  const excludeFromFrontRift = (itemName: string) =>
    itemName.startsWith('에브니 큐브 입장권') || itemName.startsWith('시련의 모래');

  const frontRiftEnriched: ContentEntry[] = entryData.frontRift.map((e: any) => {
    const kurzan = contentRewardsData['쿠르잔 전선'];
    if (!kurzan) return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: 7, rewardDetails: [] };
    
    for (const [level, stages] of Object.entries(kurzan)) {
      const stage = stages?.find((s: any) => s.stage === e.name);
      if (stage) {
        let tradable = 0, total = 0;
        const details: RewardDetail[] = [];
        for (const r of (stage.rewards || [])) {
          if (excludeFromFrontRift(r.itemName || '')) continue;
          const val = (r.price || 0) * (r.quantity || 0);
          total += val;
          const tradableFlag = isTradable(r.itemName);
          if (tradableFlag) tradable += val;
          details.push({
            itemName: r.itemName,
            quantity: r.quantity || 0,
            unitPrice: r.price || 0,
            totalPrice: val,
            isTradable: tradableFlag,
          });
        }
        return { ...e, tradableValue: tradable, totalValue: total, weeklyCount: 7, rewardDetails: details };
      }
    }
    return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: 7, rewardDetails: [] };
  });

  // 큐브&모래시계: csv-rewards 에브니큐브/모래시계 데이터
  const cubeHourglassMapping: Record<string, { key: string; weeklyCount: number }> = {
    '큐브 1해금': { key: '1해금', weeklyCount: 1.4 },
    '큐브 2해금': { key: '2해금', weeklyCount: 1.4 },
    '큐브 3해금': { key: '3해금', weeklyCount: 1.4 },
    '큐브 4해금': { key: '4해금', weeklyCount: 1.4 },
    '모래시계 1': { key: '모래시계 1', weeklyCount: 2.4 },
    '모래시계 2': { key: '모래시계 2', weeklyCount: 2.4 },
  };
  const cubeHourglassEnriched: ContentEntry[] = entryData.cubeHourglass.map((e: any) => {
    const cubeData = contentRewardsData['에브니 큐브'];
    const info = cubeHourglassMapping[e.name];
    if (!cubeData || !info) {
      return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: 1.4, rewardDetails: [] };
    }
    for (const [level, stages] of Object.entries(cubeData)) {
      const stage = stages?.find((s: any) => s.stage === info.key);
      if (stage) {
        let tradable = 0, total = 0;
        const details: RewardDetail[] = [];
        for (const r of (stage.rewards || [])) {
          const val = (r.price || 0) * (r.quantity || 0);
          total += val;
          const tradableFlag = isTradable(r.itemName);
          if (tradableFlag) tradable += val;
          details.push({
            itemName: r.itemName,
            quantity: r.quantity || 0,
            unitPrice: r.price || 0,
            totalPrice: val,
            isTradable: tradableFlag,
          });
        }
        return { ...e, tradableValue: tradable, totalValue: total, weeklyCount: info.weeklyCount, rewardDetails: details };
      }
    }
    return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: info.weeklyCount, rewardDetails: [] };
  });

  // 가디언 토벌
  const guardianEnriched: ContentEntry[] = entryData.guardian.map((e: any) => {
    const guardianData = contentRewardsData['가디언 토벌'];
    if (!guardianData) return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: 7, rewardDetails: [] };

    for (const [level, stages] of Object.entries(guardianData)) {
      const stage = stages?.find((s: any) => s.stage === e.name);
      if (stage) {
        let tradable = 0, total = 0;
        const details: RewardDetail[] = [];
        for (const r of (stage.rewards || [])) {
          const val = (r.price || 0) * (r.quantity || 0);
          total += val;
          const tradableFlag = isTradable(r.itemName);
          if (tradableFlag) tradable += val;
          details.push({
            itemName: r.itemName,
            quantity: r.quantity || 0,
            unitPrice: r.price || 0,
            totalPrice: val,
            isTradable: tradableFlag,
          });
        }
        return { ...e, tradableValue: tradable, totalValue: total, weeklyCount: 7, rewardDetails: details };
      }
    }
    return { ...e, tradableValue: 0, totalValue: 0, weeklyCount: 7, rewardDetails: [] };
  });

  // 레이드: raid-rewards.json에서 골드 및 상세 보상 계산
  const raidRewardsPath = path.join(process.cwd(), 'data', 'raid-rewards.json');
  const raidRewardsRaw = await fs.readFile(raidRewardsPath, 'utf-8').catch(() => '{}');
  const raidRewards = JSON.parse(raidRewardsRaw) as Record<string, Record<string, Record<string, { level?: string; gates?: Record<string, Record<string, Record<string, number>>> }>>>;

  const raidsEnriched: ContentEntry[] = entryData.raids.map((e: any) => {
    // e.name 형식: "레이드명 난이도" (예: "베히모스 노말")
    const lastSpace = e.name.lastIndexOf(' ');
    const raidName = lastSpace > 0 ? e.name.slice(0, lastSpace) : e.name;
    const difficulty = lastSpace > 0 ? e.name.slice(lastSpace + 1) : '';

    let totalGold = 0;
    const rewardMap = new Map<string, { quantity: number; totalPrice: number }>();

    // raid-rewards.json에서 해당 레이드 찾기 (클리어 보상만 반영, 더보기 제외)
    for (const [category, raids] of Object.entries(raidRewards)) {
      const raidData = raids?.[raidName]?.[difficulty];
      if (raidData?.gates) {
        for (const [gateNum, actions] of Object.entries(raidData.gates)) {
          const rewards = actions['클리어'];
          if (rewards && typeof rewards === 'object') {
            for (const [itemName, qty] of Object.entries(rewards)) {
              if (typeof qty === 'number') {
                const existing = rewardMap.get(itemName) || { quantity: 0, totalPrice: 0 };
                existing.quantity += qty;
                if (itemName === '골드') {
                  totalGold += qty;
                  existing.totalPrice += qty;
                } else {
                  const itemInfo = valueDbData.entryMap[itemName];
                  const unitVal = itemInfo?.unitValue ?? 0;
                  if (unitVal > 0) {
                    existing.totalPrice += qty * unitVal;
                  }
                }
                rewardMap.set(itemName, existing);
              }
            }
          }
        }
        break;
      }
    }

    const details: RewardDetail[] = Array.from(rewardMap.entries()).map(([itemName, data]) => {
      const itemInfo = valueDbData.entryMap[itemName];
      const unitPrice = itemName === '골드' ? 1 : (itemInfo?.unitValue || 0);
      return {
        itemName,
        quantity: data.quantity,
        unitPrice,
        totalPrice: data.totalPrice,
        isTradable: isTradable(itemName) || itemName === '골드',
      };
    }).filter(d => d.quantity !== 0);

    // 전체 가치 계산 (골드 + 모든 아이템 가치)
    const totalValue = details.reduce((sum, d) => sum + d.totalPrice, 0);
    const tradableValue = details.filter(d => d.isTradable).reduce((sum, d) => sum + d.totalPrice, 0);

    return {
      ...e,
      tradableValue,
      totalValue,
      weeklyCount: 1,
      rewardDetails: details,
    };
  });

  const enrichedData: ExpeditionWeeklyData = {
    frontRift: frontRiftEnriched,
    cubeHourglass: cubeHourglassEnriched,
    guardian: guardianEnriched,
    raids: raidsEnriched,
  };

  return <ExpeditionWeeklyClient entryData={enrichedData} />;
}
