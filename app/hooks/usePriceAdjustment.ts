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

      // 풀유각 오우너 (originalPrice가 null이어도 아이템 이름으로 확인)
      if (state.hasFullRelicEngraving) {
        if (itemName.includes('유물 각인서') || itemName.includes('각인서')) {
          return 0;
        }
      }

      if (originalPrice == null || originalPrice === 0) {
        return originalPrice;
      }

      // 돌파석 미반영 (운명의 돌파석, 찬란한 명예의 돌파석만)
      if (state.ignoreBreakthroughStone) {
        if (
          itemName === '운명의 돌파석' ||
          itemName === '찬란한 명예의 돌파석'
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

      return originalPrice;
    };
  }, [state.has97Stone, state.ignoreCardExp, state.hasFullRelicEngraving, state.ignoreBreakthroughStone, state.ignoreFragment]);

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

