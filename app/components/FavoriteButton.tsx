'use client';

import { useFavorites } from '../contexts/FavoritesContext';
import { usePathname } from 'next/navigation';

interface FavoriteButtonProps {
  title: string;
}

export default function FavoriteButton({ title }: FavoriteButtonProps) {
  const pathname = usePathname();
  const { isFavorite, toggleFavorite, isLoaded } = useFavorites();

  if (!isLoaded) {
    return null;
  }

  const favorite = isFavorite(pathname);

  return (
    <button
      onClick={() => toggleFavorite(title, pathname)}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
        transition-colors duration-200
        ${
          favorite
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
            : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
        }
      `}
      title={favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={favorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
    </button>
  );
}
