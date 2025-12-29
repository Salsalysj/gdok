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
  hellStages?: Stage[];
  narakStages?: Stage[];
  valueDbEntryMap?: Map<string, ValueDbEntry>;
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
  narakStages,
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
      narakStages,
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
    narakStages,
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

