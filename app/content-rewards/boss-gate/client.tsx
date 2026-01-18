'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ItemIcon from '../../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { usePriceOverride } from '../../contexts/PriceOverrideContext';
import { useValueDb } from '../../contexts/ValueDbContext';

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
  '필드보스'?: ContentData;
  '카오스게이트'?: ContentData;
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

export default function BossGateClient({ 
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
  const contentTypes: ContentType[] = ['필드보스', '카오스게이트'];
  
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
  
  // 사용 가능한 컨텐츠만 필터링 (useMemo로 감싸기)
  const availableContents = useMemo(() => {
    return contentTypes.filter(type => {
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
          // 골드(귀속)인 경우 단가를 1골드로 계산
          if (reward.itemName === '골드(귀속)') {
            finalPrice = 1;
          } else if (reward.itemName === '카드 경험치' && valueDbEntryMap) {
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
              // 골드(귀속)인 경우 단가를 1골드로 계산
              if (r.itemName === '골드(귀속)') {
                rPrice = 1;
              } else if (r.itemName === '카드 경험치' && valueDbEntryMap) {
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
    '운명의 파괴석 결정',
    '운명의 수호석 결정',
    '위대한 운명의 돌파석',
    '용암의 숨결',
    '빙하의 숨결',
    '운명의 파편 주머니(대)'
  ]), []);

  const getTradeClass = (itemName: string) => {
    const isTradable = tradableSet.has(itemName);
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
      <div>
        <div className="mb-6 md:mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            {activeContent ? `${activeContent} 보상 계산기` : '필드보스/카오스게이트 보상 계산기'}
          </h1>
          <p className="text-base text-gray-400">컨텐츠별 보상과 골드 가치를 확인하세요. (악세, 유각 등 일부 보상 제외)</p>
        </div>

        {/* 탭 버튼 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {contentTypes.map(type => {
              const isAvailable = data[type] && Object.keys(data[type]!).length > 0;
              if (!isAvailable) return null;
              return (
                <button
                  key={type}
                  onClick={() => setActiveContent(type)}
                  className={`px-4 py-2 rounded font-semibold ${
                    activeContent === type
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* 레벨 선택 */}
        {levels.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {levels.map(level => {
                let displayText = level;
                if (data[activeContent!]?.[level]) {
                  const stage = data[activeContent!]![level][0];
                //   if (stage) {
                //     displayText = `${stage.stage} (${level})`;
                //   }
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
          </div>
        )}
        
        {/* 단계별 보상 표시 */}
        <div className="space-y-6">
          {currentLevelData.map((stage, idx) => {
            const isTradableFn = (name: string) => {
              return tradableSet.has(name);
            };
            const totals = calculateStageTotals(stage, isTradableFn, (name) => isExcludedForTotal(name));
            const cashValueTradable = goldToCashPerGold ? totals.tradable * goldToCashPerGold : null;
            const cashValueTotal = goldToCashPerGold ? totals.total * goldToCashPerGold : null;
            
            return (
              <div key={idx} className="bg-gray-800 rounded p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-white">단계 {stage.stage}</h3>
                  <div className="flex flex-wrap items-end gap-4 justify-end text-right">
                    <div>
                      <div className="text-xs text-green-300 mb-1">거래가능 합계</div>
                      <div className="text-2xl font-bold text-green-300">
                        {formatNumberWithSignificantDigits(totals.tradable)}골드
                      </div>
                      {cashValueTradable != null && (
                        <div className="text-xs text-green-300/80 mt-1">
                          ≈ {Math.round(cashValueTradable).toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-yellow-300 mb-1">전체 합계(귀속 포함)</div>
                      <div className="text-2xl font-bold text-yellow-400">
                        {formatNumberWithSignificantDigits(totals.total)}골드
                      </div>
                      {cashValueTotal != null && (
                        <div className="text-xs text-yellow-300/80 mt-1">
                          ≈ {Math.round(cashValueTotal).toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 보상 표시 */}
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                    {stage.rewards.map((reward, rewardIdx) => {
                    // 계산은 원본 데이터로 수행
                    const itemTotal = (reward.price || 0) * reward.quantity;
                    const isSimpleLayout = true;
                    
                    // 표시용: 계산 완료 후 최종 표시 시에만 유효숫자 규칙 적용
                    const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                    const priceStr = reward.price ? formatNumberWithSignificantDigits(reward.price) : '';
                    const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                    const isCubeTicket = !!reward.cubeStageRewards && reward.cubeStageRewards.length > 0;

                    // 에브니 큐브 입장권: 단가(거래가능/전체) 계산
                    let cubeUnitTradable: number | null = null;
                    let cubeUnitTotal: number | null = null;
                    if (isCubeTicket) {
                      const tradableSum = reward.cubeStageRewards!.reduce((sum, r) => {
                        const price = r.price || 0;
                        const qty = r.quantity || 0;
                        const amount = price * qty;
                        const tradable = tradableSet.has(r.itemName);
                        return sum + (tradable ? amount : 0);
                      }, 0);
                      const totalSum = reward.cubeStageRewards!.reduce((sum, r) => {
                        if (isExcludedForTotal(r.itemName)) return sum;
                        return sum + ((r.price || 0) * (r.quantity || 0));
                      }, 0);
                      cubeUnitTradable = tradableSum;
                      cubeUnitTotal = totalSum;
                    }
                    const tradeInfo = getTradeClass(reward.itemName);
                    const strike = isExcludedForTotal(reward.itemName) ? 'line-through opacity-60' : '';
                    
                    return (
                      <div
                        key={rewardIdx}
                        className={`bg-gray-900 rounded border border-gray-700 ${
                          isSimpleLayout ? 'p-3' : 'p-4 flex items-center gap-3'
                        }`}
                      >
                        {isSimpleLayout ? (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-medium ${tradeInfo.nameClass} ${strike}`}>{reward.itemName}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                            </div>
                            <div className="text-gray-400 text-sm mb-1">수량: {quantityStr}</div>
                            {isCubeTicket ? (
                              <div className="space-y-0.5">
                                <div className="text-green-300 text-sm">
                                  {formatNumberWithSignificantDigits(cubeUnitTradable || 0)}골드 × {quantityStr} = {formatNumberWithSignificantDigits((cubeUnitTradable || 0) * reward.quantity)}골드
                                </div>
                                <div className="text-yellow-400 text-sm">
                                  {formatNumberWithSignificantDigits(cubeUnitTotal || 0)}골드 × {quantityStr} = {formatNumberWithSignificantDigits((cubeUnitTotal || 0) * reward.quantity)}골드
                                </div>
                                {reward.cubeStageRewards && reward.cubeStageRewards.length > 0 && (
                                  <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700">
                                    <div className="mb-1">
                                      보상:{' '}
                                      {reward.cubeStageRewards.map((r, idx) => (
                                        <span key={idx}>
                                          {idx > 0 && ', '}
                                          <span className={isExcludedForTotal(r.itemName) ? 'line-through opacity-60' : ''}>{r.itemName}</span>
                                          <span className="text-gray-500"> × {formatNumberWithSignificantDigits(r.quantity)}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              reward.price && (
                                <div className="text-yellow-400 text-sm">
                                  {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <>
                            <ItemIcon name={reward.itemName} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${tradeInfo.nameClass} ${strike}`}>{reward.itemName}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                              </div>
                              <div className="text-gray-400 text-sm">수량: {quantityStr}</div>
                              {isCubeTicket ? (
                                <div className="space-y-0.5">
                                  <div className="text-green-300 text-sm">
                                    {formatNumberWithSignificantDigits(cubeUnitTradable || 0)}골드 × {quantityStr} = {formatNumberWithSignificantDigits((cubeUnitTradable || 0) * reward.quantity)}골드
                                  </div>
                                  <div className="text-yellow-400 text-sm">
                                    {formatNumberWithSignificantDigits(cubeUnitTotal || 0)}골드 × {quantityStr} = {formatNumberWithSignificantDigits((cubeUnitTotal || 0) * reward.quantity)}골드
                                  </div>
                                  {reward.cubeStageRewards && reward.cubeStageRewards.length > 0 && (
                                    <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700">
                                      <div className="mb-1">보상: {reward.cubeStageRewards.map((r, idx) => (
                                        <span key={idx}>
                                          {idx > 0 && ', '}
                                          <span className={isExcludedForTotal(r.itemName) ? 'line-through opacity-60' : ''}>{r.itemName}</span>
                                          <span className="text-gray-500"> × {formatNumberWithSignificantDigits(r.quantity)}</span>
                                        </span>
                                      )).reduce((acc, elem) => acc === null ? elem : <>{acc}{elem}</>, null as React.ReactNode)}</div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                reward.price && (
                                  <div className="text-yellow-400 text-sm">
                                    {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                  </div>
                                )
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}
