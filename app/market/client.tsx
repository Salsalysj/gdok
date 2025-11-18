'use client';

import { useState, useMemo, useEffect } from 'react';
import MarketTableServer from './table';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';

type ItemDetail = {
  Id?: number;
  Name?: string;
  displayName: string;
  Icon?: string;
  source?: string;
  tier?: string;
  grade?: string;
  YDayAvgPrice?: number;
  RecentPrice?: number;
  CurrentMinPrice?: number;
  Stats?: any[];
};

function formatPrice(n?: number): string {
  if (!n || n === 0) return '-';
  return formatNumberWithSignificantDigits(n);
}

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
};

export default function MarketPageClient({
  tier4Items,
  tier3Items,
  gemItems,
  relicEngravingItems,
  otherItems,
  etcListItems = [],
  crystalGoldRate = null,
}: {
  tier4Items: ItemDetail[];
  tier3Items: ItemDetail[];
  gemItems: ItemDetail[];
  relicEngravingItems: ItemDetail[];
  otherItems: ItemDetail[];
  etcListItems?: EtcListItem[];
  crystalGoldRate?: number | null;
}) {
  const [activeTab, setActiveTab] = useState<'tier4' | 'tier3' | 'gem' | 'relicEngraving' | 'other'>('tier4');
  const [lightMode, setLightMode] = useState<boolean>(false);

  // 디코기준 스위치 동기화 (lightMode가 true = 디코기준 ON)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) {
        setLightMode(saved === '1');
      }
    } catch {}
    
    const handleThemeChange = (e: CustomEvent<{ light: boolean }>) => {
      setLightMode(e.detail.light);
    };
    
    window.addEventListener('theme-change', handleThemeChange as EventListener);
    return () => {
      window.removeEventListener('theme-change', handleThemeChange as EventListener);
    };
  }, []);

  // 디스코드 환율 정보 가져오기
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  useEffect(() => {
    async function fetchDiscordRate() {
      try {
        const res = await fetch('/api/admin/crystal-gold');
        const data = await res.json();
        const rates = data.exchangeRates || [];
        if (rates.length > 0) {
          const latest = rates[rates.length - 1];
          setDiscordRate(latest.discord || null);
        }
      } catch (error) {
        console.error('디스코드 환율 조회 실패:', error);
      }
    }
    fetchDiscordRate();
  }, []);

  // 골드→현금 환산 비율 계산
  // lightMode가 false (!lightMode = 디코기준 ON) → 디코기준 환산, true (디코기준 OFF) → 화폐거래소 환산
  const goldToCashPerGold = useMemo(() => {
    if (!lightMode) {
      // 어두움(디코기준 ON): 100골드 = n원이므로, 1골드 = n / 100원
      if (discordRate && discordRate > 0) return discordRate / 100;
      return null;
    } else {
      // 밝음(디코기준 OFF): 1골드 = 2750 / (100크리당 골드)원
      if (crystalGoldRate && crystalGoldRate > 0) return 2750 / crystalGoldRate;
      return null;
    }
  }, [lightMode, discordRate, crystalGoldRate]);
  
  // 유물 각인서는 가격 기준 내림차순 정렬 (가격 변경 시 자동 업데이트)
  const sortedRelicEngravings = useMemo(() => {
    return [...relicEngravingItems].sort((a, b) => {
      const priceA = a.CurrentMinPrice || 0;
      const priceB = b.CurrentMinPrice || 0;
      return priceB - priceA; // 내림차순
    });
  }, [relicEngravingItems]);
  
  const currentItems = 
    activeTab === 'tier4' ? tier4Items : 
    activeTab === 'tier3' ? tier3Items : 
    activeTab === 'gem' ? gemItems : 
    activeTab === 'relicEngraving' ? sortedRelicEngravings :
    otherItems;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">주요 아이템 시세</h1>
          <p className="text-sm md:text-base text-gray-400">거래소 주요 품목의 현재 시세와 최근 추이를 확인하세요.</p>
        </div>


        {/* 티어별 탭 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveTab('tier4')}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base rounded-lg font-semibold transition-all ${
              activeTab === 'tier4'
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden sm:inline">티어4 ({tier4Items.length}개)</span>
            <span className="sm:hidden">T4</span>
          </button>
          <button
            onClick={() => setActiveTab('tier3')}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base rounded-lg font-semibold transition-all ${
              activeTab === 'tier3'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden sm:inline">티어3 ({tier3Items.length}개)</span>
            <span className="sm:hidden">T3</span>
          </button>
          <button
            onClick={() => setActiveTab('gem')}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base rounded-lg font-semibold transition-all ${
              activeTab === 'gem'
                ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden sm:inline">보석 ({gemItems.length}개)</span>
            <span className="sm:hidden">보석</span>
          </button>
          <button
            onClick={() => setActiveTab('relicEngraving')}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base rounded-lg font-semibold transition-all ${
              activeTab === 'relicEngraving'
                ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden md:inline">유물 각인서 ({relicEngravingItems.length}개)</span>
            <span className="md:hidden">각인</span>
          </button>
          <button
            onClick={() => setActiveTab('other')}
            className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base rounded-lg font-semibold transition-all ${
              activeTab === 'other'
                ? 'bg-gradient-to-r from-gray-600 to-gray-700 text-white shadow-lg'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span className="hidden sm:inline">기타 ({(etcListItems && etcListItems.length) || 0}개)</span>
            <span className="sm:hidden">기타</span>
          </button>
        </div>

        {activeTab === 'other' && etcListItems && etcListItems.length > 0 ? (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-900/50 border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">아이템명</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">크리스탈</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">골드</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">현금 (원)</th>
                </tr>
              </thead>
              <tbody>
                {etcListItems.map((item, idx) => {
                  // 아이템 이름 매핑
                  const itemNameMap: { [key: string]: string } = {
                    '전영팩': '전설~영웅 카드팩',
                    '전희팩': '전설~희귀 카드팩',
                    '전고팩': '전설~고급 카드팩',
                    '전체팩': '전체 카드팩',
                  };
                  const displayName = itemNameMap[item.itemName] || item.itemName;

                  // 특정 아이템별 노란색 표시 규칙
                  const goldOnlyItems = [
                    '정련된 혼돈의 돌(방어구)',
                    '정련된 혼돈의(방어구)',
                    '정련된 혼돈의 돌(무기)',
                    '정련된 혼돈의(무기)',
                    '방어구 초월 복원권',
                    '무기 초월 복원권',
                  ];
                  const cashOnlyItems = [
                    '메넬리크의 서',
                    '태초의 조각',
                    '영겁의 정수',
                    '영혼의 잎사귀',
                  ];

                  const isGoldOnlyItem = goldOnlyItems.includes(item.itemName);
                  const isCashOnlyItem = cashOnlyItems.includes(item.itemName);

                  // 원본 데이터 추적 (CSV에서 읽은 값)
                  const hasOriginalCash = item.cash !== null;
                  const hasOriginalGold = item.gold !== null;
                  const hasOriginalCrystal = item.crystal !== null;

                  // 노란색 표시 결정: CSV에 있는 원본 값만 노란색으로 표시
                  let isOriginalCrystal = false;
                  let isOriginalGold = false;
                  let isOriginalCash = false;

                  if (isGoldOnlyItem) {
                    // 골드만 노란색 (CSV에 골드가 원본으로 있으면)
                    isOriginalGold = hasOriginalGold;
                  } else if (isCashOnlyItem) {
                    // 현금만 노란색 (CSV에 현금이 원본으로 있으면)
                    isOriginalCash = hasOriginalCash;
                  } else {
                    // 나머지는 크리스탈만 노란색 (CSV에 크리스탈이 원본으로 있으면)
                    isOriginalCrystal = hasOriginalCrystal;
                  }

                  // 1) 골드→현금 (현금이 비어있으면 채움)
                  let finalCash = item.cash;
                  if (finalCash === null) {
                    // 우선 골드로 환산 후 적용
                    let baseGold: number | null = item.gold;
                    // 골드가 없고 크리스탈만 있으면 크리스탈→골드 환산
                    if (baseGold === null && item.crystal !== null && crystalGoldRate && crystalGoldRate > 0) {
                      baseGold = (item.crystal * crystalGoldRate) / 100;
                    }
                    if (baseGold !== null && goldToCashPerGold !== null) {
                      finalCash = baseGold * goldToCashPerGold;
                    }
                  }

                  // 2) 크리스탈 표시값: 비어있으면 골드→크리스탈 역환산해 채움
                  let finalCrystal: number | null = item.crystal;
                  if (finalCrystal === null && item.gold !== null && crystalGoldRate && crystalGoldRate > 0) {
                    finalCrystal = (item.gold / crystalGoldRate) * 100;
                  }

                  // 3) 골드 표시값: 비어있으면 현금→골드 역환산해 채움
                  let finalGold: number | null = item.gold;
                  if (finalGold === null && finalCash !== null && goldToCashPerGold !== null && goldToCashPerGold > 0) {
                    finalGold = finalCash / goldToCashPerGold;
                  }

                  return (
                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-white">{displayName}</td>
                      <td className={`px-4 py-3 text-right ${isOriginalCrystal ? 'text-yellow-400 font-semibold' : 'text-gray-300'}`}>
                        {finalCrystal !== null ? formatNumberWithSignificantDigits(finalCrystal) : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right ${isOriginalGold ? 'text-yellow-400 font-semibold' : 'text-gray-300'}`}>
                        {finalGold !== null ? formatNumberWithSignificantDigits(finalGold) : '-'}
                      </td>
                      <td className={`px-4 py-3 text-right ${isOriginalCash ? 'text-yellow-400 font-semibold' : 'text-gray-300'}`}>
                        {finalCash !== null ? formatNumberWithSignificantDigits(finalCash) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <MarketTableServer items={currentItems} />
        )}
      </div>
    </div>
  );
}

