'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import FavoriteButton from '../components/FavoriteButton';
import GoldUnit from '../components/GoldUnit';

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  cubeStageRewards?: RewardItem[]; // 에브니 큐브 탭의 해당 단계 보상 정보
  category?: string; // 카테고리 정보 (지옥3용)
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type ContentData = {
  [level: string]: Stage[];
};

type ContentRewards = {
  '에브니 큐브'?: ContentData;
  '가디언 토벌'?: ContentData;
  '카오스 던전'?: ContentData;
  '쿠르잔 전선'?: ContentData;
};

type ContentType = keyof ContentRewards;

type RatesProps = { exchange: number | null; discord: number | null };

// 계산은 조정된 데이터로 수행 (유효숫자 규칙 적용 전)
function calculateStageTotals(
  stage: Stage,
  isTradableFn: (name: string) => boolean,
  isExcludedForTotalFn: (name: string) => boolean
): { tradable: number; total: number } {
  let tradable = 0;
  let total = 0;
  for (const reward of stage.rewards) {
    const qty = reward.quantity || 0;

    // 에브니 큐브 입장권: 내부 보상 기준으로 거래가능/전체 분리 계산
    if (reward.cubeStageRewards && reward.cubeStageRewards.length > 0) {
      const tradableUnit = reward.cubeStageRewards.reduce((sum, r) => {
        // 거래가능하고 제외되지 않은 항목만 거래가능 합계에 포함
        if (isExcludedForTotalFn(r.itemName)) return sum;
        const amount = (r.price || 0) * (r.quantity || 0);
        return sum + (isTradableFn(r.itemName) ? amount : 0);
      }, 0);
      const totalUnit = reward.cubeStageRewards.reduce((sum, r) => {
        // 제외되지 않은 모든 항목을 전체 합계에 포함
        if (isExcludedForTotalFn(r.itemName)) return sum;
        const amount = (r.price || 0) * (r.quantity || 0);
        return sum + amount;
      }, 0);
      tradable += tradableUnit * qty;
      total += totalUnit * qty;
      continue;
    }

    // 일반 아이템
    const amount = (reward.price || 0) * qty;
    // 제외되지 않은 항목만 전체 합계에 포함
    if (!isExcludedForTotalFn(reward.itemName)) {
      total += amount;
      // 거래가능한 항목은 거래가능 합계에도 포함
      if (isTradableFn(reward.itemName)) {
        tradable += amount;
      }
    }
  }
  return { tradable, total };
}

type ValueDbEntryMap = Record<string, { itemName: string; unitType: '크리스탈' | '골드' | '현금' | null; unitValue: number | null; note?: string }>;

export default function ContentRewardsClient({ 
  data, 
  rates,
  valueDbEntryMap 
}: { 
  data: ContentRewards; 
  rates: RatesProps;
  valueDbEntryMap?: ValueDbEntryMap;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const searchParams = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);
  /** 펼친 큐브/모래시계 보상: key = `${stageIdx}-${rewardIdx}` */
  const [expandedCubeKeys, setExpandedCubeKeys] = useState<Set<string>>(new Set());
  /** 모바일 전용 툴팁: 터치 시 즉시 표시 */
  const [mobileTooltipItemName, setMobileTooltipItemName] = useState<string | null>(null);
  const contentTypes: ContentType[] = ['쿠르잔 전선', '에브니 큐브', '가디언 토벌'];

  const showMobileTooltip = (itemName: string) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileTooltipItemName(itemName);
    }
  };

  const toggleCubeExpand = (key: string) => {
    setExpandedCubeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  
  // price-override-change 이벤트 리스너: 가격 조정이 변경되면 강제로 재계산
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      // 클라이언트 측에서만 재계산 (서버 재렌더링 불필요)
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  // 모바일 툴팁: 외부 터치/클릭 시 닫기, 2초 후 자동 닫기
  useEffect(() => {
    if (!mobileTooltipItemName) return;
    const close = () => setMobileTooltipItemName(null);
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
  }, [mobileTooltipItemName]);
  
  // 사용 가능한 컨텐츠만 필터링 (useMemo로 감싸기)
  const availableContents = useMemo(() => {
    return contentTypes.filter(type => {
      if (type === '에브니 큐브') {
        return data[type] !== undefined; // 에브니 큐브는 데이터가 없어도 탭 표시
      }
      return data[type] && Object.keys(data[type]!).length > 0;
    });
  }, [data]);
  
  // URL 쿼리 파라미터에서 탭 읽기
  const tabFromUrl = searchParams?.get('tab');
  const initialContent = useMemo(() => {
    if (tabFromUrl && contentTypes.includes(tabFromUrl as ContentType)) {
      return tabFromUrl as ContentType;
    }
    return availableContents.length > 0 ? availableContents[0] : null;
  }, [tabFromUrl, availableContents]);
  
  const [activeContent, setActiveContent] = useState<ContentType | null>(initialContent);
  
  // URL 쿼리 파라미터 변경 시 activeContent 동기화
  useEffect(() => {
    if (tabFromUrl && contentTypes.includes(tabFromUrl as ContentType)) {
      setActiveContent(tabFromUrl as ContentType);
    }
  }, [tabFromUrl]);
  
  // data 변경 시 activeContent 동기화
  useEffect(() => {
    if (availableContents.length > 0) {
      // 현재 선택된 컨텐츠가 더 이상 사용 불가능하면 첫 번째로 변경
      setActiveContent(prev => {
        if (!prev || !availableContents.includes(prev)) {
          return availableContents[0];
        }
        return prev;
      });
    } else {
      setActiveContent(null);
    }
  }, [availableContents]);
  
  const contentData = activeContent ? data[activeContent] : null;
  const levels = contentData ? Object.keys(contentData).sort((a, b) => {
    // 숫자로 파싱해서 정렬
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numA - numB;
  }) : [];
  const [activeLevel, setActiveLevel] = useState<string>('');
  
  // 첫 로드 시 첫 번째 레벨 선택
  useEffect(() => {
    if (levels.length > 0) {
      setActiveLevel(prev => {
        if (!prev || !levels.includes(prev)) {
          return levels[0];
        }
        return prev;
      });
    }
  }, [levels, activeContent]);
  
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
  
  // 가격 조정된 데이터 생성
  // refreshKey를 의존성에 추가하여 price-override-change 이벤트 발생 시 강제로 재계산
  const adjustedData = useMemo(() => {
    if (!contentData) return null;
    const adjusted: ContentData = {};
    for (const [level, stages] of Object.entries(contentData)) {
      adjusted[level] = stages.map(stage => ({
        ...stage,
        rewards: stage.rewards.map(reward => {
          // 카드 경험치인 경우 가치계산DB에서 가격 가져오기
          let finalPrice = reward.price ?? null;
          if (reward.itemName === '카드 경험치' && valueDbEntryMap) {
            const cardExpEntry = valueDbEntryMap['카드경험치 1당'];
            if (cardExpEntry && cardExpEntry.unitValue != null) {
              // 가치계산DB의 '카드경험치 1당' 가격을 사용 (수량을 곱하지 않음, 수량은 나중에 곱함)
              finalPrice = cardExpEntry.unitValue;
            }
          } else if (reward.itemName === '운명의 파편' && valueDbEntryMap) {
            // 운명의 파편인 경우 가치계산DB의 '운명의 파편 1개당' 가격 사용
            const fragmentEntry = valueDbEntryMap['운명의 파편 1개당'];
            if (fragmentEntry && fragmentEntry.unitValue != null) {
              finalPrice = fragmentEntry.unitValue;
            }
          } else if (reward.itemName === '실링' && valueDbEntryMap) {
            // 실링인 경우 가치계산DB에서 가격 사용 (디코기준 스위치 반영)
            const silverEntry = valueDbEntryMap['실링'];
            if (silverEntry && silverEntry.unitValue != null) {
              if (silverEntry.unitType === '현금') {
                // 현금 단위인 경우 디코기준 스위치에 따라 골드로 변환
                // lightMode === false (어두움): 디코기준 ON → discord 사용
                // lightMode === true (밝음): 디코기준 OFF → exchange 사용
                if (!lightMode && rates?.discord && rates.discord > 0) {
                  // 디코기준: 100골드 = discord원이므로, 1원 = 100/discord 골드
                  finalPrice = silverEntry.unitValue * (100 / rates.discord);
                } else if (lightMode && rates?.exchange && rates.exchange > 0) {
                  // 크리스탈 거래소 기준: 1원 = exchange/2750 골드
                  finalPrice = silverEntry.unitValue * (rates.exchange / 2750);
                } else {
                  // 환율 정보가 없으면 원래 값 그대로 사용
                  finalPrice = silverEntry.unitValue;
                }
              } else if (silverEntry.unitType === '골드') {
                finalPrice = silverEntry.unitValue;
              }
            }
          } else if ((reward.itemName === '순환 돌파석' || reward.itemName === '전이 돌파석') && (finalPrice == null || finalPrice === null)) {
            // 순환 돌파석 또는 전이 돌파석: 클라이언트에서 재계산된 값 사용
            const entry = adjustedEntries.find(e => e.itemName === reward.itemName);
            if (entry && entry.unitValue != null) {
              finalPrice = entry.unitValue;
            }
          }
          
          return {
            ...reward,
            price: adjustPrice(reward.itemName === '운명의 파편' ? '운명의 파편 1개당' : reward.itemName, finalPrice),
            cubeStageRewards: reward.cubeStageRewards?.map(r => {
              // cubeStageRewards 내부의 카드 경험치, 운명의 파편, 실링도 동일하게 처리
              let rPrice = r.price ?? null;
              if (r.itemName === '카드 경험치' && valueDbEntryMap) {
                const cardExpEntry = valueDbEntryMap['카드경험치 1당'];
                if (cardExpEntry && cardExpEntry.unitValue != null) {
                  rPrice = cardExpEntry.unitValue;
                }
              } else if (r.itemName === '운명의 파편' && valueDbEntryMap) {
                // 운명의 파편인 경우 가치계산DB의 '운명의 파편 1개당' 가격 사용
                const fragmentEntry = valueDbEntryMap['운명의 파편 1개당'];
                if (fragmentEntry && fragmentEntry.unitValue != null) {
                  rPrice = fragmentEntry.unitValue;
                }
              } else if (r.itemName === '실링' && valueDbEntryMap) {
                // 실링인 경우 가치계산DB에서 가격 사용 (디코기준 스위치 반영)
                const silverEntry = valueDbEntryMap['실링'];
                if (silverEntry && silverEntry.unitValue != null) {
                  if (silverEntry.unitType === '현금') {
                    // 현금 단위인 경우 디코기준 스위치에 따라 골드로 변환
                    if (!lightMode && rates?.discord && rates.discord > 0) {
                      // 디코기준: 100골드 = discord원이므로, 1원 = 100/discord 골드
                      rPrice = silverEntry.unitValue * (100 / rates.discord);
                    } else if (lightMode && rates?.exchange && rates.exchange > 0) {
                      // 크리스탈 거래소 기준: 1원 = exchange/2750 골드
                      rPrice = silverEntry.unitValue * (rates.exchange / 2750);
                    } else {
                      // 환율 정보가 없으면 원래 값 그대로 사용
                      rPrice = silverEntry.unitValue;
                    }
                  } else if (silverEntry.unitType === '골드') {
                    rPrice = silverEntry.unitValue;
                  }
                }
              }
              return {
                ...r,
                price: adjustPrice(r.itemName === '운명의 파편' ? '운명의 파편 1개당' : r.itemName, rPrice),
              };
            }),
          };
        }),
      }));
    }
    return adjusted;
  }, [contentData, adjustPrice, valueDbEntryMap, adjustedEntries, refreshKey, priceOverrideState, lightMode, rates]);
  
  // 현재 표시할 데이터 결정
  const currentLevelData: Stage[] = useMemo(() => {
    if (!adjustedData) return [];
    if (activeLevel && adjustedData[activeLevel]) {
      const levelData = adjustedData[activeLevel];
      return Array.isArray(levelData) ? levelData : [];
    }
    return [];
  }, [adjustedData, activeLevel, activeContent]);

  // 거래가능/귀속 색상 구분
  const tradableSet = useMemo(() => new Set<string>([
    '1레벨 보석 (3T)',
    '1레벨 보석 (4T)',
    // 운명의 파괴석, 운명의 수호석은 귀속 (쿠르잔 전선)
  ]), []);

  const getTradeClass = (itemName: string) => {
    // 가디언 토벌 탭에서는 1레벨 보석 (4T)만 거래가능, 나머지는 귀속
    let isTradable: boolean;
    if (activeContent === '가디언 토벌') {
      isTradable = itemName === '1레벨 보석 (4T)';
    } else {
      isTradable = tradableSet.has(itemName);
    }
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
    if (activeContent === '가디언 토벌') return false;
    if (priceOverrideState.ignoreBreakthroughStone && (name === '찬란한 명예의 돌파석' || name === '운명의 돌파석' || name === '위대한 운명의 돌파석')) return true;
    if (priceOverrideState.ignoreFragment && (name === '명예의 파편' || name === '운명의 파편')) return true;
    if (priceOverrideState.ignoreCardExp && name === '카드 경험치') return true;
    if (priceOverrideState.ignoreDestructionGuardStone && (name === '운명의 파괴석' || name === '운명의 수호석' || name === '운명의 파괴석 결정' || name === '운명의 수호석 결정')) return true;
    return false;
  };

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
  
  if (availableContents.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 p-8">
        <div>
          <div className="bg-gray-800 border border-gray-700 rounded p-6">
            <h2 className="text-2xl font-bold text-gray-300 mb-2">데이터 없음</h2>
            <p className="text-gray-400">
              보상 데이터가 없습니다. 먼저 <code className="bg-gray-800 px-2 py-1 rounded">scripts/parse-content-rewards.js</code>를 실행하여
              Excel 파일을 JSON으로 변환하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      {/* 모바일 전용 툴팁: 터치 시 즉시 표시 */}
      {mobileTooltipItemName && (
        <div className="fixed inset-x-4 bottom-8 z-50 md:hidden">
          <div className="mx-auto max-w-sm rounded-lg bg-gray-800 px-4 py-3 text-center text-sm text-white shadow-lg border border-gray-600">
            {mobileTooltipItemName}
          </div>
        </div>
      )}
      <div>
        <div className="mb-6 md:mb-10">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="hidden md:block text-3xl font-semibold tracking-tight text-white">
              컨텐츠 보상 계산기
            </h1>
            <div className="hidden md:block">
              <FavoriteButton title="핵심 컨텐츠" />
            </div>
          </div>
          <p className="hidden md:block text-base text-gray-400">컨텐츠별 보상과 골드 가치를 확인하세요. (악세, 유각, 편린 등 일부 보상 제외)</p>
        </div>

        {/* 컨텐츠 타입 선택 탭 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {availableContents.map(content => (
              <button
                key={content}
                onClick={() => {
                  setActiveContent(content);
                  // URL 업데이트
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', content);
                  window.history.pushState({}, '', url.toString());
                }}
                className={`px-4 py-2 rounded-lg font-semibold text-sm md:text-base transition-colors ${
                  activeContent === content
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {content === '쿠르잔 전선' ? '전선 & 균열' : content === '에브니 큐브' ? '큐브 & 모래시계' : content}
              </button>
            ))}
          </div>
        </div>

        {/* 레벨 선택 */}
        {levels.length > 0 && (
          <div className="mb-6">
            {activeContent === '쿠르잔 전선' || activeContent === '에브니 큐브' || activeContent === '가디언 토벌' ? (
              <>
                {/* 모바일: 드롭다운 */}
                <select
                  value={activeLevel}
                  onChange={(e) => setActiveLevel(e.target.value)}
                  className="md:hidden w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                >
                  {levels.map(level => {
                    let displayText = level;
                    if (activeContent === '가디언 토벌' && data[activeContent]?.[level]) {
                      const stage = data[activeContent]![level][0];
                      if (stage) displayText = `${stage.stage} (${level})`;
                    }
                    return (
                      <option key={level} value={level}>
                        {displayText}
                      </option>
                    );
                  })}
                </select>
                {/* 데스크탑: 버튼형 선택 */}
                <div className="hidden md:flex flex-wrap gap-2">
                  {levels.map(level => {
                    let displayText = level;
                    if (activeContent === '가디언 토벌' && data[activeContent]?.[level]) {
                      const stage = data[activeContent]![level][0];
                      if (stage) {
                        displayText = `${stage.stage} (${level})`;
                      }
                    }
                    return (
                      <button
                        key={level}
                        onClick={() => setActiveLevel(level)}
                        className={`px-4 py-2 rounded font-semibold ${
                          activeLevel === level
                            ? 'bg-gray-700 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                        }`}
                      >
                        {displayText}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              // 기타: 드롭다운 (모바일/데스크탑 동일)
              <select
                value={activeLevel}
                onChange={(e) => setActiveLevel(e.target.value)}
                className="w-full md:w-auto px-4 py-2 md:py-2 bg-gray-800 text-white rounded border border-gray-700 focus:outline-none focus:border-gray-600 md:focus:ring-2 md:focus:ring-blue-500"
              >
                {levels.map(level => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        
        {/* 단계별 보상 표시 */}
        <div className="space-y-6">
          {currentLevelData.map((stage, idx) => {
            // 가디언 토벌 탭이면 전부 거래가능 처리
            const isGuardianTab = activeContent === '가디언 토벌';
            
            // 가디언 토벌: 1레벨 보석 (4T)만 거래가능
            const isTradableFn = (name: string) => {
              if (isGuardianTab) {
                return name === '1레벨 보석 (4T)';
              }
              return tradableSet.has(name);
            };
            const totals = calculateStageTotals(stage, isTradableFn, (name) => isExcludedForTotal(name));
            const cashValueTradable = goldToCashPerGold ? totals.tradable * goldToCashPerGold : null;
            const cashValueTotal = goldToCashPerGold ? totals.total * goldToCashPerGold : null;
            
            return (
              <div key={idx} className="bg-gray-800 rounded p-6 border border-gray-700">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <h3 className="text-lg md:text-2xl font-bold text-white">{stage.stage}</h3>
                  <div className="flex flex-wrap items-end gap-3 md:gap-4 justify-start md:justify-end text-left md:text-right">
                    <div>
                      <div className="text-xs text-green-300 mb-1">거래가능 합계</div>
                      <div className="text-base md:text-2xl font-bold text-green-300">
                        {formatNumberWithSignificantDigits(totals.tradable)}<GoldUnit />
                      </div>
                      {cashValueTradable != null && (
                        <div className="text-xs text-green-300/80 mt-1">
                          ≈ {Math.round(cashValueTradable).toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-yellow-300 mb-1">전체 합계(귀속 포함)</div>
                      <div className="text-base md:text-2xl font-bold text-yellow-400">
                        {formatNumberWithSignificantDigits(totals.total)}<GoldUnit />
                      </div>
                      {cashValueTotal != null && (
                        <div className="text-xs text-yellow-300/80 mt-1">
                          ≈ {Math.round(cashValueTotal).toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 보상 표시 - 레이드 보상처럼 세로 나열, 큐브/모래시계는 해당 항목 밑 펼치기 */}
                <div className="bg-gray-900/80 rounded-lg border border-gray-700/50 p-4">
                  <div className="space-y-1.5">
                    {stage.rewards.map((reward, rewardIdx) => {
                      const itemTotal = (reward.price || 0) * reward.quantity;
                      const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                      const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                      const isGuardianTab = activeContent === '가디언 토벌';
                      const isCubeTicket = !!reward.cubeStageRewards && reward.cubeStageRewards.length > 0;
                      const expandKey = `${idx}-${rewardIdx}`;
                      const isExpanded = expandedCubeKeys.has(expandKey);

                      let cubeUnitTradable: number | null = null;
                      let cubeUnitTotal: number | null = null;
                      if (isCubeTicket) {
                        cubeUnitTradable = reward.cubeStageRewards!.reduce((sum, r) => {
                          const amount = (r.price || 0) * (r.quantity || 0);
                          const tradable = isGuardianTab ? r.itemName === '1레벨 보석 (4T)' : tradableSet.has(r.itemName);
                          return sum + (tradable ? amount : 0);
                        }, 0);
                        cubeUnitTotal = reward.cubeStageRewards!.reduce((sum, r) => {
                          if (isExcludedForTotal(r.itemName)) return sum;
                          return sum + ((r.price || 0) * (r.quantity || 0));
                        }, 0);
                      }

                      const tradeInfo = getTradeClass(reward.itemName);
                      const strike = (!isGuardianTab && isExcludedForTotal(reward.itemName)) ? 'line-through opacity-60' : '';

                      if (isCubeTicket) {
                        const displayTotal = (cubeUnitTotal ?? 0) * reward.quantity;
                        const list = reward.cubeStageRewards!;
                        return (
                          <div key={rewardIdx} className="border-b border-gray-700/50 last:border-0">
                            <div
                              className={`flex items-center justify-between gap-2 py-1.5 pl-3 ${strike}`}
                            >
                              <span className="text-gray-300 text-sm flex items-center gap-2 min-w-0">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); showMobileTooltip(reward.itemName); }}
                                  onTouchEnd={(e) => { e.preventDefault(); showMobileTooltip(reward.itemName); }}
                                  className="flex-shrink-0 cursor-default touch-manipulation md:cursor-default"
                                >
                                  <ItemIcon name={reward.itemName} size="sm" className="flex-shrink-0" />
                                </span>
                                <span className="hidden md:inline">{reward.itemName} </span>
                                {(reward.itemName === '카드 경험치' || reward.itemName === '실링') ? quantityStr : `${quantityStr}개`}
                                <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleCubeExpand(expandKey)}
                                  className="ml-1 px-2 py-0.5 rounded bg-gray-700/80 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? '접기' : '펼치기'}
                                </button>
                              </span>
                              <span className="text-gray-400 text-sm flex-shrink-0">
                                ({formatNumberWithSignificantDigits(displayTotal)}<GoldUnit />)
                              </span>
                            </div>
                            {isExpanded && list.length > 0 && (
                              <div className="pl-6 pr-3 pb-2 pt-0.5 border-t border-gray-700/30 bg-gray-950/50 rounded-b">
                                <div className="space-y-1">
                                  {list.map((r, i) => {
                                    const info = getTradeClass(r.itemName);
                                    const strikeCube = (!isGuardianTab && isExcludedForTotal(r.itemName)) ? 'line-through opacity-60' : '';
                                    const rTotal = (r.price || 0) * r.quantity;
                                    return (
                                      <div key={i} className={`flex items-center justify-between gap-2 py-1 pl-2 text-sm ${strikeCube}`}>
                                        <span className="text-gray-400 flex items-center gap-2 min-w-0">
                                          <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); showMobileTooltip(r.itemName); }}
                                            onTouchEnd={(e) => { e.preventDefault(); showMobileTooltip(r.itemName); }}
                                            className="flex-shrink-0 cursor-default touch-manipulation md:cursor-default"
                                          >
                                            <ItemIcon name={r.itemName} size="sm" className="flex-shrink-0" />
                                          </span>
                                          <span className="hidden md:inline">{r.itemName} </span>
                                          {(r.itemName === '카드 경험치' || r.itemName === '실링') ? formatNumberWithSignificantDigits(r.quantity) : `${formatNumberWithSignificantDigits(r.quantity)}개`}
                                          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${info.badgeClass}`}>{info.badgeText}</span>
                                        </span>
                                        <span className="text-gray-500 text-xs flex-shrink-0">
                                          ({formatNumberWithSignificantDigits(rTotal)}<GoldUnit />)
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={rewardIdx} className={`flex items-center justify-between gap-2 py-1.5 pl-3 border-b border-gray-700/50 last:border-0 ${strike}`}>
                          <span className="text-gray-300 text-sm flex items-center gap-2 min-w-0">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); showMobileTooltip(reward.itemName); }}
                              onTouchEnd={(e) => { e.preventDefault(); showMobileTooltip(reward.itemName); }}
                              className="flex-shrink-0 cursor-default touch-manipulation md:cursor-default"
                            >
                              <ItemIcon name={reward.itemName} size="sm" className="flex-shrink-0" />
                            </span>
                            <span className="hidden md:inline">{reward.itemName} </span>
                            {(reward.itemName === '카드 경험치' || reward.itemName === '실링') ? quantityStr : `${quantityStr}개`}
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                          </span>
                          <span className="text-gray-400 text-sm flex-shrink-0">
                            ({itemTotalStr}<GoldUnit />)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}

