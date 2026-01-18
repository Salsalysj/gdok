'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { useValueDb } from '../../contexts/ValueDbContext';
import { createClient } from '@supabase/supabase-js';
import type { ValueDbEntry } from '@/lib/valueDb';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type ComponentItem = {
  itemName: string;
  quantity: number;
  manualPrice?: number | null;
  manualUnitType?: '골드' | '크리스탈' | '현금' | null;
  probability?: number;
  selected?: boolean;
  nestedItem?: BundleItem;
};

type BundleItem = {
  itemName: string;
  itemType: '확정' | '확률' | '선택';
  quantity: number;
  components: ComponentItem[];
};

type BoxSelectorData = {
  itemName: string;
  acquisitionSource: string;
  items: BundleItem[];
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

export default function BoxSelectorClient({
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
  initialSavedBoxSelectors,
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
  initialSavedBoxSelectors?: Array<{ id: string; box_name: string; item_name: string | null; acquisition_source: string | null; box_data?: any; created_at: string; updated_at: string }>;
}) {
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
  const { adjustedEntries } = useValueDb();
  const [lightMode, setLightMode] = useState<boolean>(false);
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedNestedItems, setExpandedNestedItems] = useState<Record<string, boolean>>({});
  
  const [boxData, setBoxData] = useState<BoxSelectorData>({
    itemName: '',
    acquisitionSource: '',
    items: [],
  });

  // 환경 정보를 API에서 받아와서 저장 기능 활성화 여부 결정
  const [allowSave, setAllowSave] = useState<boolean>(
    process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development'
  );
  
  useEffect(() => {
    // 클라이언트에서 환경 정보 확인
    if (typeof window !== 'undefined') {
      fetch('/api/env/check')
        .then(res => res.json())
        .then(data => {
          setAllowSave(data.allowPackageSave ?? false);
        })
        .catch(() => {
          // API 호출 실패 시 기본값 유지
        });
    }
  }, []);

  const [savedBoxSelectors, setSavedBoxSelectors] = useState(initialSavedBoxSelectors || []);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 디스코드 환율
  const [discordRate, setDiscordRate] = useState<number | null>(null);

  useEffect(() => {
    async function fetchDiscordRate() {
      try {
        const res = await fetch('/api/admin/crystal-gold');
        const data = await res.json();
        // Supabase에서 가져온 discord 값 사용
        if (data.discord != null) {
          setDiscordRate(data.discord);
        }
      } catch (error) {
        console.error('디스코드 환율 조회 실패:', error);
      }
    }
    fetchDiscordRate();
  }, []);

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

  const goldToCashPerGold = useMemo(() => {
    if (!lightMode) {
      if (discordRate && discordRate > 0) return discordRate / 100;
      return null;
    } else {
      if (crystalGoldRate && crystalGoldRate > 0) return 2750 / crystalGoldRate;
      return null;
    }
  }, [lightMode, discordRate, crystalGoldRate]);

  // resolveUnitPrice 함수 (과금 효율과 동일)
  const resolveUnitPrice = useCallback((itemName: string): { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null => {
    if (itemName === '순환 돌파석' || itemName.includes('(실제가치)')) {
      const entry = adjustedEntries.find(e => e.itemName === itemName);
      if (entry && entry.unitType === '골드' && entry.unitValue != null) {
        return { unitType: '골드', unitPrice: entry.unitValue };
      }
      return null;
    }

    const isHellKey = itemName.includes('지옥 열쇠');
    const isNarakKey = itemName.includes('나락의') && itemName.includes('열쇠');
    
    if ((isHellKey || isNarakKey) && (hellStages || hell1Stages || hell2Stages) && (narakStages || narak1Stages || narak2Stages)) {
      const getValueDbPrice = (itemName: string): number | null => {
        const entry = valueDbMap[itemName];
        if (entry && entry.unitType === '골드' && entry.unitValue != null) {
          return entry.unitValue;
        }
        return null;
      };

      const getAdjustedPrice = (itemName: string, originalPrice: number | null | undefined): number | null => {
        const valueDbPrice = getValueDbPrice(itemName);
        if (valueDbPrice != null) {
          return adjustPrice(itemName, valueDbPrice);
        }
        
        let price = originalPrice ?? null;
        if (price != null) {
          price = adjustPrice(itemName, price);
        }
        
        return price;
      };

      const calculateHellStageExpectedValue = (stage: Stage, isNarak: boolean = false): number | null => {
        if (!stage || !stage.rewards || stage.rewards.length === 0) return null;
        
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
          if (categories.length >= 3) {
            const combinations: string[][] = [];
            for (let i = 0; i < categories.length; i++) {
              for (let j = i + 1; j < categories.length; j++) {
                for (let k = j + 1; k < categories.length; k++) {
                  combinations.push([categories[i], categories[j], categories[k]]);
                }
              }
            }
            
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
            
            return maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
          } else if (categories.length > 0) {
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
          const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
          const otherCategories = categories.filter(cat => cat !== baseCategory);
          
          let baseRewardValue = 0;
          if (baseCategory && groupedByCategory[baseCategory]) {
            const baseValue = groupedByCategory[baseCategory].reduce((sum, r) => {
              const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
              return sum + ((adjustedPrice || 0) * r.quantity);
            }, 0);
            baseRewardValue = baseValue * 1.9;
          }
          
          if (otherCategories.length === 0) return baseRewardValue;
          
          if (otherCategories.length >= 3) {
            const combinations: string[][] = [];
            for (let i = 0; i < otherCategories.length; i++) {
              for (let j = i + 1; j < otherCategories.length; j++) {
                for (let k = j + 1; k < otherCategories.length; k++) {
                  combinations.push([otherCategories[i], otherCategories[j], otherCategories[k]]);
                }
              }
            }
            
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
            
            const expectedSelectionValue = maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length;
            return baseRewardValue + expectedSelectionValue;
          } else if (otherCategories.length > 0) {
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

      if (isHellKey) {
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
        } else if (itemName === '전설 지옥 열쇠 II' && hell2Stages) {
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
        } else if (itemName === '전설 지옥 열쇠 III' && hellStages) {
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
      
      if (isNarakKey) {
        if ((itemName === '전설 나락의 화염 열쇠 I' || itemName === '전설 나락의 서리 열쇠 I') && narak1Stages) {
          const narak1_2Stage = narak1Stages.find(s => s.stage === '2단계');
          if (narak1_2Stage) {
            const value = calculateHellStageExpectedValue(narak1_2Stage, true);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if ((itemName === '전설 나락의 화염 열쇠 II' || itemName === '전설 나락의 서리 열쇠 II') && narak2Stages) {
          const narak2_2Stage = narak2Stages.find(s => s.stage === '2단계');
          if (narak2_2Stage) {
            const value = calculateHellStageExpectedValue(narak2_2Stage, true);
            if (value != null) {
              return { unitType: '골드', unitPrice: value };
            }
          }
        } else if ((itemName === '전설 나락의 화염 열쇠 III' || itemName === '전설 나락의 서리 열쇠 III') && narakStages) {
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

    if (itemName.startsWith('에브니 큐브 입장권')) {
      const m = itemName.match(/\(([^)]+)\)/);
      const key = m ? m[1] : '';
      if (key && cubeStageRewards[key]) {
        let sum = 0;
        for (const reward of cubeStageRewards[key]) {
          let originalPrice: number | null = null;
          
          if (reward.itemName === '카드 경험치') {
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
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            }
          }
          
          const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
          if (adjustedPrice != null && adjustedPrice > 0) {
            sum += adjustedPrice * reward.quantity;
          }
        }
        return { unitType: '골드', unitPrice: sum };
      }
      const valueDbEntry = valueDbMap[itemName];
      if (valueDbEntry && valueDbEntry.unitType === '골드' && valueDbEntry.unitValue != null) {
        const adjustedValue = adjustPrice(itemName, valueDbEntry.unitValue) ?? valueDbEntry.unitValue;
        return { unitType: '골드', unitPrice: adjustedValue };
      }
      if (key && cubeStageTotals[key] != null) {
        const price = adjustPrice(itemName, cubeStageTotals[key]) ?? cubeStageTotals[key];
        return { unitType: '골드', unitPrice: price };
      }
      return null;
    }

    if (adjustedEntries && adjustedEntries.length > 0) {
      const valueDbEntry = adjustedEntries.find(entry => entry.itemName === itemName);
      if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
        return {
          unitType: valueDbEntry.unitType,
          unitPrice: valueDbEntry.unitValue,
        };
      }
    }

    const valueDbEntry = valueDbMap[itemName];
    if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
      let adjustedValue = valueDbEntry.unitValue;
      if (valueDbEntry.unitType === '골드') {
        if (itemName === '유물 각인서 랜덤' || itemName === '유물 각인서 랜덤 주머니') {
          adjustedValue = adjustRelicEngravingAverage(adjustedValue) ?? adjustedValue;
        } else {
          adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
        }
      } else if (valueDbEntry.unitType === '현금') {
        adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
      } else if (valueDbEntry.unitType === '크리스탈') {
        adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
      }
      return {
        unitType: valueDbEntry.unitType,
        unitPrice: adjustedValue,
      };
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
  }, [cubeStageRewards, valueDbMap, etcListData, marketPriceMap, cubeStageTotals, adjustPrice, adjustRelicEngravingAverage, refreshKey, hellStages, hell1Stages, hell2Stages, narakStages, narak1Stages, narak2Stages, adjustedEntries]);

  const componentOptions = useMemo(() => {
    const realValueItems = adjustedEntries
      .filter(e => e.itemName.includes('(실제가치)'))
      .map(e => e.itemName);
    
    return [
      { value: '', label: '아이템 선택' },
      { value: '__nested__', label: '묶음 항목 추가' },
      { value: '__manual__', label: '(직접 입력)' },
      ...itemList.map(item => ({ value: item, label: item })),
      ...realValueItems.map(item => ({ value: item, label: item }))
    ];
  }, [itemList, adjustedEntries]);

  const availableItemNames = useMemo(() => {
    return new Set([
      ...itemList,
      ...adjustedEntries
        .filter(e => e.itemName.includes('(실제가치)'))
        .map(e => e.itemName)
    ]);
  }, [itemList, adjustedEntries]);

  const calculateItemPrice = (
    itemName: string,
    quantity: number,
    targetType: 'cash' | 'crystal',
    override?: { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null
  ): number => {
    const resolved = override ?? resolveUnitPrice(itemName);
    if (!resolved) return 0;

    let valueInGold: number | null = null;

    if (resolved.unitType === '골드') {
      valueInGold = resolved.unitPrice;
    } else if (resolved.unitType === '크리스탈') {
      if (crystalGoldRate && crystalGoldRate > 0) valueInGold = (resolved.unitPrice * crystalGoldRate) / 100;
    } else if (resolved.unitType === '현금') {
      if (goldToCashPerGold && goldToCashPerGold > 0) valueInGold = resolved.unitPrice / goldToCashPerGold;
    }

    if (valueInGold === null) return 0;

    if (targetType === 'cash') {
      if (goldToCashPerGold) {
        return valueInGold * goldToCashPerGold * quantity;
      }
      return 0;
    } else {
      if (crystalGoldRate && crystalGoldRate > 0) {
        return (valueInGold / crystalGoldRate) * 100 * quantity;
      }
      return 0;
    }
  };

  // 전체 가치 계산
  const totalValue = useMemo(() => {
    let total = 0;
    
    boxData.items.forEach((item) => {
      item.components.forEach((component) => {
        if (component.itemName === '__nested__' && component.nestedItem) {
          const nestedItem = component.nestedItem;
          let nestedValue = 0;
          
          nestedItem.components.forEach((nestedComp) => {
            const isManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
            const resolved = !isManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
            const finalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
              ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
              : resolved;
            
            if (!finalUnitPrice) return;

            let nestedCompValue = 0;
            if (finalUnitPrice.unitType === '골드') {
              nestedCompValue = finalUnitPrice.unitPrice * (nestedComp.quantity || 0);
            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
              nestedCompValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
              nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
            }
            
            if (nestedItem.itemType === '확률') {
              const probability = nestedComp.probability || 0;
              nestedValue += nestedCompValue * probability;
            } else if (nestedItem.itemType === '선택') {
              if (nestedComp.selected) {
                nestedValue += nestedCompValue;
              }
            } else {
              nestedValue += nestedCompValue;
            }
          });
          
          const nestedItemQuantity = nestedItem.quantity || 1;
          const nestedTotalValue = nestedValue * nestedItemQuantity;
          
          const itemQuantity = item.quantity || 1;
          
          if (item.itemType === '확정') {
            total += nestedTotalValue * (component.quantity || 1) * itemQuantity;
          } else if (item.itemType === '확률') {
            const probability = component.probability || 0;
            total += nestedTotalValue * (component.quantity || 1) * probability * itemQuantity;
          } else if (item.itemType === '선택') {
            if (component.selected) {
              total += nestedTotalValue * (component.quantity || 1) * itemQuantity;
            }
          }
          return;
        }
        
        const isManual = component.itemName === '__manual__' || component.itemName === '';
        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
          : resolved;
        
        if (!finalUnitPrice) return;

        let componentValue = 0;
        if (finalUnitPrice.unitType === '골드') {
          componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
        }

        const itemQuantity = item.quantity || 1;
        
        if (item.itemType === '확정') {
          total += componentValue * itemQuantity;
        } else if (item.itemType === '확률') {
          const probability = component.probability || 0;
          total += componentValue * probability * itemQuantity;
        } else if (item.itemType === '선택') {
          if (component.selected) {
            total += componentValue * itemQuantity;
          }
        }
      });
    });
    
    return total;
  }, [boxData.items, etcListData, crystalGoldRate, goldToCashPerGold, resolveUnitPrice]);

  // 각 묶음 항목의 가치 계산
  const itemValues = useMemo(() => {
    return boxData.items.map((item) => {
      let itemValue = 0;
      
      item.components.forEach((component) => {
        if (component.itemName === '__nested__' && component.nestedItem) {
          const nestedItem = component.nestedItem;
          let nestedValue = 0;
          
          nestedItem.components.forEach((nestedComp) => {
            const isManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
            const resolved = !isManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
            const finalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
              ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
              : resolved;
            
            if (!finalUnitPrice) return;

            let nestedCompValue = 0;
            if (finalUnitPrice.unitType === '골드') {
              nestedCompValue = finalUnitPrice.unitPrice * (nestedComp.quantity || 0);
            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
              nestedCompValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
              nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
            }
            
            if (nestedItem.itemType === '확률') {
              const probability = nestedComp.probability || 0;
              nestedValue += nestedCompValue * probability;
            } else if (nestedItem.itemType === '선택') {
              if (nestedComp.selected) {
                nestedValue += nestedCompValue;
              }
            } else {
              nestedValue += nestedCompValue;
            }
          });
          
          const nestedItemQuantity = nestedItem.quantity || 1;
          const nestedTotalValue = nestedValue * nestedItemQuantity;
          const componentQuantity = component.quantity || 1;
          
          const itemQuantity = item.quantity || 1;
          
          if (item.itemType === '확정') {
            itemValue += nestedTotalValue * componentQuantity * itemQuantity;
          } else if (item.itemType === '확률') {
            const probability = component.probability || 0;
            itemValue += nestedTotalValue * componentQuantity * probability * itemQuantity;
          } else if (item.itemType === '선택') {
            if (component.selected) {
              itemValue += nestedTotalValue * componentQuantity * itemQuantity;
            }
          }
          return;
        }
        
        const isManual = component.itemName === '__manual__' || component.itemName === '';
        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
          : resolved;
        
        if (!finalUnitPrice) return;

        let componentValue = 0;
        if (finalUnitPrice.unitType === '골드') {
          componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
        }

        const itemQuantity = item.quantity || 1;
        
        if (item.itemType === '확정') {
          itemValue += componentValue * itemQuantity;
        } else if (item.itemType === '확률') {
          const probability = component.probability || 0;
          itemValue += componentValue * probability * itemQuantity;
        } else if (item.itemType === '선택') {
          if (component.selected) {
            itemValue += componentValue * itemQuantity;
          }
        }
      });
      
      return {
        item,
        value: itemValue,
      };
    });
  }, [boxData.items, resolveUnitPrice, crystalGoldRate, goldToCashPerGold]);

  // 최고 가치 항목 찾기
  const bestItem = useMemo(() => {
    if (itemValues.length === 0) return null;
    const sorted = [...itemValues].sort((a, b) => b.value - a.value);
    return sorted[0];
  }, [itemValues]);

  const getLevelColors = (level: number) => {
    const colorPalette = [
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-gray-800/50', border: 'border-gray-700/50', text: 'text-gray-300', accent: 'gray' },
    ];
    return colorPalette[level % colorPalette.length];
  };
  
  const toggleItemExpanded = useCallback((itemIndex: number | string) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemIndex]: !prev[itemIndex]
    }));
  }, []);
  
  const toggleNestedItemExpanded = useCallback((itemIndex: number, compIndex: number) => {
    const key = `${itemIndex}-${compIndex}`;
    setExpandedNestedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const SearchableSelect = ({ 
    value, 
    onChange, 
    options, 
    placeholder = "아이템 선택",
    className = "",
    size = "normal"
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    className?: string;
    size?: "normal" | "small";
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const selectRef = useRef<HTMLDivElement>(null);
    
    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) return options;
      const query = searchQuery.toLowerCase();
      return options.filter(opt => opt.label.toLowerCase().includes(query));
    }, [options, searchQuery]);
    
    const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;
    
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          setSearchQuery("");
        }
      };
      
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen]);
    
    const handleSelect = (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery("");
    };
    
    const sizeClasses = size === "small" 
      ? "px-2 py-1 text-xs" 
      : "px-4 py-2";
    
    const bgColor = size === "small" 
      ? "bg-gray-600 border-gray-500" 
      : "bg-gray-800 border-gray-700";
    
    return (
      <div ref={selectRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full ${sizeClasses} ${bgColor} text-white rounded-lg border focus:outline-none focus:border-purple-500 text-left flex items-center justify-between`}
        >
          <span className={value ? "" : "text-gray-500"}>{selectedLabel}</span>
          <svg className={`w-4 h-4 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-hidden">
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색..."
                className="w-full px-3 py-2 bg-gray-900 text-white rounded border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors ${
                      value === option.value ? 'bg-purple-600/30 text-purple-300' : 'text-white'
                    } ${size === "small" ? "text-xs" : "text-sm"}`}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-gray-400 text-sm text-center">검색 결과가 없습니다</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const addBundleItem = () => {
    setBoxData((prev) => ({
      ...prev,
      items: [...prev.items, { itemName: '', itemType: '확정', quantity: 1, components: [] }],
    }));
  };

  const updateBundleItem = (index: number, field: keyof BundleItem, value: any) => {
    setBoxData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const addComponent = (itemIndex: number) => {
    setBoxData((prev) => {
      const newItems = [...prev.items];
      const bundleItem = newItems[itemIndex];
      
      const isSelectionType = bundleItem.itemType === '선택';
      const isFirstComponent = bundleItem.components.length === 0;
      
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
    setBoxData((prev) => {
      const newItems = [...prev.items];
      const newComponents = [...newItems[itemIndex].components];
      const oldComponent = newComponents[componentIndex];
      
      if (field === 'itemName' && oldComponent.itemName !== value) {
        const isDirectInputChange = (oldComponent.itemName === '__manual__' || oldComponent.itemName === '') && 
                                    (value === '__manual__' || value === '');
        if (!isDirectInputChange) {
          newComponents[componentIndex] = { 
            ...oldComponent, 
            [field]: value,
            manualPrice: null,
            manualUnitType: null
          };
        } else {
          newComponents[componentIndex] = { ...oldComponent, [field]: value };
        }
      } else {
        newComponents[componentIndex] = { ...oldComponent, [field]: value };
      }
      
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

  const removeBundleItem = (index: number) => {
    setBoxData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const removeComponent = (itemIndex: number, componentIndex: number) => {
    setBoxData((prev) => {
      const newItems = [...prev.items];
      newItems[itemIndex] = {
        ...newItems[itemIndex],
        components: newItems[itemIndex].components.filter((_, i) => i !== componentIndex),
      };
      return { ...prev, items: newItems };
    });
  };

  const handleNewBox = () => {
    if (boxData.itemName || boxData.items.length > 0) {
      if (!confirm('현재 작업 중인 내용이 사라집니다. 새로 만들기를 진행하시겠습니까?')) {
        return;
      }
    }
    
    setBoxData({
      itemName: '',
      acquisitionSource: '',
      items: [],
    });
    setSelectedBoxId(null);
  };

  const handleSaveBox = async () => {
    if (!boxData.itemName.trim()) {
      alert('아이템 이름을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const boxName = boxData.itemName.trim(); // box_name은 itemName을 사용
      
      let res;
      if (selectedBoxId) {
        res = await fetch(`/api/box-selectors/${selectedBoxId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            box_name: boxName,
            item_name: boxData.itemName || null,
            acquisition_source: boxData.acquisitionSource || null,
            box_data: boxData,
          }),
        });
      } else {
        res = await fetch('/api/box-selectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            box_name: boxName,
            item_name: boxData.itemName || null,
            acquisition_source: boxData.acquisitionSource || null,
            box_data: boxData,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      alert(selectedBoxId ? '상자가 업데이트되었습니다.' : '상자가 저장되었습니다.');
      setShowSaveModal(false);
      
      // 저장된 목록 새로고침
      const refreshRes = await fetch('/api/box-selectors');
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setSavedBoxSelectors(Array.isArray(refreshData) ? refreshData : []);
      }
      
      if (!selectedBoxId) {
        setSelectedBoxId(data.id);
      }
    } catch (error: any) {
      console.error('상자 저장 실패:', error);
      alert(error.message || '상자 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadBox = async (boxId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/box-selectors/${boxId}`);
      if (!res.ok) {
        throw new Error('상자 불러오기에 실패했습니다.');
      }

      const data = await res.json();
      if (data.box_data) {
        setBoxData({
          ...data.box_data,
          itemName: data.item_name || data.box_data.itemName || '',
          acquisitionSource: data.acquisition_source || data.box_data.acquisitionSource || '',
        });
        setSelectedBoxId(boxId);
      }
    } catch (error: any) {
      console.error('상자 불러오기 실패:', error);
      alert(error.message || '상자 불러오기에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBox = async (boxId: string) => {
    if (!confirm('이 상자를 삭제하시겠습니까?')) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/box-selectors/${boxId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }

      // 저장된 상자 목록 다시 불러오기
      const listRes = await fetch('/api/box-selectors');
      if (listRes.ok) {
        const listData = await listRes.json();
        setSavedBoxSelectors(Array.isArray(listData) ? listData : []);
      }

      // 현재 선택된 상자가 삭제된 경우 초기화
      if (selectedBoxId === boxId) {
        setBoxData({
          itemName: '',
          acquisitionSource: '',
          items: [],
        });
        setSelectedBoxId(null);
      }

      alert('상자가 삭제되었습니다.');
    } catch (error: any) {
      console.error('상자 삭제 실패:', error);
      alert(error.message || '상자 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">상자 선택 도우미</h1>
          <p className="text-gray-400">선택 상자 속 아이템들의 가치를 계산하여 최적의 결과를 알려주는 도구입니다.</p>
        </div>

        {/* 저장된 리스트 드롭다운 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-300 whitespace-nowrap">저장된 리스트:</label>
            <select
              value={selectedBoxId || ''}
              onChange={(e) => {
                if (e.target.value) {
                  handleLoadBox(e.target.value);
                } else {
                  handleNewBox();
                }
              }}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              disabled={isLoading}
            >
              <option value="">새로 만들기...</option>
              {savedBoxSelectors.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.box_name || '(이름 없음)'} {box.item_name ? `(${box.item_name})` : ''}
                </option>
              ))}
            </select>
            {allowSave && (
              <>
                <button
                  onClick={() => {
                    setShowSaveModal(true);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  disabled={isLoading || !boxData.itemName.trim()}
                >
                  저장
                </button>
                <button
                  onClick={handleNewBox}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  새로 만들기
                </button>
                {selectedBoxId && (
                  <button
                    onClick={() => handleDeleteBox(selectedBoxId)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    disabled={isLoading}
                  >
                    삭제
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 저장 모달 */}
        {allowSave && showSaveModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-white mb-4">
                {selectedBoxId ? '상자 업데이트' : '상자 저장'}
              </h3>
              <div className="mb-4">
                <p className="text-sm text-gray-300 mb-2">
                  아이템 이름: <span className="font-semibold text-white">{boxData.itemName || '(미입력)'}</span>
                </p>
                <p className="text-xs text-gray-400">
                  아이템 이름을 입력하면 자동으로 저장됩니다.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveBox}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  disabled={isLoading || !boxData.itemName.trim()}
                >
                  {isLoading ? '처리 중...' : selectedBoxId ? '업데이트' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 요약 */}
        {boxData.items.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-6">요약</h2>
            
            {/* 기본 정보 */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-blue-300">기본 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">아이템 이름</div>
                  <div className="text-lg font-medium text-white">{boxData.itemName || '(미입력)'}</div>
                </div>
                {boxData.acquisitionSource && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">획득처</div>
                    <div className="text-lg font-medium text-white">{boxData.acquisitionSource}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 구성품 정보 */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-purple-300">구성품 정보</h3>
              <div className="space-y-2">
                {itemValues.map((itemValue, idx) => (
                  <div key={idx} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{itemValue.item.itemName || `항목 ${idx + 1}`}</span>
                        <span className="text-xs text-gray-400">({itemValue.item.itemType})</span>
                        {itemValue.item.quantity > 1 && (
                          <span className="text-xs text-blue-400">× {itemValue.item.quantity}</span>
                        )}
                      </div>
                      <div className="text-lg font-semibold text-green-400">
                        {formatNumberWithSignificantDigits(itemValue.value)} 골드
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최고 가치 항목 */}
            {bestItem && (
              <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-lg p-4 border border-yellow-500/50">
                <h3 className="text-lg font-semibold mb-2 text-yellow-300">✨ 최고 가치 항목</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold text-xl">{bestItem.item.itemName || '항목'}</div>
                    <div className="text-sm text-gray-300 mt-1">
                      {bestItem.item.itemType}
                      {bestItem.item.quantity > 1 && ` × ${bestItem.item.quantity}`}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {formatNumberWithSignificantDigits(bestItem.value)} 골드
                  </div>
                </div>
              </div>
            )}

            {/* 총 가치 */}
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <div className="text-xl font-semibold text-white">총 가치</div>
                <div className="text-3xl font-bold text-green-400">
                  {formatNumberWithSignificantDigits(totalValue)} 골드
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 기본 정보 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">기본 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">아이템 이름</label>
              <input
                type="text"
                value={boxData.itemName}
                onChange={(e) => setBoxData((prev) => ({ ...prev, itemName: e.target.value }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                placeholder="아이템 이름을 입력하세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">획득처 (Optional)</label>
              <input
                type="text"
                value={boxData.acquisitionSource}
                onChange={(e) => setBoxData((prev) => ({ ...prev, acquisitionSource: e.target.value }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                placeholder="획득처를 입력하세요 (선택사항)"
              />
            </div>
          </div>
        </div>

        {/* 구성품 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">구성품</h2>
          </div>

          <div className="space-y-4">
            {boxData.items.map((item, itemIndex) => {
              const level0Colors = getLevelColors(0);
              return (
                <div key={itemIndex} className={`${level0Colors.bg} rounded-lg border ${level0Colors.border} p-4`}>
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) => updateBundleItem(itemIndex, 'itemName', e.target.value)}
                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                      placeholder="항목명"
                    />
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateBundleItem(itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
                      className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                      placeholder="묶음 수량"
                      min="1"
                      step="1"
                    />
                    <select
                      value={item.itemType}
                      onChange={(e) => updateBundleItem(itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                      className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    >
                      <option value="확정">확정</option>
                      <option value="확률">확률</option>
                      <option value="선택">선택</option>
                    </select>
                    <button
                      onClick={() => removeBundleItem(itemIndex)}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                  
                  {/* 구성 요소 펼치기/접기 버튼 */}
                  {item.components.length > 0 && (
                    <button
                      onClick={() => toggleItemExpanded(itemIndex)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
                    >
                      <span className="text-sm font-medium text-gray-300">
                        구성 요소 {item.components.length}개
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 ${expandedItems[itemIndex] ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  {/* 구성 요소 */}
                  {expandedItems[itemIndex] && (
                    <div className="space-y-2">
                      {item.itemType === '확률' && (() => {
                        const totalProbability = item.components.reduce((sum, comp) => {
                          return sum + (comp.probability || 0);
                        }, 0);
                        const isNot100Percent = Math.abs(totalProbability - 1) > 0.001;
                        return isNot100Percent ? (
                          <div className="text-red-400 text-sm font-medium bg-red-900/20 border border-red-700 rounded p-2 mb-2">
                            ⚠ 확률 합계가 {(totalProbability * 100).toFixed(1)}%입니다. (100%가 되어야 합니다)
                          </div>
                        ) : null;
                      })()}
                      {item.components.map((component, componentIndex) => {
                        const level0ItemColors = getLevelColors(0);
                        return (
                          <div key={componentIndex} className={`${level0ItemColors.bg} rounded-lg p-3 border ${level0ItemColors.border}`}>
                            <div className="space-y-2">
                              <div className="flex gap-2 items-center">
                                {item.itemType === '선택' && (
                                  <input
                                    type="radio"
                                    name={`item-${itemIndex}-selection`}
                                    checked={component.selected || false}
                                    onChange={(e) => updateComponent(itemIndex, componentIndex, 'selected', e.target.checked)}
                                    className="mt-2"
                                  />
                                )}
                                
                                <SearchableSelect
                                  value={
                                    (component.itemName === '__manual__' || component.itemName === '' || 
                                     (component.itemName && component.itemName !== '__nested__' && 
                                      !component.itemName.includes('(실제가치)') && 
                                      !availableItemNames.has(component.itemName)))
                                      ? '__manual__'
                                      : component.itemName
                                  }
                                  onChange={(value) => {
                                    if (value === '__nested__') {
                                      updateComponent(itemIndex, componentIndex, 'itemName', '__nested__');
                                      updateComponent(itemIndex, componentIndex, 'nestedItem', {
                                        itemName: '',
                                        itemType: '확정',
                                        quantity: 1,
                                        components: [],
                                      });
                                    } else {
                                      const oldComponent = item.components[componentIndex];
                                      if (oldComponent.itemName !== value) {
                                        updateComponent(itemIndex, componentIndex, 'itemName', value);
                                        updateComponent(itemIndex, componentIndex, 'manualPrice', null);
                                        updateComponent(itemIndex, componentIndex, 'manualUnitType', null);
                                      } else {
                                        updateComponent(itemIndex, componentIndex, 'itemName', value);
                                      }
                                      if (value !== '__nested__') {
                                        updateComponent(itemIndex, componentIndex, 'nestedItem', undefined);
                                      }
                                    }
                                  }}
                                  options={componentOptions}
                                  placeholder="아이템 선택"
                                  className="flex-1"
                                />
                              </div>
                              
                              {component.itemName === '__nested__' && component.nestedItem && (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={component.nestedItem.itemName}
                                    onChange={(e) => {
                                      const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                    }}
                                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                    placeholder="묶음 항목명"
                                  />
                                  <select
                                    value={component.nestedItem.itemType}
                                    onChange={(e) => {
                                      const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                    }}
                                    className="w-24 px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                  >
                                    <option value="확정">확정</option>
                                    <option value="확률">확률</option>
                                    <option value="선택">선택</option>
                                  </select>
                                </div>
                              )}
                              
                              {(component.itemName === '__manual__' || (component.itemName && component.itemName !== '__nested__' && !component.itemName.includes('(실제가치)') && !availableItemNames.has(component.itemName))) && (
                                <div>
                                  <input
                                    type="text"
                                    value={component.itemName === '__manual__' ? '' : component.itemName}
                                    onChange={(e) => {
                                      const value = e.target.value || '__manual__';
                                      updateComponent(itemIndex, componentIndex, 'itemName', value);
                                    }}
                                    className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                    placeholder="아이템 이름을 입력하세요"
                                  />
                                </div>
                              )}
                              
                              <div className="flex gap-2 items-center flex-wrap">
                                <input
                                  type="number"
                                  value={component.quantity || ''}
                                  onChange={(e) => updateComponent(itemIndex, componentIndex, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                  placeholder="수량"
                                  min="0"
                                />
                                
                                {item.itemType === '확률' && (
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
                              {component.itemName !== '__nested__' && (() => {
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
                                    {item.itemType === '확률' && component.probability !== undefined && (
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
                                      type="text"
                                      value={manualPriceInputs[`${itemIndex}-${componentIndex}`] ?? (component.manualPrice?.toString() ?? '')}
                                      onChange={(e) => {
                                        const key = `${itemIndex}-${componentIndex}`;
                                        setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                                      }}
                                      onBlur={(e) => {
                                        const key = `${itemIndex}-${componentIndex}`;
                                        const value = e.target.value.trim();
                                        const numValue = value === '' ? null : parseFloat(value);
                                        updateComponent(itemIndex, componentIndex, 'manualPrice', numValue || null);
                                        // 업데이트 후 임시 값 제거 (다음 렌더링에서 component.manualPrice 사용)
                                        setManualPriceInputs(prev => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      className="w-32 px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700"
                                      placeholder="단가 직접 입력"
                                    />
                                  </div>
                                );

                                // 단가 계산 (골드 기준으로 변환)
                                let unitPriceInPackageType = 0;
                                let unitPriceUnit = '골드';
                                
                                if (finalUnitPrice) {
                                  if (finalUnitPrice.unitType === '골드') {
                                    unitPriceInPackageType = finalUnitPrice.unitPrice;
                                  } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                    unitPriceInPackageType = (finalUnitPrice.unitPrice * crystalGoldRate) / 100;
                                  } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                    unitPriceInPackageType = finalUnitPrice.unitPrice / goldToCashPerGold;
                                  }
                                }

                                // 구성요소 가치 계산 (1개 기준)
                                let itemValue = 0;
                                if (finalUnitPrice) {
                                  if (finalUnitPrice.unitType === '골드') {
                                    itemValue = finalUnitPrice.unitPrice * (component.quantity || 0);
                                  } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                    itemValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
                                  } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                    itemValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
                                  }
                                  
                                  // 타입별 가치 계산
                                  if (item.itemType === '확률') {
                                    const probability = component.probability || 0;
                                    itemValue = itemValue * probability; // 기대값
                                  } else if (item.itemType === '선택' && !component.selected) {
                                    itemValue = 0; // 선택되지 않은 항목은 0
                                  }
                                  // 묶음 항목 수량은 곱하지 않음 (1개 기준으로 표시)
                                }
                                
                                // 전체 가치 계산 (묶음 항목 수량 곱한 값)
                                const itemQuantity = item.quantity || 1;
                                const totalItemValue = itemValue * itemQuantity;
                                
                                const isIncluded = item.itemType === '확정' || 
                                                 (item.itemType === '확률') ||
                                                 (item.itemType === '선택' && component.selected);

                                return (
                                  <div className="mt-2 space-y-2">
                                    {unitDisplay}
                                    <div className="text-sm text-gray-300">
                                      {item.itemType === '선택' && !component.selected && (
                                        <span className="text-gray-500">(미선택)</span>
                                      )}
                                      {item.itemType === '선택' && component.selected && (
                                        <span className="text-green-400 font-medium">✓ 선택됨</span>
                                      )}
                                      <br />
                                      {/* 수량 및 가치 */}
                                      {finalUnitPrice && unitPriceInPackageType > 0 ? (
                                        <div className={`${isIncluded ? 'text-gray-300' : 'text-gray-600'}`}>
                                          단가 <span className="font-semibold">{formatNumberWithSignificantDigits(unitPriceInPackageType)}</span> {unitPriceUnit}
                                          {item.itemType === '확률' && component.probability !== undefined && (
                                            <span className="text-purple-400 ml-1">× {component.probability}</span>
                                          )}
                                          <span className="text-gray-500 mx-1">×</span>
                                          수량 <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                          <span className="text-gray-500 mx-1">=</span>
                                          가치 <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                            {isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'} {unitPriceUnit}
                                          </span>
                                          {item.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                          {item.quantity && item.quantity > 1 && isIncluded && (
                                            <span className="text-gray-500 ml-1">(1개 기준)</span>
                                          )}
                                          {item.quantity && item.quantity > 1 && isIncluded && (
                                            <>
                                              <br />
                                              <span className="text-gray-400">
                                                × 묶음 수량 {item.quantity} = 총 가치 <span className="font-semibold text-green-400">
                                                  {formatNumberWithSignificantDigits(totalItemValue)} {unitPriceUnit}
                                                </span>
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3">
                                          <span className={`${isIncluded ? 'text-gray-400' : 'text-gray-600'}`}>
                                            수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                          </span>
                                          {finalUnitPrice && (
                                            <span className={`${isIncluded ? 'text-blue-400' : 'text-gray-600'}`}>
                                              가치: <span className="font-semibold">{isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'}</span> {unitPriceUnit}
                                              {item.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                              {item.quantity && item.quantity > 1 && isIncluded && (
                                                <span className="text-gray-500 ml-1">(1개 기준)</span>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* 하위 묶음 항목의 구성요소 UI */}
                              {component.itemName === '__nested__' && component.nestedItem && component.nestedItem.itemName && (() => {
                                const level1Colors = getLevelColors(1);
                                
                                // 하위 묶음 항목의 전체 가치 계산
                                let totalNestedValue = 0;
                                if (component.nestedItem) {
                                  const nestedItem = component.nestedItem;
                                  nestedItem.components.forEach((nestedComp) => {
                                    const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                                    const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                                    const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                      ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                      : nestedResolved;
                                    
                                    if (nestedFinalUnitPrice) {
                                      let nestedCompValue = 0;
                                      if (nestedFinalUnitPrice.unitType === '골드') {
                                        nestedCompValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                      } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                        nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                      } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                        nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                      }
                                      
                                      if (nestedItem.itemType === '확률') {
                                        const nestedProbability = nestedComp.probability || 0;
                                        nestedCompValue = nestedCompValue * nestedProbability;
                                      } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                        nestedCompValue = 0;
                                      }
                                      
                                      totalNestedValue += nestedCompValue;
                                    }
                                  });
                                }
                                
                                // 하위묶음 1개당 단가 = 하위구성요소 가치 총합
                                const nestedItemUnitPrice = totalNestedValue;
                                const nestedItemQuantity = component.nestedItem?.quantity || 1;
                                const componentQuantity = component.quantity || 1;
                                
                                // 상위 묶음 항목의 확률/선택 타입에 따라 가치 계산
                                let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * componentQuantity;
                                if (item.itemType === '확률') {
                                  const probability = component.probability ?? 0;
                                  nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * componentQuantity * probability;
                                } else if (item.itemType === '선택' && !component.selected) {
                                  nestedItemTotalValue = 0;
                                }
                                
                                // 묶음 수량 적용
                                const itemQuantity = item.quantity || 1;
                                nestedItemTotalValue = nestedItemTotalValue * itemQuantity;
                                
                                const nestedIsIncluded = component.nestedItem?.itemType === '확정' || 
                                                         (component.nestedItem?.itemType === '확률') ||
                                                         (component.nestedItem?.itemType === '선택' && component.nestedItem.components.some(c => c.selected));
                                
                                return (
                                  <div className={`mt-3 pl-4 border-l-2 border-blue-500/50 ${level1Colors.bg} rounded-lg p-3`}>
                                    {/* 하위 묶음 항목 정보 및 가치 표시 */}
                                    <div className="mb-2">
                                      <div className="flex items-baseline gap-2 flex-wrap mb-1">
                                        <span className="text-sm font-medium text-blue-300">
                                          📦 {component.nestedItem.itemName || '하위 묶음 항목'}
                                        </span>
                                        {item.itemType === '확률' && component.probability !== undefined && (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            {(component.probability * 100).toFixed(1)}%
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                          ({component.nestedItem.itemType})
                                        </span>
                                      </div>
                                      {nestedItemTotalValue > 0 && nestedIsIncluded && (
                                        <div className="mt-1 text-xs text-gray-300">
                                          단가 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedItemUnitPrice)}</span> 골드
                                          {item.itemType === '확률' && component.probability !== undefined && (
                                            <span className="text-purple-400 ml-1">× {component.probability}</span>
                                          )}
                                          <span className="text-gray-500 mx-1">×</span>
                                          수량 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedItemQuantity)}</span>
                                          {componentQuantity > 1 && (
                                            <span className="text-blue-400 ml-1">× 구성요소 수량 {componentQuantity}</span>
                                          )}
                                          {item.quantity && item.quantity > 1 && (
                                            <span className="text-blue-400 ml-1">× 묶음 수량 {item.quantity}</span>
                                          )}
                                          <span className="text-gray-500 mx-1">=</span>
                                          가치 <span className="font-semibold text-green-400">
                                            {formatNumberWithSignificantDigits(nestedItemTotalValue)} 골드
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {component.nestedItem.components.length > 0 && (
                                      <button
                                        onClick={() => toggleNestedItemExpanded(itemIndex, componentIndex)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-800/30 rounded border border-blue-500/30 hover:bg-gray-800/50 transition-colors mb-2 text-xs"
                                      >
                                        <span className="text-xs font-medium text-blue-300">
                                          하위 구성 요소 {component.nestedItem.components.length}개
                                        </span>
                                        <svg
                                          className={`w-3 h-3 text-blue-400 ${expandedNestedItems[`${itemIndex}-${componentIndex}`] ? 'rotate-180' : ''}`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    )}
                                    <div className="space-y-3">
                                      <div className="space-y-2">
                                        <button
                                          onClick={() => {
                                            const nestedItem = {
                                              ...component.nestedItem!,
                                              components: [
                                                ...component.nestedItem!.components,
                                                { itemName: '', quantity: 0, selected: component.nestedItem!.itemType === '선택' && component.nestedItem!.components.length === 0 },
                                              ],
                                            };
                                            updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                          }}
                                          className="w-full px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                                        >
                                          구성요소 추가
                                        </button>
                                        {expandedNestedItems[`${itemIndex}-${componentIndex}`] && component.nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                          const nestedItemColors = getLevelColors(2);
                                          return (
                                            <div key={nestedCompIndex} className={`${nestedItemColors.bg} rounded-lg p-2 border ${nestedItemColors.border}`}>
                                              <div className="space-y-2">
                                                <div className="flex gap-2 items-center">
                                                  <SearchableSelect
                                                    value={
                                                      (nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || 
                                                       (nestedComp.itemName && nestedComp.itemName !== '__nested__' && 
                                                        !nestedComp.itemName.includes('(실제가치)') && 
                                                        !availableItemNames.has(nestedComp.itemName)))
                                                        ? '__manual__'
                                                        : nestedComp.itemName
                                                    }
                                                    onChange={(value) => {
                                                      if (!component.nestedItem) return;
                                                      const nestedComponents = [...component.nestedItem.components];
                                                      const oldNestedComp = nestedComponents[nestedCompIndex];
                                                      if (oldNestedComp.itemName !== value) {
                                                        nestedComponents[nestedCompIndex] = { 
                                                          ...oldNestedComp, 
                                                          itemName: value,
                                                          manualPrice: null,
                                                          manualUnitType: null
                                                        };
                                                      } else {
                                                        nestedComponents[nestedCompIndex] = { ...oldNestedComp, itemName: value };
                                                      }
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                    }}
                                                    options={componentOptions}
                                                    placeholder="아이템 선택"
                                                    className="flex-1"
                                                    size="small"
                                                  />
                                                </div>
                                                
                                                {(nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || 
                                                  (nestedComp.itemName && nestedComp.itemName !== '__nested__' && 
                                                   !nestedComp.itemName.includes('(실제가치)') && 
                                                   !availableItemNames.has(nestedComp.itemName))) && (
                                                  <input
                                                    type="text"
                                                    value={nestedComp.itemName === '__manual__' || nestedComp.itemName === '' ? '' : nestedComp.itemName}
                                                    onChange={(e) => {
                                                      if (!component.nestedItem) return;
                                                      const nestedComponents = [...component.nestedItem.components];
                                                      const value = e.target.value || '__manual__';
                                                      nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], itemName: value };
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                    }}
                                                    className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                                    placeholder="아이템 이름을 입력하세요"
                                                  />
                                                )}
                                                
                                                {(nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || 
                                                  (nestedComp.itemName && nestedComp.itemName !== '__nested__' && 
                                                   !nestedComp.itemName.includes('(실제가치)') && 
                                                   !availableItemNames.has(nestedComp.itemName))) && (
                                                  <div className="flex gap-2 items-center">
                                                    <select
                                                      value={nestedComp.manualUnitType || '골드'}
                                                      onChange={(e) => {
                                                        if (!component.nestedItem) return;
                                                        const nestedComponents = [...component.nestedItem.components];
                                                        nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], manualUnitType: e.target.value as '골드' | '크리스탈' | '현금' };
                                                        const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                        updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                      }}
                                                      className="px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                                    >
                                                      <option value="골드">골드</option>
                                                      <option value="크리스탈">크리스탈</option>
                                                      <option value="현금">현금</option>
                                                    </select>
                                                    <input
                                                      type="text"
                                                      value={manualPriceInputs[`${itemIndex}-${componentIndex}-nested-${nestedCompIndex}`] ?? (nestedComp.manualPrice?.toString() ?? '')}
                                                      onChange={(e) => {
                                                        const key = `${itemIndex}-${componentIndex}-nested-${nestedCompIndex}`;
                                                        setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                      }}
                                                      onBlur={(e) => {
                                                        if (!component.nestedItem) return;
                                                        const key = `${itemIndex}-${componentIndex}-nested-${nestedCompIndex}`;
                                                        const value = e.target.value.trim();
                                                        const numValue = value === '' ? null : parseFloat(value);
                                                        const nestedComponents = [...component.nestedItem.components];
                                                        nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], manualPrice: numValue || null };
                                                        const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                        updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                        setManualPriceInputs(prev => {
                                                          const next = { ...prev };
                                                          delete next[key];
                                                          return next;
                                                        });
                                                      }}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.currentTarget.blur();
                                                        }
                                                      }}
                                                      className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                                      placeholder="단가 직접 입력"
                                                    />
                                                  </div>
                                                )}
                                                
                                                <div className="flex gap-2 items-center">
                                                  <input
                                                    type="number"
                                                    value={nestedComp.quantity || ''}
                                                    onChange={(e) => {
                                                      if (!component.nestedItem) return;
                                                      const nestedComponents = [...component.nestedItem.components];
                                                      nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], quantity: parseFloat(e.target.value) || 0 };
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                    }}
                                                    className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                                    placeholder="수량"
                                                    min="0"
                                                  />
                                                  {component.nestedItem?.itemType === '선택' && (
                                                    <input
                                                      type="radio"
                                                      name={`nested-${itemIndex}-${componentIndex}-selection`}
                                                      checked={nestedComp.selected || false}
                                                      onChange={(e) => {
                                                        if (!component.nestedItem) return;
                                                        const nestedComponents = component.nestedItem.components.map((c, idx) => ({
                                                          ...c,
                                                          selected: idx === nestedCompIndex,
                                                        }));
                                                        const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                        updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                      }}
                                                      className="w-3 h-3"
                                                    />
                                                  )}
                                                  {component.nestedItem?.itemType === '확률' && (
                                                    <input
                                                      type="number"
                                                      value={nestedComp.probability !== undefined ? (nestedComp.probability * 100) : ''}
                                                      onChange={(e) => {
                                                        if (!component.nestedItem) return;
                                                        const nestedComponents = [...component.nestedItem.components];
                                                        nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], probability: (parseFloat(e.target.value) || 0) / 100 };
                                                        const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                        updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                      }}
                                                      className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                                      placeholder="%"
                                                      min="0"
                                                      max="100"
                                                    />
                                                  )}
                                                  <button
                                                    onClick={() => {
                                                      if (!component.nestedItem) return;
                                                      const nestedComponents = component.nestedItem.components.filter((_, idx) => idx !== nestedCompIndex);
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                                    }}
                                                    className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs"
                                                  >
                                                    삭제
                                                  </button>
                                                </div>
                                                
                                                {/* 하위 구성요소 단가/가치 표시 */}
                                                {(() => {
                                                  const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                                                  const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                                                  const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                                    ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                                    : nestedResolved;
                                                  
                                                  // 단가 계산 (골드 기준으로 변환)
                                                  let nestedUnitPriceInGold = 0;
                                                  if (nestedFinalUnitPrice) {
                                                    if (nestedFinalUnitPrice.unitType === '골드') {
                                                      nestedUnitPriceInGold = nestedFinalUnitPrice.unitPrice;
                                                    } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                                      nestedUnitPriceInGold = (nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100;
                                                    } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                      nestedUnitPriceInGold = nestedFinalUnitPrice.unitPrice / goldToCashPerGold;
                                                    }
                                                  }
                                                  
                                                  // 하위 구성요소 가치 계산 (1개 기준)
                                                  let nestedCompValue = 0;
                                                  if (nestedFinalUnitPrice) {
                                                    if (nestedFinalUnitPrice.unitType === '골드') {
                                                      nestedCompValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                                    } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                                      nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                                    } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                      nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                                    }
                                                    
                                                    if (component.nestedItem?.itemType === '확률') {
                                                      const nestedProbability = nestedComp.probability || 0;
                                                      nestedCompValue = nestedCompValue * nestedProbability;
                                                    } else if (component.nestedItem?.itemType === '선택' && !nestedComp.selected) {
                                                      nestedCompValue = 0;
                                                    }
                                                  }
                                                  
                                                  const nestedIsIncluded = component.nestedItem?.itemType === '확정' || 
                                                                           (component.nestedItem?.itemType === '확률') ||
                                                                           (component.nestedItem?.itemType === '선택' && nestedComp.selected);
                                                  
                                                  return (
                                                    <div className="mt-2 text-xs text-gray-400">
                                                      {nestedFinalUnitPrice && nestedUnitPriceInGold > 0 ? (
                                                        <>
                                                          단가 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedUnitPriceInGold)}</span> 골드
                                                          {component.nestedItem?.itemType === '확률' && nestedComp.probability !== undefined && (
                                                            <span className="text-purple-400 ml-0.5">× {nestedComp.probability}</span>
                                                          )}
                                                          <span className="text-gray-600 mx-0.5">×</span>
                                                          수량 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedComp.quantity || 0)}</span>
                                                          <span className="text-gray-600 mx-0.5">=</span>
                                                          가치 <span className={`${nestedIsIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                            {nestedIsIncluded ? formatNumberWithSignificantDigits(nestedCompValue) : '0'} 골드
                                                          </span>
                                                        </>
                                                      ) : (
                                                        <>
                                                          수량: {formatNumberWithSignificantDigits(nestedComp.quantity || 0)}
                                                        </>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => addComponent(itemIndex)}
                        className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        구성 요소 추가
                      </button>
                    </div>
                  )}
                  {/* 구성요소가 없을 때 구성요소 추가 버튼 표시 */}
                  {item.components.length === 0 && (
                    <div className="pl-4 border-l-2 border-gray-700">
                      <button
                        onClick={() => addComponent(itemIndex)}
                        className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        구성 요소 추가
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={addBundleItem}
              className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              묶음 항목 추가
            </button>
            {boxData.items.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-8 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
                구성품이 없습니다. 묶음 항목을 추가해주세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
