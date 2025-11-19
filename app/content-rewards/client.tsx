'use client';

import { useEffect, useMemo, useState } from 'react';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';

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

// 계산은 항상 원본 데이터로 수행 (유효숫자 규칙 적용 전)
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
        const amount = (r.price || 0) * (r.quantity || 0);
        return sum + (isTradableFn(r.itemName) ? amount : 0);
      }, 0);
      const totalUnit = reward.cubeStageRewards.reduce((sum, r) => {
        const amount = (r.price || 0) * (r.quantity || 0);
        return sum + (isExcludedForTotalFn(r.itemName) ? 0 : amount);
      }, 0);
      tradable += tradableUnit * qty;
      total += totalUnit * qty;
      continue;
    }

    // 일반 아이템
    const amount = (reward.price || 0) * qty;
    total += isExcludedForTotalFn(reward.itemName) ? 0 : amount;
    if (isTradableFn(reward.itemName)) tradable += amount;
  }
  return { tradable, total };
}

export default function ContentRewardsClient({ data, rates }: { data: ContentRewards, rates: RatesProps }) {
  const contentTypes: ContentType[] = ['카오스 던전', '쿠르잔 전선', '에브니 큐브', '가디언 토벌'];
  
  // 사용 가능한 컨텐츠만 필터링
  // 에브니 큐브는 데이터가 없어도 탭 표시
  const availableContents = contentTypes.filter(type => {
    if (type === '에브니 큐브') {
      return data[type] !== undefined; // 에브니 큐브는 데이터가 없어도 탭 표시
    }
    return data[type] && Object.keys(data[type]!).length > 0;
  });
  
  const [activeContent, setActiveContent] = useState<ContentType | null>(
    availableContents.length > 0 ? availableContents[0] : null
  );
  
  const contentData = activeContent ? data[activeContent] : null;
  const levels = contentData ? Object.keys(contentData) : [];
  const [activeLevel, setActiveLevel] = useState<string>('');
  
  // 첫 로드 시 첫 번째 레벨 선택
  useMemo(() => {
    if (levels.length > 0 && !activeLevel) {
      setActiveLevel(levels[0]);
    }
  }, [levels, activeLevel]);
  
  // 현재 표시할 데이터 결정
  const currentLevelData: Stage[] = activeLevel && contentData ? contentData[activeLevel] : [];

  // 거래가능/귀속 색상 구분
  const tradableSet = useMemo(() => new Set<string>([
    '정제된 파괴강석',
    '정제된 수호강석',
    '1레벨 보석 (3T)',
    '1레벨 보석 (4T)',
    '운명의 파괴석',
    '운명의 수호석',
  ]), []);

  const getTradeClass = (itemName: string) => {
    // 가디언 토벌 탭에서는 모든 아이템을 거래가능으로 표시
    const forceTradable = activeContent === '가디언 토벌';
    const isTradable = forceTradable || tradableSet.has(itemName);
    return {
      isTradable,
      nameClass: isTradable ? 'text-green-300' : 'text-red-300',
      badgeClass: isTradable
        ? 'bg-green-900/30 text-green-300 border border-green-600'
        : 'bg-red-900/30 text-red-300 border border-red-600',
      badgeText: isTradable ? '거래가능' : '귀속',
    } as const;
  };

  // 합계 제외 스위치 상태
  const [skipStones, setSkipStones] = useState(false);
  const [skipFragments, setSkipFragments] = useState(false);
  const [skipCardExp, setSkipCardExp] = useState(false);

  const isExcludedForTotal = (name: string) => {
    if (activeContent === '가디언 토벌') return false;
    if (skipStones && (name === '찬란한 명예의 돌파석' || name === '운명의 돌파석')) return true;
    if (skipFragments && (name === '명예의 파편' || name === '운명의 파편')) return true;
    if (skipCardExp && name === '카드 경험치') return true;
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
  
  if (availableContents.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-400 mb-2">데이터 없음</h2>
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">컨텐츠 보상 계산기</h1>
          <p className="text-sm md:text-base text-gray-400">컨텐츠별 보상과 골드 가치를 확인하세요.</p>
        </div>
        {/* 글로벌 규칙 스위치: 모든 컨텐츠에 적용 */}
        <div className="mb-4 md:mb-6 flex flex-wrap gap-3 md:gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <span>나는 돌파석이 남아돈다</span>
            <span onClick={() => setSkipStones(v => !v)} className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors border ${skipStones ? 'bg-purple-600 border-purple-500' : 'bg-gray-600 border-gray-500'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipStones ? 'translate-x-5' : 'translate-x-1'}`} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <span>나는 파편이 남아돈다</span>
            <span onClick={() => setSkipFragments(v => !v)} className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors border ${skipFragments ? 'bg-purple-600 border-purple-500' : 'bg-gray-600 border-gray-500'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipFragments ? 'translate-x-5' : 'translate-x-1'}`} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <span>나는 카드 경험치가 남아돈다</span>
            <span onClick={() => setSkipCardExp(v => !v)} className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors border ${skipCardExp ? 'bg-purple-600 border-purple-500' : 'bg-gray-600 border-gray-500'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipCardExp ? 'translate-x-5' : 'translate-x-1'}`} />
            </span>
          </label>
        </div>
        
        {/* 컨텐츠 선택 (서브탭) */}
        <div className="flex gap-2 mb-6">
          {availableContents.map(content => (
            <button
              key={content}
              onClick={() => {
                setActiveContent(content);
                const newLevels = data[content] ? Object.keys(data[content]!) : [];
                setActiveLevel(newLevels[0] || '');
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeContent === content
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {content}
            </button>
          ))}
        </div>

        {/* 레벨 선택 (에브니 큐브, 가디언 토벌은 티어 선택) */}
        {levels.length > 0 && (
          <div className="mb-6">
            <select
              value={activeLevel}
              onChange={(e) => setActiveLevel(e.target.value)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            >
              {levels.map(level => (
                <option key={level} value={level}>
                  {level === '티어3' ? '티어3' : level === '티어4' ? '티어4' : level}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* 단계별 보상 표시 */}
        <div className="space-y-6">
          {currentLevelData.map((stage, idx) => {
            // 가디언 토벌 탭이면 전부 거래가능 처리
            const isGuardianTab = activeContent === '가디언 토벌';
            
            const totals = calculateStageTotals(stage, (name) => isGuardianTab || tradableSet.has(name), (name) => isExcludedForTotal(name));
            const cashValueTradable = goldToCashPerGold ? totals.tradable * goldToCashPerGold : null;
            const cashValueTotal = goldToCashPerGold ? totals.total * goldToCashPerGold : null;
            
            return (
              <div key={idx} className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-white">단계 {stage.stage}</h3>
                  {isGuardianTab ? (
                    <div className="text-right">
                      <div className="text-sm text-gray-400">총 골드 가치</div>
                      <div className="text-3xl font-bold text-yellow-400">
                        {formatNumberWithSignificantDigits(totals.total)}골드
                      </div>
                      {cashValueTotal != null && (
                        <div className="text-base text-blue-400 font-medium mt-2">
                          현금 환산: ≈ {Math.round(cashValueTotal).toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                  ) : (
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
                  )}
                </div>

                {/* 보상 표시 */}
                <div className={`grid gap-3 ${
                  activeContent === '카오스 던전' || activeContent === '쿠르잔 전선' || activeContent === '에브니 큐브' || activeContent === '가디언 토벌'
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' 
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                }`}>
                    {stage.rewards.map((reward, rewardIdx) => {
                    // 계산은 원본 데이터로 수행
                    const itemTotal = (reward.price || 0) * reward.quantity;
                    const isSimpleLayout = activeContent === '카오스 던전' || activeContent === '쿠르잔 전선' || activeContent === '에브니 큐브' || activeContent === '가디언 토벌';
                    
                    // 표시용: 계산 완료 후 최종 표시 시에만 유효숫자 규칙 적용
                    const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                    const priceStr = reward.price ? formatNumberWithSignificantDigits(reward.price) : '';
                    const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                    const isGuardianTab = activeContent === '가디언 토벌';
                    const isCubeTicket = !!reward.cubeStageRewards && reward.cubeStageRewards.length > 0 && reward.itemName.startsWith('에브니 큐브 입장권');

                    // 에브니 큐브 입장권: 단가(거래가능/전체) 계산
                    let cubeUnitTradable: number | null = null;
                    let cubeUnitTotal: number | null = null;
                    if (isCubeTicket) {
                      const tradableSum = reward.cubeStageRewards!.reduce((sum, r) => {
                        const price = r.price || 0;
                        const qty = r.quantity || 0;
                        const amount = price * qty;
                        const tradable = isGuardianTab || tradableSet.has(r.itemName);
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
                    const strike = (!isGuardianTab && isExcludedForTotal(reward.itemName)) ? 'line-through opacity-60' : '';
                    
                    return (
                      <div
                        key={rewardIdx}
                        className={`bg-gray-900/50 rounded-lg border border-gray-700 ${
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
                                {(activeContent === '카오스 던전' || activeContent === '쿠르잔 전선') && reward.cubeStageRewards && reward.cubeStageRewards.length > 0 && (
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

                {/* 에브니 큐브 보상: 별도 박스로 구분 표시 (아이템 카드 높이에 영향 없음) */}
                {(() => {
                  const cubeInfo = stage.rewards.find(r => r.cubeStageRewards && r.cubeStageRewards.length > 0);
                  if (!cubeInfo) return null;
                  const match = cubeInfo.itemName.match(/에브니 큐브\s*\(([^)]+)\)/);
                  const cubeLabel = match ? match[1] : '';
                  const list = cubeInfo.cubeStageRewards || [];
                  return (
                    <div className="mt-4 bg-gray-900/60 border border-gray-700 rounded-lg p-4">
                      <div className="text-sm text-gray-300 mb-2">
                        에브니 큐브 보상{cubeLabel ? ` (${cubeLabel})` : ''}
                      </div>
                      {list.length === 0 ? (
                        <div className="text-xs text-gray-500">표시할 보상이 없습니다.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {list.map((r, i) => {
                            const info = getTradeClass(r.itemName);
                            const strikeCube = (!isGuardianTab && isExcludedForTotal(r.itemName)) ? 'line-through opacity-60' : '';
                            return (
                              <div key={i} className="text-xs">
                                <span className={`${info.nameClass} ${strikeCube}`}>{r.itemName}</span>
                                <span className={`ml-1 px-1 py-0.5 rounded ${info.badgeClass}`}>{info.badgeText}</span>
                                <span className="text-gray-400"> × {formatNumberWithSignificantDigits(r.quantity)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}

