'use client';

import { useState } from 'react';
import FavoriteButton from '../../components/FavoriteButton';
import WageCalculatorClient from './WageCalculatorClient';
import type { ContentRewardsData } from './WageCalculatorClient';
import type { RaidData } from './WageCalculatorClient';
import type { ValueDbEntryMap } from './WageCalculatorClient';

export default function WageCalculatorPageContent({
  contentData,
  raidData,
  valueDbEntryMap,
  rates,
}: {
  contentData: ContentRewardsData;
  raidData: RaidData;
  valueDbEntryMap?: ValueDbEntryMap;
  rates: { exchange: number | null; discord: number | null };
}) {
  const [showTradable, setShowTradable] = useState(true);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-semibold">시급 계산기</h1>
          <FavoriteButton title="시급 계산기" />
        </div>
        <div className="inline-flex rounded-lg border border-gray-600 bg-gray-800/80 p-0.5">
          <button
            type="button"
            onClick={() => setShowTradable(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showTradable ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            거래가능
          </button>
          <button
            type="button"
            onClick={() => setShowTradable(false)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${!showTradable ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            전체(귀속포함)
          </button>
        </div>
      </div>
      <WageCalculatorClient
        contentData={contentData}
        raidData={raidData}
        valueDbEntryMap={valueDbEntryMap}
        rates={rates}
        showTradable={showTradable}
      />
    </>
  );
}
