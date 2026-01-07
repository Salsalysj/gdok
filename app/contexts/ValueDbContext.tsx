'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
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
  marketInfo,
  hellStages,
  hell1Stages,
  hell2Stages,
  narakStages,
  narak1Stages,
  narak2Stages,
  valueDbEntryMap,
}: ValueDbProviderProps) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();

  const adjustedEntries = useMemo(() => {
    return calculateAdjustedEntries({
      entries,
      cubeStageRewards,
      kurzanStageRewards,
      marketPriceMap,
      etcListData,
      weaponStages,
      armorStages,
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
    });
  }, [
    entries,
    cubeStageRewards,
    kurzanStageRewards,
    marketPriceMap,
    etcListData,
    weaponStages,
    armorStages,
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
  ]);

  return (
    <ValueDbContext.Provider value={{ adjustedEntries }}>
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

