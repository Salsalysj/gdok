'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

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
  bloodstoneCost?: number; // 혈석 교환 비용
};

type BloodstoneShopData = {
  ticketItems: BundleItem[]; // 입장권 및 보조 재료
  refiningItems: BundleItem[]; // 재련 재료
  silverItems: BundleItem[]; // 실링
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

export default function BloodstoneShopClient({
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
  initialSavedShops,
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
  initialSavedShops?: Array<{ id: string; shop_name: string; created_at: string; updated_at: string; shop_data?: any }>;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { adjustedEntries } = useValueDb();
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedNestedItems, setExpandedNestedItems] = useState<Record<string, boolean>>({});
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});

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

  const [shopData, setShopData] = useState<BloodstoneShopData>({
    ticketItems: [],
    refiningItems: [],
    silverItems: [],
  });

  // 저장 관련 상태
  const allowShopSave = process.env.NEXT_PUBLIC_ALLOW_BLOODSTONE_SHOP_SAVE === 'true' || process.env.NODE_ENV === 'development';
  const [savedShops, setSavedShops] = useState<Array<{ id: string; shop_name: string; created_at: string; updated_at: string; shop_data?: any }>>(initialSavedShops || []);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveShopName, setSaveShopName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getLevelColors = (level: number) => {
    const colorPalette = [
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-gray-800/50', border: 'border-gray-700/50', text: 'text-gray-300', accent: 'gray' },
    ];
    return colorPalette[level % colorPalette.length];
  };

  const toggleItemExpanded = useCallback((section: string, itemIndex: number) => {
    const key = `${section}-${itemIndex}`;
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const toggleNestedItemExpanded = useCallback((section: string, itemIndex: number, compIndex: number) => {
    const key = `${section}-${itemIndex}-${compIndex}`;
    setExpandedNestedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // SearchableSelect 컴포넌트 (과금 효율과 동일)
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
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  // resolveUnitPrice (과금 효율과 동일한 로직 사용)
  const resolveUnitPrice = useCallback((itemName: string): { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null => {
    if (itemName === '순환 돌파석' || itemName.includes('(실제가치)')) {
      const entry = adjustedEntries.find(e => e.itemName === itemName);
      if (entry && entry.unitType === '골드' && entry.unitValue != null) {
        return { unitType: '골드', unitPrice: entry.unitValue };
      }
      return null;
    }

    // 에브니 큐브 입장권 처리
    if (itemName.startsWith('에브니 큐브 입장권')) {
      const hellExchangeMatch = itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
      if (hellExchangeMatch) {
        const valueDbEntry = valueDbMap[itemName];
        if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
          return { unitType: valueDbEntry.unitType, unitPrice: valueDbEntry.unitValue };
        }
        return null;
      }
      
      const m = itemName.match(/에브니 큐브 입장권 \(([^)]+)\)/);
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
      if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
        let adjustedValue = valueDbEntry.unitValue;
        if (valueDbEntry.unitType === '골드') {
          adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
        }
        return { unitType: valueDbEntry.unitType, unitPrice: adjustedValue };
      }
      return null;
    }

    // 가치계산DB 우선 (크리스탈, 현금 단위도 처리)
    const valueDbEntry = valueDbMap[itemName];
    if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
      let adjustedValue = valueDbEntry.unitValue;
      // 골드 단위인 경우 가격 조정 적용
      if (valueDbEntry.unitType === '골드') {
        adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
      }
      // 크리스탈, 현금 단위는 가격 조정 없이 그대로 반환
      return {
        unitType: valueDbEntry.unitType,
        unitPrice: adjustedValue,
      };
    }

    // etc_list 확인
    const etc = etcListData[itemName];
    if (etc?.gold != null) {
      const adjustedValue = adjustPrice(itemName, etc.gold) ?? etc.gold;
      return { unitType: '골드', unitPrice: adjustedValue };
    }
    if (etc?.crystal != null) {
      return { unitType: '크리스탈', unitPrice: etc.crystal };
    }
    if (etc?.cash != null) {
      return { unitType: '현금', unitPrice: etc.cash };
    }

    // marketPriceMap 확인
    if (marketPriceMap[itemName] != null) {
      const adjustedValue = adjustPrice(itemName, marketPriceMap[itemName]) ?? marketPriceMap[itemName];
      return { unitType: '골드', unitPrice: adjustedValue };
    }

    return null;
  }, [adjustedEntries, etcListData, marketPriceMap, valueDbMap, cubeStageRewards, adjustPrice]);

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

  // 섹션별 items 배열 가져오기
  const getItems = (section: 'ticketItems' | 'refiningItems' | 'silverItems'): BundleItem[] => {
    return shopData[section];
  };

  // 섹션별 items 배열 업데이트
  const setItems = (section: 'ticketItems' | 'refiningItems' | 'silverItems', items: BundleItem[]) => {
    setShopData(prev => ({
      ...prev,
      [section]: items
    }));
  };

  // 묶음 항목 추가
  const addBundleItem = (section: 'ticketItems' | 'refiningItems' | 'silverItems') => {
    setItems(section, [
      ...getItems(section),
      { itemName: '', itemType: '확정', quantity: 1, components: [], bloodstoneCost: 0 }
    ]);
  };

  // 묶음 항목 업데이트
  const updateBundleItem = (section: 'ticketItems' | 'refiningItems' | 'silverItems', index: number, field: keyof BundleItem, value: any) => {
    const items = [...getItems(section)];
    items[index] = { ...items[index], [field]: value };
    setItems(section, items);
  };

  // 묶음 항목 삭제
  const removeBundleItem = (section: 'ticketItems' | 'refiningItems' | 'silverItems', index: number) => {
    setItems(section, getItems(section).filter((_, i) => i !== index));
  };

  // 구성 요소 추가
  const addComponent = (section: 'ticketItems' | 'refiningItems' | 'silverItems', itemIndex: number) => {
    const items = [...getItems(section)];
    const bundleItem = items[itemIndex];
    const isSelectionType = bundleItem.itemType === '선택';
    const isFirstComponent = bundleItem.components.length === 0;
    
    items[itemIndex] = {
      ...bundleItem,
      components: [
        ...bundleItem.components,
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
      items[itemIndex].components = items[itemIndex].components.map((comp, idx) => {
        if (idx === items[itemIndex].components.length - 1) {
          return { ...comp, selected: true };
        }
        return { ...comp, selected: false };
      });
    }
    
    setItems(section, items);
  };

  // 구성 요소 업데이트
  const updateComponent = (section: 'ticketItems' | 'refiningItems' | 'silverItems', itemIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setShopData(prev => {
      const newShopData = { ...prev };
      const items = [...newShopData[section]];
      const newComponents = [...items[itemIndex].components];
      const oldComponent = { ...newComponents[componentIndex] };
      
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
      
      if (field === 'selected' && value === true && items[itemIndex].itemType === '선택') {
        newComponents.forEach((comp, idx) => {
          if (idx !== componentIndex) {
            comp.selected = false;
          }
        });
      }
      
      items[itemIndex] = { ...items[itemIndex], components: newComponents };
      newShopData[section] = items;
      return newShopData;
    });
  };

  // 구성 요소 삭제
  const removeComponent = (section: 'ticketItems' | 'refiningItems' | 'silverItems', itemIndex: number, componentIndex: number) => {
    const items = [...getItems(section)];
    items[itemIndex] = {
      ...items[itemIndex],
      components: items[itemIndex].components.filter((_, i) => i !== componentIndex),
    };
    setItems(section, items);
  };

  // 섹션별 총 가치 계산
  const calculateSectionTotal = useCallback((items: BundleItem[]): number => {
    let total = 0;
    
    const calculateNestedItemValue = (nestedItem: BundleItem): number => {
      let nestedValue = 0;
      nestedItem.components.forEach((nestedComp) => {
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem);
          const nestedNestedQuantity = nestedComp.nestedItem.quantity || 1;
          const nestedNestedTotalValue = nestedNestedUnitPrice * nestedNestedQuantity;
          nestedValue += nestedNestedTotalValue;
          return;
        }
        
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
          // 현금 → 골드: 현금 가격 / goldToCashPerGold
          nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
        }
        
        if (nestedItem.itemType === '확정') {
          nestedValue += nestedCompValue;
        } else if (nestedItem.itemType === '확률') {
          const probability = nestedComp.probability || 0;
          nestedValue += nestedCompValue * probability;
        } else if (nestedItem.itemType === '선택') {
          if (nestedComp.selected) {
            nestedValue += nestedCompValue;
          }
        }
      });
      return nestedValue;
    };

    items.forEach((bundleItem) => {
      bundleItem.components.forEach((component) => {
        if (component.itemName === '__nested__' && component.nestedItem) {
          const nestedItemUnitPrice = calculateNestedItemValue(component.nestedItem);
          const nestedItemQuantity = component.nestedItem.quantity || 1;
          const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
          
          const itemQuantity = bundleItem.quantity || 1;
          
          if (bundleItem.itemType === '확정') {
            total += nestedItemTotalValue * itemQuantity;
          } else if (bundleItem.itemType === '확률') {
            const probability = component.probability || 0;
            total += nestedItemTotalValue * probability * itemQuantity;
          } else if (bundleItem.itemType === '선택') {
            if (component.selected) {
              total += nestedItemTotalValue * itemQuantity;
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
          // 현금 → 골드: 현금 가격 / goldToCashPerGold
          componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
        }
        
        const itemQuantity = bundleItem.quantity || 1;
        
        if (bundleItem.itemType === '확정') {
          total += componentValue * itemQuantity;
        } else if (bundleItem.itemType === '확률') {
          const probability = component.probability || 0;
          total += componentValue * probability * itemQuantity;
        } else if (bundleItem.itemType === '선택') {
          if (component.selected) {
            total += componentValue * itemQuantity;
          }
        }
      });
    });
    
    return total;
  }, [resolveUnitPrice, crystalGoldRate, goldToCashPerGold]);

  // 섹션별 총 혈석 비용
  const calculateSectionBloodstoneCost = useCallback((items: BundleItem[]): number => {
    return items.reduce((sum, item) => sum + (item.bloodstoneCost || 0), 0);
  }, []);

  // 각 묶음 항목의 가치 계산
  const calculateBundleItemValue = useCallback((bundleItem: BundleItem): number => {
    let total = 0;
    
    const calculateNestedItemValue = (nestedItem: BundleItem): number => {
      let nestedValue = 0;
      nestedItem.components.forEach((nestedComp) => {
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem);
          const nestedNestedQuantity = nestedComp.nestedItem.quantity || 1;
          const nestedNestedTotalValue = nestedNestedUnitPrice * nestedNestedQuantity;
          nestedValue += nestedNestedTotalValue;
          return;
        }
        
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
          // 현금 → 골드: 현금 가격 / goldToCashPerGold
          nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
        }
        
        if (nestedItem.itemType === '확정') {
          nestedValue += nestedCompValue;
        } else if (nestedItem.itemType === '확률') {
          const probability = nestedComp.probability || 0;
          nestedValue += nestedCompValue * probability;
        } else if (nestedItem.itemType === '선택') {
          if (nestedComp.selected) {
            nestedValue += nestedCompValue;
          }
        }
      });
      return nestedValue;
    };

    bundleItem.components.forEach((component) => {
      if (component.itemName === '__nested__' && component.nestedItem) {
        const nestedItemUnitPrice = calculateNestedItemValue(component.nestedItem);
        const nestedItemQuantity = component.nestedItem.quantity || 1;
        const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
        
        const itemQuantity = bundleItem.quantity || 1;
        
        if (bundleItem.itemType === '확정') {
          total += nestedItemTotalValue * itemQuantity;
        } else if (bundleItem.itemType === '확률') {
          const probability = component.probability || 0;
          total += nestedItemTotalValue * probability * itemQuantity;
        } else if (bundleItem.itemType === '선택') {
          if (component.selected) {
            total += nestedItemTotalValue * itemQuantity;
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
        // 현금 → 골드: 현금 가격 / goldToCashPerGold
        componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
      }
      
      const itemQuantity = bundleItem.quantity || 1;
      
      if (bundleItem.itemType === '확정') {
        total += componentValue * itemQuantity;
      } else if (bundleItem.itemType === '확률') {
        const probability = component.probability || 0;
        total += componentValue * probability * itemQuantity;
      } else if (bundleItem.itemType === '선택') {
        if (component.selected) {
          total += componentValue * itemQuantity;
        }
      }
    });
    
    return total;
  }, [resolveUnitPrice, crystalGoldRate, goldToCashPerGold]);

  // 각 섹션별 묶음 항목 상세 정보
  const sectionDetails = useMemo(() => {
    const getSectionDetails = (items: BundleItem[], sectionName: string) => {
      return items.map((item) => {
        const value = calculateBundleItemValue(item);
        const bloodstoneCost = item.bloodstoneCost || 0;
        const valuePerBloodstone = bloodstoneCost > 0 ? value / bloodstoneCost : 0;
        
        return {
          itemName: item.itemName || '(미입력)',
          value,
          bloodstoneCost,
          valuePerBloodstone,
        };
      });
    };
    
    return {
      ticketItems: getSectionDetails(shopData.ticketItems, '입장권 및 보조 재료'),
      refiningItems: getSectionDetails(shopData.refiningItems, '재련 재료'),
      silverItems: getSectionDetails(shopData.silverItems, '실링'),
    };
  }, [shopData, calculateBundleItemValue, goldToCashPerGold]);

  // 페이지 로드 시 저장된 상점 자동 불러오기
  useEffect(() => {
    // 저장된 상점이 없으면 스킵
    if (!initialSavedShops || initialSavedShops.length === 0) {
      console.log('[자동 로드] 저장된 상점이 없습니다.');
      return;
    }
    
    // 이미 선택된 상점이 있으면 스킵 (수동으로 로드한 경우)
    if (selectedShopId) {
      console.log('[자동 로드] 이미 상점이 선택되어 있습니다:', selectedShopId);
      return;
    }
    
    // 가장 최근 상점(첫 번째) 자동 불러오기
    const firstShop = initialSavedShops[0];
    console.log('[자동 로드] 첫 번째 상점 확인:', {
      hasFirstShop: !!firstShop,
      hasShopData: !!firstShop?.shop_data,
      shopId: firstShop?.id
    });
    
    if (firstShop && firstShop.shop_data) {
      console.log('[자동 로드] 상점 데이터 로드 중');
      setShopData(firstShop.shop_data);
      setSelectedShopId(firstShop.id);
    } else {
      console.log('[자동 로드] 상점 데이터가 없습니다.');
    }
  }, [initialSavedShops, selectedShopId]);

  // 상점 저장
  const handleSaveShop = async () => {
    if (!saveShopName.trim()) {
      alert('상점명을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const shopName = saveShopName.trim();
      
      let res;
      if (selectedShopId) {
        // 업데이트
        res = await fetch(`/api/bloodstone-shops/${selectedShopId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop_name: shopName,
            shop_data: shopData,
          }),
        });
      } else {
        // 새로 저장
        res = await fetch('/api/bloodstone-shops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop_name: shopName,
            shop_data: shopData,
          }),
        });
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      if (data.shop) {
        setSelectedShopId(data.shop.id);
      }

      setShowSaveModal(false);
      setSaveShopName('');
      alert(selectedShopId ? '상점이 업데이트되었습니다.' : '상점이 저장되었습니다.');
    } catch (error: any) {
      console.error('상점 저장 실패:', error);
      alert(error.message || '상점 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 저장된 상점 불러오기
  const handleLoadShop = async (shopId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bloodstone-shops/${shopId}`);
      const data = await res.json();
      
      if (data.shop && data.shop.shop_data) {
        setShopData(data.shop.shop_data);
        setSelectedShopId(shopId);
        alert('상점이 불러와졌습니다.');
      } else {
        throw new Error('상점을 찾을 수 없습니다.');
      }
    } catch (error: any) {
      console.error('상점 불러오기 실패:', error);
      alert(error.message || '상점 불러오기에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 상점 삭제
  const handleDeleteShop = async (shopId: string) => {
    if (!confirm('이 상점을 삭제하시겠습니까?')) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/bloodstone-shops/${shopId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }

      if (selectedShopId === shopId) {
        setSelectedShopId(null);
        setShopData({
          ticketItems: [],
          refiningItems: [],
          silverItems: [],
        });
      }

      alert('상점이 삭제되었습니다.');
    } catch (error: any) {
      console.error('상점 삭제 실패:', error);
      alert(error.message || '상점 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 새로 만들기
  const handleNewShop = () => {
    if (selectedShopId && (shopData.ticketItems.length > 0 || shopData.refiningItems.length > 0 || shopData.silverItems.length > 0)) {
      if (!confirm('현재 작업 중인 내용이 사라집니다. 새로 만들기를 진행하시겠습니까?')) {
        return;
      }
    }
    setSelectedShopId(null);
    setShopData({
      ticketItems: [],
      refiningItems: [],
      silverItems: [],
    });
  };

  // 묶음 항목 렌더링 함수 (과금 효율과 동일한 UI 구조)
  const renderBundleItem = (
    section: 'ticketItems' | 'refiningItems' | 'silverItems',
    bundleItem: BundleItem,
    itemIndex: number
  ) => {
    const level0Colors = getLevelColors(0);
    const key = `${section}-${itemIndex}`;
    const isExpanded = expandedItems[key];
    
    return (
      <div key={itemIndex} className={`${level0Colors.bg} rounded-lg border ${level0Colors.border} p-4`}>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <input
            type="text"
            value={bundleItem.itemName}
            onChange={(e) => updateBundleItem(section, itemIndex, 'itemName', e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="항목명"
          />
          <input
            type="number"
            value={bundleItem.quantity || ''}
            onChange={(e) => updateBundleItem(section, itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
            className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="묶음 수량"
            min="1"
            step="1"
          />
          <select
            value={bundleItem.itemType}
            onChange={(e) => updateBundleItem(section, itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
          >
            <option value="확정">확정</option>
            <option value="확률">확률</option>
            <option value="선택">선택</option>
          </select>
          <input
            type="number"
            value={bundleItem.bloodstoneCost || ''}
            onChange={(e) => updateBundleItem(section, itemIndex, 'bloodstoneCost', parseFloat(e.target.value) || 0)}
            className="w-32 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="혈석 비용"
            min="0"
            step="1"
          />
          <button
            onClick={() => removeBundleItem(section, itemIndex)}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            삭제
          </button>
        </div>
        
        {bundleItem.components.length > 0 && (
          <button
            onClick={() => toggleItemExpanded(section, itemIndex)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
          >
            <span className="text-sm font-medium text-gray-300">
              구성 요소 {bundleItem.components.length}개
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        
        {isExpanded && (
          <div className="space-y-2 pl-4 border-l-2 border-gray-700">
            {bundleItem.itemType === '확률' && (() => {
              const totalProbability = bundleItem.components.reduce((sum, comp) => {
                return sum + (comp.probability || 0);
              }, 0);
              const isNot100Percent = Math.abs(totalProbability - 1) > 0.001;
              return isNot100Percent ? (
                <div className="text-red-400 text-sm font-medium bg-red-900/20 border border-red-700 rounded p-2 mb-2">
                  ⚠ 확률 합계가 {(totalProbability * 100).toFixed(1)}%입니다. (100%가 되어야 합니다)
                </div>
              ) : null;
            })()}
            
            {bundleItem.components.map((component, componentIndex) => {
              const level0ItemColors = getLevelColors(0);
              return (
                <div key={componentIndex} className={`${level0ItemColors.bg} rounded-lg p-3 border ${level0ItemColors.border}`}>
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      {bundleItem.itemType === '선택' && (
                        <input
                          type="radio"
                          name={`${section}-${itemIndex}-selection`}
                          checked={component.selected || false}
                          onChange={(e) => updateComponent(section, itemIndex, componentIndex, 'selected', e.target.checked)}
                          className="mt-2"
                        />
                      )}
                      
                      <SearchableSelect
                        value={
                          // 직접 입력 모드: itemName이 __manual__이거나 availableItemNames에 없으면 __manual__ 유지
                          (component.itemName === '__manual__' || component.itemName === '' || 
                           (component.itemName && component.itemName !== '__nested__' && 
                            !component.itemName.includes('(실제가치)') && 
                            !availableItemNames.has(component.itemName)))
                            ? '__manual__'
                            : component.itemName
                        }
                        onChange={(value) => {
                          if (value === '__nested__') {
                            updateComponent(section, itemIndex, componentIndex, 'itemName', '__nested__');
                            updateComponent(section, itemIndex, componentIndex, 'nestedItem', {
                              itemName: '',
                              itemType: '확정',
                              quantity: 1,
                              components: [],
                              bloodstoneCost: 0,
                            });
                          } else {
                            updateComponent(section, itemIndex, componentIndex, 'itemName', value);
                            if (value !== '__nested__') {
                              updateComponent(section, itemIndex, componentIndex, 'nestedItem', undefined);
                            }
                          }
                        }}
                        options={componentOptions}
                        placeholder="아이템 선택"
                        className="flex-1"
                      />
                    </div>
                    
                    {(component.itemName === '__manual__' || (component.itemName && component.itemName !== '__nested__' && !component.itemName.includes('(실제가치)') && !availableItemNames.has(component.itemName))) && (
                      <div>
                        <input
                          type="text"
                          value={component.itemName === '__manual__' ? '' : component.itemName}
                          onChange={(e) => {
                            const value = e.target.value || '__manual__';
                            updateComponent(section, itemIndex, componentIndex, 'itemName', value);
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
                        onChange={(e) => updateComponent(section, itemIndex, componentIndex, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        placeholder="수량"
                        min="0"
                      />
                      
                      {bundleItem.itemType === '확률' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={component.probability !== undefined ? (component.probability * 100) : ''}
                            onChange={(e) => {
                              const percentValue = parseFloat(e.target.value) || 0;
                              updateComponent(section, itemIndex, componentIndex, 'probability', percentValue / 100);
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
                        onClick={() => removeComponent(section, itemIndex, componentIndex)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    
                    {/* 단가/가치 표시 */}
                    {component.itemName !== '__nested__' && (() => {
                      const isManual = component.itemName === '__manual__' || component.itemName === '';
                      const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                      const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                        ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                        : resolved;
                      
                      if (!finalUnitPrice) {
                        return (
                          <div className="flex items-center gap-2 mt-2">
                            <select
                              value={component.manualUnitType || '골드'}
                              onChange={(e) => updateComponent(section, itemIndex, componentIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                              className="px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700"
                            >
                              <option value="골드">골드</option>
                              <option value="크리스탈">크리스탈</option>
                              <option value="현금">현금</option>
                            </select>
                            <input
                              type="text"
                              value={manualPriceInputs[`${section}-${itemIndex}-${componentIndex}`] ?? (component.manualPrice?.toString() ?? '')}
                              onChange={(e) => {
                                const key = `${section}-${itemIndex}-${componentIndex}`;
                                setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                              }}
                              onBlur={(e) => {
                                const key = `${section}-${itemIndex}-${componentIndex}`;
                                const value = e.target.value.trim();
                                const numValue = value === '' ? null : parseFloat(value);
                                updateComponent(section, itemIndex, componentIndex, 'manualPrice', numValue || null);
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
                      }
                      
                      let componentValue = 0;
                      if (finalUnitPrice.unitType === '골드') {
                        componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
                      } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                        componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
                      } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                        // 현금 → 골드: 현금 가격 / goldToCashPerGold
                        componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
                      }
                      
                      const itemQuantity = bundleItem.quantity || 1;
                      if (bundleItem.itemType === '확정') {
                        componentValue *= itemQuantity;
                      } else if (bundleItem.itemType === '확률') {
                        const probability = component.probability || 0;
                        componentValue = componentValue * probability * itemQuantity;
                      } else if (bundleItem.itemType === '선택') {
                        if (component.selected) {
                          componentValue *= itemQuantity;
                        } else {
                          componentValue = 0;
                        }
                      }
                      
                      return (
                        <div className="mt-2 text-sm text-gray-300">
                          단가: <span className="text-yellow-300">{formatNumberWithSignificantDigits(finalUnitPrice.unitPrice)}</span> {finalUnitPrice.unitType}
                          <span className="text-gray-400 mx-1">×</span>
                          수량: {formatNumberWithSignificantDigits(component.quantity || 0)}
                          {bundleItem.quantity && bundleItem.quantity > 1 && (
                            <span className="text-blue-400 ml-1">× 묶음 수량 {bundleItem.quantity}</span>
                          )}
                          {componentValue > 0 && (
                            <>
                              <span className="text-gray-400 mx-1">=</span>
                              <span className="text-green-300 font-medium ml-1">
                                {formatNumberWithSignificantDigits(componentValue)} 골드
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            
            <button
              onClick={() => addComponent(section, itemIndex)}
              className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              구성 요소 추가
            </button>
          </div>
        )}
        
        {bundleItem.components.length === 0 && (
          <div className="pl-4 border-l-2 border-gray-700">
            <button
              onClick={() => addComponent(section, itemIndex)}
              className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              구성 요소 추가
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">길드 혈석 상점 교환 효율</h1>
          {allowShopSave && (
            <div className="flex gap-2">
              <button
                onClick={handleNewShop}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                새로 만들기
              </button>
              <button
                onClick={() => setShowSaveModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                저장
              </button>
            </div>
          )}
        </div>

        {/* 저장 모달 */}
        {showSaveModal && allowShopSave && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-white mb-4">
                {selectedShopId ? '상점 업데이트' : '상점 저장'}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">상점명</label>
                <input
                  type="text"
                  value={saveShopName}
                  onChange={(e) => setSaveShopName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="상점명 입력"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setSaveShopName('');
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveShop}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  disabled={isLoading || !saveShopName.trim()}
                >
                  {isLoading ? '처리 중...' : selectedShopId ? '업데이트' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        
        {/* 요약 카드 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">요약</h2>
          <div className="space-y-6">
            {/* 입장권 및 보조 재료 */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">입장권 및 보조 재료</h3>
              {sectionDetails.ticketItems.length > 0 ? (
                <div className="space-y-2">
                  {sectionDetails.ticketItems.map((item, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-sm text-gray-300">
                        <span className="font-medium">{item.itemName}</span>
                        {' - '}
                        가치: <span className="text-yellow-300">{formatNumberWithSignificantDigits(item.value)}</span> 골드
                        {' - '}
                        혈석: <span className="text-blue-300">{formatNumberWithSignificantDigits(item.bloodstoneCost)}</span>
                        {' - '}
                        혈석 1개당 가치: <span className="text-green-300">{item.bloodstoneCost > 0 ? formatNumberWithSignificantDigits(item.valuePerBloodstone) : '0'}</span> 골드
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">묶음 항목이 없습니다.</div>
              )}
            </div>

            {/* 재련 재료 */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">재련 재료</h3>
              {sectionDetails.refiningItems.length > 0 ? (
                <div className="space-y-2">
                  {sectionDetails.refiningItems.map((item, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-sm text-gray-300">
                        <span className="font-medium">{item.itemName}</span>
                        {' - '}
                        가치: <span className="text-yellow-300">{formatNumberWithSignificantDigits(item.value)}</span> 골드
                        {' - '}
                        혈석: <span className="text-blue-300">{formatNumberWithSignificantDigits(item.bloodstoneCost)}</span>
                        {' - '}
                        혈석 1개당 가치: <span className="text-green-300">{item.bloodstoneCost > 0 ? formatNumberWithSignificantDigits(item.valuePerBloodstone) : '0'}</span> 골드
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">묶음 항목이 없습니다.</div>
              )}
            </div>

            {/* 실링 */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">실링</h3>
              {sectionDetails.silverItems.length > 0 ? (
                <div className="space-y-2">
                  {sectionDetails.silverItems.map((item, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-sm text-gray-300">
                        <span className="font-medium">{item.itemName}</span>
                        {' - '}
                        가치: <span className="text-yellow-300">{formatNumberWithSignificantDigits(item.value)}</span> 골드
                        {' - '}
                        혈석: <span className="text-blue-300">{formatNumberWithSignificantDigits(item.bloodstoneCost)}</span>
                        {' - '}
                        혈석 1개당 가치: <span className="text-green-300">{item.bloodstoneCost > 0 ? formatNumberWithSignificantDigits(item.valuePerBloodstone) : '0'}</span> 골드
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">묶음 항목이 없습니다.</div>
              )}
            </div>
          </div>
        </div>

        {/* 입장권 및 보조 재료 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">입장권 및 보조 재료</h2>
          <div className="space-y-4">
            {shopData.ticketItems.map((item, index) => renderBundleItem('ticketItems', item, index))}
            <button
              onClick={() => addBundleItem('ticketItems')}
              className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              묶음 항목 추가
            </button>
          </div>
        </div>

        {/* 재련 재료 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">재련 재료</h2>
          <div className="space-y-4">
            {shopData.refiningItems.map((item, index) => renderBundleItem('refiningItems', item, index))}
            <button
              onClick={() => addBundleItem('refiningItems')}
              className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              묶음 항목 추가
            </button>
          </div>
        </div>

        {/* 실링 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">실링</h2>
          <div className="space-y-4">
            {shopData.silverItems.map((item, index) => renderBundleItem('silverItems', item, index))}
            <button
              onClick={() => addBundleItem('silverItems')}
              className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              묶음 항목 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

