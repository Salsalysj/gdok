'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getMaterialsForLevel,
  type GearType,
  type RefiningLevel,
  type RefiningMaterial,
  type SimulationResult,
  type OptimalStrategy,
} from '@/lib/advancedRefining';
import type { ValueDbEntry } from '@/lib/valueDb';
import simulationData from '@/lib/advancedRefiningData.json';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';

type SubTab = '상재1' | '상재2' | '상재3' | '상재4';
type SubSubTab = '무기' | '방어구';

export default function AdvancedRefiningClient({
  valueDbMap = {},
}: {
  valueDbMap?: Record<string, ValueDbEntry>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
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

  // URL 쿼리 파라미터에서 초기값 읽기
  useEffect(() => {
    const tabFromUrl = searchParams?.get('tab') as SubTab | null;
    const subTabFromUrl = searchParams?.get('subtab') as SubSubTab | null;
    
    if (tabFromUrl && ['상재1', '상재2', '상재3', '상재4'].includes(tabFromUrl)) {
      setActiveSubTab(tabFromUrl);
    }
    
    if (subTabFromUrl && ['무기', '방어구'].includes(subTabFromUrl)) {
      setActiveSubSubTab(subTabFromUrl);
    }
  }, [searchParams]);

  const subTabs: { key: SubTab; label: string; range: string }[] = [
    { key: '상재1', label: '상재1', range: '0~10단계' },
    { key: '상재2', label: '상재2', range: '11~20단계' },
    { key: '상재3', label: '상재3', range: '21~30단계' },
    { key: '상재4', label: '상재4', range: '31~40단계' },
  ];

  const subSubTabs: SubSubTab[] = ['무기', '방어구'];

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab);
    router.push(`/advanced-refining?tab=${tab}&subtab=${activeSubSubTab}`);
  };

  const handleSubSubTabChange = (subTab: SubSubTab) => {
    setActiveSubSubTab(subTab);
    router.push(`/advanced-refining?tab=${activeSubTab}&subtab=${subTab}`);
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
    breathItemName: string;
    breathMarketPrice: number;
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
  } | null>(null);

  // 하드코딩된 시뮬레이션 데이터에서 결과 가져오기 (상재1~4 모두 동일한 시뮬레이션 결과 사용)
  const simulationResults = useMemo(() => {
    if (activeSubTab !== '상재1' && activeSubTab !== '상재2' && activeSubTab !== '상재3' && activeSubTab !== '상재4') {
      return null;
    }

    const gearType: GearType = activeSubSubTab;
    
    // 하드코딩된 데이터에서 해당 gearType의 결과만 필터링
    const filteredData = (simulationData as {
      iterations: number;
      generatedAt: string;
      data: Array<{
        gearType: GearType;
        strategy: {
          normalBreath: boolean;
          normalCraft: boolean;
          ancestorBreath: boolean;
          ancestorCraft: boolean;
        };
        result: {
          expectedAttempts: number;
          normalTurns: number;
          ancestorTurns: number;
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
      },
      result: {
        expectedAttempts: item.result.expectedAttempts,
        normalTurns: item.result.normalTurns,
        ancestorTurns: item.result.ancestorTurns,
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
      
      // 실링은 골드로 환산 (1 실링 = 0.01 골드, 가격 조정 불필요)
      if (itemName === '실링') {
        return 0.01;
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
  const calculateAuxiliaryCost = (useBreath: boolean, useCraftsmanship: boolean): number => {
    return currentMaterials
      .filter(m => m.isOptional)
      .reduce((sum, mat) => {
        if (mat.name.includes('숨결') && !useBreath) return sum;
        if ((mat.name.includes('야금술') || mat.name.includes('재봉술')) && !useCraftsmanship) return sum;
        const value = materialValues[mat.name]?.totalValue;
        return sum + (value != null ? value : 0);
      }, 0);
  };

  // 시뮬레이션 결과에 총 비용 계산 (상세 정보 포함)
  const calculateTotalCost = (
    result: SimulationResult,
    useBreathNormal: boolean,
    useCraftsmanshipNormal: boolean,
    useBreathAncestor: boolean,
    useCraftsmanshipAncestor: boolean
  ): {
    totalCost: number;
    normalTurnCost: number;
    ancestorTurnCost: number;
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
    freeTurnTotal: number;
  } => {
    const normalTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(useBreathNormal, useCraftsmanshipNormal);
    const ancestorTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(useBreathAncestor, useCraftsmanshipAncestor);
    const freeTurnCost = calculateAuxiliaryCost(useBreathNormal, useCraftsmanshipNormal); // 무료턴은 필수 재료 비용 0
    
    const normalTurnTotal = result.normalTurns * normalTurnCost;
    const ancestorTurnTotal = result.ancestorTurns * ancestorTurnCost;
    const freeTurnTotal = result.freeTurns * freeTurnCost;
    
    return {
      totalCost: normalTurnTotal + ancestorTurnTotal + freeTurnTotal,
      normalTurnCost,
      ancestorTurnCost,
      freeTurnCost,
      normalTurnTotal,
      ancestorTurnTotal,
      freeTurnTotal,
    };
  };

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
        simResult.strategy.ancestorTurn.useCraftsmanship
      );
      return {
        ...simResult,
        costBreakdown,
      };
    });

    // 최적 전략 찾기 (총 비용이 가장 낮은 것)
    // 상재3, 상재4의 경우 야금술/재봉술이 투입되지 않은 시나리오만 고려
    let candidatesForOptimal = allResults;
    if (activeSubTab === '상재3' || activeSubTab === '상재4') {
      candidatesForOptimal = allResults.filter(
        (r) => !r.strategy.normalTurn.useCraftsmanship && !r.strategy.ancestorTurn.useCraftsmanship
      );
    }
    
    const optimal = candidatesForOptimal.reduce((best, current) => {
      return current.costBreakdown.totalCost < best.costBreakdown.totalCost ? current : best;
    }, candidatesForOptimal[0]);

    // 보조재료 미투입 시나리오 찾기 (일반턴/선조턴 모두 미투입)
    const noAux = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship
    );

    // 보조재료 전부투입 시나리오 찾기 (일반턴/선조턴 모두 투입)
    const fullAux = allResults.find(
      (r) => 
        r.strategy.normalTurn.useBreath && 
        r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship
    );

    // 선조턴에만 야금술/재봉술 투입 시나리오 찾기
    const ancestorOnlyCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship
    );

    // 일반턴과 선조턴 모두에 야금술/재봉술 투입 시나리오 찾기
    const bothTurnsCraft = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        r.strategy.normalTurn.useCraftsmanship &&
        !r.strategy.ancestorTurn.useBreath && 
        r.strategy.ancestorTurn.useCraftsmanship
    );

    // 선조턴에만 숨결 투입 시나리오 찾기
    const ancestorOnlyBreath = allResults.find(
      (r) => 
        !r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship
    );

    // 일반턴과 선조턴 모두에 숨결 투입 시나리오 찾기
    const bothTurnsBreath = allResults.find(
      (r) => 
        r.strategy.normalTurn.useBreath && 
        !r.strategy.normalTurn.useCraftsmanship &&
        r.strategy.ancestorTurn.useBreath && 
        !r.strategy.ancestorTurn.useCraftsmanship
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
    
    let ancestorOnlyCraftAnalysis = null;
    let bothTurnsCraftAnalysis = null;
    
    // 선조턴에만 야금술/재봉술 투입 시 실제 가치
    if (noAux && ancestorOnlyCraft) {
      const additionalValue = noAux.costBreakdown.totalCost - ancestorOnlyCraft.costBreakdown.totalCost;
      const craftsmanshipAmount = ancestorOnlyCraft.result.materialBreakdown[craftsmanshipItemName] || 0;
      const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
      const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
      
      ancestorOnlyCraftAnalysis = {
        additionalValue,
        craftsmanshipAmount,
        craftsmanshipUnitValue,
        craftsmanshipRealValue,
      };
    }
    
    // 일반턴+선조턴 모두 야금술/재봉술 투입 시 실제 가치
    if (noAux && bothTurnsCraft) {
      const additionalValue = noAux.costBreakdown.totalCost - bothTurnsCraft.costBreakdown.totalCost;
      const craftsmanshipAmount = bothTurnsCraft.result.materialBreakdown[craftsmanshipItemName] || 0;
      const craftsmanshipUnitValue = craftsmanshipAmount > 0 ? additionalValue / craftsmanshipAmount : 0;
      const craftsmanshipRealValue = craftsmanshipUnitValue + craftsmanshipMarketPrice;
      
      bothTurnsCraftAnalysis = {
        additionalValue,
        craftsmanshipAmount,
        craftsmanshipUnitValue,
        craftsmanshipRealValue,
      };
    }
    
    // 숨결 실제 가치 계산
    const breathItemName = activeSubSubTab === '무기' ? '용암의 숨결' : '빙하의 숨결';
    const breathMarketPrice = getMaterialValue(breathItemName) || 0;
    
    let ancestorOnlyBreathAnalysis = null;
    let bothTurnsBreathAnalysis = null;
    
    // 선조턴에만 숨결 투입 시 실제 가치
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
    
    // 일반턴+선조턴 모두 숨결 투입 시 실제 가치
    if (noAux && bothTurnsBreath) {
      const additionalValue = noAux.costBreakdown.totalCost - bothTurnsBreath.costBreakdown.totalCost;
      const breathAmount = bothTurnsBreath.result.materialBreakdown[breathItemName] || 0;
      const breathUnitValue = breathAmount > 0 ? additionalValue / breathAmount : 0;
      const breathRealValue = breathUnitValue + breathMarketPrice;
      
      bothTurnsBreathAnalysis = {
        additionalValue,
        breathAmount,
        breathUnitValue,
        breathRealValue,
      };
    }
    
    if (ancestorOnlyCraftAnalysis || bothTurnsCraftAnalysis || ancestorOnlyBreathAnalysis || bothTurnsBreathAnalysis) {
      setCraftsmanshipAnalysis({
        craftsmanshipItemName,
        craftsmanshipMarketPrice,
        ancestorOnlyCraftAnalysis,
        bothTurnsCraftAnalysis,
        breathItemName,
        breathMarketPrice,
        ancestorOnlyBreathAnalysis,
        bothTurnsBreathAnalysis,
      });
    } else {
      setCraftsmanshipAnalysis(null);
    }
  }, [simulationResults, valueDbMap, activeSubSubTab, materialValues, getMaterialValue, priceOverrideState, calculateTotalCost, activeSubTab, currentMaterials]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 lg:p-8">
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
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeSubTab === tab.key
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab.label} ({tab.range})
            </button>
          ))}
        </div>

        {/* 서브서브탭 */}
        <div className="flex gap-2 mb-6">
          {subSubTabs.map((subTab) => (
            <button
              key={subTab}
              onClick={() => handleSubSubTabChange(subTab)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeSubSubTab === subTab
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {subTab}
            </button>
          ))}
        </div>

        {/* 내용 영역 */}
        {(activeSubTab !== '상재1' && activeSubTab !== '상재2' && activeSubTab !== '상재3' && activeSubTab !== '상재4') ? (
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
            <div className="bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-xl border border-gray-700 p-6 shadow-lg">
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
                  <div className="bg-gradient-to-br from-green-900/30 to-gray-800/50 rounded-xl border border-green-700/50 p-6 shadow-lg">
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
                    </div>
                    <SimulationStats 
                      result={optimalResult} 
                      color="green"
                      costBreakdown={optimalStrategy ? calculateTotalCost(
                        optimalResult,
                        optimalStrategy.normalTurn.useBreath,
                        optimalStrategy.normalTurn.useCraftsmanship,
                        optimalStrategy.ancestorTurn.useBreath,
                        optimalStrategy.ancestorTurn.useCraftsmanship
                      ) : null}
                    />
                  </div>
                )}

                {/* 최적 방식 재료 소모량 */}
                {optimalResult && (
                  <div className="bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-xl border border-gray-700 p-6 shadow-lg">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">📊</span>
                      최적 방식 총 재료 소모량
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Object.entries(optimalResult.materialBreakdown)
                        .filter(([_, amount]) => amount > 0)
                        .map(([name, amount]) => (
                          <div key={name} className="bg-gray-900/50 rounded-lg p-3">
                            <div className="text-xs text-gray-400 mb-1">{name}</div>
                            <div className="text-lg font-bold text-white">{formatNumber(amount)}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 보조재료 실제 가치 분석 */}
                {craftsmanshipAnalysis && (
                  <div className="bg-gradient-to-br from-orange-900/30 to-gray-800/50 rounded-xl border border-orange-700/50 p-6 shadow-lg">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">💰</span>
                      보조재료 실제 가치 분석
                    </h2>
                    
                    {/* 야금술/재봉술 */}
                    <div className="mb-6">
                      <div className="text-sm font-semibold text-orange-400 mb-3">{craftsmanshipAnalysis.craftsmanshipItemName}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 선조턴 기준 실제 가치 */}
                        {craftsmanshipAnalysis.ancestorOnlyCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">선조턴 기준</div>
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
                        
                        {/* 일반턴+선조턴 평균 실제 가치 */}
                        {craftsmanshipAnalysis.bothTurnsCraftAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-blue-400 mb-2">일반턴+선조턴 평균</div>
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
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.bothTurnsCraftAnalysis.craftsmanshipRealValue >= craftsmanshipAnalysis.craftsmanshipMarketPrice ? (
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 선조턴 기준 실제 가치 */}
                        {craftsmanshipAnalysis.ancestorOnlyBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-purple-400 mb-2">선조턴 기준</div>
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
                        
                        {/* 일반턴+선조턴 평균 실제 가치 */}
                        {craftsmanshipAnalysis.bothTurnsBreathAnalysis && (
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-blue-400 mb-2">일반턴+선조턴 평균</div>
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
                                  <span className={`text-lg font-bold ${craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatNumber(craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathRealValue)} 골드
                                  </span>
                                  <span className={`text-sm ${craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathUnitValue >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ({craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathUnitValue >= 0 ? '+' : ''}{formatNumber(craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathUnitValue)})
                                  </span>
                                </div>
                              </div>
                              {craftsmanshipAnalysis.bothTurnsBreathAnalysis.breathRealValue >= craftsmanshipAnalysis.breathMarketPrice ? (
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
                        해당 계산은 보조재료 한 종류만의 효과를 독립적으로 계산해본 것이며, 최적 시뮬레이션 결과와 차이가 있을 수 있습니다. 참고만 해 주세요.
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
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold rounded-lg shadow-lg hover:from-purple-700 hover:to-purple-800 transition-all"
                  >
                    {showAllScenarios ? '모든 시나리오 숨기기' : '모든 시나리오 확인'}
                  </button>
                </div>

                {/* 모든 시나리오 표 */}
                {showAllScenarios && (
                  <div className="bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-xl border border-gray-700 p-6 shadow-lg">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">📋</span>
                      모든 시나리오 비교 (16가지)
                    </h2>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="px-3 py-2 text-left text-gray-300">일반턴</th>
                              <th className="px-3 py-2 text-left text-gray-300">선조턴</th>
                              <th className="px-3 py-2 text-right text-gray-300">기대 횟수</th>
                              <th className="px-3 py-2 text-right text-gray-300">일반턴</th>
                              <th className="px-3 py-2 text-right text-gray-300">선조턴</th>
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
                                  optimalStrategy.ancestorTurn.useCraftsmanship === scenario.strategy.ancestorTurn.useCraftsmanship;

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
                                    <td className="px-3 py-2 text-right text-white">{formatDecimal(scenario.result.expectedAttempts)}</td>
                                    <td className="px-3 py-2 text-right text-white">{formatDecimal(scenario.result.normalTurns)}</td>
                                    <td className="px-3 py-2 text-right text-purple-400">{formatDecimal(scenario.result.ancestorTurns)}</td>
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
                    )}
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
    red: 'from-red-900/30 to-gray-800/50 border-red-700/50',
    blue: 'from-blue-900/30 to-gray-800/50 border-blue-700/50',
    green: 'from-green-900/30 to-gray-800/50 border-green-700/50',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl border p-6 shadow-lg`}>
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
    freeTurnCost: number;
    normalTurnTotal: number;
    ancestorTurnTotal: number;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">무료 턴</div>
          <div className="text-2xl font-bold text-yellow-400">{formatDecimal(result.freeTurns)}</div>
        </div>
      </div>
      {costBreakdown && costBreakdown.totalCost > 0 && (
        <div className="bg-gradient-to-r from-yellow-900/30 to-yellow-800/20 rounded-lg p-4 border border-yellow-700/50">
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

