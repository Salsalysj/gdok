/**
 * 유효숫자 규칙에 따라 숫자 포맷팅
 * - 100 이상: 소수점 생략 (정수)
 * - 1~99: 소수점 첫째자리까지
 * - 1 미만: 유효숫자 2개까지
 */
export function formatNumberWithSignificantDigits(num: number | null | undefined): string {
  if (typeof num !== 'number' || Number.isNaN(num)) return '-';
  
  const absNum = Math.abs(num);
  
  // 100 이상: 소수점 생략 (정수)
  if (absNum >= 100) {
    const rounded = Math.round(num);
    return rounded.toLocaleString('ko-KR');
  }
  
  // 1~99: 소수점 첫째자리까지
  if (absNum >= 1) {
    const fixed = num.toFixed(1);
    // 천 단위 구분 추가
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  
  // 1 미만: 유효숫자 2개까지 (toPrecision 사용)
  if (absNum === 0) {
    return '0';
  }
  
  // toPrecision(2)를 사용하여 유효숫자 2개로 반올림
  const precision = parseFloat(num.toPrecision(2));
  return precision.toString();
}

