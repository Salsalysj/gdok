'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { usePriceOverride } from '../../contexts/PriceOverrideContext';
import { useValueDb } from '../../contexts/ValueDbContext';
import FavoriteButton from '../../components/FavoriteButton';
import GoldUnit from '../../components/GoldUnit';
import ItemIcon from '../../components/ItemIcon';

type RewardData = {
  [itemName: string]: number;
};

type GateData = {
  [gateNumber: string]: {
    클리어?: RewardData;
    더보기?: RewardData;
  };
};

type DifficultyData = {
  [difficulty: string]: {
    level: string;
    gates: GateData;
  };
};

type RaidData = {
  [raidName: string]: DifficultyData;
};

type CategoryData = {
  [category: string]: RaidData;
};

type ValueDbEntryMap = Record<string, { 
  itemName: string; 
  unitType: '크리스탈' | '골드' | '현금' | null; 
  unitValue: number | null; 
  note?: string 
}>;

type RatesProps = { exchange: number | null; discord: number | null };

/** 모바일 툴팁용 lines 생성 (일반재련과 동일 형식) */
function buildRewardTooltipLines(item: { itemName: string; quantity: number; price?: number | null }): string[] {
  const q = formatNumberWithSignificantDigits(item.quantity);
  const quantityLine =
    item.itemName === '실링' ? `수량: ${q} 실링` :
    item.itemName === '카드 경험치' ? `수량: ${q}` : `수량: ${q}개`;
  const lines: string[] = [quantityLine];
  const unitPrice = item.price ?? 0;
  if (unitPrice > 0) {
    lines.push(`단가: ${formatNumberWithSignificantDigits(unitPrice)} 골드`);
    lines.push(`합계: ${formatNumberWithSignificantDigits(unitPrice * item.quantity)} 골드`);
  }
  return lines;
}

export default function RaidRewardsClient({ 
  data, 
  data1730,
  valueDbEntryMap,
  rates
}: { 
  data: CategoryData;
  data1730?: CategoryData;
  valueDbEntryMap?: ValueDbEntryMap;
  rates?: RatesProps;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const [refreshKey, setRefreshKey] = useState(0);
  /** 모바일 툴팁 (일반재련과 동일: title + lines) */
  const [itemTooltip, setItemTooltip] = useState<{ title: string; lines: string[] } | null>(null);
  
  // 세르카 장비 계승 완료 스위치 상태 (UI용으로만 사용, 실제 데이터 선택에는 사용하지 않음)
  const [isSerkaCompleted, setIsSerkaCompleted] = useState<boolean>(false);
  // 물음표 버튼 메모 표시 상태
  const [showSerkaTooltip, setShowSerkaTooltip] = useState<boolean>(false);
  
  // 항상 raid-rewards.json 데이터 사용
  const currentData = data;
  
  // adjustedEntries를 맵으로 변환
  const adjustedEntriesMap = useMemo(() => {
    const map: Record<string, ValueDbEntryMap[string]> = {};
    adjustedEntries.forEach(entry => {
      map[entry.itemName] = entry;
    });
    return map;
  }, [adjustedEntries]);

  // price-override-change 이벤트 리스너
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  const showMobileTooltip = (title: string, lines: string[]) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setItemTooltip({ title, lines });
    }
  };

  // 모바일 툴팁: 외부 터치/클릭 시 닫기, 2초 후 자동 닫기
  useEffect(() => {
    if (!itemTooltip) return;
    const close = () => setItemTooltip(null);
    const timer = setTimeout(close, 2000);
    const handleClose = () => {
      close();
      clearTimeout(timer);
    };
    document.addEventListener('touchstart', handleClose, { once: true });
    document.addEventListener('click', handleClose, { once: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', handleClose);
      document.removeEventListener('click', handleClose);
    };
  }, [itemTooltip]);

  const categories = Object.keys(currentData);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || '');
  const [activeRaid, setActiveRaid] = useState<string>('');

  // 카테고리 변경 시 레이드 초기화
  useEffect(() => {
    if (activeCategory && currentData[activeCategory]) {
      const raids = Object.keys(currentData[activeCategory]);
      setActiveRaid(raids[0] || '');
    }
  }, [activeCategory, currentData]);

  const raids = useMemo(() => {
    if (!activeCategory || !currentData[activeCategory]) return [];
    return Object.keys(currentData[activeCategory]);
  }, [currentData, activeCategory]);

  /** 모바일: 구분 없이 모든 레이드 통합 목록 { category, raid }[] */
  const allRaidsFlat = useMemo(() => {
    return categories.flatMap(cat => {
      const raidNames = currentData[cat] ? Object.keys(currentData[cat]) : [];
      return raidNames.map(raid => ({ category: cat, raid }));
    });
  }, [categories, currentData]);

  // 선택된 레이드의 모든 난이도 데이터
  const allDifficultiesData = useMemo(() => {
    if (!activeCategory || !activeRaid || !currentData[activeCategory]?.[activeRaid]) return [];
    const raidData = currentData[activeCategory][activeRaid];
    return Object.entries(raidData).map(([difficulty, diffData]) => ({
      difficulty,
      level: diffData.level || '',
      gates: diffData.gates || {}
    }));
  }, [currentData, activeCategory, activeRaid]);

  // 가격 조정 함수 - adjustedEntries 사용 (가치계산DB 사이드바와 동일한 방식)
  // 반환값: { price: number | null, method?: '거래소 기준' | '5:1 합성 기준' }
  const getAdjustedPrice = useMemo(() => {
    return (itemName: string): { price: number | null; method?: '거래소 기준' | '5:1 합성 기준' } => {
      // 골드는 1골드로 계산
      if (itemName === '골드') {
        return { price: 1 };
      }
      
      // 세르카 장비 계승 완료 시 특정 아이템들의 가격 계산 로직 적용
      if (isSerkaCompleted) {
        // 운명의 파괴석: 거래소 가격 vs '운명의 파괴석 결정'/5 중 더 낮은 단가
        if (itemName === '운명의 파괴석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          
          const crystalEntry = adjustedEntriesMap['운명의 파괴석 결정'];
          const crystalPrice = crystalEntry?.unitValue != null ? crystalEntry.unitValue / 5 : null;
          
          if (marketPrice != null && crystalPrice != null) {
            if (marketPrice <= crystalPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: crystalPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (crystalPrice != null) {
            return { price: crystalPrice, method: '5:1 합성 기준' };
          }
        }
        
        // 운명의 수호석: 거래소 가격 vs '운명의 수호석 결정'/5 중 더 낮은 단가
        if (itemName === '운명의 수호석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          
          const crystalEntry = adjustedEntriesMap['운명의 수호석 결정'];
          const crystalPrice = crystalEntry?.unitValue != null ? crystalEntry.unitValue / 5 : null;
          
          if (marketPrice != null && crystalPrice != null) {
            if (marketPrice <= crystalPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: crystalPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (crystalPrice != null) {
            return { price: crystalPrice, method: '5:1 합성 기준' };
          }
        }
        
        // 운명의 돌파석: 거래소 가격 vs '위대한 운명의 돌파석'/5 중 더 낮은 단가
        if (itemName === '운명의 돌파석') {
          const marketEntry = adjustedEntriesMap[itemName];
          const marketPrice = marketEntry?.unitValue ?? null;
          
          const greatEntry = adjustedEntriesMap['위대한 운명의 돌파석'];
          const greatPrice = greatEntry?.unitValue != null ? greatEntry.unitValue / 5 : null;
          
          if (marketPrice != null && greatPrice != null) {
            if (marketPrice <= greatPrice) {
              return { price: marketPrice, method: '거래소 기준' };
            } else {
              return { price: greatPrice, method: '5:1 합성 기준' };
            }
          } else if (marketPrice != null) {
            return { price: marketPrice, method: '거래소 기준' };
          } else if (greatPrice != null) {
            return { price: greatPrice, method: '5:1 합성 기준' };
          }
        }
        
        // 순환 돌파석: 항상 '전이 돌파석'/5 단가 사용
        if (itemName === '순환 돌파석') {
          const transferEntry = adjustedEntriesMap['전이 돌파석'];
          const transferPrice = transferEntry?.unitValue != null ? transferEntry.unitValue / 5 : null;
          
          if (transferPrice != null) {
            return { price: transferPrice, method: '5:1 합성 기준' };
          }
        }
      }
      
      // 운명의 파괴석 결정: 거래소 vs '운명의 파괴석'x5 중 더 저렴한 가격
      if (itemName === '운명의 파괴석 결정') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        
        const sourceEntry = adjustedEntriesMap['운명의 파괴석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      // 운명의 수호석 결정: 거래소 vs '운명의 수호석'x5 중 더 저렴한 가격
      if (itemName === '운명의 수호석 결정') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        
        const sourceEntry = adjustedEntriesMap['운명의 수호석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      // 위대한 운명의 돌파석: 거래소 vs '운명의 돌파석'x5 중 더 저렴한 가격
      if (itemName === '위대한 운명의 돌파석') {
        const marketEntry = adjustedEntriesMap[itemName];
        const marketPrice = marketEntry?.unitValue ?? null;
        
        const sourceEntry = adjustedEntriesMap['운명의 돌파석'];
        const synthesisPrice = sourceEntry?.unitValue != null ? sourceEntry.unitValue * 5 : null;
        
        if (marketPrice != null && synthesisPrice != null) {
          if (marketPrice <= synthesisPrice) {
            return { price: marketPrice, method: '거래소 기준' };
          } else {
            return { price: synthesisPrice, method: '5:1 합성 기준' };
          }
        } else if (marketPrice != null) {
          return { price: marketPrice, method: '거래소 기준' };
        } else if (synthesisPrice != null) {
          return { price: synthesisPrice, method: '5:1 합성 기준' };
        }
        return { price: null };
      }
      
      // adjustedEntries에서 찾기 (이미 가격 조정이 적용됨)
      const entry = adjustedEntriesMap[itemName];
      if (entry && entry.unitValue != null) {
        return { price: entry.unitValue };
      }
      
      // 운명의 파편 - "운명의 파편 1개당"으로도 찾기
      if (itemName === '운명의 파편') {
        const fragmentEntry = adjustedEntriesMap['운명의 파편 1개당'];
        if (fragmentEntry && fragmentEntry.unitValue != null) {
          return { price: fragmentEntry.unitValue };
        }
      }
      
      return { price: null };
    };
  }, [adjustedEntriesMap, refreshKey, priceOverrideState, isSerkaCompleted]);

  // 거래가능/귀속 판별
  const tradableSet = useMemo(() => new Set<string>([
    '골드',
    // 대부분의 레이드 재료는 거래가능
  ]), []);

  const getTradeClass = (itemName: string) => {
    // 골드, 비늘, 쐐기돌, 잔영 등은 거래가능
    // 파괴석, 수호석, 돌파석, 파편 등은 귀속
    const tradableKeywords = ['골드'];
    const isTradable = tradableKeywords.some(keyword => itemName.includes(keyword)) || tradableSet.has(itemName);
    
    return {
      isTradable,
      nameClass: isTradable ? 'text-green-300' : 'text-red-300',
      badgeClass: isTradable
        ? 'bg-green-900/30 text-green-300 border border-green-600'
        : 'bg-red-900/30 text-red-300 border border-red-600',
      badgeText: isTradable ? '거래가능' : '귀속',
    } as const;
  };

  const isExcludedForTotal = (name: string) => {
    if (priceOverrideState.ignoreBreakthroughStone && (name === '운명의 돌파석' || name === '위대한 운명의 돌파석')) return true;
    if (priceOverrideState.ignoreFragment && name === '운명의 파편') return true;
    if (priceOverrideState.ignoreDestructionGuardStone && (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정')) return true;
    return false;
  };

  // 디코기준 스위치 상태 동기화 (전역 테마 스위치 사용)
  const [lightMode, setLightMode] = useState<boolean>(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) setLightMode(saved === '1');
    } catch {}
    const handler = (e: any) => setLightMode(!!e?.detail?.light);
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  // 현금 환산 비율 계산
  // OFF(밝음) → 오피셜, ON(어두움) → 디코기준
  const goldToCashPerGold = useMemo(() => {
    const exchange = rates?.exchange ?? null; // 100크리당 골드
    const discord = rates?.discord ?? null;   // 100:n 에서 n
    if (!lightMode) {
      // 어두움(디코기준 ON): 100골드 = n원이므로, 1골드 = n / 100원
      if (discord && discord > 0) return discord / 100;
      return null;
    } else {
      // 밝음(디코기준 OFF): 1골드 = 2750 / (100크리당 골드)
      if (exchange && exchange > 0) return 2750 / exchange;
      return null;
    }
  }, [lightMode, rates]);

  // 합계 계산
  const calculateTotals = (rewards: RewardData) => {
    let tradable = 0;
    let total = 0;
    
    for (const [itemName, quantity] of Object.entries(rewards)) {
      if (isExcludedForTotal(itemName)) continue;
      
      const priceInfo = getAdjustedPrice(itemName);
      if (priceInfo.price !== null) {
        const amount = priceInfo.price * quantity;
        total += amount;
        
        const tradeInfo = getTradeClass(itemName);
        if (tradeInfo.isTradable) {
          tradable += amount;
        }
      }
    }
    
    return { tradable, total };
  };

  if (categories.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 p-8">
        <div>
          <div className="bg-gray-800 border border-gray-700 rounded p-6">
            <h2 className="text-2xl font-bold text-gray-300 mb-2">데이터 없음</h2>
            <p className="text-gray-400">레이드 보상 데이터가 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      {/* 모바일 전용 툴팁: 터치 시 즉시 표시 */}
      {itemTooltip && (
        <div className="fixed inset-0 z-50 md:hidden" aria-modal="true" role="dialog" aria-label="아이템 상세">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 focus:outline-none"
            onClick={() => setItemTooltip(null)}
            aria-label="툴팁 닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-xl bg-gray-800 border border-gray-700 border-b-0 shadow-2xl p-4 max-h-[60vh] overflow-y-auto">
            <h4 className="text-sm font-semibold text-white mb-2 break-keep">{itemTooltip.title}</h4>
            <ul className="space-y-1 text-xs text-gray-300">
              {itemTooltip.lines.map((line, i) => (
                <li key={i} className="break-keep">{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg"
              onClick={() => setItemTooltip(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <div>
        <div className="mb-8 md:mb-12">
          <div className="mb-3">
            <div className="flex items-center justify-start md:justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="hidden md:block text-4xl font-bold tracking-tight text-white bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  레이드 보상 계산기
                </h1>
                <div className="hidden md:block">
                  <FavoriteButton title="레이드 (더보기 효율)" />
                </div>
              </div>
              <Link
                href="/content-rewards/raid-rewards/recommended"
                className="flex-shrink-0 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
              >
                <span className="text-lg">✨</span>
                <span>더보기 추천</span>
              </Link>
            </div>
            <p className="hidden md:block text-lg text-gray-400 mt-3">레이드별 보상과 골드 가치를 확인하세요.</p>
          </div>
        </div>

        {/* 세르카 장비 계승 완료 스위치 (데스크탑: 상단) */}
        <div className="hidden md:block mb-8 bg-gradient-to-r from-gray-800/50 to-gray-900/50 backdrop-blur rounded-xl p-4 border border-gray-700/50 shadow-lg">
          <div className="flex items-start gap-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isSerkaCompleted}
                  onChange={(e) => setIsSerkaCompleted(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-16 h-8 rounded-full transition-all duration-300 shadow-inner ${
                    isSerkaCompleted ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-500/50' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full bg-white shadow-lg transition-transform duration-300 transform ${
                      isSerkaCompleted ? 'translate-x-8' : 'translate-x-0.5'
                    } mt-0.5`}
                  />
                </div>
              </div>
              <span className="text-gray-200 font-semibold group-hover:text-white transition-colors">
                세르카 장비 계승 완료
              </span>
            </label>
            <div className="relative">
              <button
                onClick={() => setShowSerkaTooltip(!showSerkaTooltip)}
                className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-gray-400 hover:text-white flex items-center justify-center text-xs font-bold transition-all shadow-md hover:shadow-lg"
                aria-label="설명 보기"
              >
                ?
              </button>
              {showSerkaTooltip && (
                <div className="absolute left-0 top-8 z-10 p-4 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 w-[500px] shadow-2xl backdrop-blur">
                  상위 재료 ÷ 5 (합성 기준) 의 가치를 반영하여 계산합니다. 예외적으로 상위 재료의 거래소 가격이 하위재료의 5배 이상일 때는 하위재료의 거래소 단가를 그대로 반영합니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 구분 선택 (에픽/카제로스/그림자) - 데스크탑만 */}
        <div className="hidden md:block mb-6">
          <h3 className="text-base font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded"></span>
            구분
          </h3>
          <div className="flex flex-wrap gap-3">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-5 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                  activeCategory === category
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white scale-105 shadow-blue-500/30'
                    : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700/80 hover:scale-105'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 레이드 선택: 모바일=통합 목록, 데스크탑=현재 구분 내 레이드 */}
        {(() => {
          const isMobileRaidList = allRaidsFlat.length > 0;
          const isDesktopRaidList = raids.length > 0;
          return (
            <>
              {/* 모바일: 구분 없이 모든 레이드 통합 - 드롭다운 */}
              {isMobileRaidList && (
                <div className="md:hidden mb-4">
                  <label htmlFor="mobile-raid-select" className="block text-base font-semibold text-gray-300 mb-2">
                    <span className="w-1 h-4 bg-purple-500 rounded inline-block mr-2 align-middle"></span>
                    레이드
                  </label>
                  <select
                    id="mobile-raid-select"
                    value={`${activeCategory}|${activeRaid}`}
                    onChange={(e) => {
                      const [cat, r] = e.target.value.split('|');
                      if (cat && r) {
                        setActiveCategory(cat);
                        setActiveRaid(r);
                      }
                    }}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {allRaidsFlat.map(({ category, raid }) => (
                      <option key={`${category}-${raid}`} value={`${category}|${raid}`}>
                        {raid}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* 모바일: 세르카 스위치 (레이드 선택 밑) */}
              <div className="md:hidden mb-8 bg-gradient-to-r from-gray-800/50 to-gray-900/50 backdrop-blur rounded-xl p-4 border border-gray-700/50 shadow-lg">
                <div className="flex items-start gap-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isSerkaCompleted}
                        onChange={(e) => setIsSerkaCompleted(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-16 h-8 rounded-full transition-all duration-300 shadow-inner ${
                          isSerkaCompleted ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-500/50' : 'bg-gray-700'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full bg-white shadow-lg transition-transform duration-300 transform ${
                            isSerkaCompleted ? 'translate-x-8' : 'translate-x-0.5'
                          } mt-0.5`}
                        />
                      </div>
                    </div>
                    <span className="text-gray-200 font-semibold group-hover:text-white transition-colors">
                      세르카 장비 계승 완료
                    </span>
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setShowSerkaTooltip(!showSerkaTooltip)}
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-gray-400 hover:text-white flex items-center justify-center text-xs font-bold transition-all shadow-md hover:shadow-lg"
                      aria-label="설명 보기"
                    >
                      ?
                    </button>
                    {showSerkaTooltip && (
                      <div className="absolute left-0 top-8 z-10 p-4 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 w-[500px] max-w-[calc(100vw-2rem)] shadow-2xl backdrop-blur">
                        상위 재료 ÷ 5 (합성 기준) 의 가치를 반영하여 계산합니다. 예외적으로 상위 재료의 거래소 가격이 하위재료의 5배 이상일 때는 하위재료의 거래소 단가를 그대로 반영합니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* 데스크탑: 레이드 선택 (구분 내) */}
              {isDesktopRaidList && (
                <div className="hidden md:block mb-8">
                  <h3 className="text-base font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-purple-500 rounded"></span>
                    레이드
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {raids.map(raid => (
                      <button
                        key={raid}
                        onClick={() => setActiveRaid(raid)}
                        className={`px-5 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                          activeRaid === raid
                            ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white scale-105 shadow-purple-500/30'
                            : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700/80 hover:scale-105'
                        }`}
                      >
                        {raid}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* 요약 카드 - 모든 난이도 합계 */}
        {allDifficultiesData.length > 0 && (() => {
          const difficultySummary: { difficulty: string; level: string; clearGold: number; clearBound: number; moreCost: number; moreBound: number; gates: { gate: string; moreCost: number; efficiency: number; isProfit: boolean }[] }[] = [];

          allDifficultiesData.forEach(({ difficulty, level, gates }) => {
            let clearGold = 0;
            let clearBound = 0;
            let moreCost = 0;
            let moreBound = 0;
            const gateEfficiency: { gate: string; moreCost: number; efficiency: number; isProfit: boolean }[] = [];

            Object.entries(gates).forEach(([gateNumber, gateData]) => {
              // 클리어 골드 및 귀속 아이템
              if (gateData.클리어) {
                const gateClearGold = gateData.클리어['골드'] || 0;
                clearGold += gateClearGold;
                
                const boundItems = Object.entries(gateData.클리어).filter(([name]) => name !== '골드');
                const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                  if (isExcludedForTotal(itemName)) return sum;
                  const priceInfo = getAdjustedPrice(itemName);
                  return sum + (priceInfo.price !== null ? priceInfo.price * quantity : 0);
                }, 0);
                clearBound += boundTotal;
              }

              // 더보기 비용 및 귀속 아이템
              if (gateData.더보기) {
                const gateMoreCost = Math.abs(gateData.더보기['골드'] || 0);
                moreCost += gateMoreCost;
                
                const boundItems = Object.entries(gateData.더보기).filter(([name]) => name !== '골드');
                const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                  if (isExcludedForTotal(itemName)) return sum;
                  const priceInfo = getAdjustedPrice(itemName);
                  return sum + (priceInfo.price !== null ? priceInfo.price * quantity : 0);
                }, 0);
                moreBound += boundTotal;

                // 관문별 효율
                const efficiency = boundTotal - gateMoreCost;
                gateEfficiency.push({
                  gate: gateNumber,
                  moreCost: gateMoreCost,
                  efficiency,
                  isProfit: efficiency >= 0
                });
              }
            });

            difficultySummary.push({
              difficulty,
              level,
              clearGold,
              clearBound,
              moreCost,
              moreBound,
              gates: gateEfficiency
            });
          });

          return (
            <div className="mb-8 bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-xl p-4 md:p-6 border border-gray-700 shadow-2xl">
              <h3 className="text-lg md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <span className="inline-block w-1 h-6 bg-blue-500 rounded"></span>
                요약
              </h3>
              {activeRaid && (
                <p className="hidden md:block text-xs sm:text-sm text-gray-400 mb-5">
                  {activeRaid} 클리어 보상 및 더보기 효율 정리
                </p>
              )}
              
              <div className="grid grid-cols-2 gap-3 md:gap-5">
                {/* 좌측 - 난이도별 총합 */}
                <div className="bg-gray-900/60 backdrop-blur rounded-lg border border-gray-700/50 p-2 md:p-4 shadow-lg">
                  <div className="space-y-2 md:space-y-3">
                    {difficultySummary.map(({ difficulty, level, clearGold, clearBound, moreCost, moreBound }) => (
                      <div key={difficulty} className="border-b border-gray-700/50 pb-1.5 md:pb-2.5 last:border-0 last:pb-0">
                        <div className="text-gray-300 mb-1 md:mb-2 text-xs md:text-base font-semibold">
                          {difficulty} {level && `(${level})`}
                        </div>
                        <div className="text-green-400 font-medium text-xs md:text-base ml-1 md:ml-2 block">
                          <span className="block"><span className="md:hidden">클골</span><span className="hidden md:inline">클리어골드</span> {clearGold.toLocaleString('ko-KR')}<GoldUnit /></span>
                          <span className="text-[10px] md:text-xs text-gray-500 block">
                            귀속재료: {formatNumberWithSignificantDigits(clearBound)}<GoldUnit />
                          </span>
                        </div>
                        <div className="text-orange-400 font-medium text-xs md:text-base ml-1 md:ml-2 block mt-0.5 md:mt-1">
                          <span className="block"><span className="md:hidden">더보기</span><span className="hidden md:inline">더보기비용</span> {moreCost.toLocaleString('ko-KR')}<GoldUnit /></span>
                          <span className="text-[10px] md:text-xs text-gray-500 block">
                            귀속재료: {formatNumberWithSignificantDigits(moreBound)}<GoldUnit />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 우측 - 관문별 효율 (난이도별) */}
                <div className="bg-gray-900/60 backdrop-blur rounded-lg border border-gray-700/50 p-2 md:p-4 shadow-lg">
                  <div className="space-y-2 md:space-y-3">
                    {difficultySummary.map(({ difficulty, level, gates }) => (
                      <div key={difficulty} className="border-b border-gray-700/50 pb-1.5 md:pb-2.5 last:border-0 last:pb-0">
                        <div className="text-gray-300 mb-1 md:mb-2 text-xs md:text-base font-semibold">
                          {difficulty} {level && `(${level})`}
                        </div>
                        {gates.map(({ gate, moreCost, efficiency, isProfit }) => (
                          <div key={gate} className="flex flex-col md:flex-row md:items-center md:justify-between gap-0.5 text-xs md:text-base ml-1 md:ml-2">
                            <span className="text-gray-300">{gate}관문 <span className="md:hidden">더보기</span><span className="hidden md:inline">더보기비용</span> {formatNumberWithSignificantDigits(moreCost)}<GoldUnit /></span>
                            <span className={`font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                              {formatNumberWithSignificantDigits(Math.abs(efficiency))}<GoldUnit /> {isProfit ? '이득' : '손해'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 관문별 보상 표시 - 모든 난이도 */}
        {allDifficultiesData.length > 0 && (
          <div className="space-y-6">
            {allDifficultiesData.map(({ difficulty, level, gates }) => (
              <div key={difficulty} className="bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900 rounded-xl p-3 md:p-5 border border-gray-700/50 shadow-xl">
                <h2 className="text-base md:text-2xl font-bold text-white mb-3 md:mb-5 flex items-center gap-2">
                  <span className="inline-block w-1 h-6 bg-purple-500 rounded"></span>
                  {difficulty} {level && `(${level})`}
                </h2>
                
                <div className="space-y-4">
                  {Object.entries(gates).map(([gateNumber, gateData]) => (
                    <div key={gateNumber} className="bg-gray-900/50 backdrop-blur rounded-lg p-3 md:p-4 border border-gray-700/30">
                      <h3 className="text-sm md:text-lg font-bold text-gray-200 mb-2 md:mb-3">{gateNumber}관문</h3>
                
                <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 md:gap-3">
                  {/* 클리어 보상 */}
                  {gateData.클리어 && (() => {
                    const goldReward = gateData.클리어['골드'] || 0;
                    const boundItems = Object.entries(gateData.클리어).filter(([name]) => name !== '골드');
                    const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                      if (isExcludedForTotal(itemName)) return sum;
                      const priceInfo = getAdjustedPrice(itemName);
                      return sum + (priceInfo.price !== null ? priceInfo.price * quantity : 0);
                    }, 0);
                    
                    return (
                      <div className="bg-gray-900/80 rounded-lg border border-blue-500/20 p-2 md:p-3 shadow-md">
                        <h4 className="text-xs md:text-base font-bold text-blue-400 mb-2 md:mb-3">클리어 보상</h4>
                        
                        <div className="space-y-1 md:space-y-1.5">
                          {/* 클리어 골드 */}
                          <div className="flex flex-row items-center justify-between py-1 md:py-1.5 border-b border-gray-700/50 gap-0.5">
                            <span className="text-green-400 font-medium text-[10px] md:text-sm">클리어 골드</span>
                            <span className="text-green-400 font-bold text-[10px] md:text-sm">
                              {goldReward.toLocaleString('ko-KR')}<GoldUnit />
                            </span>
                          </div>
                          
                          {/* 귀속 아이템 총합 */}
                          <div className="flex flex-row items-center justify-between py-1 md:py-1.5 border-b border-gray-700/50 gap-0.5">
                            <span className="text-red-400 font-medium text-[10px] md:text-sm">귀속 총합</span>
                            <span className="text-red-400 font-bold text-[10px] md:text-sm">
                              {formatNumberWithSignificantDigits(boundTotal)}<GoldUnit />
                            </span>
                          </div>
                          
                          {/* 각 귀속 아이템 */}
                          {boundItems.map(([itemName, quantity]) => {
                            const priceInfo = getAdjustedPrice(itemName);
                            const itemTotal = priceInfo.price !== null ? priceInfo.price * quantity : 0;
                            const strike = isExcludedForTotal(itemName) ? 'line-through opacity-60' : '';
                            const showMethod = (
                              (itemName === '운명의 파괴석 결정' || itemName === '운명의 수호석 결정' || itemName === '위대한 운명의 돌파석') ||
                              (isSerkaCompleted && (itemName === '운명의 파괴석' || itemName === '운명의 수호석' || itemName === '운명의 돌파석' || itemName === '순환 돌파석'))
                            ) && priceInfo.method;
                            
                            const tooltipLines = buildRewardTooltipLines({ itemName, quantity, price: priceInfo.price ?? undefined });
                            return (
                              <div
                                key={itemName}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); showMobileTooltip(itemName, tooltipLines); }}
                                onTouchEnd={(e) => { e.preventDefault(); showMobileTooltip(itemName, tooltipLines); }}
                                className={`flex items-center justify-between gap-1 md:gap-2 py-0.5 md:py-1 pl-1 md:pl-3 cursor-default touch-manipulation md:cursor-default ${strike}`}
                              >
                                <span className="text-gray-300 text-[10px] md:text-xs flex items-center gap-1 md:gap-2 min-w-0">
                                  <span className="flex-shrink-0">
                                    <ItemIcon name={itemName} size="sm" className="flex-shrink-0" />
                                  </span>
                                  <span className="hidden md:inline">{itemName} </span>
                                  <span className="md:hidden">{(itemName === '카드 경험치' || itemName === '실링') ? formatNumberWithSignificantDigits(quantity) : `${formatNumberWithSignificantDigits(quantity)}개`}</span>
                                  <span className="hidden md:inline">{(priceInfo.price != null && priceInfo.price > 0) ? (
                                    <><span className="text-yellow-300">{formatNumberWithSignificantDigits(priceInfo.price)}골드</span><span className="text-gray-400"> x </span><span className="text-blue-300">{formatNumberWithSignificantDigits(quantity)}개</span></>
                                  ) : (itemName === '카드 경험치' || itemName === '실링') ? formatNumberWithSignificantDigits(quantity) : `${formatNumberWithSignificantDigits(quantity)}개`}</span>
                                  {showMethod && (
                                    <span className="hidden md:inline text-xs text-gray-500 font-medium ml-1.5">({priceInfo.method})</span>
                                  )}
                                </span>
                                <span className="text-gray-400 text-[10px] md:text-xs flex-shrink-0">
                                  ({formatNumberWithSignificantDigits(itemTotal)}<GoldUnit />)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 더보기 효율 */}
                  {gateData.더보기 && (() => {
                    const goldCost = Math.abs(gateData.더보기['골드'] || 0);
                    const boundItems = Object.entries(gateData.더보기).filter(([name]) => name !== '골드');
                    const boundTotal = boundItems.reduce((sum, [itemName, quantity]) => {
                      if (isExcludedForTotal(itemName)) return sum;
                      const priceInfo = getAdjustedPrice(itemName);
                      return sum + (priceInfo.price !== null ? priceInfo.price * quantity : 0);
                    }, 0);
                    const efficiency = boundTotal - goldCost;
                    const isProfit = efficiency >= 0;
                    
                    return (
                      <div className="bg-gray-900/80 rounded-lg border border-purple-500/20 p-2 md:p-3 shadow-md">
                        <div className="flex flex-row items-center justify-between gap-2 mb-2 md:mb-3">
                          <h4 className="text-xs md:text-base font-bold text-purple-400">더보기 효율</h4>
                          <span className={`text-xs md:text-sm font-bold whitespace-nowrap ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '이득' : '손해'} {formatNumberWithSignificantDigits(Math.abs(efficiency))}<GoldUnit />
                          </span>
                        </div>
                        
                        <div className="space-y-1 md:space-y-1.5">
                          {/* 더보기 비용 */}
                          <div className="flex flex-row items-center justify-between py-1 md:py-1.5 border-b border-gray-700/50 gap-0.5">
                            <span className="text-orange-400 font-medium text-[10px] md:text-sm">더보기 비용</span>
                            <span className="text-orange-400 font-bold text-[10px] md:text-sm">
                              {goldCost.toLocaleString('ko-KR')}<GoldUnit />
                            </span>
                          </div>
                          
                          {/* 귀속 아이템 총합 */}
                          <div className="flex flex-row items-center justify-between py-1 md:py-1.5 border-b border-gray-700/50 gap-0.5">
                            <span className="text-red-400 font-medium text-[10px] md:text-sm">귀속 총합</span>
                            <span className="text-red-400 font-bold text-[10px] md:text-sm">
                              {formatNumberWithSignificantDigits(boundTotal)}<GoldUnit />
                            </span>
                          </div>
                          
                          {/* 각 귀속 아이템 */}
                          {boundItems.map(([itemName, quantity]) => {
                            const priceInfo = getAdjustedPrice(itemName);
                            const itemTotal = priceInfo.price !== null ? priceInfo.price * quantity : 0;
                            const strike = isExcludedForTotal(itemName) ? 'line-through opacity-60' : '';
                            const showMethod = (
                              (itemName === '운명의 파괴석 결정' || itemName === '운명의 수호석 결정' || itemName === '위대한 운명의 돌파석') ||
                              (isSerkaCompleted && (itemName === '운명의 파괴석' || itemName === '운명의 수호석' || itemName === '운명의 돌파석' || itemName === '순환 돌파석'))
                            ) && priceInfo.method;
                            
                            const tooltipLines = buildRewardTooltipLines({ itemName, quantity, price: priceInfo.price ?? undefined });
                            return (
                              <div
                                key={itemName}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); showMobileTooltip(itemName, tooltipLines); }}
                                onTouchEnd={(e) => { e.preventDefault(); showMobileTooltip(itemName, tooltipLines); }}
                                className={`flex items-center justify-between gap-1 md:gap-2 py-0.5 md:py-1 pl-1 md:pl-3 cursor-default touch-manipulation md:cursor-default ${strike}`}
                              >
                                <span className="text-gray-300 text-[10px] md:text-xs flex items-center gap-1 md:gap-2 min-w-0">
                                  <span className="flex-shrink-0">
                                    <ItemIcon name={itemName} size="sm" className="flex-shrink-0" />
                                  </span>
                                  <span className="hidden md:inline">{itemName} </span>
                                  <span className="md:hidden">{(itemName === '카드 경험치' || itemName === '실링') ? formatNumberWithSignificantDigits(quantity) : `${formatNumberWithSignificantDigits(quantity)}개`}</span>
                                  <span className="hidden md:inline">{(priceInfo.price != null && priceInfo.price > 0) ? (
                                    <><span className="text-yellow-300">{formatNumberWithSignificantDigits(priceInfo.price)}골드</span><span className="text-gray-400"> x </span><span className="text-blue-300">{formatNumberWithSignificantDigits(quantity)}개</span></>
                                  ) : (itemName === '카드 경험치' || itemName === '실링') ? formatNumberWithSignificantDigits(quantity) : `${formatNumberWithSignificantDigits(quantity)}개`}</span>
                                  {showMethod && (
                                    <span className="hidden md:inline text-xs text-gray-500 font-medium ml-1.5">({priceInfo.method})</span>
                                  )}
                                </span>
                                <span className="text-gray-400 text-[10px] md:text-xs flex-shrink-0">
                                  ({formatNumberWithSignificantDigits(itemTotal)}<GoldUnit />)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
