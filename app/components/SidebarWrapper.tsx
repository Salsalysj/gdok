'use client';

import { useSidebar } from '../contexts/SidebarContext';
import ValueDBSidebar from './ValueDBSidebar';

export default function SidebarWrapper() {
  const { isOpen, close } = useSidebar();

  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 배경 (모바일만) */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={close}
      />
      {/* 사이드바 */}
      <div className="fixed right-0 top-16 bottom-20 w-96 z-50 lg:top-16 lg:bottom-auto lg:h-[calc(100vh-4rem-5rem)] shadow-xl lg:right-4">
        <ValueDBSidebar />
      </div>
    </>
  );
}

