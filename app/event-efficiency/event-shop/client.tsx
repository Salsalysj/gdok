'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatNumberWithSignificantDigits } from '../../utils/formatNumber';
import { usePriceAdjustment } from '../../hooks/usePriceAdjustment';
import { useValueDb } from '../../contexts/ValueDbContext';
import { usePriceOverride } from '../../contexts/PriceOverrideContext';
import type { ValueDbEntry } from '@/lib/valueDb';
import { calculateOptimalStrategy } from '../../refining-simulation/client';
import type { RefiningStage, MarketItemInfo } from '../../refining-simulation/page';
import FavoriteButton from '../../components/FavoriteButton';

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
  exchangeCost?: number; // 교환 비용
  exchangeCount?: number; // 교환 횟수
  exchangeCycle?: '주간 원정대 제한' | '원정대 제한'; // 교환 주기
};

type EventShopTab = {
  id: string;
  name: string;
  items: BundleItem[];
  coinName?: string; // 주화 이름
  coinMultiplier?: number; // 배율
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

export default function EventShopClient({
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
  weaponStages,
  armorStages,
  weaponStagesSerka,
  armorStagesSerka,
  marketInfo,
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
  weaponStages?: RefiningStage[];
  armorStages?: RefiningStage[];
  weaponStagesSerka?: RefiningStage[];
  armorStagesSerka?: RefiningStage[];
  marketInfo?: Record<string, MarketItemInfo>;
  initialSavedShops?: Array<{ id: string; shop_name: string; created_at: string; updated_at: string; shop_data?: any; start_date?: string | null; end_date?: string | null }>;
}) {
  const { adjustPrice } = usePriceAdjustment();
  const { adjustedEntries } = useValueDb();
  const { state: priceOverrideState } = usePriceOverride();
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  
  // 가격 조정 스위치 변경 시 resolveUnitPrice 재계산을 위한 refresh key
  const [refreshKey, setRefreshKey] = useState(0);

  // 순환 돌파석 가치를 클라이언트에서 재계산 (지옥 보상 페이지와 동일한 방식)
  const circularBreakthroughValue = useMemo(() => {
    if (weaponStages && armorStages && marketInfo && weaponStages.length > 0 && armorStages.length > 0) {
      const adjustedMarketInfo: Record<string, MarketItemInfo> = {};
      for (const [name, info] of Object.entries(marketInfo)) {
        adjustedMarketInfo[name] = {
          ...info,
          unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
        };
      }

      const getBreakthroughStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
        if (type === 'weapon') {
          if (level >= 10 && level <= 12) return 30;
          if (level >= 13 && level <= 16) return 40;
          if (level >= 17 && level <= 25) return 50;
        } else {
          if (level >= 10 && level <= 12) return 12;
          if (level >= 13 && level <= 16) return 16;
          if (level >= 17 && level <= 25) return 20;
        }
        return 0;
      };

      const allBreakthroughValues: number[] = [];
      
      [...weaponStages, ...armorStages].forEach(stage => {
        const { optimalStrategy } = calculateOptimalStrategy(stage, adjustedMarketInfo);
        
        const expInfo = stage.expMaterial ? (adjustedMarketInfo[stage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = stage.expMaterial && expInfo
          ? expInfo.unitPrice * stage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = stage.baseSuccessRate / 100;
        
        const type = stage.baseMaterials.some(m => m.name === '운명의 파괴석') ? 'weapon' : 'armor';
        const stoneCount = getBreakthroughStoneCount(stage.level, type);
        
        if (stoneCount > 0) {
          const value = (refiningCost * baseSuccessRate) / stoneCount;
          if (value > 0) {
            allBreakthroughValues.push(value);
          }
        }
      });

      if (allBreakthroughValues.length > 0) {
        const sorted = allBreakthroughValues.sort((a, b) => b - a);
        const top5 = sorted.slice(0, 5);
        return top5.reduce((sum, val) => sum + val, 0) / top5.length;
      }
    }
    
    const entry = Object.values(valueDbMap).find(e => e.itemName === '순환 돌파석');
    if (entry && entry.unitType === '골드' && entry.unitValue != null) {
      return adjustPrice('순환 돌파석', entry.unitValue);
    }
    return null;
  }, [valueDbMap, adjustPrice, weaponStages, armorStages, marketInfo]);

  // 전이 돌파석 가치를 클라이언트에서 재계산 (지옥 보상 페이지와 동일한 방식)
  const transitionBreakthroughValue = useMemo(() => {
    if (weaponStagesSerka && armorStagesSerka && marketInfo && weaponStagesSerka.length > 0 && armorStagesSerka.length > 0) {
      const adjustedMarketInfo: Record<string, MarketItemInfo> = {};
      for (const [name, info] of Object.entries(marketInfo)) {
        adjustedMarketInfo[name] = {
          ...info,
          unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
        };
      }

      const getTransitionStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
        if (type === 'weapon') {
          if (level >= 10 && level <= 11) return 25;
          if (level >= 12 && level <= 13) return 30;
          if (level >= 14 && level <= 16) return 35;
          if (level >= 17 && level <= 19) return 40;
          if (level >= 20 && level <= 21) return 45;
          if (level >= 22 && level <= 23) return 50;
          if (level >= 24 && level <= 25) return 55;
        } else {
          if (level >= 10 && level <= 11) return 10;
          if (level >= 12 && level <= 13) return 12;
          if (level >= 14 && level <= 16) return 14;
          if (level >= 17 && level <= 19) return 16;
          if (level >= 20 && level <= 21) return 18;
          if (level >= 22 && level <= 23) return 20;
          if (level >= 24 && level <= 25) return 22;
        }
        return 0;
      };

      const allBreakthroughValues: number[] = [];
      
      [...weaponStagesSerka, ...armorStagesSerka].forEach(stage => {
        const { optimalStrategy } = calculateOptimalStrategy(stage, adjustedMarketInfo);
        
        const expInfo = stage.expMaterial ? (adjustedMarketInfo[stage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = stage.expMaterial && expInfo
          ? expInfo.unitPrice * stage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = stage.baseSuccessRate / 100;
        
        const type = stage.baseMaterials.some(m => m.name === '운명의 파괴석 결정') ? 'weapon' : 'armor';
        const stoneCount = getTransitionStoneCount(stage.level, type);
        
        if (stoneCount > 0) {
          const value = (refiningCost * baseSuccessRate) / stoneCount;
          if (value > 0) {
            allBreakthroughValues.push(value);
          }
        }
      });

      if (allBreakthroughValues.length > 0) {
        const sorted = allBreakthroughValues.sort((a, b) => b - a);
        const top5 = sorted.slice(0, 5);
        return top5.reduce((sum, val) => sum + val, 0) / top5.length;
      }
    }
    
    const entry = Object.values(valueDbMap).find(e => e.itemName === '전이 돌파석');
    if (entry && entry.unitType === '골드' && entry.unitValue != null) {
      return adjustPrice('전이 돌파석', entry.unitValue);
    }
    return null;
  }, [valueDbMap, adjustPrice, weaponStagesSerka, armorStagesSerka, marketInfo]);

  // 가치계산DB에서 아이템 가격 가져오기 함수
  const getValueDbPrice = useCallback((itemName: string): number | null => {
    // 순환 돌파석은 클라이언트에서 재계산된 값 사용
    if (itemName === '순환 돌파석') {
      return circularBreakthroughValue;
    }
    // 전이 돌파석은 클라이언트에서 재계산된 값 사용
    if (itemName === '전이 돌파석') {
      return transitionBreakthroughValue;
    }
    
    const entry = valueDbMap[itemName];
    if (entry && entry.unitType === '골드' && entry.unitValue != null) {
      return entry.unitValue;
    }
    return null;
  }, [valueDbMap, circularBreakthroughValue, transitionBreakthroughValue]);

  // 지옥 보상 가격 조정 함수 (모든 아이템은 가치계산DB 우선 사용)
  const getAdjustedPrice = useCallback((itemName: string, originalPrice: number | null | undefined): number | null => {
    // 모든 아이템은 가치계산DB에서 가격 가져오기 (우선순위)
    const valueDbPrice = getValueDbPrice(itemName);
    if (valueDbPrice != null) {
      // 순환 돌파석은 이미 adjustPrice가 적용된 값이므로 그대로 반환
      if (itemName === '순환 돌파석') {
        return valueDbPrice;
      }
      // 가격 조정 적용
      return adjustPrice(itemName, valueDbPrice);
    }
    
    // 가치계산DB에 없는 경우 기존 로직 사용 후 가격 조정 적용
    let price = originalPrice ?? null;
    if (price != null) {
      price = adjustPrice(itemName, price);
    }
    
    return price;
  }, [getValueDbPrice, adjustPrice]);
  
  // 가격 조정 스위치 변경 감지
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [
    priceOverrideState.has97Stone,
    priceOverrideState.ignoreCardExp,
    priceOverrideState.cardSetGraduated,
    priceOverrideState.hasFullRelicEngraving,
    priceOverrideState.ignoreSilver,
    priceOverrideState.ignoreBreakthroughStone,
    priceOverrideState.ignoreFragment,
    priceOverrideState.ignoreDestructionGuardStone,
  ]);
  
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedNestedItems, setExpandedNestedItems] = useState<Record<string, boolean>>({});
  const [expandedSummaryItems, setExpandedSummaryItems] = useState<Record<string, boolean>>({});
  const [summaryComponentTooltipKey, setSummaryComponentTooltipKey] = useState<string | null>(null);
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  // 외부 클릭 시 툴팁 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (showTooltip) {
        setShowTooltip(null);
      }
    };

    if (showTooltip) {
      // 약간의 지연을 두어 버튼 클릭 이벤트가 먼저 처리되도록 함
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showTooltip]);

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

  const [tabs, setTabs] = useState<EventShopTab[]>([]);
  const [shopName, setShopName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // 환경 정보를 API에서 받아와서 저장 기능 활성화 여부 결정
  const [allowShopSave, setAllowShopSave] = useState<boolean>(
    process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development'
  );
  
  useEffect(() => {
    // 클라이언트에서 환경 정보 확인
    if (typeof window !== 'undefined') {
      fetch('/api/env/check')
        .then(res => res.json())
        .then(data => {
          setAllowShopSave(data.allowPackageSave ?? false);
        })
        .catch(() => {
          // API 호출 실패 시 기본값 유지
        });
    }
  }, []);

  // 저장 관련 상태
  const [savedShops, setSavedShops] = useState<Array<{ id: string; shop_name: string; created_at: string; updated_at: string; shop_data?: any; start_date?: string | null; end_date?: string | null }>>(initialSavedShops || []);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveShopName, setSaveShopName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 탭 추가
  const addTab = () => {
    const newTab: EventShopTab = {
      id: `tab-${Date.now()}`,
      name: `탭 ${tabs.length + 1}`,
      items: [],
    };
    setTabs([...tabs, newTab]);
  };

  // 탭 삭제
  const removeTab = (tabId: string) => {
    setTabs(tabs.filter(tab => tab.id !== tabId));
  };

  // 탭 이름 업데이트
  const updateTabName = (tabId: string, name: string) => {
    setTabs(tabs.map(tab => tab.id === tabId ? { ...tab, name } : tab));
  };

  // 탭 업데이트
  const updateTab = (tabId: string, field: 'coinName' | 'coinMultiplier', value: string | number) => {
    setTabs(tabs.map(tab => tab.id === tabId ? { ...tab, [field]: value } : tab));
  };

  const getLevelColors = (level: number) => {
    const colorPalette = [
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' },
      { bg: 'bg-gray-800/50', border: 'border-gray-700/50', text: 'text-gray-300', accent: 'gray' },
    ];
    return colorPalette[level % colorPalette.length];
  };

  const toggleItemExpanded = useCallback((tabId: string, itemIndex: number) => {
    const key = `${tabId}-${itemIndex}`;
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const toggleNestedItemExpanded = useCallback((tabId: string, itemIndex: number, compIndex: number) => {
    const key = `${tabId}-${itemIndex}-${compIndex}`;
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

  // 클라이언트에서 지옥 열쇠 가치 계산 (지옥 보상 페이지와 동일한 로직)
  const computeHellKeyValue = useCallback((hellType: '지옥1' | '지옥2' | '지옥3', stageName: string): number | null => {
    const stages = hellType === '지옥1' ? hell1Stages : hellType === '지옥2' ? hell2Stages : hellStages;
    if (!stages || stages.length === 0) return null;
    
    const stage = stages.find(s => s.stage === stageName);
    if (!stage || !stage.rewards || stage.rewards.length === 0) return null;
    
    // 카테고리별로 그룹화
    const groupedByCategory: Record<string, typeof stage.rewards> = {};
    stage.rewards.forEach((reward) => {
      const category = reward.category || '기본';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push(reward);
    });
    
    const categories = Object.keys(groupedByCategory);
    if (categories.length === 0) return null;
    
    // 지옥: 기본 보상 + 나머지 카테고리 중 3개를 랜덤으로 선택하고 그 중 최고값을 선택
    const baseCategory = categories.find(cat => cat.includes('기본') || cat.includes('보상 상자')) || categories[0];
    const otherCategories = categories.filter(cat => cat !== baseCategory);
    
    // 기본 보상 가치 계산 (가격 조정 적용, 가치계산DB 우선 사용)
    let baseRewardValue = 0;
    if (baseCategory && groupedByCategory[baseCategory]) {
      const baseValue = groupedByCategory[baseCategory].reduce((sum, r) => {
        const adjustedPrice = getAdjustedPrice(r.itemName, r.price);
        return sum + ((adjustedPrice || 0) * r.quantity);
      }, 0);
      // 기본 보상 상자는 190% 반영 (100% 기본 + 90% 풍요 기대값)
      baseRewardValue = baseValue * 1.9;
    }
    
    // 선택 보상 기대값 계산
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
  }, [hell1Stages, hell2Stages, hellStages, getAdjustedPrice, refreshKey]);

  // resolveUnitPrice (과금 효율과 동일한 로직 사용)
  const resolveUnitPrice = useCallback((itemName: string): { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null => {
    if (itemName === '순환 돌파석' || itemName.includes('(실제가치)')) {
      const entry = adjustedEntries.find(e => e.itemName === itemName);
      if (entry && entry.unitType === '골드' && entry.unitValue != null) {
        return { unitType: '골드', unitPrice: entry.unitValue };
      }
      return null;
    }

    // 가치계산DB Context 우선 (가격 조정·제작 재료 재계산 등이 반영된 값)
    if (adjustedEntries && adjustedEntries.length > 0) {
      const valueDbEntry = adjustedEntries.find((entry) => entry.itemName === itemName);
      if (valueDbEntry && valueDbEntry.unitType && valueDbEntry.unitValue != null) {
        return {
          unitType: valueDbEntry.unitType as '골드' | '크리스탈' | '현금',
          unitPrice: valueDbEntry.unitValue,
        };
      }
    }

    // 에브니 큐브 입장권 처리
    if (itemName.startsWith('에브니 큐브 입장권')) {
      const hellExchangeMatch = itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
      if (hellExchangeMatch) {
        const cubeStage = hellExchangeMatch[1]; // 1해금, 2해금, 3해금, 4해금
        let hellKeyValue: number | null = null;
        
        // 해금 단계에 따라 지옥 열쇠 가치 계산
        if (cubeStage === '1해금' || cubeStage === '2해금') {
          hellKeyValue = computeHellKeyValue('지옥1', '7단계');
        } else if (cubeStage === '3해금') {
          hellKeyValue = computeHellKeyValue('지옥2', '7단계');
        } else if (cubeStage === '4해금') {
          hellKeyValue = computeHellKeyValue('지옥3', '7단계');
        }
        
        if (hellKeyValue != null && hellKeyValue > 0) {
          return {
            unitType: '골드',
            unitPrice: hellKeyValue / 10,
          };
        }
        return null;
      }
      
      const m = itemName.match(/에브니 큐브 입장권 \(([^)]+)\)/);
      const key = m ? m[1] : '';
      if (key && cubeStageRewards[key]) {
        let sum = 0;
        for (const reward of cubeStageRewards[key]) {
          let originalPrice: number | null = null;
          
          // 1레벨 보석 (4T) 또는 (3T): marketData에서 계산
          if (reward.itemName === '1레벨 보석 (4T)' || reward.itemName === '1레벨 보석 (3T)') {
            const gemType = reward.itemName.includes('4T') ? '4T' : '3T';
            // marketData에서 5레벨 보석 가격 찾기
            const findGemPrice = (gemName: string): number | null => {
              if (!marketData) return null;
              const allItems = [
                ...(marketData.tier4Results || []),
                ...(marketData.tier3Results || []),
                ...(marketData.gemResults || []),
                ...(marketData.otherResults || []),
              ];
              const item = allItems.find((item: any) => {
                const name = (item.displayName || item.Name || '').trim();
                return name === gemName;
              });
              if (item) {
                const price = item.CurrentMinPrice || item.RecentPrice;
                return price && price > 0 ? price : null;
              }
              return null;
            };
            const fearGem = findGemPrice('5레벨 겁화의 보석');
            const fireGem = findGemPrice('5레벨 작열의 보석');
            if (fearGem && fireGem) {
              if (gemType === '4T') {
                originalPrice = (fearGem + fireGem) / 162;
              } else {
                const tier4Unit = (fearGem + fireGem) / 162;
                originalPrice = tier4Unit / 9;
              }
            }
          }
          // 카드 경험치: valueDbMap에서 찾기
          else if (reward.itemName === '카드 경험치') {
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
          }
          // 실링: 제외
          else if (reward.itemName === '실링') {
            originalPrice = null; // 실링은 합계에서 제외
          }
          // 기타 항목: etcListData 또는 marketPriceMap에서 찾기
          else {
            const etc = etcListData[reward.itemName];
            if (etc?.gold != null) {
              originalPrice = etc.gold;
            } else if (marketPriceMap[reward.itemName] != null) {
              originalPrice = marketPriceMap[reward.itemName];
            } else if (marketData) {
              // marketData에서 직접 찾기
              const allItems = [
                ...(marketData.tier4Results || []),
                ...(marketData.tier3Results || []),
                ...(marketData.gemResults || []),
                ...(marketData.otherResults || []),
              ];
              const item = allItems.find((item: any) => {
                const name = (item.displayName || item.Name || '').trim();
                return name === reward.itemName;
              });
              if (item) {
                const price = item.CurrentMinPrice || item.RecentPrice;
                if (price && price > 0) {
                  // 묶음 개수 확인
                  const bundleMatch = reward.itemName.match(/\((\d+)개 묶음\)/);
                  const bundleCount = bundleMatch ? parseInt(bundleMatch[1], 10) : 1;
                  originalPrice = bundleCount > 0 ? price / bundleCount : price;
                }
              }
            }
          }
          
          // originalPrice가 null이 아니고 0보다 크면 가격 조정 적용
          if (originalPrice != null && originalPrice > 0) {
            const adjustedPrice = adjustPrice(reward.itemName, originalPrice);
            if (adjustedPrice != null && adjustedPrice > 0) {
              sum += adjustedPrice * reward.quantity;
            }
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
      // 현금 단위인 경우도 가격 조정 적용 (실링 미반영 등)
      else if (valueDbEntry.unitType === '현금') {
        const adjusted = adjustPrice(itemName, adjustedValue);
        if (adjusted === 0) {
          adjustedValue = 0;
        } else {
          adjustedValue = adjusted ?? adjustedValue;
        }
      }
      // 크리스탈 단위는 가격 조정 없이 그대로 반환
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
      // 현금 단위도 adjustPrice를 호출하여 실링 미반영 등 가격 조정 적용
      const adjustedValue = adjustPrice(itemName, etc.cash);
      // adjustPrice가 0을 반환하면 (실링 미반영 등) 0으로 설정
      if (adjustedValue === 0) {
        return { unitType: '현금', unitPrice: 0 };
      }
      return { unitType: '현금', unitPrice: adjustedValue ?? etc.cash };
    }

    // marketPriceMap 확인
    if (marketPriceMap[itemName] != null) {
      const adjustedValue = adjustPrice(itemName, marketPriceMap[itemName]) ?? marketPriceMap[itemName];
      return { unitType: '골드', unitPrice: adjustedValue };
    }

    return null;
  }, [
    adjustedEntries, 
    etcListData, 
    marketPriceMap, 
    valueDbMap, 
    cubeStageRewards, 
    adjustPrice,
    refreshKey,
  ]);

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

  // 탭별 items 배열 가져오기
  const getItems = (tabId: string): BundleItem[] => {
    const tab = tabs.find(t => t.id === tabId);
    return tab ? tab.items : [];
  };

  // 탭별 items 배열 업데이트
  const setItems = (tabId: string, items: BundleItem[]) => {
    setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, items } : tab));
  };

  // 묶음 항목 추가
  const addBundleItem = (tabId: string) => {
    setItems(tabId, [
      ...getItems(tabId),
      { itemName: '', itemType: '확정', quantity: 1, components: [], exchangeCost: 0 }
    ]);
  };
  // 묶음 항목 삭제
  const removeBundleItem = (tabId: string, index: number) => {
    setItems(tabId, getItems(tabId).filter((_, i) => i !== index));
  };


  // 구성 요소 삭제
  const removeComponent = (tabId: string, itemIndex: number, componentIndex: number) => {
    const items = [...getItems(tabId)];
    items[itemIndex] = {
      ...items[itemIndex],
      components: items[itemIndex].components.filter((_, i) => i !== componentIndex),
    };
    setItems(tabId, items);
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
        const finalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined)
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
        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined)
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
  // 탭별 총 교환 비용
  const calculateSectionExchangeCost = useCallback((items: BundleItem[]): number => {
    return items.reduce((sum, item) => sum + (item.exchangeCost || 0), 0);
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
        const finalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined)
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
      const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined)
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


  // 전체 탭의 묶음 항목 상세 정보
  const allItemsDetails = useMemo(() => {
    // 먼저 모든 탭의 항목을 합쳐서 전체 기준으로 등수 계산
    const allItems: Array<{ tabId: string; valuePerExchange: number; id: number }> = [];
    let itemIdCounter = 0;
    
      const getAllItemsDetails = () => {
        const details: Array<{
          id: number;
          tabId: string;
          itemIndex: number;
          itemName: string;
          quantity: number;
          value: number;
          exchangeCost: number;
          baseExchangeCost: number;
          multiplier: number;
          valuePerExchange: number;
          exchangeCount?: number;
          exchangeCycle?: '주간 원정대 제한' | '원정대 제한';
        }> = [];
        
        tabs.forEach(tab => {
          const multiplier = tab.coinMultiplier && tab.coinMultiplier !== 1 ? tab.coinMultiplier : 1;
          tab.items.forEach((item, itemIndex) => {
            const value = calculateBundleItemValue(item);
            const baseExchangeCost = item.exchangeCost || 0;
            const exchangeCost = baseExchangeCost * multiplier;
            const valuePerExchange = exchangeCost > 0 ? (value / exchangeCost) * 100 : 0;
            const id = itemIdCounter++;
            
            allItems.push({ tabId: tab.id, valuePerExchange, id });
            
            details.push({
              id,
              tabId: tab.id,
              itemIndex,
              itemName: item.itemName || '(미입력)',
              quantity: item.quantity || 1,
              value,
              exchangeCost,
              baseExchangeCost,
              multiplier,
              valuePerExchange,
              exchangeCount: item.exchangeCount,
              exchangeCycle: item.exchangeCycle,
            });
          });
        });
        
        return details;
      };
    
    const allDetails = getAllItemsDetails();
    
    // 전체 기준으로 등수 계산
    const sortedAllItems = [...allItems].sort((a, b) => b.valuePerExchange - a.valuePerExchange);
    
    // 각 항목 ID에 대한 등수 맵 생성 (상위 5개만)
    const rankMap = new Map<number, number>();
    sortedAllItems.forEach((item, index) => {
      if (index < 5) {
        rankMap.set(item.id, index + 1);
      }
    });
    
    // 각 항목에 등수 정보 추가
    return allDetails.map((item) => ({
      ...item,
      rank: rankMap.get(item.id) || null,
    }));
  }, [tabs, calculateBundleItemValue, goldToCashPerGold]);

  // 구성요소의 가치 계산 (자동 선택을 위해)
  const calculateComponentValue = useCallback((component: ComponentItem, bundleItem: BundleItem): number => {
    let componentValue = 0;

    // 중첩된 묶음 항목 처리
    if (component.itemName === '__nested__' && component.nestedItem) {
      componentValue = calculateBundleItemValue(component.nestedItem) * (component.nestedItem.quantity || 1);
    } else {
      const isManual = component.itemName === '__manual__' || component.itemName === '';
      const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
      const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined)
        ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
        : resolved;

      if (finalUnitPrice) {
        if (finalUnitPrice.unitType === '골드') {
          componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
        } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
          componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
        }
      }
    }

    const itemQuantity = bundleItem.quantity || 1;
    if (bundleItem.itemType === '확정') {
      componentValue *= itemQuantity;
    } else if (bundleItem.itemType === '확률') {
      const probability = component.probability || 0;
      componentValue = componentValue * probability * itemQuantity;
    }
    // '선택' 타입은 가치만 계산하고 selected는 나중에 처리

    return componentValue;
  }, [calculateBundleItemValue, resolveUnitPrice, crystalGoldRate, goldToCashPerGold]);

  // 선택 타입 묶음 항목에서 가장 가치가 높은 구성요소 자동 선택
  const autoSelectHighestValueComponent = useCallback((bundleItem: BundleItem): ComponentItem[] => {
    if (bundleItem.itemType !== '선택' || bundleItem.components.length === 0) {
      return bundleItem.components;
    }

    const componentValues = bundleItem.components.map((comp, idx) => ({
      index: idx,
      value: calculateComponentValue(comp, bundleItem),
      component: comp,
    }));

    // 가장 가치가 높은 구성요소 찾기
    const highestValueIndex = componentValues.reduce((maxIdx, curr, idx) => {
      return curr.value > componentValues[maxIdx].value ? idx : maxIdx;
    }, 0);

    // 모든 구성요소의 selected 상태 업데이트
    return bundleItem.components.map((comp, idx) => ({
      ...comp,
      selected: idx === highestValueIndex,
    }));
  }, [calculateComponentValue]);

  // 묶음 항목 업데이트
  const updateBundleItem = (tabId: string, index: number, field: keyof BundleItem, value: any) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const tab = newTabs.find(t => t.id === tabId);
      if (!tab) return prev;

      const items = [...tab.items];
      const updatedItem = { ...items[index], [field]: value };

      // itemType이 '선택'으로 변경되거나 구성요소가 있고 선택 타입이면 자동 선택
      if (field === 'itemType' && value === '선택') {
        updatedItem.components = autoSelectHighestValueComponent(updatedItem);
      } else if (updatedItem.itemType === '선택' && updatedItem.components.length > 0) {
        updatedItem.components = autoSelectHighestValueComponent(updatedItem);
      }

      items[index] = updatedItem;
      tab.items = items;
      return newTabs;
    });
  };

  // 구성 요소 추가
  const addComponent = (tabId: string, itemIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const tab = newTabs.find(t => t.id === tabId);
      if (!tab) return prev;

      const items = [...tab.items];
      const bundleItem = items[itemIndex];
      const isSelectionType = bundleItem.itemType === '선택';
      
      const newComponent: ComponentItem = {
        itemName: '',
        quantity: 1,
        manualPrice: null,
        manualUnitType: null,
        probability: isSelectionType ? undefined : 0,
        selected: false,
      };

      const updatedItem = {
        ...bundleItem,
        components: [...bundleItem.components, newComponent],
      };

      // 선택 타입이면 가장 가치가 높은 구성요소 자동 선택
      if (isSelectionType) {
        updatedItem.components = autoSelectHighestValueComponent(updatedItem);
      }

      items[itemIndex] = updatedItem;
      tab.items = items;
      return newTabs;
    });
  };

  // 구성 요소 업데이트
  const updateComponent = (tabId: string, itemIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const tab = newTabs.find(t => t.id === tabId);
      if (!tab) return prev;
      
      const items = [...tab.items];
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
      } else if (items[itemIndex].itemType === '선택' && (field === 'itemName' || field === 'quantity' || field === 'manualPrice' || field === 'manualUnitType' || field === 'nestedItem')) {
        // 구성요소 정보가 변경되면 다시 자동 선택
        const updatedBundleItem = { ...items[itemIndex], components: newComponents };
        const autoSelectedComponents = autoSelectHighestValueComponent(updatedBundleItem);
        autoSelectedComponents.forEach((comp: ComponentItem, idx: number) => {
          newComponents[idx].selected = comp.selected;
        });
      }
      
      items[itemIndex] = { ...items[itemIndex], components: newComponents };
      tab.items = items;
      return newTabs;
    });
  };

  // 저장된 상점 목록 새로고침
  const refreshSavedShops = useCallback(async () => {
    try {
      const res = await fetch('/api/event-shops');
      const data = await res.json();
      if (data.shops) {
        setSavedShops(data.shops);
      }
    } catch (error) {
      console.error('저장된 상점 목록 조회 실패:', error);
    }
  }, []);

  // initialSavedShops가 변경될 때 savedShops 상태 업데이트
  useEffect(() => {
    if (initialSavedShops) {
      setSavedShops(initialSavedShops);
    }
  }, [initialSavedShops]);

  // 페이지 마운트 시 저장된 상점 목록 새로고침
  useEffect(() => {
    refreshSavedShops();
  }, [refreshSavedShops]);


  // 상점 저장
  const handleSaveShop = async () => {
    if (!saveShopName.trim()) {
      alert('상점명을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const shopNameValue = saveShopName.trim();
      const shopData = {
        tabs,
        shopName,
        startDate,
        endDate,
      };
      
      let res;
      if (selectedShopId) {
        // 업데이트
        res = await fetch(`/api/event-shops/${selectedShopId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop_name: shopNameValue,
            shop_data: shopData,
            start_date: startDate || null,
            end_date: endDate || null,
          }),
        });
      } else {
        // 새로 저장
        res = await fetch('/api/event-shops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop_name: shopNameValue,
            shop_data: shopData,
            start_date: startDate || null,
            end_date: endDate || null,
          }),
        });
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      if (data.shop) {
        setSelectedShopId(data.shop.id);
        setShopName(shopNameValue);
      }

      setShowSaveModal(false);
      setSaveShopName('');
      await refreshSavedShops();
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
      const res = await fetch(`/api/event-shops/${shopId}`);
      const data = await res.json();
      
      if (data.shop && data.shop.shop_data) {
        setTabs(data.shop.shop_data.tabs || [{ id: 'tab-1', name: '새로운 탭 1', items: [] }]);
        setShopName(data.shop.shop_name || '');
        setStartDate(data.shop.start_date || '');
        setEndDate(data.shop.end_date || '');
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
      const res = await fetch(`/api/event-shops/${shopId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }

      if (selectedShopId === shopId) {
        setSelectedShopId(null);
        setTabs([{ id: 'tab-1', name: '새로운 탭 1', items: [] }]);
        setShopName('');
        setStartDate('');
        setEndDate('');
      }

      await refreshSavedShops();
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
    if (selectedShopId && (tabs.length > 0 || tabs.some(tab => tab.items.length > 0))) {
      if (!confirm('현재 작업 중인 내용이 사라집니다. 새로 만들기를 진행하시겠습니까?')) {
        return;
      }
    }
    setSelectedShopId(null);
    setTabs([{ id: 'tab-1', name: '새로운 탭 1', items: [] }]);
    setShopName('');
    setStartDate('');
    setEndDate('');
  };

  // 묶음 항목 렌더링 함수 (과금 효율과 동일한 UI 구조)
  const renderBundleItem = (
    tabId: string,
    bundleItem: BundleItem,
    itemIndex: number
  ) => {
    const level0Colors = getLevelColors(0);
    const key = `${tabId}-${itemIndex}`;
    const isExpanded = expandedItems[key];
    
    return (
      <div key={itemIndex} className={`${level0Colors.bg} rounded-lg border ${level0Colors.border} p-4`}>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <input
            type="text"
            value={bundleItem.itemName}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'itemName', e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="항목명"
          />
          <input
            type="number"
            value={bundleItem.quantity || ''}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
            className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="묶음 수량"
            min="1"
            step="1"
          />
          <select
            value={bundleItem.itemType}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
          >
            <option value="확정">확정</option>
            <option value="확률">확률</option>
            <option value="선택">선택</option>
          </select>
          <input
            type="number"
            value={bundleItem.exchangeCost || ''}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'exchangeCost', parseFloat(e.target.value) || 0)}
            className="w-32 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="교환 비용"
            min="0"
            step="1"
          />
          <input
            type="number"
            value={bundleItem.exchangeCount || ''}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'exchangeCount', parseFloat(e.target.value) || 0)}
            className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
            placeholder="교환 횟수"
            min="0"
            step="1"
          />
          <select
            value={bundleItem.exchangeCycle || ''}
            onChange={(e) => updateBundleItem(tabId, itemIndex, 'exchangeCycle', e.target.value as '주간 원정대 제한' | '원정대 제한' || undefined)}
            className="w-48 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
          >
            <option value="">교환 주기 선택</option>
            <option value="주간 원정대 제한">주간 원정대 제한</option>
            <option value="원정대 제한">원정대 제한</option>
          </select>
          <button
            onClick={() => removeBundleItem(tabId, itemIndex)}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            삭제
          </button>
        </div>
        
        {bundleItem.components.length > 0 && (
          <button
            onClick={() => toggleItemExpanded(tabId, itemIndex)}
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
                          name={`${tabId}-${itemIndex}-selection`}
                          checked={component.selected || false}
                          onChange={(e) => updateComponent(tabId, itemIndex, componentIndex, 'selected', e.target.checked)}
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
                            updateComponent(tabId, itemIndex, componentIndex, 'itemName', '__nested__');
                            updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                              itemName: '',
                              itemType: '확정',
                              quantity: 1,
                              components: [],
                              exchangeCost: 0,
                            });
                          } else {
                            updateComponent(tabId, itemIndex, componentIndex, 'itemName', value);
                            if (value !== '__nested__') {
                              updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', undefined);
                            }
                          }
                        }}
                        options={componentOptions}
                        placeholder="아이템 선택"
                        className="flex-1"
                      />
                    </div>
                    
                    {/* 하위 묶음 항목 입력 */}
                    {component.itemName === '__nested__' && component.nestedItem && (
                      <div className="space-y-3 pl-4 border-l-2 border-gray-700 bg-gray-800 rounded p-3">
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={component.nestedItem.itemName}
                            onChange={(e) => {
                              const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                              updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', nestedItem);
                            }}
                            className="flex-1 px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                            placeholder="하위 묶음 항목명"
                          />
                          <select
                            value={component.nestedItem.itemType}
                            onChange={(e) => {
                              const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                              updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', nestedItem);
                            }}
                            className="w-20 px-2 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                          >
                            <option value="확정">확정</option>
                            <option value="확률">확률</option>
                            <option value="선택">선택</option>
                          </select>
                        </div>
                        
                        {/* 하위 구성 요소 목록 */}
                        <div className="space-y-2 mt-2">
                          {component.nestedItem.components.map((nestedComp, nestedCompIndex) => (
                            <div key={nestedCompIndex} className="bg-gray-900/50 rounded p-2 flex items-center gap-2">
                              <SearchableSelect
                                value={nestedComp.itemName && availableItemNames.has(nestedComp.itemName) ? nestedComp.itemName : (nestedComp.itemName === '__manual__' || (nestedComp.itemName && !nestedComp.itemName.includes('(실제가치)') && !availableItemNames.has(nestedComp.itemName)) ? '__manual__' : nestedComp.itemName || '')}
                                onChange={(value) => {
                                  const newComponents = [...component.nestedItem!.components];
                                  newComponents[nestedCompIndex] = { ...newComponents[nestedCompIndex], itemName: value || '' };
                                  updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                    ...component.nestedItem!,
                                    components: newComponents,
                                  });
                                }}
                                options={componentOptions}
                                placeholder="아이템 선택"
                                className="flex-1"
                                size="small"
                              />
                              <input
                                type="number"
                                value={nestedComp.quantity || ''}
                                onChange={(e) => {
                                  const newComponents = [...component.nestedItem!.components];
                                  newComponents[nestedCompIndex] = { ...newComponents[nestedCompIndex], quantity: parseFloat(e.target.value) || 0 };
                                  updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                    ...component.nestedItem!,
                                    components: newComponents,
                                  });
                                }}
                                className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm"
                                placeholder="수량"
                                min="0"
                              />
                              {component.nestedItem!.itemType === '확률' && (
                                <input
                                  type="number"
                                  value={nestedComp.probability !== undefined ? (nestedComp.probability * 100) : ''}
                                  onChange={(e) => {
                                    const newComponents = [...component.nestedItem!.components];
                                    newComponents[nestedCompIndex] = { ...newComponents[nestedCompIndex], probability: parseFloat(e.target.value) / 100 || 0 };
                                    updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                      ...component.nestedItem!,
                                      components: newComponents,
                                    });
                                  }}
                                  className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm"
                                  placeholder="확률"
                                  min="0"
                                  max="100"
                                />
                              )}
                              {component.nestedItem!.itemType === '선택' && (
                                <input
                                  type="checkbox"
                                  checked={nestedComp.selected || false}
                                  onChange={(e) => {
                                    const newComponents = [...component.nestedItem!.components];
                                    newComponents[nestedCompIndex] = { ...newComponents[nestedCompIndex], selected: e.target.checked };
                                    updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                      ...component.nestedItem!,
                                      components: newComponents,
                                    });
                                  }}
                                  className="w-4 h-4"
                                />
                              )}
                              <button
                                onClick={() => {
                                  const newComponents = component.nestedItem!.components.filter((_, i) => i !== nestedCompIndex);
                                  updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                    ...component.nestedItem!,
                                    components: newComponents,
                                  });
                                }}
                                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const newComponents = [...component.nestedItem!.components, {
                                itemName: '',
                                quantity: 1,
                                manualPrice: null,
                                manualUnitType: null,
                                probability: undefined,
                                selected: false,
                              }];
                              updateComponent(tabId, itemIndex, componentIndex, 'nestedItem', {
                                ...component.nestedItem!,
                                components: newComponents,
                              });
                            }}
                            className="w-full px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                          >
                            구성 요소 추가
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {(component.itemName === '__manual__' || (component.itemName && component.itemName !== '__nested__' && !component.itemName.includes('(실제가치)') && !availableItemNames.has(component.itemName))) && (
                      <div>
                        <input
                          type="text"
                          value={component.itemName === '__manual__' ? '' : component.itemName}
                          onChange={(e) => {
                            const value = e.target.value || '__manual__';
                            updateComponent(tabId, itemIndex, componentIndex, 'itemName', value);
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
                        onChange={(e) => updateComponent(tabId, itemIndex, componentIndex, 'quantity', parseFloat(e.target.value) || 0)}
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
                              updateComponent(tabId, itemIndex, componentIndex, 'probability', percentValue / 100);
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
                        onClick={() => removeComponent(tabId, itemIndex, componentIndex)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    
                    {/* 단가/가치 표시 */}
                    {component.itemName !== '__nested__' && (() => {
                      const isManual = component.itemName === '__manual__' || component.itemName === '';
                      const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                      const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined)
                        ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                        : resolved;
                      
                      if (!finalUnitPrice) {
                        return (
                          <div className="flex items-center gap-2 mt-2">
                            <select
                              value={component.manualUnitType || '골드'}
                              onChange={(e) => updateComponent(tabId, itemIndex, componentIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                              className="px-2 py-1 bg-gray-800 text-gray-200 rounded border border-gray-700"
                            >
                              <option value="골드">골드</option>
                              <option value="크리스탈">크리스탈</option>
                              <option value="현금">현금</option>
                            </select>
                            <input
                              type="text"
                              value={manualPriceInputs[`${tabId}-${itemIndex}-${componentIndex}`] ?? (component.manualPrice?.toString() ?? '')}
                              onChange={(e) => {
                                const key = `${tabId}-${itemIndex}-${componentIndex}`;
                                setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                              }}
                              onBlur={(e) => {
                                const key = `${tabId}-${itemIndex}-${componentIndex}`;
                                const value = e.target.value.trim();
                                const numValue = value === '' ? null : parseFloat(value);
                                updateComponent(tabId, itemIndex, componentIndex, 'manualPrice', numValue || null);
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
              onClick={() => addComponent(tabId, itemIndex)}
              className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              구성 요소 추가
            </button>
          </div>
        )}
        
        {bundleItem.components.length === 0 && (
          <div className="pl-4 border-l-2 border-gray-700">
            <button
              onClick={() => addComponent(tabId, itemIndex)}
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
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div>
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="hidden md:flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">이벤트 상점 교환 효율</h1>
            <FavoriteButton title="이벤트 상점 교환" />
          </div>
          {allowShopSave && (
          <div className="hidden md:flex gap-2">
            <button
              onClick={handleNewShop}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              새로 만들기
            </button>
            <button
              onClick={() => {
                setSaveShopName(shopName || '');
                setShowSaveModal(true);
              }}
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

        {/* 저장된 상점 목록 */}
        {savedShops.length > 0 && (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">저장된 상점</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedShops.map((shop) => {
                const isSelected = selectedShopId === shop.id;
                return (
                  <div 
                    key={shop.id} 
                    onClick={() => handleLoadShop(shop.id)}
                    className={`bg-gray-700/50 rounded-lg p-4 border transition-colors cursor-pointer ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-900/20 ring-2 ring-blue-500/50' 
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <div>
                      <div className={`font-medium mb-2 ${isSelected ? 'text-blue-300' : 'text-white'}`}>
                        {shop.shop_name}
                        {isSelected && (
                          <span className="ml-2 text-xs text-blue-400">✓ 선택됨</span>
                        )}
                      </div>
                      {shop.start_date || shop.end_date ? (
                        <div className="text-sm text-gray-400">
                          {shop.start_date && shop.end_date 
                            ? `${shop.start_date} ~ ${shop.end_date}`
                            : shop.start_date || shop.end_date}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 요약 카드 */}
        {tabs.length > 0 && tabs.some(tab => tab.items.length > 0) && (
          <div className="p-4 mb-4 text-xs md:text-base bg-gray-800/50 rounded-lg border border-gray-700 md:p-6 md:mb-6">
            <h2 className="hidden md:block text-2xl font-semibold mb-6">요약</h2>
            {(() => {
              // 총 주수 계산 (종료일 - 시작일 / 7, 소수점 반올림)
              let totalWeeks = 0;
              if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  const diffTime = end.getTime() - start.getTime();
                  const diffDays = diffTime / (1000 * 60 * 60 * 24);
                  totalWeeks = Math.round(diffDays / 7);
                }
              }

              // 주간 교환에 필요한 최대 수량 (교환 주기가 '주간 원정대 제한'인 항목들)
              const weeklyTotal = allItemsDetails
                .filter(item => item.exchangeCycle === '주간 원정대 제한')
                .reduce((sum, item) => {
                  const exchangeCost = item.exchangeCost || 0;
                  const exchangeCount = item.exchangeCount || 0;
                  return sum + (exchangeCost * exchangeCount);
                }, 0);

              // 원정대 제한 항목들의 합계 (교환 주기가 '원정대 제한'인 항목들)
              const expeditionTotal = allItemsDetails
                .filter(item => item.exchangeCycle === '원정대 제한')
                .reduce((sum, item) => {
                  const exchangeCost = item.exchangeCost || 0;
                  const exchangeCount = item.exchangeCount || 0;
                  return sum + (exchangeCost * exchangeCount);
                }, 0);

              // 모든 항목 교환에 필요한 최대 수량
              const totalRequired = (weeklyTotal * totalWeeks) + expeditionTotal;

              return (
                <div className="mb-4">
                  <div className="py-3 md:bg-gray-700/50 md:rounded-lg md:p-4 md:border md:border-gray-600">
                    <div className="space-y-2 text-sm text-gray-300">
                      {totalWeeks > 0 && (
                        <div>총 주수 = {totalWeeks}주</div>
                      )}
                      {weeklyTotal > 0 && (
                        <div>주간 교환에 필요한 최대 수량 = {formatNumberWithSignificantDigits(weeklyTotal)}개 / 주</div>
                      )}
                      {totalRequired > 0 && (
                        <div>
                          <span className="md:inline">모든 항목 교환에 필요한 최대 수량</span>
                          <br className="md:hidden" />
                          <span className="md:inline"> = {formatNumberWithSignificantDigits(weeklyTotal)}개 × {totalWeeks}주 + {formatNumberWithSignificantDigits(expeditionTotal)}개 = {formatNumberWithSignificantDigits(totalRequired)}개</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="space-y-4 md:space-y-6">
              {tabs.map((tab) => {
                const tabItems = allItemsDetails.filter(item => item.tabId === tab.id);
                if (tabItems.length === 0) return null;
                
                return (
                  <div key={tab.id} className="py-3 border-b border-gray-700/50 last:border-b-0 md:py-0 md:border-b-0 md:bg-gray-700/50 md:rounded-lg md:p-4 md:border md:border-gray-600">
                    <div className="mb-3">
                      <h3 className="text-lg font-medium text-white mb-2">{tab.name || '(탭 이름 없음)'}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        {tab.coinName && (
                          <span>주화: <span className="text-blue-300">{tab.coinName}</span></span>
                        )}
                        {tab.coinMultiplier && tab.coinMultiplier > 0 && (
                          <span>배율: <span className="text-purple-300">{tab.coinMultiplier}</span></span>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      {/* 모바일: 카드형 리스트 (묶음명×수량 단일행, 아래에 가치/비용/100당가치, 클릭 시 구성요소 툴팁) */}
                      <div className="md:hidden space-y-2 text-xs">
                        {tabItems.map((item, index) => {
                          const summaryKey = `${tab.id}-${item.itemIndex}`;
                          const bundleItem = tab.items[item.itemIndex];
                          const hasComponents = bundleItem && bundleItem.components && bundleItem.components.length > 0;
                          const showTooltip = summaryComponentTooltipKey === summaryKey;
                          return (
                            <div
                              key={index}
                              className={`border-b border-gray-600/50 pb-2 ${hasComponents ? 'cursor-pointer' : ''}`}
                              onClick={() => hasComponents && setSummaryComponentTooltipKey(showTooltip ? null : summaryKey)}
                            >
                              <div className="text-gray-300 font-medium">
                                {item.itemName} × {item.quantity}
                                {item.rank && (
                                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500 text-yellow-900 text-[10px] font-bold">
                                    {item.rank}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-400">
                                <span className="text-yellow-300">가치 {formatNumberWithSignificantDigits(item.value)}골드</span>
                                <span className="text-blue-300">교환비용 {item.multiplier !== 1 ? `${formatNumberWithSignificantDigits(item.baseExchangeCost)}×${item.multiplier}=${formatNumberWithSignificantDigits(item.exchangeCost)}` : formatNumberWithSignificantDigits(item.exchangeCost)}</span>
                                <span className="text-green-300">100당 {item.exchangeCost > 0 ? formatNumberWithSignificantDigits(item.valuePerExchange) : '0'}골드</span>
                              </div>
                              {showTooltip && hasComponents && bundleItem && (
                                <div
                                  className="mt-2 p-2 bg-gray-800 rounded border border-gray-600 text-[11px] text-gray-300 space-y-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="font-semibold text-gray-400">구성 요소</div>
                                  {bundleItem.components.map((c, i) => (
                                    <div key={i}>
                                      {c.itemName === '__manual__' ? '(직접 입력)' : c.itemName === '__nested__' ? '(묶음 항목)' : c.itemName} × {c.quantity ?? 0}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* 데스크톱: 기존 테이블 */}
                      <table className="w-full border-collapse hidden md:table text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="text-left py-2 px-4 text-sm font-semibold text-gray-300">묶음 항목명 × 수량</th>
                            <th className="text-right py-2 px-4 text-sm font-semibold text-gray-300">가치</th>
                            <th className="text-right py-2 px-4 text-sm font-semibold text-gray-300">교환 비용</th>
                            <th className="text-right py-2 px-4 text-sm font-semibold text-gray-300">교환 비용 100당 가치</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabItems.map((item, index) => {
                            const summaryKey = `${tab.id}-${item.itemIndex}`;
                            const isExpanded = expandedSummaryItems[summaryKey];
                            const bundleItem = tab.items[item.itemIndex];
                            const hasComponents = bundleItem && bundleItem.components && bundleItem.components.length > 0;
                            
                            return (
                              <>
                                <tr 
                                  key={index} 
                                  className={`border-b border-gray-600/50 hover:bg-gray-800/30 ${hasComponents ? 'cursor-pointer' : ''}`}
                                  onClick={() => {
                                    if (hasComponents) {
                                      setExpandedSummaryItems(prev => ({
                                        ...prev,
                                        [summaryKey]: !prev[summaryKey]
                                      }));
                                    }
                                  }}
                                >
                                  <td className="py-2 px-4 text-sm text-gray-300">
                                    <div className="flex items-center gap-2">
                                      {hasComponents && (
                                        <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                          &gt;
                                        </span>
                                      )}
                                      <span>{item.itemName} × {item.quantity}</span>
                                      {item.rank && (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-yellow-900 text-xs font-bold">
                                          {item.rank}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-sm text-right text-yellow-300">
                                    {formatNumberWithSignificantDigits(item.value)} 골드
                                  </td>
                                  <td className="py-2 px-4 text-sm text-right text-blue-300">
                                    {item.multiplier !== 1 ? (
                                      <span>
                                        <span className="text-gray-400">{formatNumberWithSignificantDigits(item.baseExchangeCost)}</span> × {item.multiplier} = {formatNumberWithSignificantDigits(item.exchangeCost)}
                                      </span>
                                    ) : (
                                      formatNumberWithSignificantDigits(item.exchangeCost)
                                    )}
                                  </td>
                                  <td className="py-2 px-4 text-sm text-right text-green-300">
                                    {item.exchangeCost > 0 ? formatNumberWithSignificantDigits(item.valuePerExchange) : '0'} 골드
                                  </td>
                                </tr>
                                {isExpanded && hasComponents && bundleItem && (
                                  <tr key={`${index}-components`} className="border-b border-gray-600/50">
                                    <td colSpan={4} className="py-2 px-4">
                                      <div className="pl-6 space-y-2 bg-gray-800/30 rounded p-3">
                                        <div className="text-xs font-semibold text-gray-400 mb-2">구성 요소:</div>
                                        {bundleItem.components.map((component, compIndex) => {
                                          const isManual = component.itemName === '__manual__' || component.itemName === '';
                                          const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                                          const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined)
                                            ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                                            : resolved;
                                          
                                          let componentValue = 0;
                                          if (finalUnitPrice) {
                                            if (finalUnitPrice.unitType === '골드') {
                                              componentValue = finalUnitPrice.unitPrice * (component.quantity || 0);
                                            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                              componentValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
                                            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                              componentValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
                                            }
                                          }
                                          
                                          const itemQuantity = bundleItem.quantity || 1;
                                          let isSelected = false;
                                          if (bundleItem.itemType === '확정') {
                                            componentValue *= itemQuantity;
                                            isSelected = true;
                                          } else if (bundleItem.itemType === '확률') {
                                            const probability = component.probability || 0;
                                            componentValue = componentValue * probability * itemQuantity;
                                            isSelected = true;
                                          } else if (bundleItem.itemType === '선택') {
                                            isSelected = component.selected || false;
                                            if (isSelected) {
                                              componentValue *= itemQuantity;
                                            } else {
                                              const baseComponentValue = componentValue;
                                              componentValue = baseComponentValue * itemQuantity;
                                            }
                                          }
                                          
                                          return (
                                            <div 
                                              key={compIndex} 
                                              className={`text-xs flex items-center gap-2 ${bundleItem.itemType === '선택' && !isSelected ? 'opacity-50 text-gray-400' : 'text-gray-300'}`}
                                              onClick={(e) => {
                                                if (bundleItem.itemType === '선택') {
                                                  e.stopPropagation();
                                                  updateComponent(tab.id, item.itemIndex, compIndex, 'selected', true);
                                                }
                                              }}
                                            >
                                              {bundleItem.itemType === '선택' ? (
                                                <input
                                                  type="radio"
                                                  name={`summary-${tab.id}-${item.itemIndex}-selection`}
                                                  checked={isSelected}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateComponent(tab.id, item.itemIndex, compIndex, 'selected', true);
                                                  }}
                                                  className="cursor-pointer"
                                                />
                                              ) : (
                                                <span className="text-gray-500">•</span>
                                              )}
                                              <span>{component.itemName === '__manual__' ? '(직접 입력)' : component.itemName === '__nested__' ? '(묶음 항목)' : component.itemName}</span>
                                              <span className="text-gray-500">× {component.quantity || 0}</span>
                                              {finalUnitPrice && (
                                                <>
                                                  <span className="text-gray-500">=</span>
                                                  <span className={bundleItem.itemType === '선택' && !isSelected ? 'text-gray-500' : 'text-yellow-300'}>
                                                    {formatNumberWithSignificantDigits(componentValue)} 골드
                                                  </span>
                                                  {bundleItem.itemType === '선택' && !isSelected && (
                                                    <span className="text-xs text-gray-500 ml-1">(미선택)</span>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 기본정보 카드 */}
        {allowShopSave && (
        <div className="hidden md:block bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">기본정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">상점 이름</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="상점 이름을 입력하세요"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        )}

        {/* 탭 카드들 */}
        {allowShopSave && (
          <>
        <div className="hidden md:block space-y-6 mb-6">
          {tabs.map((tab) => (
            <div key={tab.id} className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4 gap-4">
                <input
                  type="text"
                  value={tab.name}
                  onChange={(e) => updateTabName(tab.id, e.target.value)}
                  className="flex-1 text-2xl font-semibold bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-white min-w-[200px]"
                  placeholder="탭 이름 입력"
                />
                <button
                  onClick={() => removeTab(tab.id)}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
                >
                  탭 삭제
                </button>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-300 whitespace-nowrap">주화 이름</label>
                  <input
                    type="text"
                    value={tab.coinName || ''}
                    onChange={(e) => updateTab(tab.id, 'coinName', e.target.value)}
                    className="w-40 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    placeholder="주화 이름"
                  />
                </div>
                <div className="flex items-center gap-2 relative">
                  <label className="text-sm font-medium text-gray-300 whitespace-nowrap">배율</label>
                  <input
                    type="number"
                    value={tab.coinMultiplier || ''}
                    onChange={(e) => updateTab(tab.id, 'coinMultiplier', parseFloat(e.target.value) || 0)}
                    className="w-32 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    placeholder="배율"
                    min="0"
                    step="0.1"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTooltip(showTooltip === tab.id ? null : tab.id);
                      }}
                      className="w-5 h-5 rounded-full bg-gray-600 text-white text-xs flex items-center justify-center hover:bg-gray-500 transition-colors"
                      title="도움말"
                    >
                      ?
                    </button>
                    {showTooltip === tab.id && (
                      <div 
                        className="absolute top-full right-0 mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 max-w-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-sm text-gray-300">기본 주화 n개로 상위 주화 교환 시, n값 입력</p>
                        <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {tab.items.map((item, index) => renderBundleItem(tab.id, item, index))}
                <button
                  onClick={() => addBundleItem(tab.id)}
                  className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  묶음 항목 추가
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 탭 추가 버튼 */}
        <button
          onClick={addTab}
          className="hidden md:block w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
        >
          탭 추가
        </button>
          </>
        )}
      </div>
    </div>
  );
}

