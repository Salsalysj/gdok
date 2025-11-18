'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // 홈 페이지 접속 시 컨텐츠 보상으로 리다이렉트
    router.push('/content-rewards');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-blue-500 mb-4"></div>
        <p className="text-gray-400">컨텐츠 보상으로 이동 중...</p>
      </div>
    </div>
  );
}
