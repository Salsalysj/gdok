'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getMaterialsForLevel,
  type GearType,
  type RefiningLevel,
  type RefiningMaterial,
  type SimulationResult,
  type OptimalStrategy,
  findOptimalStrategyFromResults,
  type ScenarioWithCost,
} from '@/lib/advancedRefining';
import type { ValueDbEntry } from '@/lib/valueDb';
import simulationDataLevel1 from '@/lib/advancedRefiningData.json';
import simulationDataLevel2 from '@/lib/advancedRefiningData-level2.json';
import simulationDataLevel3 from '@/lib/advancedRefiningData-level3.json';
import simulationDataLevel4 from '@/lib/advancedRefiningData-level4.json';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import SummaryTable from './summary-table';

type SubTab = '상재1' | '상재2' | '상재3' | '상재4' | '요약표';
type SubSubTab = '무기' | '방어구';

export default function AdvancedRefiningClient({
  valueDbMap = {},
}: {
  valueDbMap?: Record<string, ValueDbEntry>;
}) {
  const searchParams = useSearchParams();
  
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('상재1');
  const [activeSubSubTab, setActiveSubSubTab] = useState<SubSubTab>('무기');
  const [showAllScenarios, setShowAllScenarios] = useState(false);
  const [allScenariosResults, setAllScenariosResults] = useState<Array<{
    strategy: OptimalStrategy;
    result: SimulationResult;
    costBreakdown: {
      totalCost: number;
      normalTurnCost: number;
      ancestorTurnCost: number;
      freeTurnCost: number;
      normalTurnTotal: number;
      ancestorTurnTotal: number;
      freeTurnTotal: number;
    };
  }>>([]);

  // URL 쿼리 파라미터에서 초기값 읽기 (마운트 시에만 실행)
  useEffect(() => {
    if (!searchParams) return;
    
    const tabFromUrl = searchParams.get('tab') as SubTab | null;
    const subTabFromUrl = searchParams.get('subtab') as SubSubTab | null;
    
    if (tabFromUrl && ['상재1', '상재2', '상재3', '상재4'].includes(tabFromUrl)) {
      setActiveSubTab(tabFromUrl);
    }
    
    if (subTabFromUrl && ['무기', '방어구'].includes(subTabFromUrl)) {
      setActiveSubSubTab(subTabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시에만 실행

  const subTabs: { key: SubTab; label: string; range: string }[] = [
    { key: '상재1', label: '상재1', range: '0~10단계' },
    { key: '상재2', label: '상재2', range: '11~20단계' },
    { key: '상재3', label: '상재3', range: '21~30단계' },
    { key: '상재4', label: '상재4', range: '31~40단계' },
    { key: '요약표', label: '요약표', range: '' },
  ];

  const subSubTabs: SubSubTab[] = ['무기', '방어구'];

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab);
    // URL 업데이트는 하지 않고 상태만 업데이트하여 다른 라우팅을 방해하지 않도록 함
  };

  const handleSubSubTabChange = (subTab: SubSubTab) => {
    setActiveSubSubTab(subTab);
    // URL 업데이트는 하지 않고 상태만 업데이트하여 다른 라우팅을 방해하지 않도록 함
  };

  // 현재 선택된 재료 목록
  const currentMaterials = useMemo(() => {
    if (activeSubTab === '상재1' || activeSubTab === '상재2' || activeSubTab === '상재3' || activeSubTab === '상재4') {
      return getMaterialsForLevel(activeSubTab as RefiningLevel, activeSubSubTab);
    }
    return [];
  }, [activeSubTab, activeSubSubTab]);

  // 시뮬레이션 결과
  const [noAuxResult, setNoAuxResult] = useState<SimulationResult | null>(null);
  const [fullAuxResult, setFullAuxResult] = useState<SimulationResult | null>(null);
  const [optimalStrategy, setOptimalStrategy] = useState<OptimalStrategy | null>(null);
  const [optimalResult, setOptimalResult] = useState<SimulationResult | null>(null);
  const [noAuxCostBreakdown, setNoAuxCostBreakdown] = useState<{
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    freeTurnTotal: number;
  } | null>(null);
  const [fullAuxCostBreakdown, setFullAuxCostBreakdown] = useState<{
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    freeTurnTotal: number;
  } | null>(null);
  const [craftsmanshipAnalysis, setCraftsmanshipAnalysis] = useState<{
    craftsmanshipItemName: string;
    craftsmanshipMarketPrice: number;
    // 상재1, 2용
    ancestorOnlyCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    bothTurnsCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    // 상재3, 4용 - 각 턴의 순수 기여도 측정
    enhancedAncestorTurnCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    ancestorTurnCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    normalTurnCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    allTurnsAverageCraftAnalysis: {
      additionalValue: number;
      craftsmanshipAmount: number;
      craftsmanshipUnitValue: number;
      craftsmanshipRealValue: number;
    } | null;
    breathItemName: string;
    breathMarketPrice: number;
    // 상재1, 2용
    ancestorOnlyBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
    bothTurnsBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
    // 상재3, 4용 - 각 턴의 순수 기여도 측정
    enhancedAncestorTurnBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
    ancestorTurnBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
    normalTurnBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
    allTurnsAverageBreathAnalysis: {
      additionalValue: number;
      breathAmount: number;
      breathUnitValue: number;
      breathRealValue: number;
    } | null;
  } | null>(null);

  // 하드코딩된 시뮬레이션 데이터에서 결과 가져오기
  const simulationResults = useMemo(() => {
    if (activeSubTab !== '상재1' && activeSubTab !== '상재2' && activeSubTab !== '상재3' && activeSubTab !== '상재4') {
      return null;
    }

    const gearType: GearType = activeSubSubTab;
    
    // 상재 레벨에 따라 다른 데이터 파일 사용
    let simulationData: any;
    if (activeSubTab === '상재3') {
      simulationData = simulationDataLevel3;
    } else if (activeSubTab === '상재4') {
      simulationData = simulationDataLevel4;
    } else if (activeSubTab === '상재2') {
      simulationData = simulationDataLevel2;
    } else {
      simulationData = simulationDataLevel1;
    }
    
    // 상재3, 4의 경우 enhancedAncestor 관련 필드가 있음
    const isLevel3Or4 = activeSubTab === '상재3' || activeSubTab === '상재4';
    
    // 하드코딩된 데이터에서 해당 gearType의 결과만 필터링
    const filteredData = (simulationData as unknown as {
      iterations: number;
      generatedAt: string;
      data: Array<{
        gearType: GearType;
        strategy: {
          normalBreath: boolean;
          normalCraft: boolean;
          ancestorBreath: boolean;
          ancestorCraft: boolean;
          enhancedAncestorBreath?: boolean;
          enhancedAncestorCraft?: boolean;
        };
        result: {
          expectedAttempts: number;
          normalTurns: number;
          ancestorTurns: number;
          enhancedAncestorTurns?: number;
          freeTurns: number;
          materialBreakdown: { [key: string]: number };
        };
      }>;
    }).data.filter(item => item.gearType === gearType);

    // OptimalStrategy 형식으로 변환
    return filteredData.map(item => ({
      strategy: {
        normalTurn: {
          useBreath: item.strategy.normalBreath,
          useCraftsmanship: item.strategy.normalCraft,
        },
        ancestorTurn: {
          useBreath: item.strategy.ancestorBreath,
          useCraftsmanship: item.strategy.ancestorCraft,
        },
        ...(isLevel3Or4 && {
          enhancedAncestorTurn: {
            useBreath: item.strategy.enhancedAncestorBreath || false,
            useCraftsmanship: item.strategy.enhancedAncestorCraft || false,
          },
        }),
      },
      result: {
        expectedAttempts: item.result.expectedAttempts,
        normalTurns: item.result.normalTurns,
        ancestorTurns: item.result.ancestorTurns,
        ...(isLevel3Or4 && { enhancedAncestorTurns: item.result.enhancedAncestorTurns || 0 }),
        freeTurns: item.result.freeTurns,
        totalCost: 0, // 비용은 나중에 계산
        materialBreakdown: item.result.materialBreakdown,
      } as SimulationResult,
    }));
  }, [activeSubTab, activeSubSubTab]);

  // 가격 조정 훅 사용
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();

  const formatNumber = (num: number) => {
    return Math.round(num).toLocaleString();
  };
  const formatDecimal = (num: number) => num.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // 재료 가치 계산 (가격 조정 적용)
  const getMaterialValue = useMemo(() => {
    return (itemName: string): number | null => {
      // 골드는 직접 반환 (가격 조정 불필요)
      if (itemName === '골드') {
        return 1; // 골드 1개 = 골드 1
      }
      
      // 실링은 0골드로 처리
      if (itemName === '실링') {
        return 0;
      }
      
      let basePrice: number | null = null;
      
      // 운명의 파편은 '운명의 파편 1개당'으로 찾기
      if (itemName === '운명의 파편') {
        const entry = valueDbMap['운명의 파편 1개당'];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          basePrice = entry.unitValue;
        }
      } else {
        // 가치계산DB에서 찾기
        const entry = valueDbMap[itemName];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          basePrice = entry.unitValue;
        }
      }
      
      // 가격 조정 적용
      if (basePrice != null) {
        return adjustPrice(itemName, basePrice);
      }
      
      return null;
    };
  }, [valueDbMap, adjustPrice]);

  // 재료별 가치 계산
  const materialValues = useMemo(() => {
    const values: { [key: string]: { unitPrice: number | null; totalValue: number | null } } = {};
    
    currentMaterials.forEach((mat) => {
      const unitPrice = getMaterialValue(mat.name);
      values[mat.name] = {
        unitPrice,
        totalValue: unitPrice != null ? unitPrice * mat.amount : null,
      };
    });
    
    return values;
  }, [currentMaterials, valueDbMap, getMaterialValue, priceOverrideState]);

  // 필수 재료 가치 합계
  const requiredMaterialsTotal = useMemo(() => {
    return currentMaterials
      .filter(m => !m.isOptional)
      .reduce((sum, mat) => {
        const value = materialValues[mat.name]?.totalValue;
        return sum + (value != null ? value : 0);
      }, 0);
  }, [currentMaterials, materialValues]);

  // 전체 재료 가치 합계 (필수 + 보조)
  const allMaterialsTotal = useMemo(() => {
    return currentMaterials
      .reduce((sum, mat) => {
        const value = materialValues[mat.name]?.totalValue;
        return sum + (value != null ? value : 0);
      }, 0);
  }, [currentMaterials, materialValues]);

  // 보조재료 비용 계산 (보조재료 투입 여부에 따라)
  const calculateAuxiliaryCost = useCallback((useBreath: boolean, useCraftsmanship: boolean): number => {
    return currentMaterials
      .filter(m => m.isOptional)
      .reduce((sum, mat) => {
        if (mat.name.includes('숨결') && !useBreath) return sum;
        if ((mat.name.includes('야금술') || mat.name.includes('재봉술')) && !useCraftsmanship) return sum;
        const value = materialValues[mat.name]?.totalValue;
        return sum + (value != null ? value : 0);
      }, 0);
  }, [currentMaterials, materialValues]);

  // 시뮬레이션 결과에 총 비용 계산 (상세 정보 포함)
  const calculateTotalCost = useCallback((
    result: SimulationResult,
    useBreathNormal: boolean,
    useCraftsmanshipNormal: boolean,
    useBreathAncestor: boolean,
    useCraftsmanshipAncestor: boolean,
    useBreathEnhancedAncestor?: boolean,
    useCraftsmanshipEnhancedAncestor?: boolean
  ): {
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    enhancedAncestorTurnCost?: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    enhancedAncestorTurnTotal?: number;
    freeTurnTotal: number;
  } => {
    const normalTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(useBreathNormal, useCraftsmanshipNormal);
    const ancestorTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(useBreathAncestor, useCraftsmanshipAncestor);
    const freeTurnCost = calculateAuxiliaryCost(useBreathNormal, useCraftsmanshipNormal); // 무료턴은 필수 재료 비용 0
    
    const normalTurnTotal = result.normalTurns * normalTurnCost;
    const ancestorTurnTotal = result.ancestorTurns * ancestorTurnCost;
    const freeTurnTotal = result.freeTurns * freeTurnCost;
    
    // 강화선조턴이 있는 경우 (상재3, 4)
    let enhancedAncestorTurnCost: number | undefined;
    let enhancedAncestorTurnTotal: number | undefined;
    if (result.enhancedAncestorTurns !== undefined && useBreathEnhancedAncestor !== undefined && useCraftsmanshipEnhancedAncestor !== undefined) {
      enhancedAncestorTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(useBreathEnhancedAncestor, useCraftsmanshipEnhancedAncestor);
      enhancedAncestorTurnTotal = result.enhancedAncestorTurns * enhancedAncestorTurnCost;
    }
    
    const totalCost = normalTurnTotal + ancestorTurnTotal + freeTurnTotal + (enhancedAncestorTurnTotal || 0);
    
    return {
      totalCost,
      normalTurnCost,
      ancestorTurnCost,
      ...(enhancedAncestorTurnCost !== undefined && { enhancedAncestorTurnCost }),
      freeTurnCost,
      normalTurnTotal,
      ancestorTurnTotal,
      ...(enhancedAncestorTurnTotal !== undefined && { enhancedAncestorTurnTotal }),
      freeTurnTotal,
    };
  }, [requiredMaterialsTotal, calculateAuxiliaryCost]);

  // 비용 계산 및 결과 처리 (시뮬레이션 결과, 시세, 가격 조정 상태가 변경될 때마다 실행)
  useEffect(() => {
    if (!simulationResults || (activeSubTab !== '상재1' && activeSubTab !== '상재2' && activeSubTab !== '상재3' && activeSubTab !== '상재4')) {
      return;
    }

    // 모든 시나리오에 대해 비용 계산
    const allResults = simulationResults.map((simResult) => {
      const costBreakdown = calculateTotalCost(
        simResult.result,
        simResult.strategy.normalTurn.useBreath,
        simResult.strategy.normalTurn.useCraftsmanship,
        simResult.strategy.ancestorTurn.useBreath,
        simResult.strategy.ancestorTurn.useCraftsmanship,
        simResult.strategy.enhancedAncestorTurn?.useBreath,
        simResult.strategy.enhancedAncestorTurn?.useCraftsmanship
      );
      return {
        ...simResult,
        costBreakdown,
      };
    });

    // 최적 전략 찾기 (총 비용이 가장 낮은 것)
    const optimal = findOptimalStrategyFromResults(allResults, {
      excludeCraftsmanship: false,
    });
    
    if (!optimal) {
      return;
    }

    // 보조재료 미투입 시나리오 찾기 (모든 턴에서 미투입)
    const noAux = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 보조재료 전부투입 시나리오 찾기 (일반턴/선조턴 모두 투입, 상재1~2 전용)
    const fullAux = allResults.find(
      (r) => 
        r.strategy.normalTurn.useBreath && 
        r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship &&
        (!r.strategy.enhancedAncestorTurn || 
          (r.strategy.enhancedAncestorTurn.useBreath && r.strategy.enhancedAncestorTurn.useCraftsmanship))
    );

    // 선조턴에만 야금술/재봉술 투입 시나리오 찾기 (상재1~2 전용)
    const ancestorOnlyCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 일반턴과 선조턴 모두에 야금술/재봉술 투입 시나리오 찾기 (상재1~2 전용)
    const bothTurnsCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 선조턴에만 숨결 투입 시나리오 찾기
    const ancestorOnlyBreath = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 상재3, 4 전용 시나리오들
    // 강화선조턴에만 야금술/재봉술 투입
    const enhancedAncestorOnlyCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 선조턴 + 강화선조턴에 야금술/재봉술 투입
    const ancestorAndEnhancedCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 일반턴 + 선조턴 + 강화선조턴에 야금술/재봉술 투입
    const allTurnsCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 일반턴과 선조턴 모두에 숨결 투입 시나리오 찾기
    const bothTurnsBreath = allResults.find(
      (r) => 
        r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        !r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 상재3, 4 전용 숨결 시나리오들
    // 강화선조턴에만 숨결 투입
    const enhancedAncestorOnlyBreath = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 선조턴 + 강화선조턴에 숨결 투입
    const ancestorAndEnhancedBreath = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 일반턴 + 선조턴 + 강화선조턴에 숨결 투입
    const allTurnsBreath = allResults.find(
      (r) => 
        r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship &&
        r.strategy.enhancedAncestorTurn?.useBreath &&
        !r.strategy.enhancedAncestorTurn?.useCraftsmanship
    );

    // 결과 설정
    if (noAux) {
      setNoAuxResult(noAux.result);
      setNoAuxCostBreakdown(noAux.costBreakdown);
    }
    if (fullAux) {
      setFullAuxResult(fullAux.result);
      setFullAuxCostBreakdown(fullAux.costBreakdown);
    }
    setOptimalStrategy(optimal.strategy);
    setOptimalResult(optimal.result);
    setAllScenariosResults(allResults);
    
    // 야금술/재봉술 실제 가치 계산 (레벨에 따라 단계 결정)
    const craftsmanshipStage = activeSubTab === '상재1' ? '1단계' : activeSubTab === '상재2' ? '2단계' : activeSubTab === '상재3' ? '3단계' : '4단계';
    const craftsmanshipItemName = activeSubSubTab === '무기' ? `장인의 야금술 : ${craftsmanshipStage}` : `장인의 재봉술 : ${craftsmanshipStage}`;
    const craftsmanshipMarketPrice = getMaterialValue(craftsmanshipItemName) || 0;
    
    // materialBreakdown에서도 동일한 단계 사용
    // 디버깅: 실제 materialBreakdown에 있는 키 확인
    if (allResults.length > 0 && allResults[0].result.materialBreakdown) {
      const materialKeys = Object.keys(allResults[0].result.materialBreakdown);
      const craftKeys = materialKeys.filter(k => k.includes('야금술') || k.includes('재봉술'));
      // 실제 데이터에 있는 키로 매칭 시도
      if (craftKeys.length > 0 && !allResults.some(r => r.result.materialBreakdown[craftsmanshipItemName] !== undefined)) {
        var craftsmanshipItemNameInBreakdown = craftKeys[0];
      } else {
        var craftsmanshipItemNameInBreakdown = craftsmanshipItemName;
      }
    } else {
      var craftsmanshipItemNameInBreakdown = craftsmanshipItemName;
    }
    
    let ancestorOnlyCraftAnalysis = null;
    let bothTurnsCraftAnalysis = null;
    let enhancedAncestorTurnCraftAnalysis = null;
    let ancestorTurnCraftAnalysis = null;
    let normalTurnCraftAnalysis = null;
    let allTurnsAverageCraftAnalysis = null;
    
    const isLevel3Or4 = activeSubTab === '상재3' || activeSubTab === '상재4';
    
    if (isLevel3Or4) {
      // 상재3, 4 전용 분석 - 각 턴의 순수 기여도 측정
      // 1. 강화선조턴 기준: 보조재료 미반영 vs 강화선조턴에만 투입
      if (noAux && enhancedAncestorOnlyCraft) {
        const additionalValue = noAux.costBreakdown.totalCost - enhancedAncestorOnlyCraft.costBreakdown.totalCost;
        const craftsmanshipAmount = enhancedAncestorOnlyCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
        const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
        
        enhancedAncestorTurnCraftAnalysis = {
          additionalValue,
          craftsmanshipAmount,
          craftsmanshipUnitValue,
          craftsmanshipRealValue,
        };
      }
      
      // 2. 선조턴 기준: 강화선조턴에만 투입 vs 강화선조턴+선조턴에 투입
      if (enhancedAncestorOnlyCraft && ancestorAndEnhancedCraft) {
        const additionalValue = enhancedAncestorOnlyCraft.costBreakdown.totalCost - ancestorAndEnhancedCraft.costBreakdown.totalCost;
        const craftsmanshipAmountBefore = enhancedAncestorOnlyCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmountAfter = ancestorAndEnhancedCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmount = craftsmanshipAmountAfter - craftsmanshipAmountBefore;
        const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
        const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
        
        ancestorTurnCraftAnalysis = {
          additionalValue,
          craftsmanshipAmount,
          craftsmanshipUnitValue,
          craftsmanshipRealValue,
        };
      }
      
      // 3. 일반턴 기준: 강화선조턴+선조턴에 투입 vs 모든 턴에 투입
      if (ancestorAndEnhancedCraft && allTurnsCraft) {
        const additionalValue = ancestorAndEnhancedCraft.costBreakdown.totalCost - allTurnsCraft.costBreakdown.totalCost;
        const craftsmanshipAmountBefore = ancestorAndEnhancedCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmountAfter = allTurnsCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmount = craftsmanshipAmountAfter - craftsmanshipAmountBefore;
        const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
        const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
        
        normalTurnCraftAnalysis = {
          additionalValue,
          craftsmanshipAmount,
          craftsmanshipUnitValue,
          craftsmanshipRealValue,
        };
      }
      
      // 4. 전체 턴 평균: 보조재료 미반영 vs 모든 턴에 투입
      if (noAux && allTurnsCraft) {
        const additionalValue = noAux.costBreakdown.totalCost - allTurnsCraft.costBreakdown.totalCost;
        const craftsmanshipAmount = allTurnsCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
        const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
        
        allTurnsAverageCraftAnalysis = {
          additionalValue,
          craftsmanshipAmount,
          craftsmanshipUnitValue,
          craftsmanshipRealValue,
        };
      }
    } else {
      // 상재1, 2 전용 분석 - 각 턴의 순수 기여도 측정
      // 1. 선조턴 기준: 보조재료 미투입 vs 선조턴에만 투입
    if (noAux && ancestorOnlyCraft) {
      const additionalValue = noAux.costBreakdown.totalCost - ancestorOnlyCraft.costBreakdown.totalCost;
      const craftsmanshipAmount = ancestorOnlyCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
      const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
      const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
      
      ancestorOnlyCraftAnalysis = {
        additionalValue,
        craftsmanshipAmount,
        craftsmanshipUnitValue,
        craftsmanshipRealValue,
      };
    }
    
      // 2. 일반턴 기준: 선조턴에만 투입 vs 모든 턴에 투입
      if (ancestorOnlyCraft && bothTurnsCraft) {
        const additionalValue = ancestorOnlyCraft.costBreakdown.totalCost - bothTurnsCraft.costBreakdown.totalCost;
        const craftsmanshipAmountBefore = ancestorOnlyCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmountAfter = bothTurnsCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
        const craftsmanshipAmount = craftsmanshipAmountAfter - craftsmanshipAmountBefore;
        const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
        const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
        
        normalTurnCraftAnalysis = {
          additionalValue,
          craftsmanshipAmount,
          craftsmanshipUnitValue,
          craftsmanshipRealValue,
        };
      }
      
      // 3. 전체 턴 평균: 보조재료 미반영 vs 모든 턴에 투입
    if (noAux && bothTurnsCraft) {
      const additionalValue = noAux.costBreakdown.totalCost - bothTurnsCraft.costBreakdown.totalCost;
      const craftsmanshipAmount = bothTurnsCraft.result.materialBreakdown[craftsmanshipItemNameInBreakdown] || 0;
      const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
      const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
      
        allTurnsAverageCraftAnalysis = {
        additionalValue,
        craftsmanshipAmount,
        craftsmanshipUnitValue,
        craftsmanshipRealValue,
      };
      }
    }
    
    // 숨결 실제 가치 계산
    const breathItemName = activeSubSubTab === '무기' ? '용암의 숨결' : '빙하의 숨결';
    const breathMarketPrice = getMaterialValue(breathItemName) || 0;
    
    let ancestorOnlyBreathAnalysis = null;
    let bothTurnsBreathAnalysis = null;
    let enhancedAncestorTurnBreathAnalysis = null;
    let ancestorTurnBreathAnalysis = null;
    let normalTurnBreathAnalysis = null;
    let allTurnsAverageBreathAnalysis = null;
    
    if (isLevel3Or4) {
      // 상재3, 4 전용 분석 - 각 턴의 순수 기여도 측정
      // 1. 강화선조턴 기준: 보조재료 미반영 vs 강화선조턴에만 투입
      if (noAux && enhancedAncestorOnlyBreath) {
        const additionalValue = noAux.costBreakdown.totalCost - enhancedAncestorOnlyBreath.costBreakdown.totalCost;
        const breathAmount = enhancedAncestorOnlyBreath.result.materialBreakdown[breathItemName] || 0;
        const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
        const breathRealValue = breathUnitValue + breathMarketPrice;
        
        enhancedAncestorTurnBreathAnalysis = {
          additionalValue,
          breathAmount,
          breathUnitValue,
          breathRealValue,
        };
      }
      
      // 2. 선조턴 기준: 강화선조턴에만 투입 vs 강화선조턴+선조턴에 투입
      if (enhancedAncestorOnlyBreath && ancestorAndEnhancedBreath) {
        const additionalValue = enhancedAncestorOnlyBreath.costBreakdown.totalCost - ancestorAndEnhancedBreath.costBreakdown.totalCost;
        const breathAmountBefore = enhancedAncestorOnlyBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmountAfter = ancestorAndEnhancedBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmount = breathAmountAfter - breathAmountBefore;
        const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
        const breathRealValue = breathUnitValue + breathMarketPrice;
        
        ancestorTurnBreathAnalysis = {
          additionalValue,
          breathAmount,
          breathUnitValue,
          breathRealValue,
        };
      }
      
      // 3. 일반턴 기준: 강화선조턴+선조턴에 투입 vs 모든 턴에 투입
      if (ancestorAndEnhancedBreath && allTurnsBreath) {
        const additionalValue = ancestorAndEnhancedBreath.costBreakdown.totalCost - allTurnsBreath.costBreakdown.totalCost;
        const breathAmountBefore = ancestorAndEnhancedBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmountAfter = allTurnsBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmount = breathAmountAfter - breathAmountBefore;
        const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
        const breathRealValue = breathUnitValue + breathMarketPrice;
        
        normalTurnBreathAnalysis = {
          additionalValue,
          breathAmount,
          breathUnitValue,
          breathRealValue,
        };
      }
      
      // 4. 전체 턴 평균: 보조재료 미반영 vs 모든 턴에 투입
      if (noAux && allTurnsBreath) {
        const additionalValue = noAux.costBreakdown.totalCost - allTurnsBreath.costBreakdown.totalCost;
        const breathAmount = allTurnsBreath.result.materialBreakdown[breathItemName] || 0;
        const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
        const breathRealValue = breathUnitValue + breathMarketPrice;
        
        allTurnsAverageBreathAnalysis = {
          additionalValue,
          breathAmount,
          breathUnitValue,
          breathRealValue,
        };
      }
    } else {
      // 상재1, 2 전용 분석 - 각 턴의 순수 기여도 측정
      // 1. 선조턴 기준: 보조재료 미투입 vs 선조턴에만 투입
    if (noAux && ancestorOnlyBreath) {
      const additionalValue = noAux.costBreakdown.totalCost - ancestorOnlyBreath.costBreakdown.totalCost;
      const breathAmount = ancestorOnlyBreath.result.materialBreakdown[breathItemName] || 0;
      const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
      const breathRealValue = breathUnitValue + breathMarketPrice;
      
      ancestorOnlyBreathAnalysis = {
        additionalValue,
        breathAmount,
        breathUnitValue,
        breathRealValue,
      };
    }
    
      // 2. 일반턴 기준: 선조턴에만 투입 vs 모든 턴에 투입
      if (ancestorOnlyBreath && bothTurnsBreath) {
        const additionalValue = ancestorOnlyBreath.costBreakdown.totalCost - bothTurnsBreath.costBreakdown.totalCost;
        const breathAmountBefore = ancestorOnlyBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmountAfter = bothTurnsBreath.result.materialBreakdown[breathItemName] || 0;
        const breathAmount = breathAmountAfter - breathAmountBefore;
        const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
        const breathRealValue = breathUnitValue + breathMarketPrice;
        
        normalTurnBreathAnalysis = {
          additionalValue,
          breathAmount,
          breathUnitValue,
          breathRealValue,
        };
      }
      
      // 3. 전체 턴 평균: 보조재료 미반영 vs 모든 턴에 투입
    if (noAux && bothTurnsBreath) {
      const additionalValue = noAux.costBreakdown.totalCost - bothTurnsBreath.costBreakdown.totalCost;
      const breathAmount = bothTurnsBreath.result.materialBreakdown[breathItemName] || 0;
      const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
      const breathRealValue = breathUnitValue + breathMarketPrice;
      
        allTurnsAverageBreathAnalysis = {
        additionalValue,
        breathAmount,
        breathUnitValue,
        breathRealValue,
      };
    }
    }
    
    if (ancestorOnlyCraftAnalysis || bothTurnsCraftAnalysis || 
        enhancedAncestorTurnCraftAnalysis || ancestorTurnCraftAnalysis || 
        normalTurnCraftAnalysis || allTurnsAverageCraftAnalysis ||
        ancestorOnlyBreathAnalysis || bothTurnsBreathAnalysis || 
        enhancedAncestorTurnBreathAnalysis || ancestorTurnBreathAnalysis ||
        normalTurnBreathAnalysis || allTurnsAverageBreathAnalysis) {
      setCraftsmanshipAnalysis({
        craftsmanshipItemName,
        craftsmanshipMarketPrice,
        ancestorOnlyCraftAnalysis,
        bothTurnsCraftAnalysis,
        enhancedAncestorTurnCraftAnalysis,
        ancestorTurnCraftAnalysis,
        normalTurnCraftAnalysis,
        allTurnsAverageCraftAnalysis,
        breathItemName,
        breathMarketPrice,
        ancestorOnlyBreathAnalysis,
        bothTurnsBreathAnalysis,
        enhancedAncestorTurnBreathAnalysis,
        ancestorTurnBreathAnalysis,
        normalTurnBreathAnalysis,
        allTurnsAverageBreathAnalysis,
      });
    } else {
      setCraftsmanshipAnalysis(null);
    }
  }, [simulationResults, valueDbMap, activeSubSubTab, materialValues, getMaterialValue, priceOverrideState, calculateTotalCost, activeSubTab, currentMaterials, requiredMaterialsTotal]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">
            상급 재련 시뮬레이션
          </h1>
          <p className="text-sm md:text-base text-gray-400">
            상급 재련의 효율을 시뮬레이션하고 최적의 전략을 제시합니다
          </p>
        </div>

        {/* 서브탭 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleSubTabChange(tab.key)}
              className={`px-6 py-3 rounded-lg font-semibold ${
                activeSubTab === tab.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab.label}{tab.range && ` (${tab.range})`}
            </button>
          ))}
        </div>

        {/* 서브서브탭 - 요약표에서는 숨김 */}
        {activeSubTab !== '요약표' && (
          <div className="flex gap-2 mb-6">
            {subSubTabs.map((subTab) => (
              <button
                key={subTab}
                onClick={() => handleSubSubTabChange(subTab)}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  activeSubSubTab === subTab
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {subTab}
              </button>
            ))}
          </div>
        )}

        {/* 내용 영역 */}
        {activeSubTab === '요약표' ? (
          <SummaryTable valueDbMap={valueDbMap} />
        ) : (activeSubTab !== '상재1' && activeSubTab !== '상재2' && activeSubTab !== '상재3' && activeSubTab !== '상재4') ? (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🚧</div>
              <h2 className="text-2xl font-bold text-white mb-2">페이지 미구현 중</h2>
              <p className="text-gray-400">
                {activeSubTab} ({subTabs.find(t => t.key === activeSubTab)?.range}) - {activeSubSubTab} 페이지는 현재 구현 중입니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. 재련 재료 */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📦</span>
                1회 재련 재료
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-purple-400 mb-2">필수 재료</h3>
                  <div className="space-y-2">
                    {currentMaterials.filter(m => !m.isOptional).map((mat) => {
                      const value = materialValues[mat.name];
                      return (
                        <div key={mat.name} className="bg-gray-900/50 px-3 py-2 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-gray-300 text-sm">{mat.name}</span>
                            <span className="text-white font-medium">{formatNumber(mat.amount)}</span>
                          </div>
                          {value?.totalValue != null && (
                            <div className="text-xs text-yellow-400 text-right">
                              {formatNumber(value.totalValue)} 골드
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">보조 재료 (선택)</h3>
                  <div className="space-y-2">
                    {currentMaterials.filter(m => m.isOptional).map((mat) => {
                      const value = materialValues[mat.name];
                      return (
                        <div key={mat.name} className="bg-gray-900/50 px-3 py-2 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-gray-300 text-sm">{mat.name}</span>
                            <span className="text-white font-medium">{formatNumber(mat.amount)}</span>
                          </div>
                          {value?.totalValue != null && (
                            <div className="text-xs text-yellow-400 text-right">
                              {formatNumber(value.totalValue)} 골드
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* 가치 합계 */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-700/50">
                    <div className="text-sm text-purple-300 mb-1">필수 재료 가치 합계</div>
                    <div className="text-xl font-bold text-purple-400">
                      {formatNumber(requiredMaterialsTotal)} 골드
                    </div>
                  </div>
                  <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/50">
                    <div className="text-sm text-blue-300 mb-1">1회 재련 재료 가치 합계 (전체)</div>
                    <div className="text-xl font-bold text-blue-400">
                      {formatNumber(allMaterialsTotal)} 골드
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(
              <>
                {/* 최적 시뮬레이션 (1회 재련 재료 바로 다음) */}
                {optimalStrategy && optimalResult && (
                  <div className="bg-gray-800 rounded-lg border border-green-700/50 p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">⚡</span>
                      최적 시뮬레이션
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-green-400 mb-3">일반 턴</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">숨결 투입</span>
                            <span className={optimalStrategy.normalTurn.useBreath ? 'text-green-400 font-medium' : 'text-red-400'}>
                              {optimalStrategy.normalTurn.useBreath ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">야금술/재봉술 투입</span>
                            <span className={optimalStrategy.normalTurn.useCraftsmanship ? 'text-green-400 font-medium' : 'text-red-400'}>
                              {optimalStrategy.normalTurn.useCraftsmanship ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-purple-400 mb-3">선조 턴</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">숨결 투입</span>
                            <span className={optimalStrategy.ancestorTurn.useBreath ? 'text-green-400 font-medium' : 'text-red-400'}>
                              {optimalStrategy.ancestorTurn.useBreath ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">야금술/재봉술 투입</span>
                            <span className={optimalStrategy.ancestorTurn.useCraftsmanship ? 'text-green-400 font-medium' : 'text-red-400'}>
                              {optimalStrategy.ancestorTurn.useCraftsmanship ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {optimalStrategy.enhancedAncestorTurn && (activeSubTab === '상재3' || activeSubTab === '상재4') && (
                        <div className="bg-gray-900/50 rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-orange-400 mb-3">강화 선조 턴</h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">숨결 투입</span>
                              <span className={optimalStrategy.enhancedAncestorTurn.useBreath ? 'text-green-400 font-medium' : 'text-red-400'}>
                                {optimalStrategy.enhancedAncestorTurn.useBreath ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">야금술/재봉술 투입</span>
                              <span className={optimalStrategy.enhancedAncestorTurn.useCraftsmanship ? 'text-green-400 font-medium' : 'text-red-400'}>
                                {optimalStrategy.enhancedAncestorTurn.useCraftsmanship ? 'Yes' : 'No'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <SimulationStats 
                      result={optimalResult} 
                      color="green"
                      costBreakdown={optimalStrategy ? calculateTotalCost(
                        optimalResult,
                        optimalStrategy.normalTurn.useBreath,
                        optimalStrategy.normalTurn.useCraftsmanship,
                        optimalStrategy.ancestorTurn.useBreath,
                        optimalStrategy.ancestorTurn.useCraftsmanship,
                        optimalStrategy.enhancedAncestorTurn?.useBreath,
                        optimalStrategy.enhancedAncestorTurn?.useCraftsmanship
                      ) : null}
                    />
                  </div>
                )}

                {/* 최적 방식 재료 소모량 */}
                {optimalResult && (
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">📊</span>
                      최적 방식 총 재료 소모량
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Object.entries(optimalResult.materialBreakdown)
                        .filter(([_, amount]) => amount > 0)
                        .map(([name, amount]) => {
                          // 상재2, 상재3, 상재4의 경우 야금술/재봉술 이름을 해당 레벨에 맞게 변환
                          let displayName = name;
                          if (activeSubTab === '상재2' || activeSubTab === '상재3' || activeSubTab === '상재4') {
                            const craftsmanshipStage = activeSubTab === '상재2' ? '2단계' : activeSubTab === '상재3' ? '3단계' : '4단계';
                            if (name.includes('장인의 야금술 : 1단계')) {
                              displayName = name.replace('장인의 야금술 : 1단계', `장인의 야금술 : ${craftsmanshipStage}`);
                            } else if (name.includes('장인의 재봉술 : 1단계')) {
                              displayName = name.replace('장인의 재봉술 : 1단계', `장인의 재봉술 : ${craftsmanshipStage}`);
                            }
                          }
                          return (
                            <div key={name} className="bg-gray-900/50 rounded-lg p-3">
                              <div className="text-xs text-gray-400 mb-1">{displayName}</div>
                              <div className="text-lg font-bold text-white">{formatNumber(amount)}</div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 보조재료 실제 가치 분석 */}
                {craftsmanshipAnalysis && (
                  <div className="bg-gray-800 rounded-lg border border-orange-700/50 p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">💰</span>
                      보조재료 실제 가치 분석
                    </h2>
                    
                    {/* 야금술/재봉술 */}
                    <div className="mb-6">
                      <div className="text-sm font-semibold text-orange-400 mb-3">{craftsmanshipAnalysis.craftsmanshipItemName}</div>
                      <div className={`grid grid-cols-1 ${(activeSubTab === '상재3' || activeSubTab === '상재4') ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                        {/* 상재1, 2: 선조턴 기준 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.ancestorOnlyCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미투입 vs 선조턴만</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-purple-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.ancestorOnlyCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재1, 2: 일반턴 기준 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.normalTurnCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-cyan-400 mb-2">일반턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 선조만 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-cyan-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재1, 2: 전체 턴 평균 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.allTurnsAverageCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-green-400 mb-2">전체 턴 평균</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-green-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 강화선조턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">강화선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 강화선조턴만</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-purple-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.enhancedAncestorTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 선조턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.ancestorTurnCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-blue-400 mb-2">선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 강화선조만 vs 강화선조+선조</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-blue-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.ancestorTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 일반턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.normalTurnCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-cyan-400 mb-2">일반턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 강화선조+선조 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                      </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-cyan-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.normalTurnCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 전체 턴 평균 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.allTurnsAverageCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-green-400 mb-2">전체 턴 평균</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.craftsmanshipMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-green-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.allTurnsAverageCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 숨결 */}
                    <div>
                      <div className="text-sm font-semibold text-orange-400 mb-3">{craftsmanshipAnalysis.breathItemName}</div>
                      <div className={`grid grid-cols-1 ${(activeSubTab === '상재3' || activeSubTab === '상재4') ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                        {/* 상재1, 2: 선조턴 기준 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.ancestorOnlyBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미투입 vs 선조턴만</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-purple-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.ancestorOnlyBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재1, 2: 일반턴 기준 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.normalTurnBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-cyan-400 mb-2">일반턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 선조만 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-cyan-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재1, 2: 전체 턴 평균 */}
                        {(activeSubTab === '상재1' || activeSubTab === '상재2') && craftsmanshipAnalysis.allTurnsAverageBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-green-400 mb-2">전체 턴 평균</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-green-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 강화선조턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">강화선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 강화선조턴만</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-purple-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.enhancedAncestorTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 선조턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.ancestorTurnBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-blue-400 mb-2">선조턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 강화선조만 vs 강화선조+선조</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-blue-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.ancestorTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 일반턴 기준 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.normalTurnBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-cyan-400 mb-2">일반턴 기준</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 강화선조+선조 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                      </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-cyan-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.normalTurnBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.normalTurnBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 상재3, 4: 전체 턴 평균 */}
                        {(activeSubTab === '상재3' || activeSubTab === '상재4') && craftsmanshipAnalysis.allTurnsAverageBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-green-400 mb-2">전체 턴 평균</div>
                            <div className="text-xs text-gray-400 mb-2">비교: 미반영 vs 모든 턴</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-300">1개당 거래소 가격</span>
                                <span className="text-white font-medium">
                                  {formatNumber(craftsmanshipAnalysis.breathMarketPrice)} 골드
                                </span>
                              </div>
                              <div className="pt-2 mt-2 border-t border-gray-700 flex justify-between items-center">
                                <span className="text-green-300 font-semibold">실제 가치</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.allTurnsAverageBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
                                <div className="text-xs text-green-400 mt-1">✓ 투입 시 이득</div>
                              ) : (
                                <div className="text-xs text-red-400 mt-1">✗ 투입 시 손해</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="text-sm text-gray-400 text-center leading-relaxed">
                        각 턴 타입별로 보조재료를 추가 투입했을 때의 순수 가치를 측정한 것입니다.
                        <br />
                        두 케이스의 보조재료 투입 수량 차이를 통해 1개당 실제 가치를 산출합니다.
                        <br />
                        (실제 재련은 위쪽의 최적 시뮬레이션 결과대로 하시는 걸 추천합니다)
                      </div>
                    </div>
                  </div>
                )}

                {/* 보조재료 미투입/전부투입 (2개 단으로) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {noAuxResult && noAuxCostBreakdown && (
                    <SimulationCard
                      title="보조재료 미투입 시 예상 비용"
                      icon="🚫"
                      result={noAuxResult}
                      materials={currentMaterials}
                      color="red"
                      costBreakdown={noAuxCostBreakdown}
                    />
                  )}

                  {fullAuxResult && fullAuxCostBreakdown && (
                    <SimulationCard
                      title="보조재료 전부 투입 시 예상 비용"
                      icon="💎"
                      result={fullAuxResult}
                      materials={currentMaterials}
                      color="blue"
                      costBreakdown={fullAuxCostBreakdown}
                    />
                  )}
                </div>

                {/* 모든 시나리오 확인 버튼 */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      setShowAllScenarios(!showAllScenarios);
                    }}
                    className="px-8 py-4 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700"
                  >
                    {showAllScenarios ? '모든 시나리오 숨기기' : '모든 시나리오 확인'}
                  </button>
                </div>

                {/* 모든 시나리오 표 */}
                {showAllScenarios && (
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">📋</span>
                      모든 시나리오 비교 ({allScenariosResults.length}가지)
                    </h2>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="px-3 py-2 text-left text-gray-300">일반턴</th>
                              <th className="px-3 py-2 text-left text-gray-300">선조턴</th>
                              {(activeSubTab === '상재3' || activeSubTab === '상재4') && (
                                <th className="px-3 py-2 text-left text-gray-300">강화선조턴</th>
                              )}
                              <th className="px-3 py-2 text-right text-gray-300">기대 횟수</th>
                              <th className="px-3 py-2 text-right text-gray-300">일반턴</th>
                              <th className="px-3 py-2 text-right text-gray-300">선조턴</th>
                              {(activeSubTab === '상재3' || activeSubTab === '상재4') && (
                                <th className="px-3 py-2 text-right text-gray-300">강화선조턴</th>
                              )}
                              <th className="px-3 py-2 text-right text-gray-300">무료턴</th>
                              <th className="px-3 py-2 text-right text-yellow-400 font-bold">총 비용</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allScenariosResults
                              .sort((a, b) => a.costBreakdown.totalCost - b.costBreakdown.totalCost)
                              .map((scenario, index) => {
                                const formatDecimal = (num: number) => num.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                const formatNumber = (num: number) => Math.round(num).toLocaleString();
                                const isOptimal = optimalStrategy && 
                                  optimalStrategy.normalTurn.useBreath === scenario.strategy.normalTurn.useBreath &&
                                  optimalStrategy.normalTurn.useCraftsmanship === scenario.strategy.normalTurn.useCraftsmanship &&
                                  optimalStrategy.ancestorTurn.useBreath === scenario.strategy.ancestorTurn.useBreath &&
                                  optimalStrategy.ancestorTurn.useCraftsmanship === scenario.strategy.ancestorTurn.useCraftsmanship &&
                                  (!optimalStrategy.enhancedAncestorTurn || !scenario.strategy.enhancedAncestorTurn || 
                                    (optimalStrategy.enhancedAncestorTurn.useBreath === scenario.strategy.enhancedAncestorTurn.useBreath &&
                                     optimalStrategy.enhancedAncestorTurn.useCraftsmanship === scenario.strategy.enhancedAncestorTurn.useCraftsmanship));

                                return (
                                  <tr 
                                    key={index} 
                                    className={`border-b border-gray-800/50 hover:bg-gray-900/50 ${isOptimal ? 'bg-green-900/20' : ''}`}
                                  >
                                    <td className="px-3 py-2 text-gray-300">
                                      숨결: {scenario.strategy.normalTurn.useBreath ? '✓' : '✗'}<br />
                                      야금술: {scenario.strategy.normalTurn.useCraftsmanship ? '✓' : '✗'}
                                    </td>
                                    <td className="px-3 py-2 text-gray-300">
                                      숨결: {scenario.strategy.ancestorTurn.useBreath ? '✓' : '✗'}<br />
                                      야금술: {scenario.strategy.ancestorTurn.useCraftsmanship ? '✓' : '✗'}
                                    </td>
                                    {(activeSubTab === '상재3' || activeSubTab === '상재4') && (
                                      <td className="px-3 py-2 text-gray-300">
                                        {scenario.strategy.enhancedAncestorTurn ? (
                                          <>
                                            숨결: {scenario.strategy.enhancedAncestorTurn.useBreath ? '✓' : '✗'}<br />
                                            야금술: {scenario.strategy.enhancedAncestorTurn.useCraftsmanship ? '✓' : '✗'}
                                          </>
                                        ) : '-'}
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right text-white">{formatDecimal(scenario.result.expectedAttempts)}</td>
                                    <td className="px-3 py-2 text-right text-white">{formatDecimal(scenario.result.normalTurns)}</td>
                                    <td className="px-3 py-2 text-right text-purple-400">{formatDecimal(scenario.result.ancestorTurns)}</td>
                                    {(activeSubTab === '상재3' || activeSubTab === '상재4') && (
                                      <td className="px-3 py-2 text-right text-orange-400">
                                        {scenario.result.enhancedAncestorTurns !== undefined ? formatDecimal(scenario.result.enhancedAncestorTurns) : '-'}
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right text-yellow-400">{formatDecimal(scenario.result.freeTurns)}</td>
                                    <td className="px-3 py-2 text-right text-yellow-400 font-bold">
                                      {formatNumber(scenario.costBreakdown.totalCost)} 골드
                                      {isOptimal && <span className="ml-2 text-green-400">(최적)</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 시뮬레이션 카드 컴포넌트
function SimulationCard({
  title,
  icon,
  result,
  materials,
  color,
  costBreakdown,
}: {
  title: string;
  icon: string;
  result: SimulationResult;
  materials: RefiningMaterial[];
  color: 'red' | 'blue' | 'green';
  costBreakdown: {
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    freeTurnTotal: number;
  };
}) {
  const colorClasses = {
    red: 'bg-gray-800 border-red-700/50',
    blue: 'bg-gray-800 border-blue-700/50',
    green: 'bg-gray-800 border-green-700/50',
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg border p-6`}>
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        {title}
      </h2>
      <SimulationStats result={result} color={color} costBreakdown={costBreakdown} />
    </div>
  );
}

// 시뮬레이션 통계 컴포넌트
function SimulationStats({ 
  result, 
  color,
  costBreakdown = null,
}: { 
  result: SimulationResult; 
  color: 'red' | 'blue' | 'green';
  costBreakdown?: {
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    enhancedAncestorTurnCost?: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    enhancedAncestorTurnTotal?: number;
    freeTurnTotal: number;
  } | null;
}) {
  const formatNumber = (num: number) => Math.round(num).toLocaleString();
  const formatDecimal = (num: number) => num.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatDecimalNumber = (num: number) => Math.round(num).toLocaleString();
  
  const colorClasses = {
    red: 'text-red-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
  };

  return (
    <div>
      <div className={`grid gap-4 mb-4 ${result.enhancedAncestorTurns !== undefined ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">기대 횟수</div>
          <div className={`text-2xl font-bold ${colorClasses[color]}`}>
            {formatDecimal(result.expectedAttempts)}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">일반 턴</div>
          <div className="text-2xl font-bold text-white">{formatDecimal(result.normalTurns)}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">선조 턴</div>
          <div className="text-2xl font-bold text-purple-400">{formatDecimal(result.ancestorTurns)}</div>
        </div>
        {result.enhancedAncestorTurns !== undefined && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">강화 선조 턴</div>
            <div className="text-2xl font-bold text-orange-400">{formatDecimal(result.enhancedAncestorTurns)}</div>
          </div>
        )}
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">무료 턴</div>
          <div className="text-2xl font-bold text-yellow-400">{formatDecimal(result.freeTurns)}</div>
        </div>
      </div>
      {costBreakdown && costBreakdown.totalCost > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-yellow-700/50">
          <div className="text-sm text-yellow-300 mb-3 font-semibold">예상 총 비용</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">일반턴 비용 × 일반턴 횟수</span>
              <span className="text-white font-medium">
                {formatDecimalNumber(costBreakdown.normalTurnCost)} × {formatDecimal(result.normalTurns)} = {formatDecimalNumber(costBreakdown.normalTurnTotal)} 골드
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300">선조턴 비용 × 선조턴 횟수</span>
              <span className="text-white font-medium">
                {formatDecimalNumber(costBreakdown.ancestorTurnCost)} × {formatDecimal(result.ancestorTurns)} = {formatDecimalNumber(costBreakdown.ancestorTurnTotal)} 골드
              </span>
            </div>
            {costBreakdown.enhancedAncestorTurnCost !== undefined && costBreakdown.enhancedAncestorTurnTotal !== undefined && result.enhancedAncestorTurns !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-gray-300">강화선조턴 비용 × 강화선조턴 횟수</span>
                <span className="text-white font-medium">
                  {formatDecimalNumber(costBreakdown.enhancedAncestorTurnCost)} × {formatDecimal(result.enhancedAncestorTurns)} = {formatDecimalNumber(costBreakdown.enhancedAncestorTurnTotal)} 골드
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-300">무료턴 비용 × 무료턴 횟수</span>
              <span className="text-white font-medium">
                {formatDecimalNumber(costBreakdown.freeTurnCost)} × {formatDecimal(result.freeTurns)} = {formatDecimalNumber(costBreakdown.freeTurnTotal)} 골드
              </span>
            </div>
            <div className="pt-2 mt-2 border-t border-yellow-700/50 flex justify-between items-center">
              <span className="text-yellow-300 font-semibold">합계</span>
              <span className="text-2xl font-bold text-yellow-400">
                {formatDecimalNumber(costBreakdown.totalCost)} 골드
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

