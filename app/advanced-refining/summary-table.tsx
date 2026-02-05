'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  type GearType,
  type RefiningLevel,
  getMaterialsForLevel,
  findOptimalStrategyFromResults,
  type ScenarioWithCost,
  type SimulationResult,
} from '@/lib/advancedRefining';
import type { ValueDbEntry } from '@/lib/valueDb';
import simulationDataLevel1 from '@/lib/advancedRefiningData.json';
import simulationDataLevel2 from '@/lib/advancedRefiningData-level2.json';
import simulationDataLevel3 from '@/lib/advancedRefiningData-level3.json';
import simulationDataLevel4 from '@/lib/advancedRefiningData-level4.json';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import ItemIcon from '../components/ItemIcon';

interface SummaryTableProps {
  valueDbMap: Record<string, ValueDbEntry>;
  silverCashValue?: number | null;
  initialRates?: { exchange: number | null; discord: number | null };
  initialCrystalGoldRate?: number | null;
}

type SummaryRow = {
  gearType: GearType;
  level: '상재1' | '상재2' | '상재3' | '상재4';
  normalTurn: { breath: boolean; craft: boolean };
  ancestorTurn: { breath: boolean; craft: boolean };
  enhancedAncestorTurn?: { breath: boolean; craft: boolean };
  totalCost: number;
};

export default function SummaryTable({ valueDbMap, silverCashValue = null, initialRates, initialCrystalGoldRate }: SummaryTableProps) {
  console.log('[상급 재련 요약표] 초기화:', { silverCashValue, initialRates, initialCrystalGoldRate });
  
  const { adjustPrice } = usePriceAdjustment();

  // 디코기준 스위치 상태 및 환율 정보
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(initialRates?.discord ?? null);
  const [crystalGoldRate, setCrystalGoldRate] = useState<number | null>(initialCrystalGoldRate ?? null);

  // 디코기준 스위치 상태 동기화
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) {
        setLightMode(saved === '1');
      }
    } catch {}
    
    const handleThemeChange = (e: CustomEvent<{ light: boolean }>) => {
      setLightMode(e.detail.light);
    };
    
    window.addEventListener('theme-change', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('theme-change', handleThemeChange as EventListener);
    };
  }, []);

  // 환율 정보 업데이트 (서버에서 초기값을 받았지만, 클라이언트에서도 주기적으로 업데이트 가능)
  useEffect(() => {
    async function fetchRates() {
      try {
        // 디스코드 환율 (서버에서 받지 못한 경우에만)
        if (!discordRate) {
          const discordRes = await fetch('/api/admin/crystal-gold');
          const discordData = await discordRes.json();
          const rates = discordData.exchangeRates || [];
          if (rates.length > 0) {
            const latest = rates[rates.length - 1];
            const rate = latest.discord || null;
            console.log('[상급 재련 요약표] 디스코드 환율 (클라이언트):', rate);
            setDiscordRate(rate);
          }
        }
        
        // 크리스탈-골드 환율 (서버에서 받지 못한 경우에만)
        if (!crystalGoldRate) {
          const crystalRes = await fetch('/api/crystal-gold');
          const crystalData = await crystalRes.json();
          if (crystalData.rate) {
            console.log('[상급 재련 요약표] 크리스탈-골드 환율 (클라이언트):', crystalData.rate);
            setCrystalGoldRate(crystalData.rate);
          }
        }
      } catch (error) {
        console.error('[상급 재련 요약표] 환율 정보 조회 실패:', error);
      }
    }
    fetchRates();
  }, [discordRate, crystalGoldRate]);

  // 현금(원) 1원당 골드 계산
  const goldPerWon = useMemo(() => {
    // 디코기준 스위치가 켜져있으면 (lightMode가 false이면 디코기준 ON)
    if (!lightMode && discordRate && discordRate > 0) {
      // 디스코드 환율 = 100 : n
      // 1원당 골드 = 100 / n
      return 100 / discordRate;
    }
    
    // 디코기준 스위치가 꺼져있으면 크리스탈 환율 사용
    if (crystalGoldRate && crystalGoldRate > 0) {
      // 크리스탈 1개당 골드 = crystalGoldRate / 100 (100크리당 골드를 1크리당으로)
      // 2750원 = 100크리
      // 1원 = 100/2750 크리
      // 1원당 골드 = (100/2750) * (crystalGoldRate/100)
      return (crystalGoldRate / 2750);
    }
    return null;
  }, [lightMode, discordRate, crystalGoldRate]);

  // 실링 1개당 골드 가치 계산 (가격 조정 적용 전)
  const baseSillingUnitPrice = useMemo(() => {
    if (silverCashValue != null && goldPerWon != null) {
      const result = silverCashValue * goldPerWon;
      console.log('[상급 재련 요약표] 실링 1개당 골드 가치 (기본):', result);
      return result;
    }
    console.log('[상급 재련 요약표] 실링 가치 계산 실패 - 기본값 0 반환');
    return 0; // 기본값
  }, [silverCashValue, goldPerWon, lightMode, discordRate, crystalGoldRate]);

  // 실링 1개당 골드 가치 계산 (가격 조정 적용)
  const sillingUnitPrice = useMemo(() => {
    const adjusted = adjustPrice('실링', baseSillingUnitPrice);
    console.log('[상급 재련 요약표] 실링 1개당 골드 가치 (조정 후):', adjusted);
    return adjusted ?? 0;
  }, [baseSillingUnitPrice, adjustPrice]);

  // 재료 가치 계산 함수
  const getMaterialValue = useCallback(
    (itemName: string): number | null => {
      if (itemName === '골드') {
        return 1;
      }
      if (itemName === '실링') {
        console.log('[상급 재련 요약표] getMaterialValue 실링 호출, 반환값:', sillingUnitPrice);
        return sillingUnitPrice;
      }

      let basePrice: number | null = null;

      if (itemName === '운명의 파편') {
        const entry = valueDbMap['운명의 파편 1개당'];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          basePrice = entry.unitValue;
        }
      } else {
        const entry = valueDbMap[itemName];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          basePrice = entry.unitValue;
        }
      }

      if (basePrice != null) {
        return adjustPrice(itemName, basePrice);
      }

      return null;
    },
    [valueDbMap, adjustPrice, sillingUnitPrice]
  );

  // 보조재료 비용 계산
  const calculateAuxiliaryCost = useCallback(
    (currentMaterials: any[], materialValues: Record<string, { unitPrice: number | null; totalValue: number | null }>, useBreath: boolean, useCraftsmanship: boolean): number => {
      return currentMaterials
        .filter(m => m.isOptional)
        .reduce((sum, mat) => {
          if (mat.name.includes('숨결') && !useBreath) return sum;
          if ((mat.name.includes('야금술') || mat.name.includes('재봉술')) && !useCraftsmanship) return sum;
          const value = materialValues[mat.name]?.totalValue;
          return sum + (value != null ? value : 0);
        }, 0);
    },
    []
  );

  // 총 비용 계산
  const calculateTotalCost = useCallback(
    (
      result: SimulationResult,
      currentMaterials: any[],
      materialValues: Record<string, { unitPrice: number | null; totalValue: number | null }>,
      requiredMaterialsTotal: number,
      useBreathNormal: boolean,
      useCraftsmanshipNormal: boolean,
      useBreathAncestor: boolean,
      useCraftsmanshipAncestor: boolean,
      useBreathEnhancedAncestor?: boolean,
      useCraftsmanshipEnhancedAncestor?: boolean
    ) => {
      const normalTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(currentMaterials, materialValues, useBreathNormal, useCraftsmanshipNormal);
      const ancestorTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(currentMaterials, materialValues, useBreathAncestor, useCraftsmanshipAncestor);
      const freeTurnCost = calculateAuxiliaryCost(currentMaterials, materialValues, useBreathNormal, useCraftsmanshipNormal);

      const normalTurnTotal = result.normalTurns * normalTurnCost;
      const ancestorTurnTotal = result.ancestorTurns * ancestorTurnCost;
      const freeTurnTotal = result.freeTurns * freeTurnCost;

      let enhancedAncestorTurnCost: number | undefined;
      let enhancedAncestorTurnTotal: number | undefined;
      if (result.enhancedAncestorTurns !== undefined && useBreathEnhancedAncestor !== undefined && useCraftsmanshipEnhancedAncestor !== undefined) {
        enhancedAncestorTurnCost = requiredMaterialsTotal + calculateAuxiliaryCost(currentMaterials, materialValues, useBreathEnhancedAncestor, useCraftsmanshipEnhancedAncestor);
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
    },
    [calculateAuxiliaryCost]
  );

  const summaryData = useMemo(() => {
    const rows: SummaryRow[] = [];
    const levels: Array<{ key: '상재1' | '상재2' | '상재3' | '상재4'; data: any }> = [
      { key: '상재1', data: simulationDataLevel1 },
      { key: '상재2', data: simulationDataLevel2 },
      { key: '상재3', data: simulationDataLevel3 },
      { key: '상재4', data: simulationDataLevel4 },
    ];

    for (const levelInfo of levels) {
      const { key: level, data: simulationData } = levelInfo;
      const isLevel3Or4 = level === '상재3' || level === '상재4';

      for (const gearType of ['무기', '방어구'] as GearType[]) {
        // 해당 레벨과 gearType의 재료 정보 가져오기
        const currentMaterials = getMaterialsForLevel(level as RefiningLevel, gearType);

        // 재료별 가치 계산
        const materialValues: Record<string, { unitPrice: number | null; totalValue: number | null }> = {};
        currentMaterials.forEach((mat) => {
          const unitPrice = getMaterialValue(mat.name);
          materialValues[mat.name] = {
            unitPrice,
            totalValue: unitPrice != null ? unitPrice * mat.amount : null,
          };
        });

        // 필수 재료 가치 합계 계산
        const requiredMaterialsTotal = currentMaterials
          .filter(m => !m.isOptional)
          .reduce((sum, mat) => {
            const value = materialValues[mat.name]?.totalValue;
            return sum + (value != null ? value : 0);
          }, 0);

        // 데이터 필터링
        const filteredData = simulationData.data.filter((item: any) => item.gearType === gearType);

        // 모든 시나리오에 대해 비용 계산
        const allResults: ScenarioWithCost[] = filteredData.map((item: any) => {
          const strategy = {
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
          };

          const result: SimulationResult = {
            expectedAttempts: item.result.expectedAttempts,
            normalTurns: item.result.normalTurns,
            ancestorTurns: item.result.ancestorTurns,
            ...(isLevel3Or4 && { enhancedAncestorTurns: item.result.enhancedAncestorTurns || 0 }),
            freeTurns: item.result.freeTurns,
            totalCost: 0,
            materialBreakdown: item.result.materialBreakdown,
          };

          const costBreakdown = calculateTotalCost(
            result,
            currentMaterials,
            materialValues,
            requiredMaterialsTotal,
            strategy.normalTurn.useBreath,
            strategy.normalTurn.useCraftsmanship,
            strategy.ancestorTurn.useBreath,
            strategy.ancestorTurn.useCraftsmanship,
            strategy.enhancedAncestorTurn?.useBreath,
            strategy.enhancedAncestorTurn?.useCraftsmanship
          );

          return {
            strategy,
            result,
            costBreakdown,
          };
        });

        // 최적 시나리오 찾기
        const optimal = findOptimalStrategyFromResults(allResults, {
          excludeCraftsmanship: false,
        });

        if (optimal) {
          rows.push({
            gearType,
            level,
            normalTurn: {
              breath: optimal.strategy.normalTurn.useBreath,
              craft: optimal.strategy.normalTurn.useCraftsmanship,
            },
            ancestorTurn: {
              breath: optimal.strategy.ancestorTurn.useBreath,
              craft: optimal.strategy.ancestorTurn.useCraftsmanship,
            },
            ...(isLevel3Or4 && {
              enhancedAncestorTurn: {
                breath: optimal.strategy.enhancedAncestorTurn?.useBreath || false,
                craft: optimal.strategy.enhancedAncestorTurn?.useCraftsmanship || false,
              },
            }),
            totalCost: optimal.costBreakdown.totalCost,
          });
        }
      }
    }

    return rows;
  }, [valueDbMap, getMaterialValue, calculateAuxiliaryCost, calculateTotalCost]);

  const formatNumber = (num: number) => Math.round(num).toLocaleString();

  // 행별 보조재료 이름 (숨결, 야금술/재봉술) — 아이콘 표시용
  const getOptionalMaterialNames = useCallback((level: RefiningLevel, gearType: GearType) => {
    const materials = getMaterialsForLevel(level, gearType);
    const optional = materials.filter((m: { isOptional?: boolean }) => m.isOptional);
    const breathMat = optional.find((m: { name: string }) => m.name.includes('숨결'));
    const craftMat = optional.find((m: { name: string }) => m.name.includes('야금술') || m.name.includes('재봉술'));
    return { breathName: breathMat?.name ?? null, craftName: craftMat?.name ?? null };
  }, []);

  // 턴별로 O(투입 이득)인 아이템 아이콘만 표시
  const TurnIcons = ({
    breath,
    craft,
    level,
    gearType,
  }: {
    breath: boolean;
    craft: boolean;
    level: RefiningLevel;
    gearType: GearType;
  }) => {
    const { breathName, craftName } = getOptionalMaterialNames(level, gearType);
    const show = (breath && breathName) || (craft && craftName);
    if (!show) return <span className="text-gray-500">-</span>;
    return (
      <div className="flex items-center gap-1.5">
        {breath && breathName && (
          <span title={breathName}>
            <ItemIcon name={breathName} size="sm" className="flex-shrink-0" />
          </span>
        )}
        {craft && craftName && (
          <span title={craftName}>
            <ItemIcon name={craftName} size="sm" className="flex-shrink-0" />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 overflow-x-auto">
      <h2 className="text-2xl font-bold text-white mb-6">최적 시나리오 요약표</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-3 px-4 text-gray-300 font-semibold">구분</th>
            <th className="text-left py-3 px-4 text-gray-300 font-semibold">단계</th>
            <th className="text-left py-3 px-4 text-gray-300 font-semibold">일반턴</th>
            <th className="text-left py-3 px-4 text-gray-300 font-semibold">선조턴</th>
            <th className="text-left py-3 px-4 text-gray-300 font-semibold">강화선조턴</th>
            <th className="text-right py-3 px-4 text-gray-300 font-semibold">총비용</th>
          </tr>
        </thead>
        <tbody>
          {summaryData.map((row, index) => (
            <tr
              key={`${row.gearType}-${row.level}`}
              className={`border-b border-gray-700/50 ${
                index % 2 === 0 ? 'bg-gray-800/30' : 'bg-gray-800/10'
              }`}
            >
              <td className="py-3 px-4 text-white font-medium">{row.gearType}</td>
              <td className="py-3 px-4 text-gray-300">{row.level}</td>
              <td className="py-3 px-4 text-gray-400 text-sm">
                <TurnIcons
                  breath={row.normalTurn.breath}
                  craft={row.normalTurn.craft}
                  level={row.level}
                  gearType={row.gearType}
                />
              </td>
              <td className="py-3 px-4 text-gray-400 text-sm">
                <TurnIcons
                  breath={row.ancestorTurn.breath}
                  craft={row.ancestorTurn.craft}
                  level={row.level}
                  gearType={row.gearType}
                />
              </td>
              <td className="py-3 px-4 text-gray-400 text-sm">
                {row.enhancedAncestorTurn ? (
                  <TurnIcons
                    breath={row.enhancedAncestorTurn.breath}
                    craft={row.enhancedAncestorTurn.craft}
                    level={row.level}
                    gearType={row.gearType}
                  />
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </td>
              <td className="py-3 px-4 text-right text-white font-semibold">
                {formatNumber(row.totalCost)} 골드
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

