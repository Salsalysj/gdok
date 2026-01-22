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
      {/* 사이드바 드로어 */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-gray-900 z-50 lg:hidden overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-white">DB / 필터</h2>
          <button
            onClick={close}
            className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded"
            aria-label="닫기"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <ValueDBSidebar />
        </div>
      </div>
    </>
  );
}

