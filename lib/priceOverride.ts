/**
 * 클라이언트에서 전역 상태를 확인하여 가격을 조정하는 헬퍼 함수
 * 클라이언트 컴포넌트에서만 사용 가능합니다.
 */

export function getPriceOverrideState(): {
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
} | null {
  // 서버 사이드에서는 null 반환 (클라이언트에서만 사용)
  if (typeof window === 'undefined') return null;
  
  try {
    const saved = localStorage.getItem('priceOverrideState');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return null;
}

/**
 * 아이템 이름에 따라 가격을 조정합니다.
 * 클라이언트 컴포넌트에서만 사용 가능합니다.
 */
export function applyPriceOverride(itemName: string, originalPrice: number | null): number | null {
  if (typeof window === 'undefined' || originalPrice == null || originalPrice === 0) {
    return originalPrice;
  }

  const state = getPriceOverrideState();
  if (!state) return originalPrice;

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

  // 카드경험치 미반영
  if (state.ignoreCardExp) {
    if (
      itemName === '메넬리크의 서' ||
      itemName === '태초의 조각' ||
      itemName === '영겁의 정수' ||
      itemName === '영혼의 잎사귀'
    ) {
      return 0;
    }
  }

  // 카드 세트 졸업
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

  // 97돌 오우너
  if (state.has97Stone) {
    if (itemName === '어빌리티 스톤 키트') {
      return 0;
    }
  }

  // 풀유각 오우너 (유물 각인서 43종)
  if (state.hasFullRelicEngraving) {
    if (itemName.includes('유물 각인서') || itemName.includes('각인서')) {
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

  // 융화 재료 미반영 (아비도스 융화 재료, 상급 아비도스 융화 재료)
  if (state.ignoreFusionMaterial) {
    if (
      itemName === '아비도스 융화 재료' ||
      itemName === '상급 아비도스 융화 재료'
    ) {
      return 0;
    }
  }

  // 숨결 미반영 (용암의 숨결, 빙하의 숨결)
  if (state.ignoreBreath) {
    if (
      itemName === '용암의 숨결' ||
      itemName === '빙하의 숨결'
    ) {
      return 0;
    }
  }

  // 하위단계 야금/재봉 미반영
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

  return originalPrice;
}

/**
 * 유물 각인서 평균 가격을 조정합니다.
 */
export function applyRelicEngravingAverageOverride(originalPrice: number | null): number | null {
  if (typeof window === 'undefined' || originalPrice == null || originalPrice === 0) {
    return originalPrice;
  }

  const state = getPriceOverrideState();
  if (!state) return originalPrice;

  if (state.hasFullRelicEngraving) {
    return 0;
  }

  return originalPrice;
}
