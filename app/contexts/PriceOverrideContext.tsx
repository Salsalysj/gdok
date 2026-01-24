'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';

type PriceOverrideState = {
  ignoreBreakthroughStone: boolean;
  ignoreFragment: boolean;
  ignoreCardExp: boolean;
  has97Stone: boolean;
  hasFullRelicEngraving: boolean;
  cardSetGraduated: boolean;
  ignoreSilver: boolean;
  ignoreDestructionGuardStone: boolean;
  ignoreFusionMaterial: boolean;
  ignoreBreath: boolean;
  ignoreLowTierCrafting: boolean;
  ignoreGem: boolean;
};

const PriceOverrideContext = createContext<{
  state: PriceOverrideState;
  setState: React.Dispatch<React.SetStateAction<PriceOverrideState>>;
} | null>(null);

export function PriceOverrideProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PriceOverrideState>({
    ignoreBreakthroughStone: false,
    ignoreFragment: false,
    ignoreCardExp: false,
    has97Stone: false,
    hasFullRelicEngraving: false,
    cardSetGraduated: false,
    ignoreSilver: false,
    ignoreDestructionGuardStone: false,
    ignoreFusionMaterial: false,
    ignoreBreath: false,
    ignoreLowTierCrafting: false,
    ignoreGem: false,
  });
  const isInitialMount = useRef(true);
  const previousStateRef = useRef<PriceOverrideState | undefined>(undefined);

  // 로컬 스토리지에서 상태 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem('priceOverrideState');
      if (saved) {
        const parsed = JSON.parse(saved);
        setState((prev) => ({ ...prev, ...parsed }));
        previousStateRef.current = { ...parsed };
      }
    } catch {}
  }, []);

  // 상태 변경 시 로컬 스토리지에 저장 및 이벤트 브로드캐스트
  useEffect(() => {
    // 초기 마운트 시에는 처리하지 않음
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousStateRef.current = { ...state };
      return;
    }

    try {
      localStorage.setItem('priceOverrideState', JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('price-override-change', { detail: state }));
      
      // 현재 상태를 이전 상태로 저장
      previousStateRef.current = { ...state };
    } catch {}
  }, [state]);


  return (
    <PriceOverrideContext.Provider value={{ state, setState }}>
      {children}
    </PriceOverrideContext.Provider>
  );
}

export function usePriceOverride() {
  const context = useContext(PriceOverrideContext);
  if (!context) {
    throw new Error('usePriceOverride must be used within PriceOverrideProvider');
  }
  return context;
}

