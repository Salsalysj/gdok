'use client';

import { useEffect } from 'react';

let homeBannerPushed = false;

export default function AdsenseHomeBanner() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pushAd = () => {
      if (homeBannerPushed) return;
      try {
        const w = window as unknown as { adsbygoogle?: unknown[] };
        (w.adsbygoogle = w.adsbygoogle || []).push({});
        homeBannerPushed = true;
      } catch {
        // AdSense 로드 실패 시 무시
      }
    };

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
    <div className="flex justify-center overflow-x-auto">
      <ins
        className="adsbygoogle"
        style={{ display: 'inline-block', width: 728, height: 90 }}
        data-ad-client="ca-pub-8290185223283573"
        data-ad-slot="2207101442"
      />
    </div>
  );
}
