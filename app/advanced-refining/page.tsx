export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '상급 재련 - 껨산기',
  description: '로스트아크 상급 재련 효율을 계산하고 최적의 재련 전략을 제시합니다.',
};

import { Suspense } from 'react';
import AdvancedRefiningClient from './client';
import { getValueDbData } from '@/lib/valueDb';

export default async function AdvancedRefiningPage() {
  const valueDbData = await getValueDbData();
  const valueDbMap = valueDbData.entryMap;

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 p-8">
        <div>
          <div className="text-center py-12">
            <div className="text-white">로딩 중...</div>
          </div>
        </div>
      </div>
    }>
      <AdvancedRefiningClient valueDbMap={valueDbMap} />
    </Suspense>
  );
}

