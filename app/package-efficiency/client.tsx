'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

type ComponentItem = {
  itemName: string;
  quantity: number;
  manualPrice?: number | null;
  manualUnitType?: '골드' | '크리스탈' | '현금' | null;
  probability?: number; // 확률 타입용
  selected?: boolean; // 선택 타입용
};

type PackageItem = {
  itemName: string;
  itemType: '확정' | '확률' | '선택'; // 새로 추가
  quantity: number; // 상위 항목 개수
  components: ComponentItem[];
  priceType?: '현금' | '크리스탈' | '골드' | '보너스'; // 보너스룸용 가격 타입
  price?: number; // 보너스룸용 가격
};

type BonusRoom = {
  roomName: string; // '보너스룸1', '보너스룸2', '보너스룸3'
  items: PackageItem[];
};

type PackageData = {
  packageName: string;
  category: '월간' | '주간' | '한정';
  priceType: '현금' | '크리스탈' | '골드';
  price: number;
  packageType: '일반' | '3+1' | '보너스룸';
  is3Plus1: boolean; // 3+1 타입일 때 요약 화면에서 체크 여부
  purchaseCount: number;
  endDate: string | null;
  items: PackageItem[];
  bonusRooms?: BonusRoom[]; // 보너스룸 타입일 때만 사용
};

type EtcListItem = {
  crystal: number | null;
  gold: number | null;
  cash: number | null;
};

type MarketItem = {
  displayName?: string;
  Name?: string;
  Grade?: string;
  CurrentMinPrice?: number;
  RecentPrice?: number;
};

type RewardItem = {
  itemName: string;
  quantity: number;
  price?: number | null;
  category?: string;
};

type Stage = {
  stage: string;
  rewards: RewardItem[];
};

export default function PackageEfficiencyClient({
  itemList,
  etcListData,
  crystalGoldRate,
  marketPriceMap,
  marketData,
  cubeStageTotals,
  cubeStageRewards,
  valueDbMap,
  hellStages,
  hell1Stages,
  hell2Stages,
  narakStages,
  narak1Stages,
  narak2Stages,
}: {
  itemList: string[];
  etcListData: { [key: string]: EtcListItem };
  crystalGoldRate: number | null;
  marketPriceMap: Record<string, number>;
  marketData: any;
  cubeStageTotals: Record<string, number>;
  cubeStageRewards: Record<string, { itemName: string; quantity: number }[]>;
  valueDbMap: Record<string, ValueDbEntry>;
  hellStages?: Stage[];
  hell1Stages?: Stage[];
  hell2Stages?: Stage[];
  narakStages?: Stage[];
  narak1Stages?: Stage[];
  narak2Stages?: Stage[];
}) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
  const { adjustedEntries } = useValueDb();
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  
  // 가격 조정 스위치 변경 시 resolveUnitPrice 재계산을 위한 refresh key
  const [refreshKey, setRefreshKey] = useState(0);
  
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  // 디코기준 스위치 동기화
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

  const [packageData, setPackageData] = useState<PackageData>({
    packageName: '',
    category: '월간',
    priceType: '골드',
    price: 0,
    packageType: '일반',
    is3Plus1: false,
    purchaseCount: 1,
    endDate: null,
    items: [],
    bonusRooms: [
      { roomName: '보너스룸1', items: [] },
      { roomName: '보너스룸2', items: [] },
      { roomName: '보너스룸3', items: [] },
    ],
  });

  // 저장된 패키지 관련 상태
  const [savedPackages, setSavedPackages] = useState<Array<{ id: string; package_name: string; created_at: string; updated_at: string }>>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePackageName, setSavePackageName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  // 젬 가격 계산 (등급별 평균)
  function calculateGemPriceByGrade(gemGrade: '영웅' | '희귀' | '고급'): number | null {
    if (!marketData) return null;
    
    // 모든 카테고리에서 아이템 찾기
    const allItems = [
      ...(marketData.tier4Results || []),
      ...(marketData.tier3Results || []),
      ...(marketData.gemResults || []),
      ...(marketData.otherResults || []),
      ...(marketData.relicEngravingResults || [])
    ];
    
    // 젬 목록 (총 6가지)
    const gemNames = [
      '질서의 젬 : 불변',
      '질서의 젬 : 견고',
      '질서의 젬 : 안정',
      '혼돈의 젬 : 침식',
      '혼돈의 젬 : 왜곡',
      '혼돈의 젬 : 붕괴',
    ];
    
    // 해당 등급의 젬 가격 수집
    const gemPrices: number[] = [];
    
    for (const gemName of gemNames) {
      // 정확한 이름과 등급으로 매칭
      const gem = allItems.find((i: MarketItem) => {
        const name = (i.displayName || i.Name || '').trim();
        const grade = i.Grade || '';
        return name === gemName && grade === gemGrade;
      });
      
      if (gem) {
        const price = gem.CurrentMinPrice || gem.RecentPrice;
        if (price && price > 0) {
          gemPrices.push(price);
        }
      }
    }
    
    // 6가지 젬 가격의 평균 계산
    if (gemPrices.length === 0) return null;
    
    const averagePrice = gemPrices.reduce((sum, price) => sum + price, 0) / gemPrices.length;
    return averagePrice;
  }

  // 구성요소 단가 해석: etc_list 우선, 없으면 캐시 골드, 없으면 null
  const resolveUnitPrice = useCallback((itemName: string): { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null => {
    // 순환 돌파석: 가치계산DB Context에서 계산된 값 사용 (이미 가격조정 적용됨)
    if (itemName === '순환 돌파석') {
      const entry = adjustedEntries.find(e => e.itemName === itemName);
      if (entry && entry.unitType === '골드' && entry.unitValue != null) {
        return { unitType: '골드', unitPrice: entry.unitValue };
      }
      return null;
    }

    // 지옥/나락 열쇠: 클라이언트에서 재계산 (지옥 보상 계산기와 동일한 방식)
    const isHellKey = itemName.includes('지옥 열쇠');
    const isNarakKey = itemName.includes('나락의') && itemName.includes('열쇠');
    
    if ((isHellKey || isNarakKey) && (hellStages || hell1Stages || hell2Stages) && (narakStages || narak1Stages || narak2Stages)) {
      // 가치계산DB에서 아이템 가격 가져오기 함수
      const getValueDbPrice = (itemName: string): number | null => {
        const entry = valueDbMap[itemName];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          return entry.unitValue;
        }
        return null;
      };

      // 지옥 보상 가격 조정 함수 (모든 아이템은 가치계산DB 우선 사용)
      const getAdjustedPrice = (itemName: string, originalPrice: number | null | undefined): number | null => {
        // 모든 아이템은 가치계산DB에서 가격 가져오기 (우선순위)
        const valueDbPrice = getValueDbPrice(itemName);
        if (valueDbPrice != null) {
          // 가격 조정 적용
          return adjustPrice(itemName, valueDbPrice);
        }
        
        // 가치계산DB에 없는 경우 기존 로직 사용 후 가격 조정 적용
        let price = originalPrice ?? null;
        if (price != null) {
          price = adjustPrice(itemName, price);
        }
        
        return price;
      };

      // 지옥3 스테이지 기대값 계산
      const calculateHellStageExpectedValue = (stage: Stage, isNarak: boolean = false): number | null => {
        if (!stage || !stage.rewards || stage.rewards.length === 0) return null;
        
        // 카테고리별로 그룹화
        const groupedByCategory: Record<string, RewardItem[]> = {};
        stage.rewards.forEach((reward) => {
          const category = reward.category || '기본';
          if (!groupedByCategory[category]) {
            groupedByCategory[category] = [];
          }
          groupedByCategory[category].push(reward);
        });
        
        const categories = Object.keys(groupedByCategory);
        if (categories.length === 0) return null;
        
        if (isNarak) {
          // 나락: 기본 보상 없음, 모든 카테고리 중 3개를 랜덤 추출 후 최고가 선택
          if (categories.length >= 3) {
            // 모든 3개 조합 생성
            const combinations: string[][] = [];
            for (let i = 0; i < categories.length; i++) {
              for (let j = i + 1; j < categories.length; j++) {
                for (let k = j + 1; k < categories.length; k++) {
                  combinations.push([categories[i], categories[j], categories[k]]);
                }
              }
            }
            
            // 각 조합의 최고값 계산 (가격 조정 적용, 가치계산DB 우선 사용)
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
            return maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
          } else if (categories.length > 0) {
            // 카테고리가 3개 미만이면 모든 카테고리의 최고값
            const categoryValues = categories.map(cat => {
              return groupedByCategory[cat].reduce((sum, r) => {
                const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                return sum + ((adjustedPrice || 0) * r.quantity);
              }, 0);
            });
            return Math.max(...categoryValues);
          }
          return null;
        } else {
          // 지옥: 기본 보상 + 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
          const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
          const otherCategories = categories.filter(cat => cat !== baseCategory);
          
          // 기본 보상 가치 계산
          // 풍요 시 10배 기대값 고려: 100% + 90% = 190%
          let baseRewardValue = 0;
          if (baseCategory && groupedByCategory[baseCategory]) {
            const baseValue = groupedByCategory[baseCategory].reduce((sum, r) => {
              const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
              return sum + ((adjustedPrice || 0) * r.quantity);
            }, 0);
            // 기본 보상 상자는 190% 반영 (100% 기본 + 90% 풍요 기대값)
            baseRewardValue = baseValue * 1.9;
          }
          
          if (otherCategories.length === 0) return baseRewardValue;
          
          // 선택 보상 기대값 계산
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
            
            // 각 조합의 최고값 계산
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
            return baseRewardValue + expectedSelectionValue;
          } else if (otherCategories.length > 0) {
            // 카테고리가 3개 미만이면 모든 카테고리의 최고값
            const otherValues = otherCategories.map(cat => {
              return groupedByCategory[cat].reduce((sum, r) => {
                const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
                return sum + ((adjustedPrice || 0) * r.quantity);
              }, 0);
            });
            const maxOtherValue = Math.max(...otherValues);
            return baseRewardValue + maxOtherValue;
          } else {
            return baseRewardValue;
          }
        }
      };

      // 지옥 열쇠 처리
      if (isHellKey) {
        // 지옥 열쇠 I: 지옥1
        if (itemName === '전설 지옥 열쇠 I' && hell1Stages) {
          const hell1_7Stage = hell1Stages.find(s => s.stage === '7단계');
          if (hell1_7Stage) {
            const value = calculateHellStageExpectedValue(hell1_7Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '영웅 지옥 열쇠 I' && hell1Stages) {
          const hell1_6Stage = hell1Stages.find(s => s.stage === '6단계');
          if (hell1_6Stage) {
            const value = calculateHellStageExpectedValue(hell1_6Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '희귀 지옥 열쇠 I' && hell1Stages) {
          const hell1_5Stage = hell1Stages.find(s => s.stage === '5단계');
          if (hell1_5Stage) {
            const value = calculateHellStageExpectedValue(hell1_5Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
        // 지옥 열쇠 II: 지옥2
        else if (itemName === '전설 지옥 열쇠 II' && hell2Stages) {
          const hell2_7Stage = hell2Stages.find(s => s.stage === '7단계');
          if (hell2_7Stage) {
            const value = calculateHellStageExpectedValue(hell2_7Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '영웅 지옥 열쇠 II' && hell2Stages) {
          const hell2_6Stage = hell2Stages.find(s => s.stage === '6단계');
          if (hell2_6Stage) {
            const value = calculateHellStageExpectedValue(hell2_6Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '희귀 지옥 열쇠 II' && hell2Stages) {
          const hell2_5Stage = hell2Stages.find(s => s.stage === '5단계');
          if (hell2_5Stage) {
            const value = calculateHellStageExpectedValue(hell2_5Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
        // 지옥 열쇠 III: 지옥3
        else if (itemName === '전설 지옥 열쇠 III' && hellStages) {
          const hell7Stage = hellStages.find(s => s.stage === '7단계');
          if (hell7Stage) {
            const value = calculateHellStageExpectedValue(hell7Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '영웅 지옥 열쇠 III' && hellStages) {
          const hell6Stage = hellStages.find(s => s.stage === '6단계');
          if (hell6Stage) {
            const value = calculateHellStageExpectedValue(hell6Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if (itemName === '희귀 지옥 열쇠 III' && hellStages) {
          const hell5Stage = hellStages.find(s => s.stage === '5단계');
          if (hell5Stage) {
            const value = calculateHellStageExpectedValue(hell5Stage, false);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
      }
      
      // 나락 열쇠 처리
      if (isNarakKey) {
        // 나락 열쇠 I: 나락1
        if ((itemName === '전설 나락의 화염 열쇠 I' || itemName === '전설 나락의 서리 열쇠 I') && narak1Stages) {
          const narak1_2Stage = narak1Stages.find(s => s.stage === '2단계');
          if (narak1_2Stage) {
            const value = calculateHellStageExpectedValue(narak1_2Stage, true);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
        // 나락 열쇠 II: 나락2
        else if ((itemName === '전설 나락의 화염 열쇠 II' || itemName === '전설 나락의 서리 열쇠 II') && narak2Stages) {
          const narak2_2Stage = narak2Stages.find(s => s.stage === '2단계');
          if (narak2_2Stage) {
            const value = calculateHellStageExpectedValue(narak2_2Stage, true);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
        // 나락 열쇠 III: 나락3
        else if ((itemName === '전설 나락의 화염 열쇠 III' || itemName === '전설 나락의 서리 열쇠 III') && narakStages) {
          const narak3_2Stage = narakStages.find(s => s.stage === '2단계');
          if (narak3_2Stage) {
            const value = calculateHellStageExpectedValue(narak3_2Stage, true);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        }
      }
    }

    // 에브니 큐브 입장권: cubeStageRewards를 사용하여 클라이언트에서 재계산 (카드경험치 미반영 반영)
    if (itemName.startsWith('에브니 큐브 입장권')) {
      const m = itemName.match(/\(([^)]+)\)/);
      const key = m ? m[1] : '';
      if (key && cubeStageRewards[key]) {
        // cubeStageRewards를 사용하여 재계산
        let sum = 0;
        for (const reward of cubeStageRewards[key]) {
          let originalPrice: number | null = null;
          
          if (reward.itemName === '카드 경험치') {
            // 카드 경험치인 경우 가치계산DB의 '카드경험치 1당' 가격 사용
            const cardExpEntry = Object.values(valueDbMap).find(e => e.itemName === '카드경험치 1당');
            if (cardExpEntry && cardExpEntry.unitValue != null) {
              originalPrice = cardExpEntry.unitValue;
            } else {
              const etc = etcListData[reward.itemName];
              if (etc?.gold != null) {
                originalPrice = etc.gold;
              } else if (marketPriceMap[reward.itemName] != null) {
                originalPrice = marketPriceMap[reward.itemName];
              }
            }
          } else {
            // 다른 보상의 경우 원본 가격 찾기
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            }
          }
          
          // adjustPrice로 가격 조정 (카드경험치 미반영, 돌파석 미반영, 파편 미반영 등)
          const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
          if (adjustedPrice != null && adjustedPrice > 0) {
            sum += adjustedPrice * reward.quantity;
          }
        }
        return { unitType: '골드', unitPrice: sum };
      }
      // cubeStageRewards에 없으면 valueDbMap에서 찾기 (fallback)
      const valueDbEntry = valueDbMap[itemName];
      if (valueDbEntry && valueDbEntry.unitType === '골드' && valueDbEntry.unitValue != null) {
        const adjustedValue = adjustPrice(itemName, valueDbEntry.unitValue) ?? valueDbEntry.unitValue;
        return { unitType: '골드', unitPrice: adjustedValue };
      }
      // cubeStageTotals fallback (하위 호환성)
      if (key && cubeStageTotals[key] != null) {
        const price = adjustPrice(itemName, cubeStageTotals[key]) ?? cubeStageTotals[key];
        return { unitType: '골드', unitPrice: price };
      }
      return null;
    }

    const valueDbEntry = valueDbMap[itemName];
    if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
      let adjustedValue = valueDbEntry.unitValue;
      // 골드 단위인 경우 가격 조정 적용
      if (valueDbEntry.unitType === '골드') {
        // 유물 각인서 랜덤의 경우 특별 처리
        if (itemName === '유물 각인서 랜덤' || itemName === '유물 각인서 랜덤 주머니') {
          adjustedValue = adjustRelicEngravingAverage(adjustedValue) ?? adjustedValue;
        } else {
          adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
        }
      }
      return {
        unitType: valueDbEntry.unitType,
        unitPrice: adjustedValue,
      };
    }
    // 젬 아이템 처리
    if (itemName === '고급 젬') {
      const price = calculateGemPriceByGrade('고급');
      if (price != null) {
        const adjusted = adjustPrice(itemName, price) ?? price;
        return { unitType: '골드', unitPrice: adjusted };
      }
    } else if (itemName === '희귀 젬') {
      const price = calculateGemPriceByGrade('희귀');
      if (price != null) {
        const adjusted = adjustPrice(itemName, price) ?? price;
        return { unitType: '골드', unitPrice: adjusted };
      }
    } else if (itemName === '영웅 젬') {
      const price = calculateGemPriceByGrade('영웅');
      if (price != null) {
        const adjusted = adjustPrice(itemName, price) ?? price;
        return { unitType: '골드', unitPrice: adjusted };
      }
    }
    
    const etc = etcListData[itemName];
    if (etc) {
      if (etc.cash != null) {
        const adjusted = adjustPrice(itemName, etc.cash) ?? etc.cash;
        return { unitType: '현금', unitPrice: adjusted };
      }
      if (etc.gold != null) {
        const adjusted = adjustPrice(itemName, etc.gold) ?? etc.gold;
        return { unitType: '골드', unitPrice: adjusted };
      }
      if (etc.crystal != null) return { unitType: '크리스탈', unitPrice: etc.crystal };
    }
    const market = marketPriceMap[itemName];
    if (market != null && market > 0) {
      const adjusted = adjustPrice(itemName, market) ?? market;
      return { unitType: '골드', unitPrice: adjusted };
    }
    return null;
  }, [cubeStageRewards, valueDbMap, etcListData, marketPriceMap, cubeStageTotals, adjustPrice, adjustRelicEngravingAverage, calculateGemPriceByGrade, refreshKey, hellStages, hell1Stages, hell2Stages, narakStages, narak1Stages, narak2Stages, adjustedEntries]);

  // 아이템 가격 계산 함수
  const calculateItemPrice = (
    itemName: string,
    quantity: number,
    targetType: 'cash' | 'crystal',
    override?: { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null
  ): number => {
    const resolved = override ?? resolveUnitPrice(itemName);
    if (!resolved) return 0;

    let valueInGold: number | null = null;

    // 1. 골드 값 확보 (단위에 따른 변환)
    if (resolved.unitType === '골드') {
      valueInGold = resolved.unitPrice;
    } else if (resolved.unitType === '크리스탈') {
      if (crystalGoldRate && crystalGoldRate > 0) valueInGold = (resolved.unitPrice * crystalGoldRate) / 100;
    } else if (resolved.unitType === '현금') {
      if (goldToCashPerGold && goldToCashPerGold > 0) valueInGold = resolved.unitPrice / goldToCashPerGold;
    }

    if (valueInGold === null) return 0;

    // 2. 목표 타입으로 환산
    if (targetType === 'cash') {
      // 골드 → 현금
      if (goldToCashPerGold) {
        return valueInGold * goldToCashPerGold * quantity;
      }
      return 0;
    } else {
      // 골드 → 크리스탈
      if (crystalGoldRate && crystalGoldRate > 0) {
        return (valueInGold / crystalGoldRate) * 100 * quantity;
      }
      return 0;
    }
  };

  // 전체 구성품 합계 계산 (타입별 로직 적용)
  const totalValue = useMemo(() => {
    let total = 0;
    
    // 계산할 items 목록 결정
    const itemsToCalculate = packageData.packageType === '보너스룸' 
      ? (packageData.bonusRooms || []).flatMap(room => room.items)
      : packageData.items;
    
    itemsToCalculate.forEach((packageItem) => {
      packageItem.components.forEach((component) => {
        const isManual = component.itemName === '__manual__' || component.itemName === '';
        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
          : resolved;
        
        if (!finalUnitPrice) return;

        let componentValue = 0;

        // 가치 계산 (패키지 가격 타입에 맞춰)
        if (packageData.priceType === '현금') {
          componentValue = calculateItemPrice(
            component.itemName || '직접입력',
            component.quantity || 0,
            'cash',
            finalUnitPrice
          );
        } else if (packageData.priceType === '크리스탈') {
          componentValue = calculateItemPrice(
            component.itemName || '직접입력',
            component.quantity || 0,
            'crystal',
            finalUnitPrice
          );
        } else if (packageData.priceType === '골드') {
          if (finalUnitPrice.unitType === '골드') {
            componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
          } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
            componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
          } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
            componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
          }
        }

        // 상위 항목 개수 적용
        const itemQuantity = packageItem.quantity || 1;
        
        // 타입별 처리
        if (packageItem.itemType === '확정') {
          // 확정: 모든 구성요소 가치 합산
          total += componentValue * itemQuantity;
        } else if (packageItem.itemType === '확률') {
          // 확률: 가치 * 확률(0~1)로 기대값 합산
          const probability = component.probability || 0;
          total += componentValue * probability * itemQuantity;
        } else if (packageItem.itemType === '선택') {
          // 선택: 선택된 구성요소만 가치 합산
          if (component.selected) {
            total += componentValue * itemQuantity;
          }
        }
      });
    });
    return total;
  }, [packageData.items, packageData.bonusRooms, packageData.packageType, packageData.priceType, etcListData, crystalGoldRate, goldToCashPerGold, marketPriceMap, valueDbMap, resolveUnitPrice]);

  // 효율 계산 (배수)
  const efficiency = useMemo(() => {
    if (packageData.price <= 0) return null;
    let effectivePrice = packageData.price;
    
    // 3+1 타입이고 3+1 적용 체크된 경우 (4개 구매 시 3개 가격으로 계산)
    if (packageData.packageType === '3+1' && packageData.is3Plus1) {
      effectivePrice = (packageData.price * 3) / 4;
    }
    
    return totalValue / effectivePrice;
  }, [totalValue, packageData.price, packageData.packageType, packageData.is3Plus1]);

  // 보너스룸: 각 묶음 항목별 가치 계산
  const calculateItemValue = useCallback((packageItem: PackageItem, itemPriceType: '현금' | '크리스탈' | '골드' | '보너스'): number => {
    let itemValue = 0;
    
    packageItem.components.forEach((component) => {
      const isManual = component.itemName === '__manual__' || component.itemName === '';
      const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
      const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
        ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
        : resolved;
      
      if (!finalUnitPrice) return;

      let componentValue = 0;

      // 가치 계산 (묶음 항목 가격 타입에 맞춰)
      if (itemPriceType === '현금') {
        componentValue = calculateItemPrice(
          component.itemName || '직접입력',
          component.quantity || 0,
          'cash',
          finalUnitPrice
        );
      } else if (itemPriceType === '크리스탈') {
        componentValue = calculateItemPrice(
          component.itemName || '직접입력',
          component.quantity || 0,
          'crystal',
          finalUnitPrice
        );
      } else if (itemPriceType === '골드') {
        if (finalUnitPrice.unitType === '골드') {
          componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
        }
      }

      const itemQuantity = packageItem.quantity || 1;
      
      if (packageItem.itemType === '확정') {
        itemValue += componentValue * itemQuantity;
      } else if (packageItem.itemType === '확률') {
        const probability = component.probability || 0;
        itemValue += componentValue * probability * itemQuantity;
      } else if (packageItem.itemType === '선택') {
        if (component.selected) {
          itemValue += componentValue * itemQuantity;
        }
      }
    });
    
    return itemValue;
  }, [resolveUnitPrice, calculateItemPrice, crystalGoldRate, goldToCashPerGold]);

  // 보너스룸: 각 보너스룸별 가치 및 효율 계산
  const bonusRoomEfficiencies = useMemo(() => {
    if (packageData.packageType !== '보너스룸' || !packageData.bonusRooms) return null;
    
    return packageData.bonusRooms.map((room) => {
      let roomValue = 0;
      let roomPrice = 0;
      const itemEfficiencies = room.items.map((item) => {
        const itemValue = calculateItemValue(item, item.priceType || '골드');
        const itemPrice = item.price || 0;
        const itemPriceType = item.priceType || '골드';
        
        // 가격 타입 변환 (보너스는 0)
        let convertedPrice = 0;
        if (itemPriceType === '보너스') {
          convertedPrice = 0;
        } else if (itemPriceType === '골드') {
          convertedPrice = itemPrice;
        } else if (itemPriceType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          convertedPrice = (itemPrice * crystalGoldRate) / 100;
        } else if (itemPriceType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          convertedPrice = itemPrice / goldToCashPerGold;
        }
        
        // 가치도 골드로 변환
        let convertedValue = itemValue;
        if (itemPriceType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          // 크리스탈 → 골드: 크리스탈 가치 * (크리스탈당 골드 비율) / 100
          convertedValue = (itemValue * crystalGoldRate) / 100;
        } else if (itemPriceType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          // 현금 → 골드: 현금 가치 / (골드당 현금 비율)
          convertedValue = itemValue / goldToCashPerGold;
        }
        
        roomValue += convertedValue;
        roomPrice += convertedPrice;
        
        const efficiency = convertedPrice > 0 ? convertedValue / convertedPrice : null;
        
        return {
          itemName: item.itemName || '미입력',
          itemType: item.itemType,
          value: convertedValue,
          price: convertedPrice,
          originalPrice: itemPrice, // 원래 가격 저장
          priceType: itemPriceType,
          efficiency,
        };
      });
      
      const roomEfficiency = roomPrice > 0 ? roomValue / roomPrice : null;
      
      return {
        roomName: room.roomName,
        items: itemEfficiencies,
        totalValue: roomValue,
        totalPrice: roomPrice,
        efficiency: roomEfficiency,
      };
    });
  }, [packageData.packageType, packageData.bonusRooms, calculateItemValue, crystalGoldRate, goldToCashPerGold]);

  const addPackageItem = () => {
    setPackageData((prev) => ({
      ...prev,
      items: [...prev.items, { itemName: '', itemType: '확정', quantity: 1, components: [] }],
    }));
  };

  const updatePackageItem = (index: number, field: keyof PackageItem, value: any) => {
    setPackageData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const addComponent = (itemIndex: number) => {
    setPackageData((prev) => {
      const newItems = [...prev.items];
      const packageItem = newItems[itemIndex];
      
      // 선택 타입일 때: 첫 번째 구성요소만 selected=true, 나머지는 false
      // 확률/확정 타입일 때: selected는 undefined
      const isSelectionType = packageItem.itemType === '선택';
      const isFirstComponent = packageItem.components.length === 0;
      
      newItems[itemIndex] = {
        ...newItems[itemIndex],
        components: [
          ...newItems[itemIndex].components,
          {
            itemName: '',
            quantity: 1,
            manualPrice: null,
            manualUnitType: null,
            probability: isSelectionType ? undefined : 0,
            selected: isSelectionType ? isFirstComponent : undefined,
          },
        ],
      };
      
      // 선택 타입에서 새 구성요소 추가 시 기존 선택 해제 (하나만 선택 가능)
      if (isSelectionType && !isFirstComponent) {
        newItems[itemIndex].components = newItems[itemIndex].components.map((comp, idx) => {
          if (idx === newItems[itemIndex].components.length - 1) {
            return { ...comp, selected: true };
          }
          return { ...comp, selected: false };
        });
      }
      
      return { ...prev, items: newItems };
    });
  };

  const updateComponent = (itemIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setPackageData((prev) => {
      const newItems = [...prev.items];
      const newComponents = [...newItems[itemIndex].components];
      newComponents[componentIndex] = { ...newComponents[componentIndex], [field]: value };
      
      // 선택 타입: 한 항목 선택 시 다른 항목 선택 해제
      if (field === 'selected' && value === true && newItems[itemIndex].itemType === '선택') {
        newComponents.forEach((comp, idx) => {
          if (idx !== componentIndex) {
            comp.selected = false;
          }
        });
      }
      
      newItems[itemIndex] = { ...newItems[itemIndex], components: newComponents };
      return { ...prev, items: newItems };
    });
  };

  const removePackageItem = (index: number) => {
    setPackageData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const removeComponent = (itemIndex: number, componentIndex: number) => {
    setPackageData((prev) => {
      const newItems = [...prev.items];
      newItems[itemIndex] = {
        ...newItems[itemIndex],
        components: newItems[itemIndex].components.filter((_, i) => i !== componentIndex),
      };
      return { ...prev, items: newItems };
    });
  };

  // 보너스룸 관련 함수들
  const addBonusRoomItem = (roomIndex: number) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      newBonusRooms[roomIndex] = {
        ...newBonusRooms[roomIndex],
        items: [
          ...newBonusRooms[roomIndex].items,
          { 
            itemName: '', 
            itemType: '확정', 
            quantity: 1, 
            components: [],
            priceType: '골드',
            price: 0,
          },
        ],
      };
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  const updateBonusRoomItem = (roomIndex: number, itemIndex: number, field: keyof PackageItem, value: any) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      const newItems = [...newBonusRooms[roomIndex].items];
      newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
      // 보너스 가격 타입일 때 가격을 0으로 고정
      if (field === 'priceType' && value === '보너스') {
        newItems[itemIndex].price = 0;
      }
      newBonusRooms[roomIndex] = { ...newBonusRooms[roomIndex], items: newItems };
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  const removeBonusRoomItem = (roomIndex: number, itemIndex: number) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      newBonusRooms[roomIndex] = {
        ...newBonusRooms[roomIndex],
        items: newBonusRooms[roomIndex].items.filter((_, i) => i !== itemIndex),
      };
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  const addBonusRoomComponent = (roomIndex: number, itemIndex: number) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      const bonusRoomItem = newBonusRooms[roomIndex].items[itemIndex];
      const isSelectionType = bonusRoomItem.itemType === '선택';
      const isFirstComponent = bonusRoomItem.components.length === 0;
      
      newBonusRooms[roomIndex].items[itemIndex] = {
        ...bonusRoomItem,
        components: [
          ...bonusRoomItem.components,
          {
            itemName: '',
            quantity: 1,
            manualPrice: null,
            manualUnitType: null,
            probability: isSelectionType ? undefined : 0,
            selected: isSelectionType ? isFirstComponent : undefined,
          },
        ],
      };
      
      if (isSelectionType && !isFirstComponent) {
        newBonusRooms[roomIndex].items[itemIndex].components = newBonusRooms[roomIndex].items[itemIndex].components.map((comp, idx) => {
          if (idx === newBonusRooms[roomIndex].items[itemIndex].components.length - 1) {
            return { ...comp, selected: true };
          }
          return { ...comp, selected: false };
        });
      }
      
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  const updateBonusRoomComponent = (roomIndex: number, itemIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      const newComponents = [...newBonusRooms[roomIndex].items[itemIndex].components];
      newComponents[componentIndex] = { ...newComponents[componentIndex], [field]: value };
      
      if (field === 'selected' && value === true && newBonusRooms[roomIndex].items[itemIndex].itemType === '선택') {
        newComponents.forEach((comp, idx) => {
          if (idx !== componentIndex) {
            comp.selected = false;
          }
        });
      }
      
      newBonusRooms[roomIndex].items[itemIndex] = {
        ...newBonusRooms[roomIndex].items[itemIndex],
        components: newComponents,
      };
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  const removeBonusRoomComponent = (roomIndex: number, itemIndex: number, componentIndex: number) => {
    setPackageData((prev) => {
      const newBonusRooms = [...(prev.bonusRooms || [])];
      newBonusRooms[roomIndex].items[itemIndex] = {
        ...newBonusRooms[roomIndex].items[itemIndex],
        components: newBonusRooms[roomIndex].items[itemIndex].components.filter((_, i) => i !== componentIndex),
      };
      return { ...prev, bonusRooms: newBonusRooms };
    });
  };

  // 새로 만들기 (초기화)
  const handleNewPackage = () => {
    if (packageData.packageName || packageData.items.length > 0 || (packageData.bonusRooms && packageData.bonusRooms.some(room => room.items.length > 0))) {
      if (!confirm('현재 작성 중인 내용이 있습니다. 새로 만들기를 하시겠습니까?')) {
        return;
      }
    }
    
    setPackageData({
      packageName: '',
      category: '월간',
      priceType: '골드',
      price: 0,
      packageType: '일반',
      is3Plus1: false,
      purchaseCount: 1,
      endDate: null,
      items: [],
      bonusRooms: [
        { roomName: '보너스룸1', items: [] },
        { roomName: '보너스룸2', items: [] },
        { roomName: '보너스룸3', items: [] },
      ],
    });
    setSelectedPackageId(null);
  };

  // 저장된 패키지 목록 불러오기
  useEffect(() => {
    async function loadSavedPackages() {
      try {
        const res = await fetch('/api/packages');
        const data = await res.json();
        if (data.packages) {
          setSavedPackages(data.packages);
        }
      } catch (error) {
        console.error('저장된 패키지 목록 불러오기 실패:', error);
      }
    }
    loadSavedPackages();
  }, []);

  // 패키지 저장
  const handleSavePackage = async () => {
    if (!packageData.packageName.trim()) {
      alert('패키지명을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const packageName = savePackageName.trim() || packageData.packageName;
      
      let res;
      if (selectedPackageId) {
        // 업데이트
        res = await fetch(`/api/packages/${selectedPackageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            package_name: packageName,
            package_data: packageData,
          }),
        });
      } else {
        // 새로 저장
        res = await fetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            package_name: packageName,
            package_data: packageData,
          }),
        });
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      // 저장된 패키지 목록 다시 불러오기
      const listRes = await fetch('/api/packages');
      const listData = await listRes.json();
      if (listData.packages) {
        setSavedPackages(listData.packages);
        if (data.package) {
          setSelectedPackageId(data.package.id);
          setPackageData((prev) => ({ ...prev, packageName: data.package.package_name }));
        }
      }

      setShowSaveModal(false);
      setSavePackageName('');
      alert(selectedPackageId ? '패키지가 업데이트되었습니다.' : '패키지가 저장되었습니다.');
    } catch (error: any) {
      console.error('패키지 저장 실패:', error);
      alert(error.message || '패키지 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 저장된 패키지 불러오기
  const handleLoadPackage = async (packageId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      
      if (data.packages) {
        const packageToLoad = data.packages.find((p: any) => p.id === packageId);
        if (packageToLoad && packageToLoad.package_data) {
          // 기존 데이터 호환성: quantity 필드가 없으면 기본값 1로 설정
          const loadedData = packageToLoad.package_data;
          if (loadedData.items && Array.isArray(loadedData.items)) {
            loadedData.items = loadedData.items.map((item: any) => ({
              ...item,
              quantity: item.quantity !== undefined ? item.quantity : 1,
            }));
          }
          // 보너스룸 데이터가 없으면 초기화
          if (!loadedData.bonusRooms) {
            loadedData.bonusRooms = [
              { roomName: '보너스룸1', items: [] },
              { roomName: '보너스룸2', items: [] },
              { roomName: '보너스룸3', items: [] },
            ];
          }
          setPackageData(loadedData);
          setSelectedPackageId(packageId);
          alert('패키지가 불러와졌습니다.');
        } else {
          throw new Error('패키지를 찾을 수 없습니다.');
        }
      }
    } catch (error: any) {
      console.error('패키지 불러오기 실패:', error);
      alert(error.message || '패키지 불러오기에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 패키지 삭제
  const handleDeletePackage = async (packageId: string) => {
    if (!confirm('이 패키지를 삭제하시겠습니까?')) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }

      // 저장된 패키지 목록 다시 불러오기
      const listRes = await fetch('/api/packages');
      const listData = await listRes.json();
      if (listData.packages) {
        setSavedPackages(listData.packages);
      }

      if (selectedPackageId === packageId) {
        setSelectedPackageId(null);
        setPackageData({
          packageName: '',
          category: '월간',
          priceType: '골드',
          price: 0,
          packageType: '일반',
          is3Plus1: false,
          purchaseCount: 1,
          endDate: null,
          items: [],
          bonusRooms: [
            { roomName: '보너스룸1', items: [] },
            { roomName: '보너스룸2', items: [] },
            { roomName: '보너스룸3', items: [] },
          ],
        });
      }

      alert('패키지가 삭제되었습니다.');
    } catch (error: any) {
      console.error('패키지 삭제 실패:', error);
      alert(error.message || '패키지 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold text-white">패키지 효율 계산기</h1>
            <div className="flex gap-2">
              {/* 저장된 패키지 목록 */}
              {savedPackages.length > 0 && (
                <select
                  value={selectedPackageId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleLoadPackage(e.target.value);
                    }
                  }}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  disabled={isLoading}
                >
                  <option value="">저장된 패키지 불러오기</option>
                  {savedPackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.package_name} ({new Date(pkg.updated_at).toLocaleDateString('ko-KR')})
                    </option>
                  ))}
                </select>
              )}
              {/* 새로 만들기 버튼 */}
              <button
                onClick={handleNewPackage}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                새로 만들기
              </button>
            </div>
          </div>
          <p className="text-gray-400">패키지를 스스로 계산해볼 수 있습니다.</p>
        </div>

        {/* 저장 모달 */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-white mb-4">
                {selectedPackageId ? '패키지 업데이트' : '패키지 저장'}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">패키지명</label>
                <input
                  type="text"
                  value={savePackageName}
                  onChange={(e) => setSavePackageName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="패키지명 입력"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setSavePackageName('');
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  onClick={handleSavePackage}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  disabled={isLoading || !savePackageName.trim()}
                >
                  {isLoading ? '처리 중...' : selectedPackageId ? '업데이트' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 입력 폼 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">패키지 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">패키지명</label>
              <input
                type="text"
                value={packageData.packageName}
                onChange={(e) => setPackageData((prev) => ({ ...prev, packageName: e.target.value }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                placeholder="패키지명 입력"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">구분</label>
              <select
                value={packageData.category}
                onChange={(e) => setPackageData((prev) => ({ ...prev, category: e.target.value as '월간' | '주간' | '한정' }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
              >
                <option value="월간">월간</option>
                <option value="주간">주간</option>
                <option value="한정">한정</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${packageData.packageType === '보너스룸' ? 'text-gray-500' : 'text-gray-300'}`}>가격 타입</label>
              <select
                value={packageData.priceType}
                onChange={(e) => setPackageData((prev) => ({ ...prev, priceType: e.target.value as '현금' | '크리스탈' | '골드' }))}
                disabled={packageData.packageType === '보너스룸'}
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:border-purple-500 ${
                  packageData.packageType === '보너스룸'
                    ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                    : 'bg-gray-900 text-white border-gray-700'
                }`}
              >
                <option value="현금">현금</option>
                <option value="크리스탈">크리스탈</option>
                <option value="골드">골드</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${packageData.packageType === '보너스룸' ? 'text-gray-500' : 'text-gray-300'}`}>가격</label>
              <input
                type="number"
                value={packageData.price || ''}
                onChange={(e) => setPackageData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                disabled={packageData.packageType === '보너스룸'}
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:border-purple-500 ${
                  packageData.packageType === '보너스룸'
                    ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                    : 'bg-gray-900 text-white border-gray-700'
                }`}
                placeholder="0"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${packageData.packageType === '보너스룸' ? 'text-gray-500' : 'text-gray-300'}`}>구매 가능 횟수</label>
              <input
                type="number"
                value={packageData.purchaseCount || ''}
                onChange={(e) => setPackageData((prev) => ({ ...prev, purchaseCount: parseInt(e.target.value) || 1 }))}
                disabled={packageData.packageType === '보너스룸'}
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:border-purple-500 ${
                  packageData.packageType === '보너스룸'
                    ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                    : 'bg-gray-900 text-white border-gray-700'
                }`}
                placeholder="1"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">종료 예정일</label>
              <input
                type="date"
                value={packageData.endDate || ''}
                onChange={(e) => setPackageData((prev) => ({ ...prev, endDate: e.target.value || null }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">패키지 유형</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="packageType"
                    value="일반"
                    checked={packageData.packageType === '일반'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '일반', is3Plus1: false }))}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">일반</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="packageType"
                    value="3+1"
                    checked={packageData.packageType === '3+1'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '3+1', is3Plus1: true }))}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">3+1</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="packageType"
                    value="보너스룸"
                    checked={packageData.packageType === '보너스룸'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '보너스룸', is3Plus1: false }))}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">보너스룸</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 구성품 / 보너스룸 */}
        {packageData.packageType === '보너스룸' ? (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">보너스룸</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(packageData.bonusRooms || []).map((room, roomIndex) => (
                <div key={roomIndex} className="bg-gray-900/50 rounded-lg border border-gray-700 p-4 max-h-[800px] overflow-y-auto">
                  <h3 className="text-lg font-semibold text-white mb-3 sticky top-0 bg-gray-900/50 backdrop-blur-sm z-10 pb-2">{room.roomName}</h3>
                  <button
                    onClick={() => addBonusRoomItem(roomIndex)}
                    className="w-full mb-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    묶음 항목 추가
                  </button>
                  <div className="space-y-3">
                    {room.items.map((packageItem, itemIndex) => (
                      <div key={itemIndex} className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
                        <div className="space-y-2 mb-2">
                          <input
                            type="text"
                            value={packageItem.itemName}
                            onChange={(e) => updateBonusRoomItem(roomIndex, itemIndex, 'itemName', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            placeholder="항목명"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={packageItem.quantity || ''}
                              onChange={(e) => updateBonusRoomItem(roomIndex, itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
                              className="w-20 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                              placeholder="묶음 수량"
                              min="1"
                            />
                            <select
                              value={packageItem.itemType}
                              onChange={(e) => updateBonusRoomItem(roomIndex, itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                              className="px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            >
                              <option value="확정">확정</option>
                              <option value="확률">확률</option>
                              <option value="선택">선택</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={packageItem.priceType || '골드'}
                              onChange={(e) => updateBonusRoomItem(roomIndex, itemIndex, 'priceType', e.target.value as '현금' | '크리스탈' | '골드' | '보너스')}
                              className="px-2 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            >
                              <option value="현금">현금</option>
                              <option value="크리스탈">크리스탈</option>
                              <option value="골드">골드</option>
                              <option value="보너스">보너스(무료)</option>
                            </select>
                            <input
                              type="number"
                              value={packageItem.priceType === '보너스' ? 0 : (packageItem.price || '')}
                              onChange={(e) => updateBonusRoomItem(roomIndex, itemIndex, 'price', parseFloat(e.target.value) || 0)}
                              disabled={packageItem.priceType === '보너스'}
                              className={`w-24 px-2 py-2 rounded-lg border focus:outline-none focus:border-purple-500 text-sm ${
                                packageItem.priceType === '보너스'
                                  ? 'bg-gray-600 text-gray-400 border-gray-500 cursor-not-allowed'
                                  : 'bg-gray-700 text-white border-gray-600'
                              }`}
                              placeholder="가격"
                              min="0"
                            />
                          </div>
                          <button
                            onClick={() => removeBonusRoomItem(roomIndex, itemIndex)}
                            className="w-full px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                          >
                            삭제
                          </button>
                        </div>
                        <div className="space-y-2 pl-3 border-l-2 border-gray-600">
                          <button
                            onClick={() => addBonusRoomComponent(roomIndex, itemIndex)}
                            className="w-full px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs"
                          >
                            구성요소 추가
                          </button>
                          {packageItem.components.map((component, compIndex) => (
                            <div key={compIndex} className="bg-gray-700/50 rounded p-2 text-xs">
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-2 items-center">
                                  {packageItem.itemType === '선택' && (
                                    <input
                                      type="radio"
                                      name={`bonus-${roomIndex}-${itemIndex}-selection`}
                                      checked={component.selected || false}
                                      onChange={(e) => updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'selected', e.target.checked)}
                                      className="mt-1"
                                    />
                                  )}
                                  <select
                                    value={component.itemName}
                                    onChange={(e) => updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'itemName', e.target.value)}
                                    className="flex-1 min-w-0 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                  >
                                    <option value="">아이템 선택</option>
                                    <option value="__manual__">(직접 입력)</option>
                                    {itemList.map((item) => (
                                      <option key={item} value={item}>{item}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex gap-2 items-center flex-wrap">
                                  <input
                                    type="number"
                                    value={component.quantity || ''}
                                    onChange={(e) => updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'quantity', parseFloat(e.target.value) || 0)}
                                    className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                    placeholder="수량"
                                    min="0"
                                  />
                                  {packageItem.itemType === '확률' && (
                                    <input
                                      type="number"
                                      value={component.probability !== undefined ? (component.probability * 100) : ''}
                                      onChange={(e) => {
                                        const percentValue = parseFloat(e.target.value) || 0;
                                        updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'probability', percentValue / 100);
                                      }}
                                      className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                      placeholder="확률%"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                    />
                                  )}
                                  <button
                                    onClick={() => removeBonusRoomComponent(roomIndex, itemIndex, compIndex)}
                                    className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">구성품</h2>
              <button
                onClick={addPackageItem}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                묶음 항목 추가
              </button>
            </div>

            <div className="space-y-4">
            {packageData.items.map((packageItem, itemIndex) => (
              <div key={itemIndex} className="bg-gray-900/50 rounded-lg border border-gray-700 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={packageItem.itemName}
                    onChange={(e) => updatePackageItem(itemIndex, 'itemName', e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    placeholder="항목명"
                  />
                  <input
                    type="number"
                    value={packageItem.quantity || ''}
                    onChange={(e) => updatePackageItem(itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
                    className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    placeholder="묶음 수량"
                    min="1"
                    step="1"
                  />
                  <select
                    value={packageItem.itemType}
                    onChange={(e) => updatePackageItem(itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  >
                    <option value="확정">확정</option>
                    <option value="확률">확률</option>
                    <option value="선택">선택</option>
                  </select>
                  <button
                    onClick={() => removePackageItem(itemIndex)}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    삭제
                  </button>
                </div>
                
                {/* 구성요소: 들여쓰기 및 구분선 */}
                <div className="space-y-2 pl-4 border-l-2 border-gray-700">
                  {/* 확률 타입일 때 확률 합계 경고 */}
                  {packageItem.itemType === '확률' && (() => {
                    const totalProbability = packageItem.components.reduce((sum, comp) => {
                      return sum + (comp.probability || 0);
                    }, 0);
                    const isNot100Percent = Math.abs(totalProbability - 1) > 0.001; // 부동소수점 오차 고려
                    return isNot100Percent ? (
                      <div className="text-red-400 text-sm font-medium bg-red-900/20 border border-red-700 rounded p-2 mb-2">
                        ⚠ 확률 합계가 {(totalProbability * 100).toFixed(1)}%입니다. (100%가 되어야 합니다)
                      </div>
                    ) : null;
                  })()}
                  {packageItem.components.map((component, componentIndex) => (
                    <div key={componentIndex} className="bg-gray-900/40 rounded-lg p-3 border border-gray-700">
                      <div className="flex gap-2 mb-2">
                        {/* 선택 타입: 라디오 버튼 */}
                        {packageItem.itemType === '선택' && (
                          <input
                            type="radio"
                            name={`item-${itemIndex}-selection`}
                            checked={component.selected || false}
                            onChange={(e) => updateComponent(itemIndex, componentIndex, 'selected', e.target.checked)}
                            className="mt-2"
                          />
                        )}
                        
                        <select
                          value={component.itemName}
                          onChange={(e) => updateComponent(itemIndex, componentIndex, 'itemName', e.target.value)}
                          className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">아이템 선택</option>
                          <option value="__manual__">(직접 입력)</option>
                          {itemList.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={component.quantity || ''}
                          onChange={(e) => updateComponent(itemIndex, componentIndex, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                          placeholder="수량"
                          min="0"
                        />
                        
                        {/* 확률 타입: 확률 입력 필드 (백분율) */}
                        {packageItem.itemType === '확률' && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={component.probability !== undefined ? (component.probability * 100) : ''}
                              onChange={(e) => {
                                const percentValue = parseFloat(e.target.value) || 0;
                                updateComponent(itemIndex, componentIndex, 'probability', percentValue / 100);
                              }}
                              className="w-20 px-2 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                              placeholder="확률"
                              min="0"
                              max="100"
                              step="0.1"
                            />
                            <span className="text-gray-400 text-sm">%</span>
                          </div>
                        )}
                        
                        <button
                          onClick={() => removeComponent(itemIndex, componentIndex)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          삭제
                        </button>
                      </div>

                      {/* 단가 / 가치 표시 및 직접입력 UI */}
                      {(() => {
                        const isManual = component.itemName === '__manual__' || component.itemName === '';
                        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                        const hasPrice = resolved !== null || (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0);

                        // 단가 결정: 수동 입력 > resolved
                        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                          : resolved;

                        // 단가 표시
                        const unitDisplay = finalUnitPrice ? (
                          <div className="text-sm text-gray-300">
                            단가: <span className="text-yellow-300 font-medium">{formatNumberWithSignificantDigits(finalUnitPrice.unitPrice)}</span> {finalUnitPrice.unitType}
                            {packageItem.itemType === '확률' && component.probability !== undefined && (
                              <span className="text-purple-300 ml-2">
                                (확률: {((component.probability || 0) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={component.manualUnitType || '골드'}
                              onChange={(e) => updateComponent(itemIndex, componentIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                              className="px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700"
                            >
                              <option value="골드">골드</option>
                              <option value="크리스탈">크리스탈</option>
                              <option value="현금">현금</option>
                            </select>
                            <input
                              type="number"
                              value={component.manualPrice || ''}
                              onChange={(e) => updateComponent(itemIndex, componentIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                              className="w-32 px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700"
                              placeholder="단가 직접 입력"
                            />
                          </div>
                        );

                        // 가치 계산
                        let primaryValue = 0;
                        let primaryUnit = packageData.priceType;
                        let secondaryValue: number | null = null;
                        let expectedValue = 0; // 확률 타입용 기대값

                        if (finalUnitPrice) {
                          if (packageData.priceType === '현금') {
                            // 현금 타입: 현금 가치만 표시
                            primaryValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'cash',
                              finalUnitPrice
                            );
                          } else if (packageData.priceType === '골드') {
                            // 골드 타입: 골드 가치 먼저, 현금 가치 추가 표시
                            // 골드 가치 직접 계산
                            if (finalUnitPrice.unitType === '골드') {
                              primaryValue = finalUnitPrice.unitPrice * (component.quantity || 0);
                            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                              primaryValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
                            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                              primaryValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
                            }
                            
                            // 현금 가치 추가 계산
                            secondaryValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'cash',
                              finalUnitPrice
                            );
                          } else if (packageData.priceType === '크리스탈') {
                            // 크리스탈 타입: 크리스탈 가치 먼저, 현금 가치 추가 표시
                            primaryValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'crystal',
                              finalUnitPrice
                            );
                            // 현금 가치 추가 계산
                            secondaryValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'cash',
                              finalUnitPrice
                            );
                          }
                          
                          // 확률 타입: 기대값 계산
                          if (packageItem.itemType === '확률') {
                            const probability = component.probability || 0;
                            expectedValue = primaryValue * probability;
                          }
                          
                          // 묶음 수량 적용
                          const itemQuantity = packageItem.quantity || 1;
                          primaryValue = primaryValue * itemQuantity;
                          if (expectedValue > 0) {
                            expectedValue = expectedValue * itemQuantity;
                          }
                          if (secondaryValue !== null && secondaryValue > 0) {
                            secondaryValue = secondaryValue * itemQuantity;
                          }
                        }

                        return (
                          <div className="mt-2 space-y-2">
                            {unitDisplay}
                            <div className="text-sm text-gray-300">
                              {packageItem.itemType === '선택' && !component.selected && (
                                <span className="text-gray-500">(미선택)</span>
                              )}
                              {packageItem.itemType === '선택' && component.selected && (
                                <span className="text-green-400 font-medium">✓ 선택됨</span>
                              )}
                              <br />
                              수량: {formatNumberWithSignificantDigits(component.quantity || 0)} × 단가
                              {packageItem.quantity && packageItem.quantity > 1 && (
                                <span className="text-blue-400 ml-1">× 묶음 수량 {packageItem.quantity}</span>
                              )}
                              {primaryValue > 0 && (
                                <>
                                  <span className="text-gray-400 mx-1">=</span>
                                  <span className="text-green-300 font-medium ml-1">
                                    {formatNumberWithSignificantDigits(primaryValue)} {primaryUnit}
                                  </span>
                                  {packageItem.itemType === '확률' && expectedValue > 0 && (
                                    <span className="text-purple-300 font-medium ml-2">
                                      (기대값: {formatNumberWithSignificantDigits(expectedValue)} {primaryUnit})
                                    </span>
                                  )}
                                  {secondaryValue !== null && secondaryValue > 0 && (
                                    <>
                                      <span className="text-gray-400 mx-1">=</span>
                                      <span className="text-blue-300 text-sm">
                                        {formatNumberWithSignificantDigits(secondaryValue)} 현금
                                      </span>
                                    </>
                                  )}
                                </>
                              )}
                              {primaryValue === 0 && secondaryValue !== null && secondaryValue > 0 && (
                                <span className="text-blue-300 text-sm ml-1">
                                  {formatNumberWithSignificantDigits(secondaryValue)} 현금
                                </span>
                              )}
                              {primaryValue === 0 && secondaryValue === null && (
                                <span className="text-gray-500 ml-1">계산 불가</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  <button
                    onClick={() => addComponent(itemIndex)}
                    className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    구성 요소 추가
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* 계산 결과 */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-white mb-4">계산 결과</h2>
          
          {/* 패키지 개요 카드 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">패키지 개요</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">패키지명</div>
                <div className="text-base font-medium text-white flex items-center gap-2">
                  {packageData.packageName || '(미입력)'}
                  {packageData.endDate && (() => {
                    const endDate = new Date(packageData.endDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    if (endDate < today) {
                      return (
                        <span className="text-xs bg-red-600 text-white px-2 py-1 rounded font-semibold">
                          판매종료
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">구분</div>
                <div className="text-base font-medium text-white">
                  {packageData.category}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">가격 타입</div>
                <div className="text-base font-medium text-white">
                  {packageData.priceType}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">패키지 가격</div>
                <div className="text-lg font-bold text-white">
                  {formatNumberWithSignificantDigits(packageData.price)} {packageData.priceType}
                  {packageData.packageType === '3+1' && packageData.is3Plus1 && (
                    <span className="text-xs text-gray-400 ml-2">
                      (3+1: {formatNumberWithSignificantDigits((packageData.price * 3) / 4)} {packageData.priceType})
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  유형: {packageData.packageType}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">구매 가능 횟수</div>
                <div className="text-base font-medium text-white">
                  {packageData.purchaseCount}회
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">종료 예정일</div>
                <div className="text-base font-medium text-white">
                  {packageData.endDate || '미정'}
                </div>
              </div>
            </div>
          </div>

          {/* 구성품 내용 카드 */}
          {packageData.packageType !== '보너스룸' && packageData.items.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">구성품 내용</h3>
              <div className="space-y-3">
                {packageData.items.map((packageItem, itemIndex) => (
                  <div key={itemIndex} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="font-medium text-white mb-2">
                      {packageItem.itemName || `항목 ${itemIndex + 1}`} 
                      <span className="text-xs text-gray-400 ml-2">({packageItem.itemType})</span>
                      {packageItem.quantity && (
                        <span className="text-xs text-blue-400 ml-2">묶음 수량: {packageItem.quantity}</span>
                      )}
                    </div>
                    <div className="space-y-1 pl-4">
                      {packageItem.components.map((component, compIndex) => {
                        const isManual = component.itemName === '__manual__' || component.itemName === '';
                        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                          : resolved;

                        let itemValue = 0;
                        if (finalUnitPrice) {
                          if (packageData.priceType === '현금') {
                            itemValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'cash',
                              finalUnitPrice
                            );
                          } else if (packageData.priceType === '크리스탈') {
                            itemValue = calculateItemPrice(
                              component.itemName || '직접입력',
                              component.quantity || 0,
                              'crystal',
                              finalUnitPrice
                            );
                          } else if (packageData.priceType === '골드') {
                            if (finalUnitPrice.unitType === '골드') {
                              itemValue = finalUnitPrice.unitPrice * (component.quantity || 0);
                            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                              itemValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
                            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                              itemValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
                            }
                          }
                          
                          // 타입별 가치 계산
                          if (packageItem.itemType === '확률') {
                            const probability = component.probability || 0;
                            itemValue = itemValue * probability; // 기대값
                          } else if (packageItem.itemType === '선택' && !component.selected) {
                            itemValue = 0; // 선택되지 않은 항목은 0
                          }
                          
                          // 상위 항목 개수 적용
                          const itemQuantity = packageItem.quantity || 1;
                          itemValue = itemValue * itemQuantity;
                        }

                        const isIncluded = packageItem.itemType === '확정' || 
                                         (packageItem.itemType === '확률') ||
                                         (packageItem.itemType === '선택' && component.selected);

                        return (
                          <div key={compIndex} className={`text-sm ${isIncluded ? 'text-gray-300' : 'text-gray-500 line-through'} flex items-center gap-2 flex-wrap`}>
                            {packageItem.itemType === '선택' && (
                              <label className="flex items-center cursor-pointer mr-2">
                                <input
                                  type="radio"
                                  name={`selection-${itemIndex}`}
                                  checked={component.selected || false}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      updateComponent(itemIndex, compIndex, 'selected', true);
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-2"
                                />
                                <span className={`ml-2 ${component.selected ? 'text-green-400 font-medium' : 'text-gray-500'}`}>
                                  {component.selected ? '✓ 선택됨' : '선택'}
                                </span>
                              </label>
                            )}
                            {packageItem.itemType === '확률' && component.probability !== undefined && (
                              <span className="text-purple-400 mr-2">
                                [{(component.probability * 100).toFixed(1)}%] 
                              </span>
                            )}
                            <span className="text-gray-400">•</span>
                            <span>{component.itemName || '(직접 입력)'} × {formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                            {finalUnitPrice && (
                              <span className="text-gray-400 ml-2">
                                ({isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'} {packageData.priceType}
                                {packageItem.itemType === '확률' && ' (기대값)'}
                                )
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {packageItem.components.length === 0 && (
                        <div className="text-sm text-gray-500">구성 요소 없음</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 합산 효율 카드 */}
          {packageData.packageType === '보너스룸' ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">보너스룸 효율</h3>
              <div className="space-y-6">
                {bonusRoomEfficiencies?.map((room, roomIndex) => (
                  <div key={roomIndex} className="bg-gray-900/50 rounded-lg border border-gray-700 p-4">
                    <h4 className="text-base font-semibold text-white mb-3">{room.roomName}</h4>
                    
                    {/* 보너스룸별 효율 */}
                    <div className="mb-4 p-3 bg-gray-800/50 rounded border border-gray-600">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">보너스룸 가격 합계</div>
                          <div className="text-lg font-bold text-white">
                            {formatNumberWithSignificantDigits(room.totalPrice)} 골드
                          </div>
                          {goldToCashPerGold && goldToCashPerGold > 0 && (
                            <>
                              <div className="text-sm text-gray-300 mt-1">
                                = {formatNumberWithSignificantDigits(room.totalPrice * goldToCashPerGold)} 현금
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {formatNumberWithSignificantDigits(room.totalPrice)} 골드 × {formatNumberWithSignificantDigits(goldToCashPerGold)} = {formatNumberWithSignificantDigits(room.totalPrice * goldToCashPerGold)} 현금
                              </div>
                            </>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">보너스룸 가치 합계</div>
                          <div className="text-lg font-bold text-white">
                            {formatNumberWithSignificantDigits(room.totalValue)} 골드
                          </div>
                        </div>
                        <div className={`${room.efficiency !== null && room.efficiency >= 1 ? 'border-green-500/50' : room.efficiency !== null ? 'border-red-500/50' : 'border-gray-600'} border rounded p-2`}>
                          <div className="text-xs text-gray-400 mb-1">보너스룸 효율</div>
                          {room.efficiency !== null ? (
                            <>
                              <div className={`text-xl font-bold ${room.efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatNumberWithSignificantDigits(room.efficiency)}배
                              </div>
                              <div className={`text-xs font-medium ${room.efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                                {room.efficiency >= 1 ? '✓ 이득' : '✗ 손해'}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-gray-500">계산 불가</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* 묶음 항목별 효율 */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-300 mb-2">묶음 항목별 효율</div>
                      {room.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="bg-gray-800/50 rounded p-2 border border-gray-600">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-sm text-white font-medium">
                              {item.itemName || `항목 ${itemIndex + 1}`}
                              <span className="text-xs text-gray-400 ml-2">({item.itemType})</span>
                            </div>
                            {item.efficiency !== null ? (
                              <div className={`text-sm font-bold ${item.efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatNumberWithSignificantDigits(item.efficiency)}배
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500">계산 불가</div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 space-y-1">
                            <div>
                              가격: {item.priceType === '보너스' ? (
                                '보너스(무료)'
                              ) : (
                                <>
                                  {formatNumberWithSignificantDigits(item.originalPrice)} {item.priceType}
                                  {item.priceType !== '골드' && item.price > 0 && (
                                    <> (= {formatNumberWithSignificantDigits(item.price)} 골드)</>
                                  )}
                                </>
                              )}
                            </div>
                            <div>가치: {formatNumberWithSignificantDigits(item.value)} 골드</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* 저장 버튼 */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => {
                    setSavePackageName(packageData.packageName);
                    setShowSaveModal(true);
                  }}
                  className="px-8 py-3 bg-purple-600 text-white text-lg font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-lg"
                  disabled={isLoading || !packageData.packageName.trim()}
                >
                  {selectedPackageId ? '📝 패키지 업데이트' : '💾 패키지 저장'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">합산 효율</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-sm text-gray-400 mb-2">패키지 가격</div>
                  {(() => {
                    const effectivePrice = packageData.packageType === '3+1' && packageData.is3Plus1 
                      ? (packageData.price * 3) / 4 
                      : packageData.price;
                    
                    let priceInGold = 0;
                    let priceInCash = 0;
                    let conversionFormula = '';
                    
                    if (packageData.priceType === '현금') {
                      priceInCash = effectivePrice;
                      if (goldToCashPerGold && goldToCashPerGold > 0) {
                        priceInGold = effectivePrice / goldToCashPerGold;
                        conversionFormula = `${formatNumberWithSignificantDigits(effectivePrice)} 현금 ÷ ${formatNumberWithSignificantDigits(goldToCashPerGold)} = ${formatNumberWithSignificantDigits(priceInGold)} 골드`;
                      }
                    } else if (packageData.priceType === '골드') {
                      priceInGold = effectivePrice;
                      if (goldToCashPerGold && goldToCashPerGold > 0) {
                        priceInCash = effectivePrice * goldToCashPerGold;
                        conversionFormula = `${formatNumberWithSignificantDigits(effectivePrice)} 골드 × ${formatNumberWithSignificantDigits(goldToCashPerGold)} = ${formatNumberWithSignificantDigits(priceInCash)} 현금`;
                      }
                    } else if (packageData.priceType === '크리스탈') {
                      if (crystalGoldRate && crystalGoldRate > 0) {
                        priceInGold = (effectivePrice * crystalGoldRate) / 100;
                        conversionFormula = `${formatNumberWithSignificantDigits(effectivePrice)} 크리스탈 × ${formatNumberWithSignificantDigits(crystalGoldRate)} ÷ 100 = ${formatNumberWithSignificantDigits(priceInGold)} 골드`;
                        if (goldToCashPerGold && goldToCashPerGold > 0) {
                          priceInCash = priceInGold * goldToCashPerGold;
                          conversionFormula += `\n${formatNumberWithSignificantDigits(priceInGold)} 골드 × ${formatNumberWithSignificantDigits(goldToCashPerGold)} = ${formatNumberWithSignificantDigits(priceInCash)} 현금`;
                        }
                      }
                    }
                    
                    return (
                      <>
                        <div className="text-2xl font-bold text-white mb-2">
                          {formatNumberWithSignificantDigits(effectivePrice)} {packageData.priceType}
                        </div>
                        {priceInGold > 0 && (
                          <div className="text-sm text-gray-300 mb-1">
                            = {formatNumberWithSignificantDigits(priceInGold)} 골드
                          </div>
                        )}
                        {priceInCash > 0 && (
                          <div className="text-sm text-gray-300 mb-2">
                            = {formatNumberWithSignificantDigits(priceInCash)} 현금
                          </div>
                        )}
                        {conversionFormula && (
                          <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700 whitespace-pre-line">
                            {conversionFormula}
                          </div>
                        )}
                        {packageData.packageType === '3+1' && (
                          <label className="flex items-center gap-2 mt-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={packageData.is3Plus1}
                              onChange={(e) => setPackageData((prev) => ({ ...prev, is3Plus1: e.target.checked }))}
                              className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                            />
                            <span className="text-sm text-gray-300">3+1 적용</span>
                          </label>
                        )}
                        {packageData.packageType !== '3+1' && (
                          <div className="text-xs text-gray-500 mt-3">
                            유형: {packageData.packageType}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-sm text-gray-400 mb-2">구성품 합계</div>
                  <div className="text-2xl font-bold text-white">
                    {formatNumberWithSignificantDigits(totalValue)} {packageData.priceType}
                  </div>
                </div>
                <div className={`bg-gray-900/50 rounded-lg p-4 border ${efficiency !== null && efficiency >= 1 ? 'border-green-500/50' : efficiency !== null ? 'border-red-500/50' : 'border-gray-700'}`}>
                  <div className="text-sm text-gray-400 mb-2">효율 (배수)</div>
                  {efficiency !== null ? (
                    <>
                      <div className={`text-3xl font-bold ${efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatNumberWithSignificantDigits(efficiency)}배
                      </div>
                      <div className={`text-sm font-medium mt-1 ${efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                        {efficiency >= 1 ? '✓ 이득' : '✗ 손해'}
                      </div>
                    </>
                  ) : (
                    <div className="text-lg text-gray-500">계산 불가</div>
                  )}
                </div>
              </div>
              
              {/* 저장 버튼 */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => {
                    setSavePackageName(packageData.packageName);
                    setShowSaveModal(true);
                  }}
                  className="px-8 py-3 bg-purple-600 text-white text-lg font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-lg"
                  disabled={isLoading || !packageData.packageName.trim()}
                >
                  {selectedPackageId ? '📝 패키지 업데이트' : '💾 패키지 저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 저장된 패키지 목록 */}
        {savedPackages.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">저장된 패키지 목록</h3>
            <div className="space-y-2">
              {savedPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`bg-gray-900/50 rounded-lg p-4 border ${
                    selectedPackageId === pkg.id ? 'border-purple-500' : 'border-gray-700'
                  } flex items-center justify-between`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-white">{pkg.package_name}</div>
                    <div className="text-sm text-gray-400">
                      저장일: {new Date(pkg.created_at).toLocaleString('ko-KR')} | 
                      수정일: {new Date(pkg.updated_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadPackage(pkg.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      disabled={isLoading}
                    >
                      불러오기
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        setPackageData((prev) => ({ ...prev, packageName: pkg.package_name }));
                        setShowSaveModal(true);
                      }}
                      className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                      disabled={isLoading}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeletePackage(pkg.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                      disabled={isLoading}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

