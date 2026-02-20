'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFavorites } from '../contexts/FavoritesContext';

export default function LeftSidebarPlaceholder() {
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(true);
  const { favorites, isLoaded, reorderFavorites, removeFavorite } = useFavorites();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <img src="/page_logo_white.png" alt="" className="h-8 w-auto object-contain flex-shrink-0" />
          <span className="text-xl md:text-2xl font-bold text-white">
            껨산기
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline">
            by 스누껨독
          </span>
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <nav className="space-y-2">
          <Link
            href="/updates"
            className="block px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded"
          >
            업데이트 내역
          </Link>
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

          {/* 즐겨찾기 섹션 */}
          <div className="pt-2">
            <button
              onClick={() => setIsFavoritesOpen(!isFavoritesOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded"
            >
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4 text-yellow-400"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>즐겨찾기</span>
                {isLoaded && favorites.length > 0 && (
                  <span className="text-xs text-gray-500">({favorites.length})</span>
                )}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-4 h-4 transition-transform ${isFavoritesOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* 즐겨찾기 목록 */}
            {isFavoritesOpen && (
              <div className="mt-1 ml-3 space-y-1">
                {isLoaded && favorites.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    즐겨찾기한 페이지가 없습니다
                  </div>
                ) : (
                  favorites.map((favorite, index) => (
                    <div
                      key={favorite.url}
                      draggable
                      onDragStart={(e) => {
                        setDraggedIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/html', '');
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverIndex(index);
                      }}
                      onDragLeave={() => {
                        setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedIndex !== null && draggedIndex !== index) {
                          reorderFavorites(draggedIndex, index);
                        }
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={`
                        group relative flex items-center gap-2
                        ${draggedIndex === index ? 'opacity-50' : ''}
                        ${dragOverIndex === index ? 'border-t-2 border-blue-500' : ''}
                      `}
                    >
                      <div 
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                        style={{ cursor: 'grab' }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.cursor = 'grabbing';
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.cursor = 'grab';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.cursor = 'grab';
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          {/* 가로줄 4개 - 더 명확하게 */}
                          <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
                          <rect x="2" y="6.5" width="12" height="1.5" rx="0.75" />
                          <rect x="2" y="10" width="12" height="1.5" rx="0.75" />
                          <rect x="2" y="13.5" width="12" height="1.5" rx="0.75" />
                        </svg>
                      </div>
                      <Link
                        href={favorite.url}
                        className="flex-1 block px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded truncate"
                        title={favorite.title}
                        onClick={(e) => {
                          // 드래그 중일 때는 링크 클릭 방지
                          if (draggedIndex !== null) {
                            e.preventDefault();
                          }
                        }}
                      >
                        {favorite.title}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          removeFavorite(favorite.url);
                        }}
                        className="flex-shrink-0 p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded opacity-60 hover:opacity-100 transition-opacity"
                        title="즐겨찾기에서 제거"
                        aria-label="즐겨찾기에서 제거"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto flex items-center justify-center min-h-0">
          <div className="text-gray-400 text-sm">광고주를 위한 공간 (많관부)</div>
      </div>
      {/* 하단 광고 영역 (남는 공간) */}
      {/* <div className="mt-auto flex-shrink-0 p-3 pt-2 border-t border-gray-800 flex justify-center items-center min-h-[80px]">
        <img src="/adraising.png" alt="ad" className="w-full h-auto object-contain" />
      </div> */}
    </div>
  );
}

