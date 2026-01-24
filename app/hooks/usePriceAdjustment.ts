'use client';

import { useMemo } from 'react';
import { usePriceOverride } from '../contexts/PriceOverrideContext';

/**
 * 클라이언트 컴포넌트에서 가격을 조정하는 훅
 */
export function usePriceAdjustment() {
  const { state } = usePriceOverride();

  const adjustPrice = useMemo(() => {
    return (itemName: string, originalPrice: number | null): number | null => {
      // 97돌 오우너 (originalPrice가 null이어도 아이템 이름으로 확인) - 가장 먼저 체크
      if (state.has97Stone) {
        if (itemName === '어빌리티 스톤 키트' || itemName === '어빌리티 스톤 키트 (지옥)') {
          return 0;
        }
      }

      // 카드경험치 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreCardExp) {
        if (
          itemName === '메넬리크의 서' ||
          itemName === '태초의 조각' ||
          itemName === '영겁의 정수' ||
          itemName === '영혼의 잎사귀' ||
          itemName === '카드 경험치' ||
          itemName === '카드경험치 1당'
        ) {
          return 0;
        }
      }

      // 카드 세트 졸업 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.cardSetGraduated) {
        if (
          itemName === '전설 카드팩 (확률)' ||
          itemName === '전설~고급 카드팩' ||
          itemName === '전설~영웅 카드팩' ||
          itemName === '전설~희귀 카드팩' ||
          itemName === '전체 카드팩' ||
          itemName === '전설 카드 선택팩'
        ) {
          return 0;
        }
      }

      // 풀유각 오우너 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.hasFullRelicEngraving) {
        if (itemName.includes('유물 각인서') || itemName.includes('각인서')) {
          return 0;
        }
      }

      // 실링 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreSilver) {
        if (itemName === '실링') {
          return 0;
        }
      }

      // 융화 재료 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreFusionMaterial) {
        if (
          itemName === '아비도스 융화 재료' ||
          itemName === '상급 아비도스 융화 재료'
        ) {
          return 0;
        }
      }

      // 숨결 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreBreath) {
        if (
          itemName === '용암의 숨결' ||
          itemName === '빙하의 숨결'
        ) {
          return 0;
        }
      }

      // 하위단계 야금/재봉 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreLowTierCrafting) {
        if (
          itemName === '야금술 : 업화 [11-14]' ||
          itemName === '재봉술 : 업화 [11-14]' ||
          itemName === '야금술 : 업화 [15-18]' ||
          itemName === '재봉술 : 업화 [15-18]' ||
          itemName === '장인의 야금술 : 1단계' ||
          itemName === '장인의 야금술 : 2단계' ||
          itemName === '장인의 재봉술 : 1단계' ||
          itemName === '장인의 재봉술 : 2단계'
        ) {
          return 0;
        }
      }

      // 젬 미반영 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.ignoreGem) {
        if (
          itemName === '고급 젬' ||
          itemName === '희귀 젬' ||
          itemName === '영웅 젬' ||
          itemName === '고급~영웅 젬 상자' ||
          itemName === '고급~영웅 젬 랜덤 상자' ||
          itemName === '희귀~영웅 젬 상자' ||
          itemName === '희귀~영웅 젬 랜덤 상자' ||
          itemName.startsWith('희귀 젬 선택 상자') ||
          itemName.startsWith('영웅 젬 선택 상자') ||
          itemName.startsWith('희귀 질서의 젬 선택 상자') ||
          itemName.startsWith('희귀 혼돈의 젬 선택 상자') ||
          itemName === '젬 가공 초기화권' ||
          itemName.startsWith('질서의 젬 : ') ||
          itemName.startsWith('혼돈의 젬 : ')
        ) {
          return 0;
        }
      }

      if (originalPrice == null || originalPrice === 0) {
        return originalPrice;
      }

      // 돌파석 미반영 (운명의 돌파석, 찬란한 명예의 돌파석, 위대한 운명의 돌파석)
      if (state.ignoreBreakthroughStone) {
        if (
          itemName === '운명의 돌파석' ||
          itemName === '찬란한 명예의 돌파석' ||
          itemName === '위대한 운명의 돌파석'
        ) {
          return 0;
        }
      }

      // 파편 미반영
      if (state.ignoreFragment) {
        if (
          itemName === '운명의 파편' ||
          itemName === '명예의 파편' ||
          itemName.includes('파편')
        ) {
          return 0;
        }
      }

      // 파괴석/수호석 미반영
      if (state.ignoreDestructionGuardStone) {
        if (
          itemName === '운명의 파괴석' ||
          itemName === '운명의 수호석' ||
          itemName === '운명의 파괴석 결정' ||
          itemName === '운명의 수호석 결정'
        ) {
          return 0;
        }
      }

      return originalPrice;
    };
  }, [state.has97Stone, state.ignoreCardExp, state.hasFullRelicEngraving, state.ignoreBreakthroughStone, state.ignoreFragment, state.cardSetGraduated, state.ignoreSilver, state.ignoreDestructionGuardStone, state.ignoreFusionMaterial, state.ignoreBreath, state.ignoreLowTierCrafting, state.ignoreGem]);

  const adjustRelicEngravingAverage = useMemo(() => {
    return (originalPrice: number | null): number | null => {
      if (originalPrice == null || originalPrice === 0) {
        return originalPrice;
      }

      if (state.hasFullRelicEngraving) {
        return 0;
      }

      return originalPrice;
    };
  }, [state.hasFullRelicEngraving]);

  return { adjustPrice, adjustRelicEngravingAverage };
}

