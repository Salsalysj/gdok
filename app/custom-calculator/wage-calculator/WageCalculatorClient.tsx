'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { usePriceOverride } from '../../contexts/PriceOverrideContext';
import { useValueDb } from '../../contexts/ValueDbContext';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  cubeStageRewards?: RewardItem[];
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type ContentData = {
  [level: string]: Stage[];
};

export type ContentRewardsData = {
  '쿠르잔 전선'?: ContentData;
  '에브니 큐브'?: ContentData;
  '가디언 토벌'?: ContentData;
  '필드보스'?: ContentData;
  '카오스게이트'?: ContentData;
};

type GateData = {
  [gateNumber: string]: {
    클리어?: { [itemName: string]: number };
    더보기?: { [itemName: string]: number };
  };
};

export type RaidData = {
  [category: string]: {
    [raidName: string]: {
      [difficulty: string]: { level: string; gates: GateData };
    };
  };
};

export type ValueDbEntryMap = Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>;

const KURZAN_LEVELS = ['1640', '1660', '1680', '1700', '1720', '1730'];

function calculateStageTotals(
  stage: Stage,
  isTradableFn: (name: string) => boolean,
  isExcludedForTotalFn: (name: string) => boolean
): { tradable: number; total: number } {
  let tradable = 0;
  let total = 0;
  for (const reward of stage.rewards) {
    const qty = reward.quantity || 0;
    if (reward.cubeStageRewards && reward.cubeStageRewards.length > 0) {
      const tradableUnit = reward.cubeStageRewards.reduce((sum, r) => {
        if (isExcludedForTotalFn(r.itemName)) return sum;
        const amount = (r.price || 0) * (r.quantity || 0);
        return sum + (isTradableFn(r.itemName) ? amount : 0);
      }, 0);
      const totalUnit = reward.cubeStageRewards.reduce((sum, r) => {
        if (isExcludedForTotalFn(r.itemName)) return sum;
        return sum + (r.price || 0) * (r.quantity || 0);
      }, 0);
      tradable += tradableUnit * qty;
      total += totalUnit * qty;
      continue;
    }
    const amount = (reward.price || 0) * qty;
    if (!isExcludedForTotalFn(reward.itemName)) {
      total += amount;
      if (isTradableFn(reward.itemName)) tradable += amount;
    }
  }
  return { tradable, total };
}

export default function WageCalculatorClient({
  contentData,
  raidData,
  valueDbEntryMap,
  rates,
  showTradable = true,
}: {
  contentData: ContentRewardsData;
  raidData: RaidData;
  valueDbEntryMap?: ValueDbEntryMap;
  rates: { exchange: number | null; discord: number | null };
  showTradable?: boolean;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const [refreshKey, setRefreshKey] = useState(0);
  const [lightMode, setLightMode] = useState(false);

  const DEFAULT_DURATIONS: Record<string, number> = {
    '전선&균열': 3,
    '에브니 큐브': 5,
    '할의 모래시계': 5,
    '가디언 토벌': 3,
    '레이드': 30,
    '필드보스': 10,
    '카오스게이트': 5,
  };
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const setDuration = (rowKey: string, minutes: number) => {
    setDurations((prev) => ({ ...prev, [rowKey]: Math.max(0.1, minutes) }));
  };
  useEffect(() => {
    try {
      const v = localStorage.getItem('wage-calculator-durations');
      if (v) {
        const o = JSON.parse(v);
        if (o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0) {
          setDurations(o);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('wage-calculator-durations', JSON.stringify(durations));
    } catch {}
  }, [durations]);

  const getRowKey = (row: { content: string; level: string; rowKey?: string }) =>
    row.rowKey ?? (row.level ? `${row.content}-${row.level}` : row.content);
  const getDuration = (row: { content: string; level: string; durationKey: string; rowKey?: string }) => {
    const key = getRowKey(row);
    return durations[key] ?? DEFAULT_DURATIONS[row.durationKey] ?? 1;
  };

  const [sortBy, setSortBy] = useState<'보상' | '시급' | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem('wage-calculator-sortBy');
      if (v === '보상' || v === '시급') setSortBy(v);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (sortBy != null) localStorage.setItem('wage-calculator-sortBy', sortBy);
    } catch {}
  }, [sortBy]);

  const goldToCashPerGold = useMemo(() => {
    if (!lightMode && rates?.discord && rates.discord > 0) return rates.discord / 100;
    if (lightMode && rates?.exchange && rates.exchange > 0) return 2750 / rates.exchange;
    return null;
  }, [lightMode, rates]);

  const ROW_BG: Record<string, string> = {
    '전선&균열': 'bg-blue-950/50',
    '에브니 큐브': 'bg-amber-950/50',
    '할의 모래시계': 'bg-orange-950/50',
    '가디언 토벌': 'bg-emerald-950/50',
    '레이드': 'bg-violet-950/50',
    '필드보스': 'bg-rose-950/50',
    '카오스게이트': 'bg-cyan-950/50',
  };

  useEffect(() => {
    const saved = localStorage.getItem('themeLight');
    if (saved != null) setLightMode(saved === '1');
    const handler = (e: any) => setLightMode(!!e?.detail?.light);
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  useEffect(() => {
    const handlePriceOverrideChange = () => setRefreshKey((k) => k + 1);
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => window.removeEventListener('price-override-change', handlePriceOverrideChange);
  }, []);

  const adjustedEntriesMap = useMemo(() => {
    const map: Record<string, { unitValue: number | null }> = {};
    adjustedEntries.forEach((e) => {
      map[e.itemName] = { unitValue: e.unitValue };
    });
    return map;
  }, [adjustedEntries, refreshKey]);

  const isExcludedForTotal = (name: string) => {
    if (priceOverrideState.ignoreBreakthroughStone && (name === '찬란한 명예의 돌파석' || name === '운명의 돌파석' || name === '위대한 운명의 돌파석')) return true;
    if (priceOverrideState.ignoreFragment && (name === '명예의 파편' || name === '운명의 파편')) return true;
    if (priceOverrideState.ignoreCardExp && name === '카드 경험치') return true;
    if (priceOverrideState.ignoreDestructionGuardStone && (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정')) return true;
    return false;
  };

  const isExcludedForRaid = (name: string) => {
    if (priceOverrideState.ignoreBreakthroughStone && (name === '운명의 돌파석' || name === '위대한 운명의 돌파석')) return true;
    if (priceOverrideState.ignoreFragment && name === '운명의 파편') return true;
    if (priceOverrideState.ignoreDestructionGuardStone && (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정')) return true;
    return false;
  };

  const getRaidPrice = (itemName: string): number | null => {
    if (itemName === '골드') return 1;
    const entry = adjustedEntriesMap[itemName] || (itemName === '운명의 파편' ? adjustedEntriesMap['운명의 파편 1개당'] : null);
    const base = entry?.unitValue ?? null;
    return adjustPrice(itemName === '운명의 파편' ? '운명의 파편 1개당' : itemName, base);
  };

  const applyPricesToStages = (data: ContentData | undefined): ContentData | null => {
    if (!data) return null;
    const result: ContentData = {};
    for (const [level, stages] of Object.entries(data)) {
      result[level] = stages.map((stage) => ({
        ...stage,
        rewards: stage.rewards.map((r) => {
          let finalPrice = r.price ?? null;
          if (r.itemName === '골드(귀속)') finalPrice = 1;
          else if (r.itemName === '카드 경험치' && valueDbEntryMap) {
            const e = valueDbEntryMap['카드경험치 1당'];
            if (e?.unitValue != null) finalPrice = e.unitValue;
          } else if (r.itemName === '운명의 파편' && valueDbEntryMap) {
            const e = valueDbEntryMap['운명의 파편 1개당'];
            if (e?.unitValue != null) finalPrice = e.unitValue;
          } else if (r.itemName === '실링' && valueDbEntryMap) {
            const silverEntry = valueDbEntryMap['실링'];
            if (silverEntry?.unitValue != null) {
              if (silverEntry.unitType === '현금') {
                if (!lightMode && rates?.discord && rates.discord > 0) finalPrice = silverEntry.unitValue * (100 / rates.discord);
                else if (lightMode && rates?.exchange && rates.exchange > 0) finalPrice = silverEntry.unitValue * (rates.exchange / 2750);
                else finalPrice = silverEntry.unitValue;
              } else if (silverEntry.unitType === '골드') finalPrice = silverEntry.unitValue;
            }
          } else {
            const entry = adjustedEntriesMap[r.itemName] || (r.itemName === '운명의 파편' ? adjustedEntriesMap['운명의 파편 1개당'] : null);
            finalPrice = entry?.unitValue ?? null;
          }
          finalPrice = adjustPrice(r.itemName === '운명의 파편' ? '운명의 파편 1개당' : r.itemName, finalPrice);
          return {
            ...r,
            price: finalPrice,
            cubeStageRewards: r.cubeStageRewards?.map((sub) => {
              let subPrice = sub.price ?? null;
              if (sub.itemName === '골드(귀속)') subPrice = 1;
              else if (sub.itemName === '카드 경험치' && valueDbEntryMap) {
                const e = valueDbEntryMap['카드경험치 1당'];
                if (e?.unitValue != null) subPrice = e.unitValue;
              } else if (sub.itemName === '운명의 파편' && valueDbEntryMap) {
                const e = valueDbEntryMap['운명의 파편 1개당'];
                if (e?.unitValue != null) subPrice = e.unitValue;
              } else if (sub.itemName === '실링' && valueDbEntryMap) {
                const silverEntry = valueDbEntryMap['실링'];
                if (silverEntry?.unitValue != null) {
                  if (silverEntry.unitType === '현금') {
                    if (!lightMode && rates?.discord && rates.discord > 0) subPrice = silverEntry.unitValue * (100 / rates.discord);
                    else if (lightMode && rates?.exchange && rates.exchange > 0) subPrice = silverEntry.unitValue * (rates.exchange / 2750);
                    else subPrice = silverEntry.unitValue;
                  } else if (silverEntry.unitType === '골드') subPrice = silverEntry.unitValue;
                }
              } else {
                const entry = adjustedEntriesMap[sub.itemName] || (sub.itemName === '운명의 파편' ? adjustedEntriesMap['운명의 파편 1개당'] : null);
                subPrice = entry?.unitValue ?? null;
              }
              subPrice = adjustPrice(sub.itemName === '운명의 파편' ? '운명의 파편 1개당' : sub.itemName, subPrice);
              return { ...sub, price: subPrice };
            }),
          };
        }),
      }));
    }
    return result;
  };

  const kurzanAdjusted = useMemo(() => applyPricesToStages(contentData['쿠르잔 전선']), [contentData['쿠르잔 전선'], adjustedEntriesMap, valueDbEntryMap, rates, lightMode, adjustPrice, refreshKey, priceOverrideState]);
  const cubeAdjusted = useMemo(() => applyPricesToStages(contentData['에브니 큐브']), [contentData['에브니 큐브'], adjustedEntriesMap, valueDbEntryMap, rates, lightMode, adjustPrice, refreshKey, priceOverrideState]);
  const guardianAdjusted = useMemo(() => applyPricesToStages(contentData['가디언 토벌']), [contentData['가디언 토벌'], adjustedEntriesMap, valueDbEntryMap, rates, lightMode, adjustPrice, refreshKey, priceOverrideState]);
  const fieldBossAdjusted = useMemo(() => applyPricesToStages(contentData['필드보스']), [contentData['필드보스'], adjustedEntriesMap, valueDbEntryMap, rates, lightMode, adjustPrice, refreshKey, priceOverrideState]);
  const chaosGateAdjusted = useMemo(() => applyPricesToStages(contentData['카오스게이트']), [contentData['카오스게이트'], adjustedEntriesMap, valueDbEntryMap, rates, lightMode, adjustPrice, refreshKey, priceOverrideState]);

  const tradableSet = useMemo(() => new Set(['1레벨 보석 (3T)', '1레벨 보석 (4T)']), []);
  const isTradableKurzan = (name: string) => tradableSet.has(name);
  const isTradableCube = (name: string) => tradableSet.has(name);
  const isTradableGuardian = (name: string) => name === '1레벨 보석 (4T)';
  const bossGateTradableSet = useMemo(() => new Set([
    '1레벨 보석 (4T)', '운명의 파괴석 결정', '운명의 수호석 결정', '위대한 운명의 돌파석',
    '용암의 숨결', '빙하의 숨결', '운명의 파편 주머니(대)', '골드(귀속)',
  ]), []);
  const isTradableBossGate = (name: string) => bossGateTradableSet.has(name);

  const cubeStageToLevel: Record<string, string> = { '1해금': '1640', '2해금': '1680', '3해금': '1700', '4해금': '1720' };

  const kurzanRows = useMemo(() => {
    if (!kurzanAdjusted) return [];
    return KURZAN_LEVELS.filter((l) => kurzanAdjusted[l]).map((level) => {
      const stages = kurzanAdjusted[level];
      let tradable = 0, total = 0;
      stages.forEach((stage) => {
        const t = calculateStageTotals(stage, isTradableKurzan, isExcludedForTotal);
        tradable += t.tradable;
        total += t.total;
      });
      return { content: '전선&균열', level, tradable, total, durationKey: '전선&균열' };
    });
  }, [kurzanAdjusted, isTradableKurzan]);

  const cubeRows = useMemo(() => {
    if (!cubeAdjusted) return [];
    return Object.keys(cubeAdjusted).sort().flatMap((tierKey) => {
      const stages = cubeAdjusted[tierKey];
      const durationKey = tierKey === '에브니 큐브' ? '에브니 큐브' : tierKey === '할의 모래시계' ? '할의 모래시계' : tierKey;
      return stages.map((stage) => {
        const t = calculateStageTotals(stage, isTradableCube, isExcludedForTotal);
        const stageName = stage.stage;
        const content = tierKey === '에브니 큐브' ? `에브니 큐브 ${stageName}` : tierKey === '할의 모래시계' ? `할의 모래시계 ${stageName.replace('모래시계 ', '')}단계` : tierKey;
        const level = tierKey === '에브니 큐브' ? (cubeStageToLevel[stageName] ?? '') : tierKey === '할의 모래시계' ? '1730' : stageName;
        return { content, level, tradable: t.tradable, total: t.total, durationKey };
      });
    });
  }, [cubeAdjusted, isTradableCube]);

  const guardianRows = useMemo(() => {
    if (!guardianAdjusted) return [];
    return Object.keys(guardianAdjusted).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((level) => {
      const stages = guardianAdjusted[level];
      let tradable = 0, total = 0;
      stages.forEach((stage) => {
        const t = calculateStageTotals(stage, isTradableGuardian, isExcludedForTotal);
        tradable += t.tradable;
        total += t.total;
      });
      return { content: '가디언 토벌', level, tradable, total, durationKey: '가디언 토벌' };
    });
  }, [guardianAdjusted, isTradableGuardian]);

  const fieldBossRow = useMemo(() => {
    if (!fieldBossAdjusted) return null;
    let tradable = 0, total = 0;
    for (const stages of Object.values(fieldBossAdjusted)) {
      stages.forEach((stage) => {
        const t = calculateStageTotals(stage, isTradableBossGate, isExcludedForTotal);
        tradable += t.tradable;
        total += t.total;
      });
    }
    return { content: '필드보스', level: '1730', tradable, total, durationKey: '필드보스' };
  }, [fieldBossAdjusted, isTradableBossGate]);

  const chaosGateRow = useMemo(() => {
    if (!chaosGateAdjusted) return null;
    let tradable = 0, total = 0;
    for (const stages of Object.values(chaosGateAdjusted)) {
      stages.forEach((stage) => {
        const t = calculateStageTotals(stage, isTradableBossGate, isExcludedForTotal);
        tradable += t.tradable;
        total += t.total;
      });
    }
    return { content: '카오스게이트', level: '1730', tradable, total, durationKey: '카오스게이트' };
  }, [chaosGateAdjusted, isTradableBossGate]);

  const raidRows = useMemo(() => {
    const rows: { content: string; level: string; tradable: number; total: number; rowKey: string; durationKey: string }[] = [];
    for (const [category, raids] of Object.entries(raidData)) {
      for (const [raidName, difficulties] of Object.entries(raids)) {
        for (const [difficulty, diffData] of Object.entries(difficulties)) {
          const gates = diffData.gates || {};
          let clearGold = 0;
          let clearBound = 0;
          for (const gate of Object.values(gates)) {
            if (!gate.클리어) continue;
            clearGold += gate.클리어['골드'] || 0;
            for (const [itemName, qty] of Object.entries(gate.클리어)) {
              if (itemName === '골드') continue;
              if (isExcludedForRaid(itemName)) continue;
              const p = getRaidPrice(itemName);
              if (p != null) clearBound += p * qty;
            }
          }
          rows.push({
            content: `${raidName} ${difficulty}`,
            level: diffData.level || '',
            tradable: clearGold,
            total: clearGold + clearBound,
            rowKey: `${category}-${raidName}-${difficulty}`,
            durationKey: '레이드',
          });
        }
      }
    }
    return rows;
  }, [raidData, adjustedEntriesMap, adjustPrice, isExcludedForRaid, refreshKey, priceOverrideState]);

  const allRows = useMemo(() => {
    const rows: { content: string; level: string; tradable: number; total: number; rowKey?: string; durationKey: string }[] = [
      ...kurzanRows,
      ...cubeRows,
      ...guardianRows,
      ...raidRows,
    ];
    if (fieldBossRow != null) rows.push(fieldBossRow);
    if (chaosGateRow != null) rows.push(chaosGateRow);
    return rows;
  }, [kurzanRows, cubeRows, guardianRows, raidRows, fieldBossRow, chaosGateRow]);

  const sortedRows = useMemo(() => {
    if (sortBy == null) return allRows;
    return [...allRows].sort((a, b) => {
      if (sortBy === '보상') {
        const valA = showTradable ? a.tradable : a.total;
        const valB = showTradable ? b.tradable : b.total;
        return valB - valA;
      }
      const durA = getDuration(a);
      const durB = getDuration(b);
      const valA = showTradable ? a.tradable : a.total;
      const valB = showTradable ? b.tradable : b.total;
      const hourlyA = durA > 0 ? (valA * 60) / durA : 0;
      const hourlyB = durB > 0 ? (valB * 60) / durB : 0;
      const cashA = goldToCashPerGold != null ? hourlyA * goldToCashPerGold : hourlyA;
      const cashB = goldToCashPerGold != null ? hourlyB * goldToCashPerGold : hourlyB;
      return cashB - cashA;
    });
  }, [allRows, sortBy, durations, showTradable, goldToCashPerGold]);

  const tableClass = 'w-full border-collapse border border-gray-700 text-center';
  const thClass = 'border border-gray-700 bg-gray-800 px-3 py-2 text-gray-200 font-semibold';
  const tdClass = 'border border-gray-700 px-3 py-2 text-white';
  const btnBase = 'px-3 py-1.5 text-sm rounded-lg border border-gray-600 transition-colors';
  const btnActive = 'bg-gray-600 border-gray-500 text-white';
  const btnInactive = 'text-gray-400 hover:text-white hover:bg-gray-700';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setSortBy('보상')}
          className={`${btnBase} ${sortBy === '보상' ? btnActive : btnInactive}`}
        >
          보상 높은순
        </button>
        <button
          type="button"
          onClick={() => setSortBy('시급')}
          className={`${btnBase} ${sortBy === '시급' ? btnActive : btnInactive}`}
        >
          시급 높은순
        </button>
        <button
          type="button"
          onClick={() => setSortBy(null)}
          className={`${btnBase} ${sortBy == null ? btnActive : btnInactive}`}
        >
          기본값
        </button>
      </div>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>컨텐츠</th>
            <th className={thClass}>레벨</th>
            <th className={thClass}>보상</th>
            <th className={thClass}>소요시간(분)</th>
            <th className={thClass}>시급</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const { content, level, tradable, total, durationKey } = row;
            const key = getRowKey(row);
            const value = showTradable ? tradable : total;
            const duration = getDuration(row);
            const hourlyGold = duration > 0 ? (value * 60) / duration : 0;
            const hourlyCash = goldToCashPerGold != null ? hourlyGold * goldToCashPerGold : 0;
            const rowBg = ROW_BG[durationKey] ?? '';
            return (
              <tr key={key} className={rowBg}>
                <td className={tdClass}>{content}</td>
                <td className={tdClass}>{level}</td>
                <td className={tdClass}>{formatNumberWithSignificantDigits(value)}골드</td>
                <td className={tdClass}>
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    inputMode="decimal"
                    value={editingRowKey === key ? editingValue : String(duration)}
                    onFocus={() => {
                      setEditingRowKey(key);
                      setEditingValue(String(duration));
                    }}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => {
                      const raw = editingValue.trim();
                      const num = raw === '' ? NaN : parseFloat(raw);
                      if (!Number.isNaN(num) && num >= 0.1) {
                        setDuration(key, num);
                      } else {
                        setDuration(key, DEFAULT_DURATIONS[durationKey] ?? 1);
                      }
                      setEditingRowKey(null);
                      setEditingValue('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-20 px-2 py-1 text-center bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-gray-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
                <td className={tdClass}>
                  {goldToCashPerGold != null
                    ? `${formatNumberWithSignificantDigits(hourlyCash)}원`
                    : `${formatNumberWithSignificantDigits(hourlyGold)}골드`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
