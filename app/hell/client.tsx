'use client';

import { useEffect, useMemo, useState } from 'react';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  category?: string; // 카테고리 정보 (지옥3용)
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

type HellData = {
  '지옥1'?: Stage[];
  '지옥2'?: Stage[];
  '지옥3'?: Stage[];
};

type RatesProps = { exchange: number | null; discord: number | null };

export default function HellClient({ data, rates }: { data: HellData | undefined, rates: RatesProps }) {
  const hellTypes = ['지옥1', '지옥2', '지옥3'];
  const [activeHellType, setActiveHellType] = useState<string>('지옥1');
  const [activeHellStage, setActiveHellStage] = useState<string>('0단계');
  
  // 지옥 보상 스위치 상태
  const [has97Stone, setHas97Stone] = useState(false); // 97돌 있음
  const [hasExtraFragments, setHasExtraFragments] = useState(false); // 파편 남아돌음
  const [braceletGraduated, setBraceletGraduated] = useState(false); // 팔찌 졸업함
  const [karmaGraduated, setKarmaGraduated] = useState(false); // 카르마 졸업함
  const [arkgridGraduated, setArkgridGraduated] = useState(false); // 아크그리드 졸업함
  
  // 지옥3 카테고리 펼치기 상태
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // 첫 로드 시 첫 번째 단계 선택
  useMemo(() => {
    if (!activeHellType) {
      setActiveHellType('지옥1');
    }
    if (!activeHellStage) {
      setActiveHellStage('0단계');
    }
    if (activeHellType && data) {
      const stages = data[activeHellType as '지옥1' | '지옥2' | '지옥3'];
      if (stages && stages.length > 0) {
        const firstStage = stages.find(s => s.stage === activeHellStage) || stages[0];
        if (firstStage && firstStage.stage !== activeHellStage) {
          setActiveHellStage(firstStage.stage);
        }
      }
    }
  }, [activeHellType, activeHellStage, data]);
  
  // 현재 표시할 데이터 결정
  let currentLevelData: Stage[] = [];
  if (activeHellType && data) {
    const stages = data[activeHellType as '지옥1' | '지옥2' | '지옥3'];
    if (stages) {
      if (activeHellStage) {
        const selectedStage = stages.find(s => s.stage === activeHellStage);
        currentLevelData = selectedStage ? [selectedStage] : [];
      } else {
        currentLevelData = stages;
      }
    }
  } else {
    // 데이터가 없어도 빈 Stage 구조로 표시
    currentLevelData = activeHellStage ? [{
      stage: activeHellStage,
      rewards: []
    }] : [];
  }

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

  // 지옥 보상 가격 조정 함수
  const getAdjustedPrice = (itemName: string, originalPrice: number | null | undefined): number | null => {
    // 97돌 있음: 어빌리티 스톤 키트 단가를 0골드로
    if (has97Stone && (itemName === '어빌리티 스톤 키트' || itemName.includes('어빌리티 스톤 키트'))) {
      return 0;
    }
    
    // 파편 남아돌음: 운명의 파편 단가를 0골드로
    if (hasExtraFragments && itemName === '운명의 파편') {
      return 0;
    }
    
    // 팔찌 졸업함: 고대 팔찌 단가를 0골드로
    if (braceletGraduated && itemName === '고대 팔찌') {
      return 0;
    }
    
    // 카르마 졸업함: 정련된 운명의 돌 단가를 0골드로
    if (karmaGraduated && itemName === '정련된 운명의 돌') {
      return 0;
    }
    
    // 아크그리드 졸업함: 젬 랜덤, 젬 선택 단가를 0골드로
    if (arkgridGraduated && (
      itemName === '희귀~영웅 젬 상자' || 
      itemName === '희귀~영웅 젬 랜덤 상자' ||
      itemName === '희귀 젬 선택 상자' ||
      itemName.includes('젬 상자') ||
      itemName.includes('젬 선택')
    )) {
      return 0;
    }
    
    return originalPrice ?? null;
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
  
  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-400 mb-2">데이터 없음</h2>
            <p className="text-gray-400">
              지옥 보상 데이터가 없습니다.
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
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">지옥 보상 계산기</h1>
          <p className="text-sm md:text-base text-gray-400">지옥 보상과 골드 가치를 확인하세요.</p>
        </div>
        
        {/* 지옥 선택 UI */}
        <div className="mb-6 space-y-4">
          {/* 지옥1, 지옥2, 지옥3 선택 */}
          <div className="flex gap-2">
            {hellTypes.map(hellType => (
              <button
                key={hellType}
                onClick={() => {
                  setActiveHellType(hellType);
                  // 데이터가 있으면 첫 번째 단계로 설정, 없으면 0단계 유지
                  if (data) {
                    const stages = data[hellType as '지옥1' | '지옥2' | '지옥3'];
                    if (stages && stages.length > 0) {
                      setActiveHellStage(stages[0].stage);
                    } else {
                      setActiveHellStage('0단계');
                    }
                  } else {
                    setActiveHellStage('0단계');
                  }
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  activeHellType === hellType
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {hellType}
              </button>
            ))}
          </div>
          
          {/* 단계 선택 (0단계 ~ 10단계) */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">단계 선택</label>
            <select
              value={activeHellStage}
              onChange={(e) => setActiveHellStage(e.target.value)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-red-500"
            >
              {Array.from({ length: 11 }, (_, i) => {
                const stageName = `${i}단계`;
                // 데이터가 있으면 해당 단계가 있는지 확인
                const hasData = data && data[activeHellType as '지옥1' | '지옥2' | '지옥3']?.some(s => s.stage === stageName);
                return (
                  <option key={stageName} value={stageName}>
                    {stageName} {hasData ? '' : '(데이터 없음)'}
                  </option>
                );
              })}
            </select>
            {data && !data[activeHellType as '지옥1' | '지옥2' | '지옥3'] && (
              <p className="text-yellow-400 text-sm mt-2">
                {activeHellType} 데이터가 없습니다. 데이터를 추가해주세요.
              </p>
            )}
          </div>
          
          {/* 지옥 보상 스위치 */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-sm font-semibold text-white mb-3">보상 가치 조정</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={has97Stone}
                  onChange={(e) => setHas97Stone(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-300">97돌 있음</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasExtraFragments}
                  onChange={(e) => setHasExtraFragments(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-300">파편 남아돌음</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={braceletGraduated}
                  onChange={(e) => setBraceletGraduated(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-300">팔찌 졸업함</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={karmaGraduated}
                  onChange={(e) => setKarmaGraduated(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-300">카르마 졸업함</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={arkgridGraduated}
                  onChange={(e) => setArkgridGraduated(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                />
                <span className="text-sm text-gray-300">아크그리드 졸업함</span>
              </label>
            </div>
          </div>
        </div>
        
        {/* 단계별 보상 표시 */}
        <div className="space-y-6">
          {currentLevelData.map((stage, idx) => {
            const isHell3 = activeHellType === '지옥3';
            
            // 지옥3인 경우 카테고리별로 그룹화
            const groupedByCategory = isHell3 && stage.rewards.some(r => r.category) 
              ? stage.rewards.reduce((acc, reward) => {
                  const category = reward.category || '기타';
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(reward);
                  return acc;
                }, {} as { [category: string]: RewardItem[] })
              : null;
            
            // 지옥 보상 기대값 계산
            let hellExpectedValue: number | null = null;
            let baseRewardValue: number = 0;
            if (isHell3 && groupedByCategory) {
              const categories = Object.keys(groupedByCategory);
              // 기본 보상 상자 찾기 (첫 번째 카테고리 또는 "기본 보상" 이름의 카테고리)
              const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
              const otherCategories = categories.filter(cat => cat !== baseCategory);
              
              // 기본 보상 가치 계산 (가격 조정 적용)
              if (baseCategory && groupedByCategory[baseCategory]) {
                baseRewardValue = groupedByCategory[baseCategory].reduce((sum, r) => {
                  const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                  return sum + ((adjustedPrice || 0) * r.quantity);
                }, 0);
              }
              
              // 선택 보상 기대값 계산: 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
              if (otherCategories.length >= 3) {
                // 모든 3개 조합 생성
                const combinations: string[][] = [];
                for (let i = 0; i < otherCategories.length; i++) {
                  for (let j = i + 1; j < otherCategories.length; j++) {
                    for (let k = j + 1; k < otherCategories.length; k++) {
                      combinations.push([otherCategories[i], otherCategories[j], otherCategories[k]]);
                    }
                  }
                }
                
                // 각 조합의 최고값 계산 (가격 조정 적용)
                const maxValues: number[] = [];
                combinations.forEach(combo => {
                  const comboValues = combo.map(cat => {
                    return groupedByCategory[cat].reduce((sum, r) => {
                      const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                      return sum + ((adjustedPrice || 0) * r.quantity);
                    }, 0);
                  });
                  maxValues.push(Math.max(...comboValues));
                });
                
                // 기대값 = 모든 최고값의 평균
                const expectedSelectionValue = maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
                hellExpectedValue = baseRewardValue + expectedSelectionValue;
              } else if (otherCategories.length > 0) {
                // 카테고리가 3개 미만이면 모든 카테고리의 최고값 (가격 조정 적용)
                const otherValues = otherCategories.map(cat => {
                  return groupedByCategory[cat].reduce((sum, r) => {
                    const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                    return sum + ((adjustedPrice || 0) * r.quantity);
                  }, 0);
                });
                const maxOtherValue = Math.max(...otherValues);
                hellExpectedValue = baseRewardValue + maxOtherValue;
              } else {
                // 선택 보상이 없으면 기본 보상만
                hellExpectedValue = baseRewardValue;
              }
            }
            
            return (
              <div key={idx} className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-white">단계 {stage.stage}</h3>
                  {isHell3 && hellExpectedValue !== null ? (
                    <div className="text-right">
                      <div className="text-sm text-gray-400 mb-2">
                        <div>기본 보상 상자: 100% 제공</div>
                        <div className="text-xs text-gray-500 mt-1">
                          선택 보상: 나머지 카테고리 중 3개 랜덤 선택 → 최고값 선택
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">기대값 (기본 + 선택)</div>
                      <div className="text-3xl font-bold text-yellow-400">
                        {formatNumberWithSignificantDigits(hellExpectedValue)}골드
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 지옥3: 카테고리별 그룹화 표시 */}
                {isHell3 && groupedByCategory ? (
                  <div className="space-y-3">
                    {Object.entries(groupedByCategory).map(([category, rewards]) => {
                      const isExpanded = expandedCategories.has(category);
                      const categoryTotal = rewards.reduce((sum, r) => {
                        const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                        return sum + ((adjustedPrice || 0) * r.quantity);
                      }, 0);
                      
                      return (
                        <div key={category} className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                          <button
                            onClick={() => {
                              setExpandedCategories(prev => {
                                const next = new Set(prev);
                                if (next.has(category)) {
                                  next.delete(category);
                                } else {
                                  next.add(category);
                                }
                                return next;
                              });
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                ▶
                              </span>
                              <span className="font-semibold text-white">{category}</span>
                              <span className="text-sm text-gray-400">
                                ({rewards.length}개 구성품)
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-400">카테고리 합계</div>
                              <div className="text-lg font-bold text-yellow-400">
                                {formatNumberWithSignificantDigits(categoryTotal)}골드
                              </div>
                            </div>
                          </button>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-700">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                {rewards.map((reward, rewardIdx) => {
                                  const adjustedPrice = getAdjustedPrice(reward.itemName, reward.price);
                                  const itemTotal = (adjustedPrice || 0) * reward.quantity;
                                  const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                                  const priceStr = adjustedPrice !== null ? formatNumberWithSignificantDigits(adjustedPrice) : '';
                                  const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                                  const tradeInfo = getTradeClass(reward.itemName);
                                  
                                  return (
                                    <div
                                      key={rewardIdx}
                                      className="bg-gray-900/50 rounded-lg border border-gray-700 p-3"
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`font-medium ${tradeInfo.nameClass}`}>{reward.itemName}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                                      </div>
                                      <div className="text-gray-400 text-sm mb-1">수량: {quantityStr}</div>
                                      {reward.itemName === '어빌리티 스톤 키트' || reward.itemName.includes('어빌리티 스톤 키트') ? (
                                        <div>
                                          <div className="text-blue-400 text-xs mb-1">페온 9개 + 100골드</div>
                                          {adjustedPrice !== null && adjustedPrice > 0 ? (
                                            <div className="text-yellow-400 text-sm">
                                              {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                            </div>
                                          ) : adjustedPrice === 0 ? (
                                            <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                                          ) : (
                                            <div className="text-gray-500 text-xs">크리스탈 환율 정보 없음</div>
                                          )}
                                        </div>
                                      ) : adjustedPrice !== null && adjustedPrice > 0 ? (
                                        <div className="text-yellow-400 text-sm">
                                          {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                                        </div>
                                      ) : adjustedPrice === 0 ? (
                                        <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                                      ) : (
                                        <div className="text-gray-500 text-xs">가격 정보 없음</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {stage.rewards.map((reward, rewardIdx) => {
                      const adjustedPrice: number | null = getAdjustedPrice(reward.itemName, reward.price);
                      const itemTotal = (adjustedPrice ?? 0) * reward.quantity;
                      const quantityStr = formatNumberWithSignificantDigits(reward.quantity);
                      const priceStr = adjustedPrice !== null ? formatNumberWithSignificantDigits(adjustedPrice) : '';
                      const itemTotalStr = formatNumberWithSignificantDigits(itemTotal);
                      const tradeInfo = getTradeClass(reward.itemName);
                      
                      return (
                        <div
                          key={rewardIdx}
                          className="bg-gray-900/50 rounded-lg border border-gray-700 p-4 flex items-center gap-3"
                        >
                          <ItemIcon name={reward.itemName} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${tradeInfo.nameClass}`}>{reward.itemName}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${tradeInfo.badgeClass}`}>{tradeInfo.badgeText}</span>
                            </div>
                            <div className="text-gray-400 text-sm">수량: {quantityStr}</div>
                            {adjustedPrice !== null && adjustedPrice > 0 ? (
                              <div className="text-yellow-400 text-sm">
                                {priceStr}골드 × {quantityStr} = {itemTotalStr}골드
                              </div>
                            ) : adjustedPrice === 0 ? (
                              <div className="text-gray-500 text-xs">스위치로 인해 0골드로 처리됨</div>
                            ) : (
                              <div className="text-gray-500 text-xs">가격 정보 없음</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

