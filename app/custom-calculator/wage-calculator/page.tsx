'use client';

import FavoriteButton from '../../components/FavoriteButton';

export default function WageCalculatorPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h1 className="text-3xl font-semibold">시급 계산기</h1>
          <FavoriteButton title="시급 계산기" />
        </div>
        <p className="text-gray-400">구현 예정입니다.</p>
      </div>
    </div>
  );
}
