'use client';

/** 골드 단위 표기: 데스크탑 '골드', 모바일 'G' */
export default function GoldUnit({ className }: { className?: string }) {
  return (
    <>
      <span className={`hidden md:inline ${className ?? ''}`}>골드</span>
      <span className={`md:hidden ${className ?? ''}`}>G</span>
    </>
  );
}
