'use client';

import { useCallback, useRef } from 'react';

/** 터치 이동 허용 거리(px). 이보다 크면 스크롤로 간주하고 툴팁을 띄우지 않음 */
const TAP_MOVE_THRESHOLD_PX = 14;
/** 터치 유지 시간(ms). 이보다 길면 롱프레스로 간주 */
const TAP_TIME_THRESHOLD_MS = 400;

/**
 * 모바일에서 스크롤/스와이프와 탭을 구분해, 탭일 때만 콜백을 실행하는 훅.
 * 터치 민감도로 인해 스크롤 중 툴팁이 뜨는 문제를 줄이기 위해 사용.
 */
export function useTapOnly() {
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent, callback: () => void) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    const isTap =
      Math.hypot(dx, dy) <= TAP_MOVE_THRESHOLD_PX && dt <= TAP_TIME_THRESHOLD_MS;
    if (isTap) {
      e.preventDefault();
      callback();
    }
  }, []);

  return { onTouchStart, onTouchEnd };
}
