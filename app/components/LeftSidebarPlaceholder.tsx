'use client';

import Link from 'next/link';

export default function LeftSidebarPlaceholder() {
  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl md:text-2xl font-bold text-white">
            껨산기
          </span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-300 border border-gray-700 rounded">
            오픈베타
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline">
            by 스누껨독
          </span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-2">
          <a
            href="https://www.youtube.com/channel/UCjTgPJoznJgeUta2qTI60SQ"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded"
          >
            유튜브 스누껨독
          </a>
          <a
            href="https://discord.gg/Bd7BGwsbV7"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded"
          >
            오류 / 건의사항
          </a>
        </nav>
      </div>
    </div>
  );
}

