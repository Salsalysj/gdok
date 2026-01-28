'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Favorite {
  title: string;
  url: string;
  addedAt: number;
}

const FAVORITES_KEY = 'gcalc_favorites';

interface FavoritesContextType {
  favorites: Favorite[];
  isLoaded: boolean;
  addFavorite: (title: string, url: string) => void;
  removeFavorite: (url: string) => void;
  isFavorite: (url: string) => boolean;
  toggleFavorite: (title: string, url: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 로컬스토리지에서 즐겨찾기 불러오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (error) {
      console.error('즐겨찾기 로드 실패:', error);
    }
    setIsLoaded(true);
  }, []);

  // 로컬스토리지 변경 감지 (다른 탭에서 변경된 경우)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === FAVORITES_KEY && e.newValue) {
        try {
          setFavorites(JSON.parse(e.newValue));
        } catch (error) {
          console.error('즐겨찾기 동기화 실패:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 즐겨찾기 저장
  const saveFavorites = (newFavorites: Favorite[]) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('즐겨찾기 저장 실패:', error);
    }
  };

  // 즐겨찾기 추가
  const addFavorite = (title: string, url: string) => {
    const newFavorite: Favorite = {
      title,
      url,
      addedAt: Date.now(),
    };
    const newFavorites = [...favorites, newFavorite];
    saveFavorites(newFavorites);
  };

  // 즐겨찾기 제거
  const removeFavorite = (url: string) => {
    const newFavorites = favorites.filter((fav) => fav.url !== url);
    saveFavorites(newFavorites);
  };

  // 즐겨찾기 여부 확인
  const isFavorite = (url: string) => {
    return favorites.some((fav) => fav.url === url);
  };

  // 즐겨찾기 토글
  const toggleFavorite = (title: string, url: string) => {
    if (isFavorite(url)) {
      removeFavorite(url);
    } else {
      addFavorite(title, url);
    }
  };

  // 즐겨찾기 순서 변경
  const reorderFavorites = (fromIndex: number, toIndex: number) => {
    const newFavorites = [...favorites];
    const [moved] = newFavorites.splice(fromIndex, 1);
    newFavorites.splice(toIndex, 0, moved);
    saveFavorites(newFavorites);
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isLoaded,
        addFavorite,
        removeFavorite,
        isFavorite,
        toggleFavorite,
        reorderFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
