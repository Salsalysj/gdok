'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // 로컬 스토리지에서 초기 상태 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebarOpen');
      if (saved !== null) {
        setIsOpen(saved === 'true');
      }
    } catch {}
  }, []);

  // 상태 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    try {
      localStorage.setItem('sidebarOpen', isOpen.toString());
    } catch {}
  }, [isOpen]);

  const toggle = () => setIsOpen(prev => !prev);
  const close = () => setIsOpen(false);
  const open = () => setIsOpen(true);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, open }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}


