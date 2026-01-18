'use client';

import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import type { ValueDbEntry } from '@/lib/valueDb';
import type { RefiningStage, MarketItemInfo } from '../refining-simulation/page';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { calculateAdjustedEntries } from '@/lib/calculateAdjustedEntries';

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  category?: string;
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type ValueDbContextType = {
  adjustedEntries: ValueDbEntry[];
  explanationMap?: Record<string, string>;
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  marketPriceMap: Record<string, number>;
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>;
  valueDbMap: Map<string, ValueDbEntry>;
  marketData: any;
};

const ValueDbContext = createContext<ValueDbContextType | null>(null);

type ValueDbProviderProps = {
  children: ReactNode;
  entries: ValueDbEntry[];
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  kurzanStageRewards: Record<string, { itemName: string; quantity: number; price?: number | null; cubeStageRewards?: { itemName: string; quantity: number; price?: number | null }[] }[]>;
  marketPriceMap: Record<string, number>;
  etcListData: Record<string, { crystal: number | null; gold: number | null; cash: number | null }>;
  weaponStages?: RefiningStage[];
  armorStages?: RefiningStage[];
  weaponStagesSerka?: RefiningStage[];
  armorStagesSerka?: RefiningStage[];
  marketInfo?: Record<string, MarketItemInfo>;
  hellStages?: Stage[]; // 지옥3 stages (기존 호환성 유지)
  hell1Stages?: Stage[];
  hell2Stages?: Stage[];
  narakStages?: Stage[]; // 나락3 stages (기존 호환성 유지)
  narak1Stages?: Stage[];
  narak2Stages?: Stage[];
  valueDbEntryMap?: Map<string, ValueDbEntry>;
  cubeStageTotals: Record<string, number>;
  explanationMap?: Record<string, string>;
};

export function ValueDbProvider({
  children,
  entries,
  cubeStageRewards,
  kurzanStageRewards,
  marketPriceMap,
  etcListData,
  weaponStages,
  armorStages,
  weaponStagesSerka,
  armorStagesSerka,
  marketInfo,
  hellStages,
  hell1Stages,
  hell2Stages,
  narakStages,
  narak1Stages,
  narak2Stages,
  valueDbEntryMap,
  cubeStageTotals,
  explanationMap,
}: ValueDbProviderProps) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
  
  // 디코기준 스위치 상태 동기화
  const [lightMode, setLightMode] = useState<boolean>(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) setLightMode(saved === '1');
    } catch {}
    const handler = (e: any) => setLightMode(!!e?.detail?.light);
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);
  
  // 환율 정보 가져오기
  const [rates, setRates] = useState<{ exchange: number | null; discord: number | null }>({ exchange: null, discord: null });
  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch('/api/admin/crystal-gold');
        const data = await res.json();
        setRates({
          exchange: data.exchange || null,
          discord: data.discord || null,
        });
      } catch (error) {
        console.error('환율 정보 조회 실패:', error);
      }
    }
    fetchRates();
  }, []);

  const adjustedEntries = useMemo(() => {
    return calculateAdjustedEntries({
      entries,
      cubeStageRewards,
      kurzanStageRewards,
      marketPriceMap,
      etcListData,
      weaponStages,
      armorStages,
      weaponStagesSerka,
      armorStagesSerka,
      marketInfo,
      hellStages,
      hell1Stages,
      hell2Stages,
      narakStages,
      narak1Stages,
      narak2Stages,
      valueDbEntryMap,
      adjustPrice,
      adjustRelicEngravingAverage,
      rates,
      lightMode,
    });
  }, [
    entries,
    cubeStageRewards,
    kurzanStageRewards,
    marketPriceMap,
    etcListData,
    weaponStages,
    armorStages,
    weaponStagesSerka,
    armorStagesSerka,
    marketInfo,
    hellStages,
    hell1Stages,
    hell2Stages,
    narakStages,
    narak1Stages,
    narak2Stages,
    valueDbEntryMap,
    adjustPrice,
    adjustRelicEngravingAverage,
    rates,
    lightMode,
  ]);

  const valueDbMap = valueDbEntryMap || new Map<string, ValueDbEntry>();

  return (
    <ValueDbContext.Provider value={{ 
      adjustedEntries,
      explanationMap,
      cubeStageRewards,
      marketPriceMap,
      etcListData,
      valueDbMap,
      marketData: marketInfo,
    }}>
      {children}
    </ValueDbContext.Provider>
  );
}

export function useValueDb() {
  const context = useContext(ValueDbContext);
  if (!context) {
    throw new Error('useValueDb must be used within ValueDbProvider');
  }
  return context;
}

