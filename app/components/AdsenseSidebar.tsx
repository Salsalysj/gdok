'use client';

import { useEffect } from 'react';

let hasPushed = false;

export default function AdsenseSidebar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pushAd = () => {
      if (hasPushed) return;
      try {
        const w = window as unknown as { adsbygoogle?: unknown[] };
        (w.adsbygoogle = w.adsbygoogle || []).push({});
        hasPushed = true;
      } catch {
        // AdSense 로드 실패 시 무시
      }
    };

    // 스크립트 로드 후 push: load 이벤트 또는 지연 폴백
    const script = document.querySelector('script[src*="adsbygoogle"]');
    if (script) {
      script.addEventListener('load', pushAd);
    }
    const timer = setTimeout(pushAd, 500);

    return () => {
      script?.removeEventListener('load', pushAd);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: '100%', minHeight: 250 }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-8290185223283573"
        data-ad-slot="2344044261"
        data-ad-format="rectangle"
        data-full-width-responsive="false"
      //  data-adtest="on"  // 테스트 모드 비활성화
      />
    </div>
  );
}
