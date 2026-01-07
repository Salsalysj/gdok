'use client';

import { useMemo, useCallback } from 'react';
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

interface SummaryTableProps {
  valueDbMap: Record<string, ValueDbEntry>;
}

type SummaryRow = {
  gearType: GearType;
  level: '상재1' | '상재2' | '상재3' | '상재4';
  normalTurn: { breath: boolean; craft: boolean };
  ancestorTurn: { breath: boolean; craft: boolean };
  enhancedAncestorTurn?: { breath: boolean; craft: boolean };
  totalCost: number;
};

export default function SummaryTable({ valueDbMap }: SummaryTableProps) {
  const { adjustPrice } = usePriceAdjustment();

  // 재료 가치 계산 함수
  const getMaterialValue = useCallback(
    (itemName: string): number | null => {
      if (itemName === '골드') {
        return 1;
      }
      if (itemName === '실링') {
        return 0;
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
    [valueDbMap, adjustPrice]
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
  const formatStrategy = (breath: boolean, craft: boolean, gearType: GearType) => {
    const breathText = breath ? '숨결O' : '숨결X';
    const craftText = craft
      ? gearType === '무기'
        ? '야금술O'
        : '재봉술O'
      : gearType === '무기'
      ? '야금술X'
      : '재봉술X';
    return `${breathText}, ${craftText}`;
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
                {formatStrategy(row.normalTurn.breath, row.normalTurn.craft, row.gearType)}
              </td>
              <td className="py-3 px-4 text-gray-400 text-sm">
                {formatStrategy(row.ancestorTurn.breath, row.ancestorTurn.craft, row.gearType)}
              </td>
              <td className="py-3 px-4 text-gray-400 text-sm">
                {row.enhancedAncestorTurn
                  ? formatStrategy(
                      row.enhancedAncestorTurn.breath,
                      row.enhancedAncestorTurn.craft,
                      row.gearType
                    )
                  : '-'}
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

