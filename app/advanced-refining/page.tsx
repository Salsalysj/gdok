export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import AdvancedRefiningClient from './client';
import { getValueDbData } from '@/lib/valueDb';

export default async function AdvancedRefiningPage() {
  const valueDbData = await getValueDbData();
  const valueDbMap = valueDbData.entryMap;

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
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

