'use client';

import { useState, useEffect } from 'react';

const SCROLL_THRESHOLD = 400;

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > SCROLL_THRESHOLD);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isMobile || !visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="맨 위로"
      className="fixed bottom-6 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gray-700/90 text-white shadow-lg ring-1 ring-gray-600 hover:bg-gray-600 active:scale-95 transition-all md:hidden"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="M11.47 4.72a.75.75 0 011.06 0l7.5 7.5a.75.75 0 11-1.06 1.06L12 6.31l-6.97 6.97a.75.75 0 01-1.06-1.06l7.5-7.5z" clipRule="evenodd" />
      </svg>
    </button>
  );
}
