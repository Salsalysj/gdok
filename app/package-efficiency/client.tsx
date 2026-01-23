'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';
import { calculateOptimalStrategy } from '../refining-simulation/client';
import type { RefiningStage, MarketItemInfo } from '../refining-simulation/page';

type ComponentItem = {
  itemName: string;
  quantity: number;
  manualPrice?: number | null;
  manualUnitType?: '골드' | '크리스탈' | '현금' | null;
  probability?: number; // 확률 타입용
  selected?: boolean; // 선택 타입용
  nestedItem?: PackageItem; // 하위 묶음 항목
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
  category: '월간' | '주간' | '한정' | '패스';
  priceType: '현금' | '크리스탈' | '골드';
  price: number;
  packageType: '일반' | '3+1' | '3+보너스' | '보너스룸';
  is3Plus1: boolean; // 3+1 타입일 때 요약 화면에서 체크 여부
  is3PlusBonus: boolean; // 3+보너스 타입일 때 3+보너스 구성품 가치 합산 여부
  purchaseCount: number;
  endDate: string | null;
  items: PackageItem[];
  bonus3Items: PackageItem[]; // 3+보너스 타입일 때만 사용
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
  weaponStages,
  armorStages,
  weaponStagesSerka,
  armorStagesSerka,
  marketInfo,
  initialSavedPackages = [],
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
  initialSavedPackages?: Array<{ id: string; package_name: string; created_at: string; updated_at: string; package_data?: any }>;
}) {
  // 환경 정보를 API에서 받아와서 저장 기능 활성화 여부 결정
  const [allowPackageSave, setAllowPackageSave] = useState<boolean>(
    process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development'
  );
  
  useEffect(() => {
    // 클라이언트에서 환경 정보 확인
    if (typeof window !== 'undefined') {
      fetch('/api/env/check')
        .then(res => res.json())
        .then(data => {
          setAllowPackageSave(data.allowPackageSave ?? false);
        })
        .catch(() => {
          // API 호출 실패 시 기본값 유지
        });
    }
  }, []);
  
  const { adjustPrice, adjustRelicEngravingAverage } = usePriceAdjustment();
  const { adjustedEntries } = useValueDb();
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
  
  // 단가 직접 입력 필드의 임시 값 저장 (입력 중에는 문자열로 유지)
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  
  // 펼치기/접기 상태 관리 (묶음 항목별, 하위 묶음 항목별)
  // 기본적으로 접혀있도록 설정 (false가 기본값이므로 명시적으로 설정하지 않아도 됨)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [expandedNestedItems, setExpandedNestedItems] = useState<Record<string, boolean>>({});
  
  // 입력 폼 참조 (스크롤 이동용)
  const inputFormRef = useRef<HTMLDivElement>(null);

  // 레벨별 색상 팔레트
  // 레벨 0: 묶음 항목
  // 레벨 1: 구성요소, 하위묶음항목
  // 레벨 2: 하위구성요소
  const getLevelColors = (level: number) => {
    const colorPalette = [
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' }, // 레벨 0: 묶음 항목 (파란색)
      { bg: 'bg-blue-900/30', border: 'border-blue-500/30', text: 'text-blue-300', accent: 'blue' }, // 레벨 1: 구성요소, 하위묶음항목 (파란색)
      { bg: 'bg-gray-800/50', border: 'border-gray-700/50', text: 'text-gray-300', accent: 'gray' }, // 레벨 2: 하위구성요소 (회색)
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
  
  // 검색 가능한 드롭다운 컴포넌트
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
          className={`w-full ${sizeClasses} ${bgColor} text-white rounded-lg border focus:outline-none focus:border-purple-500 text-left flex items-center justify-between gap-2`}
        >
          <span className={`truncate ${value ? "" : "text-gray-500"}`}>{selectedLabel}</span>
          <svg className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  const [packageData, setPackageData] = useState<PackageData>({
    packageName: '',
    category: '월간',
    priceType: '골드',
    price: 0,
    packageType: '일반',
    is3Plus1: false,
    is3PlusBonus: false,
    purchaseCount: 1,
    endDate: null,
    items: [],
    bonus3Items: [],
    bonusRooms: [
      { roomName: '보너스룸1', items: [] },
      { roomName: '보너스룸2', items: [] },
      { roomName: '보너스룸3', items: [] },
    ],
  });

  // 저장된 패키지 관련 상태 (서버에서 전달받은 초기값 사용)
  const [savedPackages, setSavedPackages] = useState<Array<{ id: string; package_name: string; created_at: string; updated_at: string; package_data?: any }>>(initialSavedPackages);
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
    // 순환 돌파석 또는 실제가치 항목: 가치계산DB Context에서 계산된 값 사용 (이미 가격조정 적용됨)
    if (itemName === '순환 돌파석' || itemName.includes('(실제가치)')) {
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
      };

      // 지옥 보상 가격 조정 함수 (모든 아이템은 가치계산DB 우선 사용)
      const getAdjustedPrice = (itemName: string, originalPrice: number | null | undefined): number | null => {
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
      
      // 에브니 큐브 입장권 (지옥교환) 처리: 클라이언트에서 지옥 열쇠 가치 계산
      if (itemName.startsWith('에브니 큐브 입장권')) {
        const hellExchangeMatch = itemName.match(/에브니 큐브 입장권 \(([^)]+)\) \(지옥교환\)/);
        if (hellExchangeMatch) {
          const cubeStage = hellExchangeMatch[1]; // 1해금, 2해금, 3해금, 4해금
          let hellKeyValue: number | null = null;
          
          // 해금 단계에 따라 지옥 열쇠 가치 계산 (calculateHellStageExpectedValue 재사용)
          if ((cubeStage === '1해금' || cubeStage === '2해금') && hell1Stages) {
            const hell1_7Stage = hell1Stages.find(s => s.stage === '7단계');
            if (hell1_7Stage) {
              hellKeyValue = calculateHellStageExpectedValue(hell1_7Stage, false);
            }
          } else if (cubeStage === '3해금' && hell2Stages) {
            const hell2_7Stage = hell2Stages.find(s => s.stage === '7단계');
            if (hell2_7Stage) {
              hellKeyValue = calculateHellStageExpectedValue(hell2_7Stage, false);
            }
          } else if (cubeStage === '4해금' && hellStages) {
            const hell7Stage = hellStages.find(s => s.stage === '7단계');
            if (hell7Stage) {
              hellKeyValue = calculateHellStageExpectedValue(hell7Stage, false);
            }
          }
          
          if (hellKeyValue != null && hellKeyValue > 0) {
            return {
              unitType: '골드',
              unitPrice: hellKeyValue / 10,
            };
          }
          return null;
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

    // 가치계산DB에서 먼저 찾기 (우선순위 - 가격 조정이 이미 적용된 데이터)
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
      // 골드 단위인 경우 가격 조정 적용
      if (valueDbEntry.unitType === '골드') {
        // 유물 각인서 랜덤의 경우 특별 처리
        if (itemName === '유물 각인서 랜덤' || itemName === '유물 각인서 랜덤 주머니') {
          adjustedValue = adjustRelicEngravingAverage(adjustedValue) ?? adjustedValue;
        } else {
          adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
        }
      } else if (valueDbEntry.unitType === '현금') {
        // 현금 단위인 경우에도 가격 조정 적용 (카드경험치 미반영 등)
        adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
      } else if (valueDbEntry.unitType === '크리스탈') {
        // 크리스탈 단위인 경우에도 가격 조정 적용
        adjustedValue = adjustPrice(itemName, adjustedValue) ?? adjustedValue;
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

  // 드롭다운 옵션 목록 생성 (실제가치 항목 포함)
  const componentOptions = useMemo(() => {
    // 실제가치 항목들 필터링
    const realValueItems = adjustedEntries
      .filter(e => e.itemName.includes('(실제가치)'))
      .map(e => e.itemName);
    
    // 기본 옵션 + itemList + 실제가치 항목들
    return [
      { value: '', label: '아이템 선택' },
      { value: '__nested__', label: '묶음 항목 추가' },
      { value: '__manual__', label: '(직접 입력)' },
      ...itemList.map(item => ({ value: item, label: item })),
      ...realValueItems.map(item => ({ value: item, label: item }))
    ];
  }, [itemList, adjustedEntries]);

  // 드롭다운에 있는 항목 목록 (직접 입력 필드 표시 여부 확인용)
  const availableItemNames = useMemo(() => {
    return new Set([
      ...itemList,
      ...adjustedEntries
        .filter(e => e.itemName.includes('(실제가치)'))
        .map(e => e.itemName)
    ]);
  }, [itemList, adjustedEntries]);

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
    let itemsToCalculate: PackageItem[] = [];
    let bonus3ItemsToCalculate: PackageItem[] = [];
    if (packageData.packageType === '보너스룸') {
      itemsToCalculate = (packageData.bonusRooms || []).flatMap(room => room.items);
    } else if (packageData.packageType === '3+보너스') {
      // 3+보너스 타입: 일반 구성품과 3+보너스 구성품을 분리
      itemsToCalculate = [...packageData.items];
      if (packageData.is3PlusBonus) {
        bonus3ItemsToCalculate = [...packageData.bonus3Items];
      }
    } else {
      itemsToCalculate = packageData.items;
    }
    
    // 하위 묶음 항목의 가치를 재귀적으로 계산하는 함수 (하위묶음 1개당 단가 반환)
    const calculateNestedItemValue = (nestedItem: PackageItem, priceType: '현금' | '크리스탈' | '골드'): number => {
      let nestedValue = 0;
      nestedItem.components.forEach((nestedComp) => {
        // 중첩된 항목 내부에 또 중첩이 있는 경우 재귀 호출
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          // 중첩된 하위묶음 1개당 단가
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem, priceType);
          // 중첩된 하위묶음 가치 = 중첩된 하위묶음 1개당 단가 × 중첩된 하위묶음 수량
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

        if (priceType === '현금') {
          nestedCompValue = calculateItemPrice(
            nestedComp.itemName || '직접입력',
            nestedComp.quantity || 0,
            'cash',
            finalUnitPrice
          );
        } else if (priceType === '크리스탈') {
          nestedCompValue = calculateItemPrice(
            nestedComp.itemName || '직접입력',
            nestedComp.quantity || 0,
            'crystal',
            finalUnitPrice
          );
        } else if (priceType === '골드') {
          if (finalUnitPrice.unitType === '골드') {
            nestedCompValue = finalUnitPrice.unitPrice * (nestedComp.quantity || 0);
          } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
            nestedCompValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
          } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
            nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
          }
        }

        // 하위구성요소 가치는 1개 기준으로 계산 (하위묶음 수량은 곱하지 않음)
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

    itemsToCalculate.forEach((packageItem) => {
      packageItem.components.forEach((component) => {
        // 하위 묶음 항목 처리
        if (component.itemName === '__nested__' && component.nestedItem) {
          // 하위묶음 1개당 단가 = 하위구성요소 가치 총합
          const nestedItemUnitPrice = calculateNestedItemValue(component.nestedItem, packageData.priceType);
          // 하위묶음 가치 = 하위묶음 1개당 단가 × 하위묶음 수량
          const nestedItemQuantity = component.nestedItem.quantity || 1;
          const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
          
          const itemQuantity = packageItem.quantity || 1;
          
          if (packageItem.itemType === '확정') {
            total += nestedItemTotalValue * itemQuantity;
          } else if (packageItem.itemType === '확률') {
            const probability = component.probability || 0;
            total += nestedItemTotalValue * probability * itemQuantity;
          } else if (packageItem.itemType === '선택') {
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
    
    // 3+보너스 적용 시: 일반 구성품 x 3 + 3+보너스 구성품
    if (packageData.packageType === '3+보너스' && packageData.is3PlusBonus) {
      const normalItemsTotal = total; // 일반 구성품 합계
      total = 0; // 초기화
      
      // 3+보너스 구성품 계산
      bonus3ItemsToCalculate.forEach((packageItem) => {
        packageItem.components.forEach((component) => {
          // 하위 묶음 항목 처리
          if (component.itemName === '__nested__' && component.nestedItem) {
            const nestedItemUnitPrice = calculateNestedItemValue(component.nestedItem, packageData.priceType);
            const nestedItemQuantity = component.nestedItem.quantity || 1;
            const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
            const itemQuantity = packageItem.quantity || 1;
            
            if (packageItem.itemType === '확정') {
              total += nestedItemTotalValue * itemQuantity;
            } else if (packageItem.itemType === '확률') {
              const probability = component.probability || 0;
              total += nestedItemTotalValue * probability * itemQuantity;
            } else if (packageItem.itemType === '선택') {
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
          
          const itemQuantity = packageItem.quantity || 1;
          
          if (packageItem.itemType === '확정') {
            total += componentValue * itemQuantity;
          } else if (packageItem.itemType === '확률') {
            const probability = component.probability || 0;
            total += componentValue * probability * itemQuantity;
          } else if (packageItem.itemType === '선택') {
            if (component.selected) {
              total += componentValue * itemQuantity;
            }
          }
        });
      });
      
      // 일반 구성품 x 3 + 3+보너스 구성품
      total = normalItemsTotal * 3 + total;
    }
    
    return total;
  }, [packageData.items, packageData.bonus3Items, packageData.bonusRooms, packageData.packageType, packageData.is3PlusBonus, packageData.priceType, etcListData, crystalGoldRate, goldToCashPerGold, marketPriceMap, valueDbMap, resolveUnitPrice, calculateItemPrice]);

  // 효율 계산 (배수)
  const efficiency = useMemo(() => {
    if (packageData.price <= 0) return null;
    let effectivePrice = packageData.price;
    
    // 3+1 타입이고 3+1 적용 체크된 경우 (4개 구매 시 3개 가격으로 계산)
    if (packageData.packageType === '3+1' && packageData.is3Plus1) {
      effectivePrice = (packageData.price * 3) / 4;
    } else if (packageData.packageType === '3+보너스' && packageData.is3PlusBonus) {
      // 3+보너스 적용 시: 패키지 가격 x 3
      effectivePrice = packageData.price * 3;
    }
    
    return totalValue / effectivePrice;
  }, [totalValue, packageData.price, packageData.packageType, packageData.is3Plus1, packageData.is3PlusBonus]);

  // 보너스룸: 각 묶음 항목별 가치 계산
  const calculateItemValue = useCallback((packageItem: PackageItem, itemPriceType: '현금' | '크리스탈' | '골드' | '보너스'): number => {
    let itemValue = 0;
    
    // 하위 묶음 항목의 가치를 재귀적으로 계산하는 함수
    const calculateNestedItemValue = (nestedItem: PackageItem, priceType: '현금' | '크리스탈' | '골드'): number => {
      let nestedValue = 0;
      nestedItem.components.forEach((nestedComp) => {
        // 중첩된 항목 내부에 또 중첩이 있는 경우 재귀 호출
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          // 중첩된 하위묶음 1개당 단가
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem, priceType);
          // 중첩된 하위묶음 가치 = 중첩된 하위묶음 1개당 단가 × 중첩된 하위묶음 수량
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

        if (priceType === '현금') {
          nestedCompValue = calculateItemPrice(
            nestedComp.itemName || '직접입력',
            nestedComp.quantity || 0,
            'cash',
            finalUnitPrice
          );
        } else if (priceType === '크리스탈') {
          nestedCompValue = calculateItemPrice(
            nestedComp.itemName || '직접입력',
            nestedComp.quantity || 0,
            'crystal',
            finalUnitPrice
          );
        } else if (priceType === '골드') {
          if (finalUnitPrice.unitType === '골드') {
            nestedCompValue = finalUnitPrice.unitPrice * (nestedComp.quantity || 0);
          } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
            nestedCompValue = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
          } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
            nestedCompValue = (finalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
          }
        }

        const nestedItemQuantity = nestedItem.quantity || 1;
        
        if (nestedItem.itemType === '확정') {
          nestedValue += nestedCompValue * nestedItemQuantity;
        } else if (nestedItem.itemType === '확률') {
          const probability = nestedComp.probability || 0;
          nestedValue += nestedCompValue * probability * nestedItemQuantity;
        } else if (nestedItem.itemType === '선택') {
          if (nestedComp.selected) {
            nestedValue += nestedCompValue * nestedItemQuantity;
          }
        }
      });
      return nestedValue;
    };
    
    packageItem.components.forEach((component) => {
      // 중첩된 묶음 항목 처리
      if (component.itemName === '__nested__' && component.nestedItem) {
        // '보너스' 타입은 '골드'로 변환하여 처리
        const priceTypeForNested = itemPriceType === '보너스' ? '골드' : itemPriceType;
        const nestedValue = calculateNestedItemValue(component.nestedItem, priceTypeForNested);
        const itemQuantity = packageItem.quantity || 1;
        
        if (packageItem.itemType === '확정') {
          itemValue += nestedValue * (component.quantity || 1) * itemQuantity;
        } else if (packageItem.itemType === '확률') {
          const probability = component.probability || 0;
          itemValue += nestedValue * (component.quantity || 1) * probability * itemQuantity;
        } else if (packageItem.itemType === '선택') {
          if (component.selected) {
            itemValue += nestedValue * (component.quantity || 1) * itemQuantity;
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
    
    return packageData.bonusRooms.map((room, roomIndex) => {
      let roomValue = 0;
      let roomPrice = 0;
      const itemEfficiencies = room.items.map((item, itemIndex) => {
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
        
        // 구성요소 정보 수집 (가치 계산 내역용)
        const componentDetails = item.components.map((component) => {
          const isManual = component.itemName === '__manual__' || component.itemName === '';
          const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
          const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
            ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
            : resolved;
          
          let componentValueInGold = 0;
          if (finalUnitPrice) {
            if (itemPriceType === '골드') {
              if (finalUnitPrice.unitType === '골드') {
                componentValueInGold = finalUnitPrice.unitPrice * (component.quantity || 0);
              } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                componentValueInGold = ((finalUnitPrice.unitPrice * crystalGoldRate) / 100) * (component.quantity || 0);
              } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                componentValueInGold = (finalUnitPrice.unitPrice / goldToCashPerGold) * (component.quantity || 0);
              }
            } else if (itemPriceType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
              const crystalValue = calculateItemPrice(
                component.itemName || '직접입력',
                component.quantity || 0,
                'crystal',
                finalUnitPrice
              );
              componentValueInGold = (crystalValue * crystalGoldRate) / 100;
            } else if (itemPriceType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
              const cashValue = calculateItemPrice(
                component.itemName || '직접입력',
                component.quantity || 0,
                'cash',
                finalUnitPrice
              );
              componentValueInGold = cashValue / goldToCashPerGold;
            }
          }
          
          return {
            itemName: component.itemName || '직접입력',
            quantity: component.quantity || 0,
            unitPrice: finalUnitPrice?.unitPrice || 0,
            unitType: finalUnitPrice?.unitType || '골드',
            valueInGold: componentValueInGold,
            probability: component.probability,
            selected: component.selected,
          };
        });
        
        return {
          itemName: item.itemName || '미입력',
          itemType: item.itemType,
          value: convertedValue,
          price: convertedPrice,
          originalPrice: itemPrice, // 원래 가격 저장
          priceType: itemPriceType,
          efficiency,
          quantity: item.quantity || 1,
          components: componentDetails,
          roomIndex: roomIndex,
          itemIndex: itemIndex,
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
  }, [packageData.packageType, packageData.bonusRooms, calculateItemValue, crystalGoldRate, goldToCashPerGold, resolveUnitPrice, calculateItemPrice]);

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
      const oldComponent = newComponents[componentIndex];
      
      // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
      // 단, 직접 입력 모드(__manual__)에서 텍스트를 입력하는 경우는 제외
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

  // 3+보너스 구성품 관련 함수들
  const addBonus3Item = () => {
    setPackageData((prev) => ({
      ...prev,
      bonus3Items: [...prev.bonus3Items, { itemName: '', itemType: '확정', quantity: 1, components: [] }],
    }));
  };

  const updateBonus3Item = (index: number, field: keyof PackageItem, value: any) => {
    setPackageData((prev) => {
      const newItems = [...prev.bonus3Items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, bonus3Items: newItems };
    });
  };

  const removeBonus3Item = (index: number) => {
    setPackageData((prev) => ({
      ...prev,
      bonus3Items: prev.bonus3Items.filter((_, i) => i !== index),
    }));
  };

  const addBonus3Component = (itemIndex: number) => {
    setPackageData((prev) => {
      const newItems = [...prev.bonus3Items];
      const packageItem = newItems[itemIndex];
      
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
      
      if (isSelectionType && !isFirstComponent) {
        newItems[itemIndex].components = newItems[itemIndex].components.map((comp, idx) => {
          if (idx === newItems[itemIndex].components.length - 1) {
            return { ...comp, selected: true };
          }
          return { ...comp, selected: false };
        });
      }
      
      return { ...prev, bonus3Items: newItems };
    });
  };

  const updateBonus3Component = (itemIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setPackageData((prev) => {
      const newItems = [...prev.bonus3Items];
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
      return { ...prev, bonus3Items: newItems };
    });
  };

  const removeBonus3Component = (itemIndex: number, componentIndex: number) => {
    setPackageData((prev) => {
      const newItems = [...prev.bonus3Items];
      newItems[itemIndex] = {
        ...newItems[itemIndex],
        components: newItems[itemIndex].components.filter((_, i) => i !== componentIndex),
      };
      return { ...prev, bonus3Items: newItems };
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
      const oldComponent = newComponents[componentIndex];
      
      // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
      // 단, 직접 입력 모드(__manual__)에서 텍스트를 입력하는 경우는 제외
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
      is3PlusBonus: false,
      purchaseCount: 1,
      endDate: null,
      items: [],
      bonus3Items: [],
      bonusRooms: [
        { roomName: '보너스룸1', items: [] },
        { roomName: '보너스룸2', items: [] },
        { roomName: '보너스룸3', items: [] },
      ],
    });
    setSelectedPackageId(null);
    
    // 입력 폼으로 스크롤 이동
    setTimeout(() => {
      inputFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // 저장된 패키지 목록 업데이트 (페이지 로드 시 최신 데이터 가져오기)
  useEffect(() => {
    // 페이지 로드 시 항상 최신 데이터 가져오기 (배포 환경 캐싱 문제 해결)
    const fetchLatestPackages = async () => {
      try {
        const res = await fetch('/api/packages', {
          cache: 'no-store', // 캐시 사용 안 함
        });
        const data = await res.json();
        if (data.packages) {
          setSavedPackages(data.packages);
        }
      } catch (error) {
        console.error('패키지 목록 갱신 실패:', error);
      }
    };

    fetchLatestPackages();
  }, []);

  // 패키지 저장
  const handleSavePackage = async () => {
    if (!packageData.packageName.trim()) {
      alert('상품명을 입력해주세요.');
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
          // 3+보너스 구성품 데이터가 없으면 초기화
          if (!loadedData.bonus3Items) {
            loadedData.bonus3Items = [];
          }
          // is3PlusBonus가 없으면 초기화
          if (loadedData.is3PlusBonus === undefined) {
            loadedData.is3PlusBonus = false;
          }
          // 패스 구분일 경우 패키지 유형을 '일반'으로 강제 설정
          if (loadedData.category === '패스') {
            loadedData.packageType = '일반';
            loadedData.is3Plus1 = false;
            loadedData.is3PlusBonus = false;
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
          is3PlusBonus: false,
          purchaseCount: 1,
          endDate: null,
          items: [],
          bonus3Items: [],
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
    <div className="min-h-screen bg-gray-950 p-8">
      <div>
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">과금 효율 계산기</h1>
          </div>
          <p className="text-base text-gray-400">과금 상품을 스스로 계산해볼 수 있습니다.</p>
        </div>

        {/* 저장 모달 */}
        {showSaveModal && allowPackageSave && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-white mb-4">
                {selectedPackageId ? '패키지 업데이트' : '패키지 저장'}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">상품명</label>
                <input
                  type="text"
                  value={savePackageName}
                  onChange={(e) => setSavePackageName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="상품명 입력"
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

        {/* 패키지 선택 버튼들 */}
        <div className="mb-6">
          {/* 새로 만들기 버튼 (왼쪽 상단) */}
          <div className="mb-3">
            <button
              onClick={handleNewPackage}
              className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold border border-green-500/50"
              disabled={isLoading}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                새로 만들기
              </span>
            </button>
          </div>
          
          {/* 판매중인 패키지 버튼들 (기간제한, 상시, 패스로 구분) */}
          {savedPackages.filter((pkg) => {
            const pkgData = (pkg as any).package_data;
            // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
            const endDate = (pkg as any).end_date || pkgData?.endDate;
            if (!endDate) return true;
            const end = new Date(endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            return end >= today;
          }).length > 0 && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-white">현재 판매중</h3>
                <p className="text-xs text-gray-400 mt-1">버튼 클릭 시 확인 가능</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {/* 기간제한 패키지 */}
                <div>
                  <div className="text-sm text-gray-400 font-medium mb-2">기간제한</div>
                  <div className="flex flex-wrap gap-2">
                    {savedPackages
                      .filter((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        const category = pkgData?.category;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        // 종료 예정일이 없으면 상시로 분류되므로 제외
                        if (!endDate) return false;
                        // 종료 예정일이 있고 구분이 패스면 패스로 분류되므로 제외
                        if (category === '패스') return false;
                        // 나머지 (종료 예정일이 있고 패스가 아닌 경우) -> 기간제한
                        const end = new Date(endDate);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        end.setHours(0, 0, 0, 0);
                        return end >= today;
                      })
                      .map((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        const isSelected = selectedPackageId === pkg.id;
                        
                        return (
                          <button
                            key={pkg.id}
                            onClick={() => handleLoadPackage(pkg.id)}
                            className={`group relative px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 text-xs ${
                              isSelected
                                ? 'bg-purple-600 text-white border border-purple-500'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                            }`}
                            disabled={isLoading}
                          >
                            <span className="flex items-center gap-1">
                              {isSelected && (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              {pkg.package_name}
                              {endDate && (
                                <span className="text-[10px] opacity-90 font-normal">
                                  ({endDate})
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
                
                {/* 상시 패키지 */}
                <div>
                  <div className="text-sm text-gray-400 font-medium mb-2">상시</div>
                  <div className="flex flex-wrap gap-2">
                    {savedPackages
                      .filter((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        // 종료 예정일 값이 없는 경우 -> 상시
                        if (!endDate) return true;
                        // 종료 예정일이 있으면 다른 카테고리로 분류되므로 제외
                        return false;
                      })
                      .map((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        const isSelected = selectedPackageId === pkg.id;
                        
                        return (
                          <button
                            key={pkg.id}
                            onClick={() => handleLoadPackage(pkg.id)}
                            className={`group relative px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 text-xs ${
                              isSelected
                                ? 'bg-purple-600 text-white border border-purple-500'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                            }`}
                            disabled={isLoading}
                          >
                            <span className="flex items-center gap-1">
                              {isSelected && (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              {pkg.package_name}
                              {endDate && (
                                <span className="text-[10px] opacity-90 font-normal">
                                  ({endDate})
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
                
                {/* 패스 패키지 */}
                <div>
                  <div className="text-sm text-gray-400 font-medium mb-2">패스</div>
                  <div className="flex flex-wrap gap-2">
                    {savedPackages
                      .filter((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        const category = pkgData?.category;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        // 종료 예정일 값이 있고, 구분이 '패스'인 경우 -> 패스
                        if (!endDate) return false;
                        if (category !== '패스') return false;
                        const end = new Date(endDate);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        end.setHours(0, 0, 0, 0);
                        return end >= today;
                      })
                      .map((pkg) => {
                        const pkgData = (pkg as any).package_data;
                        // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                        const endDate = (pkg as any).end_date || pkgData?.endDate;
                        const isSelected = selectedPackageId === pkg.id;
                        
                        return (
                          <button
                            key={pkg.id}
                            onClick={() => handleLoadPackage(pkg.id)}
                            className={`group relative px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 text-xs ${
                              isSelected
                                ? 'bg-purple-600 text-white border border-purple-500'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                            }`}
                            disabled={isLoading}
                          >
                            <span className="flex items-center gap-1">
                              {isSelected && (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              {pkg.package_name}
                              {endDate && (
                                <span className="text-[10px] opacity-90 font-normal">
                                  ({endDate})
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* 이전 과금 상품 드롭다운 */}
          {savedPackages.filter((pkg) => {
            const pkgData = (pkg as any).package_data;
            // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
            const endDate = (pkg as any).end_date || pkgData?.endDate;
            if (!endDate) return false;
            const end = new Date(endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            return end < today;
          }).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400 whitespace-nowrap">이전 과금 상품:</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleLoadPackage(e.target.value);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                  disabled={isLoading}
                >
                  <option value="">이전 과금 상품 선택...</option>
                  {savedPackages
                    .filter((pkg) => {
                      const pkgData = (pkg as any).package_data;
                      // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                      const endDate = (pkg as any).end_date || pkgData?.endDate;
                      if (!endDate) return false;
                      const end = new Date(endDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      end.setHours(0, 0, 0, 0);
                      return end < today;
                    })
                    .map((pkg) => {
                      const pkgData = (pkg as any).package_data;
                      // Supabase의 end_date 컬럼이 있으면 우선 사용, 없으면 package_data.endDate 사용
                      const endDate = (pkg as any).end_date || pkgData?.endDate;
                      
                      return (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.package_name} (종료일: {endDate}) [판매종료]
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>
          )}
        </div>
        {/* 계산 결과 */}
        <div className="space-y-6">             
          {/* 패키지 개요 카드 */}
          <div className="relative bg-gray-800/90 rounded-lg border border-gray-700 p-8">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">상품 정보</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <div className="text-xs font-medium text-purple-400/80 uppercase tracking-wider">상품명</div>
                  </div>
                  <div className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                    {packageData.packageName || '(미입력)'}
                    {packageData.endDate && (() => {
                      const endDate = new Date(packageData.endDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      endDate.setHours(0, 0, 0, 0);
                      if (endDate < today) {
                        return (
                          <span className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-full">
                            판매종료
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs font-medium text-blue-400/80 uppercase tracking-wider">패키지 가격</div>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {formatNumberWithSignificantDigits(packageData.price)} {packageData.priceType}
                  </div>
                  {packageData.packageType === '3+1' && packageData.is3Plus1 && (
                    <div className="text-xs text-blue-400/70 mt-1">
                      3+1: {formatNumberWithSignificantDigits((packageData.price * 3) / 4)} {packageData.priceType}
                    </div>
                  )}
                  <div className="mt-2 inline-block px-2 py-1 bg-gray-800/50 rounded text-xs text-gray-400">
                    {packageData.packageType}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <div className="text-xs font-medium text-green-400/80 uppercase tracking-wider">구매 가능</div>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {packageData.purchaseCount}<span className="text-base text-gray-400 ml-1">회</span>
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div className="text-xs font-medium text-yellow-400/80 uppercase tracking-wider">종료 예정일</div>
                  </div>
                  <div className="text-base font-medium text-white">
                    {packageData.endDate || (
                      <span className="text-gray-500">미정</span>
                    )}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <div className="text-xs font-medium text-cyan-400/80 uppercase tracking-wider">구분</div>
                  </div>
                  <div className="text-base font-medium text-white">
                    {packageData.category}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 합산 효율 카드 */}
          {packageData.packageType === '보너스룸' ? (
            <div className="relative bg-gray-800/90 rounded-lg border border-gray-700 p-8">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white">보너스룸 효율</h3>
                </div>
              <div className="space-y-6">
                {bonusRoomEfficiencies?.map((room, roomIndex) => (
                  <div key={roomIndex} className="bg-gray-900/70 rounded-lg border border-orange-500/20 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <h4 className="text-lg font-bold text-white">{room.roomName}</h4>
                    </div>
                    
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
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <div className="text-sm font-semibold text-gray-300">묶음 항목별 효율</div>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {room.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                          {/* 항목 헤더 */}
                          <div className="flex items-start justify-between mb-3 pb-2 border-b border-gray-700/50">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                <div className="text-sm text-white font-semibold">
                                  {item.itemName || `항목 ${itemIndex + 1}`}
                                </div>
                              </div>
                              <span className="text-xs font-medium text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">
                                {item.itemType}
                              </span>
                            </div>
                            {item.efficiency !== null ? (
                              <div className={`text-right ml-2 px-3 py-1 rounded-lg ${item.efficiency >= 1 ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                                <div className={`text-lg font-bold ${item.efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatNumberWithSignificantDigits(item.efficiency)}배
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 ml-2">계산 불가</div>
                            )}
                          </div>
                          
                          {/* 가격/가치 정보 */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="bg-gray-900/50 rounded-lg p-2">
                              <div className="text-xs text-gray-500 mb-1">가격</div>
                              <div className="text-sm font-semibold text-white">
                                {item.priceType === '보너스' ? (
                                  <span className="text-green-400">보너스(무료)</span>
                                ) : (
                                  <>
                                    {formatNumberWithSignificantDigits(item.originalPrice)} {item.priceType}
                                    {item.priceType !== '골드' && item.price > 0 && (
                                      <div className="text-xs text-gray-400 mt-0.5">
                                        = {formatNumberWithSignificantDigits(item.price)} 골드
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-2">
                              <div className="text-xs text-gray-500 mb-1">가치</div>
                              <div className="text-sm font-semibold text-blue-400">
                                {formatNumberWithSignificantDigits(item.value)} 골드
                              </div>
                            </div>
                          </div>
                          
                          {/* 가치 계산 내역 */}
                          {item.components && item.components.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-700/50">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <div className="text-xs font-medium text-gray-400">가치 계산 내역</div>
                              </div>
                              <div className="space-y-1.5">
                                {item.itemType === '선택' ? (
                                  // 선택 타입: 라디오 버튼으로 선택 변경 가능
                                  <div className="space-y-1">
                                    {item.components.map((comp, compIndex) => (
                                      <label key={compIndex} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${comp.selected ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-900/30 border border-gray-700/50'}`}>
                                        <input
                                          type="radio"
                                          name={`bonus-room-${roomIndex}-item-${itemIndex}-selection`}
                                          checked={comp.selected || false}
                                          onChange={() => {
                                            // 선택 변경
                                            setPackageData((prev) => {
                                              const newBonusRooms = [...(prev.bonusRooms || [])];
                                              const targetItem = newBonusRooms[roomIndex].items[itemIndex];
                                              const newComponents = targetItem.components.map((c, idx) => ({
                                                ...c,
                                                selected: idx === compIndex,
                                              }));
                                              newBonusRooms[roomIndex].items[itemIndex] = {
                                                ...targetItem,
                                                components: newComponents,
                                              };
                                              return { ...prev, bonusRooms: newBonusRooms };
                                            });
                                          }}
                                          className="w-4 h-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500"
                                        />
                                        <div className="flex-1">
                                          <div className={`text-xs font-medium mb-1 ${comp.selected ? 'text-yellow-300' : 'text-gray-300'}`}>
                                            {comp.selected && <span className="text-yellow-400 mr-1">✓</span>}
                                            {comp.itemName}
                                          </div>
                                          <div className="text-xs text-gray-500 space-x-2">
                                            <span>수량: {formatNumberWithSignificantDigits(comp.quantity)}</span>
                                            {comp.unitPrice > 0 && (
                                              <span>• 단가: {formatNumberWithSignificantDigits(comp.unitPrice)} {comp.unitType}</span>
                                            )}
                                          </div>
                                          {comp.valueInGold > 0 && (
                                            <div className="text-xs text-blue-400 mt-1">
                                              = {formatNumberWithSignificantDigits(comp.valueInGold)} 골드
                                              {item.quantity > 1 && comp.selected && (
                                                <span className="text-gray-500"> × {item.quantity} = {formatNumberWithSignificantDigits(comp.valueInGold * item.quantity)} 골드</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                ) : item.itemType === '확률' ? (
                                  // 확률 타입: 확률과 기대값 표시
                                  item.components.map((comp, compIndex) => (
                                    <div key={compIndex} className="bg-gray-900/30 border border-gray-700/50 rounded-lg p-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="text-xs font-medium text-gray-300">{comp.itemName}</div>
                                        {comp.probability !== undefined && (
                                          <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                                            {(comp.probability * 100).toFixed(1)}%
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500 space-x-2">
                                        <span>수량: {formatNumberWithSignificantDigits(comp.quantity)}</span>
                                        {comp.unitPrice > 0 && (
                                          <span>• 단가: {formatNumberWithSignificantDigits(comp.unitPrice)} {comp.unitType}</span>
                                        )}
                                      </div>
                                      {comp.valueInGold > 0 && comp.probability !== undefined && (
                                        <div className="text-xs text-blue-400 mt-1">
                                          기대값: {formatNumberWithSignificantDigits(comp.valueInGold * (comp.probability || 0))} 골드
                                          {item.quantity > 1 && (
                                            <span className="text-gray-500"> × {item.quantity} = {formatNumberWithSignificantDigits(comp.valueInGold * (comp.probability || 0) * item.quantity)} 골드</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  // 확정 타입: 모든 구성요소 표시
                                  item.components.map((comp, compIndex) => (
                                    <div key={compIndex} className="bg-gray-900/30 border border-gray-700/50 rounded-lg p-2">
                                      <div className="text-xs font-medium text-gray-300 mb-1">{comp.itemName}</div>
                                      <div className="text-xs text-gray-500 space-x-2">
                                        <span>수량: {formatNumberWithSignificantDigits(comp.quantity)}</span>
                                        {comp.unitPrice > 0 && (
                                          <span>• 단가: {formatNumberWithSignificantDigits(comp.unitPrice)} {comp.unitType}</span>
                                        )}
                                      </div>
                                      {comp.valueInGold > 0 && (
                                        <div className="text-xs text-blue-400 mt-1">
                                          = {formatNumberWithSignificantDigits(comp.valueInGold)} 골드
                                          {item.quantity > 1 && (
                                            <span className="text-gray-500"> × {item.quantity} = {formatNumberWithSignificantDigits(comp.valueInGold * item.quantity)} 골드</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </div>
              
              {/* 저장 버튼 */}
              {allowPackageSave && (
                <div className="flex justify-center gap-3 mt-6">
                  <button
                    onClick={() => {
                      setSavePackageName(packageData.packageName);
                      setShowSaveModal(true);
                    }}
                    className="px-8 py-3 bg-purple-600 text-white text-lg font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    disabled={isLoading || !packageData.packageName.trim()}
                  >
                    {selectedPackageId ? '📝 패키지 업데이트' : '💾 패키지 저장'}
                  </button>
                  {selectedPackageId && (
                    <button
                      onClick={() => handleDeletePackage(selectedPackageId)}
                      className="px-8 py-3 bg-red-600 text-white text-lg font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      disabled={isLoading}
                    >
                      🗑️ 패키지 삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative bg-gray-800/90 rounded-lg border border-gray-700 p-8">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white">합산 효율</h3>
                </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs font-medium text-blue-400/80 uppercase tracking-wider">패키지 가격</div>
                  </div>
                  {(() => {
                    let effectivePrice = packageData.price;
                    if (packageData.packageType === '3+1' && packageData.is3Plus1) {
                      effectivePrice = (packageData.price * 3) / 4;
                    } else if (packageData.packageType === '3+보너스' && packageData.is3PlusBonus) {
                      effectivePrice = packageData.price * 3;
                    }
                    
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
                        {packageData.packageType === '3+보너스' && (
                          <label className="flex items-center gap-2 mt-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={packageData.is3PlusBonus}
                              onChange={(e) => setPackageData((prev) => ({ ...prev, is3PlusBonus: e.target.checked }))}
                              className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                            />
                            <span className="text-sm text-gray-300">3+보너스 적용</span>
                          </label>
                        )}
                        {packageData.packageType !== '3+1' && packageData.packageType !== '3+보너스' && (
                          <div className="text-xs text-gray-500 mt-3">
                            유형: {packageData.packageType}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <div className="text-xs font-medium text-purple-400/80 uppercase tracking-wider">구성품 합계</div>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {formatNumberWithSignificantDigits(totalValue)} {packageData.priceType}
                  </div>
                </div>
                <div className={`bg-gray-900/50 rounded-lg p-6 border ${efficiency !== null && efficiency >= 1 ? 'border-green-500/50' : efficiency !== null ? 'border-red-500/50' : 'border-gray-700/50'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg className={`w-4 h-4 ${efficiency !== null && efficiency >= 1 ? 'text-green-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <div className={`text-xs font-medium uppercase tracking-wider ${efficiency !== null && efficiency >= 1 ? 'text-green-400/80' : 'text-red-400/80'}`}>효율 (배수)</div>
                  </div>
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
              {allowPackageSave && (
                <div className="flex justify-center gap-3 mt-8">
                  <button
                    onClick={() => {
                      setSavePackageName(packageData.packageName);
                      setShowSaveModal(true);
                    }}
                    className="group relative px-10 py-4 bg-purple-600 text-white text-lg font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    disabled={isLoading || !packageData.packageName.trim()}
                  >
                    <span className="flex items-center gap-2">
                      {selectedPackageId ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          패키지 업데이트
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          패키지 저장
                        </>
                      )}
                    </span>
                  </button>
                  {selectedPackageId && (
                    <button
                      onClick={() => handleDeletePackage(selectedPackageId)}
                      className="group relative px-10 py-4 bg-red-600 text-white text-lg font-bold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      disabled={isLoading}
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        패키지 삭제
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
            </div>
          )}

          {/* 구성품 내용 카드 */}
          {packageData.packageType !== '보너스룸' && (packageData.items.length > 0 || (packageData.packageType === '3+보너스' && packageData.bonus3Items.length > 0)) && (
            <div className="relative bg-gray-800/90 rounded-lg border border-gray-700 p-8">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white">구성품 내용</h3>
                </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {packageData.items.map((packageItem, itemIndex) => {
                  const typeColors = {
                    '확정': { border: 'border-blue-500/30', bg: 'bg-blue-500/5', icon: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
                    '확률': { border: 'border-purple-500/30', bg: 'bg-purple-500/5', icon: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400' },
                    '선택': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
                  };
                  const colors = typeColors[packageItem.itemType as keyof typeof typeColors] || typeColors['확정'];
                  
                  return (
                  <div key={itemIndex} className={`relative bg-gray-900/70 rounded-lg p-5 border ${colors.border} ${colors.bg}`}>
                    {/* 타입 배지 */}
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                        {packageItem.itemType}
                      </span>
                    </div>
                    
                    <div className="mb-3 pr-16">
                      <div className="flex items-center gap-2 mb-1">
                        {packageData.category === '패스' && (
                          <span className="text-sm font-semibold text-purple-400 whitespace-nowrap">
                            패스 레벨 {itemIndex + 1}
                          </span>
                        )}
                        <svg className={`w-4 h-4 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <div className="font-bold text-white text-base">
                          {packageItem.itemName || `항목 ${itemIndex + 1}`}
                        </div>
                      </div>
                      {packageItem.quantity && packageItem.quantity > 1 && (
                        <div className="flex items-center gap-1 text-xs text-blue-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          묶음 ×{packageItem.quantity}
                        </div>
                      )}
                      {/* 묶음 항목 전체 가치 표시 (수량 1 이상) */}
                      {packageItem.quantity && packageItem.quantity >= 1 && (() => {
                        // 묶음 항목의 전체 가치 계산
                        let totalPackageItemValue = 0;
                        packageItem.components.forEach((comp) => {
                          // 하위묶음 항목 처리
                          if (comp.itemName === '__nested__' && comp.nestedItem) {
                            const nestedItem = comp.nestedItem;
                            let totalNestedValue = 0;
                            
                            // 하위구성요소 가치 총합 계산
                            nestedItem.components.forEach((nestedComp) => {
                              const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                              const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                              const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                : nestedResolved;
                              
                              if (nestedFinalUnitPrice) {
                                let nestedCompValue = 0;
                                if (packageData.priceType === '현금') {
                                  nestedCompValue = calculateItemPrice(
                                    nestedComp.itemName || '직접입력',
                                    nestedComp.quantity || 0,
                                    'cash',
                                    nestedFinalUnitPrice
                                  );
                                } else if (packageData.priceType === '크리스탈') {
                                  nestedCompValue = calculateItemPrice(
                                    nestedComp.itemName || '직접입력',
                                    nestedComp.quantity || 0,
                                    'crystal',
                                    nestedFinalUnitPrice
                                  );
                                } else if (packageData.priceType === '골드') {
                                  if (nestedFinalUnitPrice.unitType === '골드') {
                                    nestedCompValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                  } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                    nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                  } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                    nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                  }
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
                            
                            // 하위묶음 1개당 단가 × 하위묶음 수량 = 하위묶음 가치
                            const nestedItemUnitPrice = totalNestedValue;
                            const nestedItemQuantity = nestedItem.quantity || 1;
                            const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                            
                            // 묶음 1개당 단가 계산이므로 구성요소 수량은 곱하지 않음
                            const compValue = nestedItemTotalValue;
                            
                            if (packageItem.itemType === '확률') {
                              const probability = comp.probability || 0;
                              totalPackageItemValue += compValue * probability;
                            } else if (packageItem.itemType === '선택' && !comp.selected) {
                              // 선택되지 않은 항목은 0
                            } else {
                              totalPackageItemValue += compValue;
                            }
                          } else {
                            // 일반 구성요소 처리
                            const isCompManual = comp.itemName === '__manual__' || comp.itemName === '';
                            const compResolved = !isCompManual && comp.itemName ? resolveUnitPrice(comp.itemName) : null;
                            const compFinalUnitPrice = (comp.manualPrice !== null && comp.manualPrice !== undefined && comp.manualPrice > 0)
                              ? { unitType: (comp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: comp.manualPrice }
                              : compResolved;
                            
                            if (compFinalUnitPrice) {
                              let compValue = 0;
                              if (packageData.priceType === '현금') {
                                compValue = calculateItemPrice(
                                  comp.itemName || '직접입력',
                                  comp.quantity || 0,
                                  'cash',
                                  compFinalUnitPrice
                                );
                              } else if (packageData.priceType === '크리스탈') {
                                compValue = calculateItemPrice(
                                  comp.itemName || '직접입력',
                                  comp.quantity || 0,
                                  'crystal',
                                  compFinalUnitPrice
                                );
                              } else if (packageData.priceType === '골드') {
                                if (compFinalUnitPrice.unitType === '골드') {
                                  compValue = compFinalUnitPrice.unitPrice * (comp.quantity || 0);
                                } else if (compFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                  compValue = ((compFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (comp.quantity || 0);
                                } else if (compFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                  compValue = (compFinalUnitPrice.unitPrice / goldToCashPerGold) * (comp.quantity || 0);
                                }
                              }
                              
                              if (packageItem.itemType === '확률') {
                                const probability = comp.probability || 0;
                                compValue = compValue * probability;
                              } else if (packageItem.itemType === '선택' && !comp.selected) {
                                compValue = 0;
                              }
                              
                              totalPackageItemValue += compValue;
                            }
                          }
                        });
                        
                        const totalValue = totalPackageItemValue * packageItem.quantity;
                        
                        return totalValue > 0 ? (
                          <div className="mt-1 text-xs text-green-400 font-medium">
                            단가 {formatNumberWithSignificantDigits(totalPackageItemValue)} {packageData.priceType}
                            <span className="text-gray-500 mx-1">×</span>
                            수량 {packageItem.quantity || 1}
                            <span className="text-gray-500 mx-1">=</span>
                            가치 {formatNumberWithSignificantDigits(totalValue)} {packageData.priceType}
                            {packageItem.itemType === '확률' && <span className="text-gray-400 ml-1">(기대값)</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {/* 구성 요소 펼치기/접기 버튼 */}
                    {packageItem.components.length > 0 && (
                      <button
                        onClick={() => toggleItemExpanded(itemIndex)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
                      >
                        <span className="text-sm font-medium text-gray-300">
                          구성 요소 {packageItem.components.length}개
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
                        {packageItem.components.map((component, compIndex) => {
                        const isManual = component.itemName === '__manual__' || component.itemName === '';
                        const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                        const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                          ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                          : resolved;

                        // 단가 계산 (패키지 가격 타입에 맞춰 변환)
                        let unitPriceInPackageType = 0;
                        let unitPriceUnit = packageData.priceType;
                        
                        if (finalUnitPrice) {
                          if (packageData.priceType === '골드') {
                            if (finalUnitPrice.unitType === '골드') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                              unitPriceInPackageType = (finalUnitPrice.unitPrice * crystalGoldRate) / 100;
                            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                              unitPriceInPackageType = finalUnitPrice.unitPrice / goldToCashPerGold;
                            }
                          } else if (packageData.priceType === '크리스탈') {
                            if (finalUnitPrice.unitType === '크리스탈') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '골드' && crystalGoldRate && crystalGoldRate > 0) {
                              unitPriceInPackageType = (finalUnitPrice.unitPrice * 100) / crystalGoldRate;
                            } else if (finalUnitPrice.unitType === '현금') {
                              // 크리스탈 → 현금 변환은 복잡하므로 단가 직접 사용
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            }
                          } else if (packageData.priceType === '현금') {
                            if (finalUnitPrice.unitType === '현금') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '골드' && goldToCashPerGold && goldToCashPerGold > 0) {
                              unitPriceInPackageType = finalUnitPrice.unitPrice * goldToCashPerGold;
                            } else if (finalUnitPrice.unitType === '크리스탈') {
                              // 크리스탈 → 현금 변환은 복잡하므로 단가 직접 사용
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            }
                          }
                        }

                        // 구성요소 가치 계산 (1개 기준)
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
                          // 묶음 항목 수량은 곱하지 않음 (1개 기준으로 표시)
                        }
                        
                        // 전체 가치 계산 (묶음 항목 수량 곱한 값)
                        const itemQuantity = packageItem.quantity || 1;
                        const totalItemValue = itemValue * itemQuantity;

                        const isIncluded = packageItem.itemType === '확정' || 
                                         (packageItem.itemType === '확률') ||
                                         (packageItem.itemType === '선택' && component.selected);

                        const level0Colors = getLevelColors(0);
                        return (
                          <div key={compIndex} className={`${level0Colors.bg} rounded-lg p-3 border ${isIncluded ? level0Colors.border : 'border-gray-800'} ${!isIncluded && 'opacity-50'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {/* 선택 라디오 버튼 */}
                                {packageItem.itemType === '선택' && (
                                  <label className="flex items-center gap-2 mb-2 cursor-pointer group">
                                    <input
                                      type="radio"
                                      name={`selection-${itemIndex}`}
                                      checked={component.selected || false}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          updateComponent(itemIndex, compIndex, 'selected', true);
                                        }
                                      }}
                                      className="w-4 h-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500 focus:ring-2"
                                    />
                                    <span className={`text-xs font-semibold ${component.selected ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-400'}`}>
                                      {component.selected ? '✓ 선택됨' : '선택'}
                                    </span>
                                  </label>
                                )}
                                
                                {/* 아이템 정보 */}
                                {component.itemName === '__nested__' && component.nestedItem ? (
                                  // 하위 묶음 항목 표시
                                  <div className="space-y-2">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                      <span className={`text-sm font-medium ${isIncluded ? 'text-white' : 'text-gray-500 line-through'}`}>
                                        📦 {component.nestedItem.itemName || '하위 묶음 항목'}
                                      </span>
                                      {packageItem.itemType === '확률' && component.probability !== undefined && (
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
                                    {/* 하위 묶음 항목의 전체 가치 계산 */}
                                    {(() => {
                                      if (!component.nestedItem) return null;
                                      const nestedItem = component.nestedItem;
                                      let totalNestedValue = 0;
                                      nestedItem.components.forEach((nestedComp) => {
                                        const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                                        const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                                        const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                          ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                          : nestedResolved;
                                        
                                        if (nestedFinalUnitPrice) {
                                          let nestedCompValue = 0;
                                          if (packageData.priceType === '현금') {
                                            nestedCompValue = calculateItemPrice(
                                              nestedComp.itemName || '직접입력',
                                              nestedComp.quantity || 0,
                                              'cash',
                                              nestedFinalUnitPrice
                                            );
                                          } else if (packageData.priceType === '크리스탈') {
                                            nestedCompValue = calculateItemPrice(
                                              nestedComp.itemName || '직접입력',
                                              nestedComp.quantity || 0,
                                              'crystal',
                                              nestedFinalUnitPrice
                                            );
                                          } else if (packageData.priceType === '골드') {
                                            if (nestedFinalUnitPrice.unitType === '골드') {
                                              nestedCompValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                            } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                              nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                            } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                              nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                            }
                                          }
                                          
                                          if (nestedItem.itemType === '확률') {
                                            const nestedProbability = nestedComp.probability || 0;
                                            nestedCompValue = nestedCompValue * nestedProbability;
                                          } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                            nestedCompValue = 0;
                                          }
                                          
                                          // 하위구성요소 가치는 1개 기준으로 계산 (하위묶음 수량은 곱하지 않음)
                                          totalNestedValue += nestedCompValue;
                                        }
                                      });
                                      
                                      const nestedIsIncluded = nestedItem.itemType === '확정' || 
                                                               (nestedItem.itemType === '확률') ||
                                                               (nestedItem.itemType === '선택' && nestedItem.components.some(c => c.selected));
                                      
                                      // 하위묶음 1개당 단가 = 하위구성요소 가치 총합 (하위묶음의 확률은 이미 적용됨)
                                      const nestedItemUnitPrice = totalNestedValue;
                                      const nestedItemQuantity = component.nestedItem?.quantity || 1;
                                      
                                      // 상위 묶음 항목의 확률/선택 타입에 따라 가치 계산
                                      let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                                      if (packageItem.itemType === '확률') {
                                        // 상위 묶음 항목이 확률 타입이면 확률을 곱함
                                        const probability = component.probability ?? 0;
                                        nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
                                      } else if (packageItem.itemType === '선택' && !component.selected) {
                                        nestedItemTotalValue = 0;
                                      }
                                      
                                      // 단가 계산 (패키지 가격 타입에 맞춰 변환)
                                      let nestedUnitPriceInPackageType = 0;
                                      if (nestedItemUnitPrice > 0) {
                                        nestedUnitPriceInPackageType = nestedItemUnitPrice;
                                      }
                                      
                                      return nestedItemTotalValue > 0 && nestedIsIncluded ? (
                                        <div className="mt-1 space-y-1 text-xs">
                                          <div className={`${isIncluded ? 'text-gray-300' : 'text-gray-600'}`}>
                                            단가 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedUnitPriceInPackageType)}</span> {packageData.priceType}
                                            {packageItem.itemType === '확률' && component.probability !== undefined && (
                                              <span className="text-purple-400 ml-1">× {component.probability}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedItemQuantity)}</span>
                                            <span className="text-gray-500 mx-1">=</span>
                                            가치 <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                              {isIncluded ? formatNumberWithSignificantDigits(nestedItemTotalValue) : '0'} {packageData.priceType}
                                            </span>
                                          </div>
                                        </div>
                                      ) : null;
                                    })()}
                                    {/* 하위 묶음 항목의 구성요소 펼치기/접기 버튼 */}
                                    {component.nestedItem && component.nestedItem.components.length > 0 && (
                                      <button
                                        onClick={() => toggleNestedItemExpanded(itemIndex, compIndex)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-800/30 rounded border border-blue-500/30 hover:bg-gray-800/50 transition-colors mt-2 text-xs"
                                      >
                                        <span className="text-xs font-medium text-blue-300">
                                          하위 구성 요소 {component.nestedItem.components.length}개
                                        </span>
                                        <svg
                                          className={`w-3 h-3 text-blue-400 ${expandedNestedItems[`${itemIndex}-${compIndex}`] ? 'rotate-180' : ''}`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    )}
                                    {/* 하위 묶음 항목의 구성요소 표시 */}
                                    {component.nestedItem && component.nestedItem.components.length > 0 && expandedNestedItems[`${itemIndex}-${compIndex}`] && (() => {
                                      const nestedItem = component.nestedItem!;
                                      const level1Colors = getLevelColors(1);
                                      return (
                                        <div className="pl-4 border-l-2 border-blue-500/50 space-y-1.5 mt-2">
                                          {nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                            const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                                            const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                                            const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                              ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                              : nestedResolved;
                                            
                                            let nestedItemValue = 0;
                                            if (nestedFinalUnitPrice) {
                                              if (packageData.priceType === '현금') {
                                                nestedItemValue = calculateItemPrice(
                                                  nestedComp.itemName || '직접입력',
                                                  nestedComp.quantity || 0,
                                                  'cash',
                                                  nestedFinalUnitPrice
                                                );
                                              } else if (packageData.priceType === '크리스탈') {
                                                nestedItemValue = calculateItemPrice(
                                                  nestedComp.itemName || '직접입력',
                                                  nestedComp.quantity || 0,
                                                  'crystal',
                                                  nestedFinalUnitPrice
                                                );
                                              } else if (packageData.priceType === '골드') {
                                                if (nestedFinalUnitPrice.unitType === '골드') {
                                                  nestedItemValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                                } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                                  nestedItemValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                                } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                  nestedItemValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                                }
                                              }
                                              
                                              if (nestedItem.itemType === '확률') {
                                                const nestedProbability = nestedComp.probability || 0;
                                                nestedItemValue = nestedItemValue * nestedProbability;
                                              } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                                nestedItemValue = 0;
                                              }
                                              
                                              // 하위구성요소 가치는 1개 기준으로 계산 (하위묶음 수량은 곱하지 않음)
                                            }
                                            
                                            const nestedItemColors = getLevelColors(2); // 하위구성요소는 회색
                                            const nestedIsIncluded = nestedItem.itemType === '확정' || 
                                                                     (nestedItem.itemType === '확률') ||
                                                                     (nestedItem.itemType === '선택' && nestedComp.selected);
                                          return (
                                            <div key={nestedCompIndex} className={`${nestedItemColors.bg} rounded p-2 border ${nestedIsIncluded ? nestedItemColors.border : 'border-gray-800'} ${!nestedIsIncluded && 'opacity-50'}`}>
                                              {/* 선택 타입일 때 라디오 버튼 */}
                                              {nestedItem.itemType === '선택' && (
                                                <label className="flex items-center gap-1.5 mb-1 cursor-pointer group">
                                                  <input
                                                    type="radio"
                                                    name={`nested-selection-${itemIndex}-${compIndex}`}
                                                    checked={nestedComp.selected || false}
                                                    onChange={(e) => {
                                                      if (e.target.checked) {
                                                        const nestedComponents = nestedItem.components.map((c, idx) => ({
                                                          ...c,
                                                          selected: idx === nestedCompIndex,
                                                        }));
                                                        const updatedNestedItem = { ...nestedItem, components: nestedComponents };
                                                        updateComponent(itemIndex, compIndex, 'nestedItem', updatedNestedItem);
                                                      }
                                                    }}
                                                    className="w-3 h-3 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500 focus:ring-1"
                                                  />
                                                  <span className={`text-[10px] font-semibold ${nestedComp.selected ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-400'}`}>
                                                    {nestedComp.selected ? '✓ 선택됨' : '선택'}
                                                  </span>
                                                </label>
                                              )}
                                              <div className="flex items-baseline gap-2 flex-wrap">
                                                <span className={`${nestedIsIncluded ? 'text-gray-300' : 'text-gray-500 line-through'}`}>
                                                  • {nestedComp.itemName || '(직접 입력)'}
                                                </span>
                                                {nestedItem.itemType === '확률' && nestedComp.probability !== undefined && (
                                                  <span className="text-purple-400 text-[10px]">
                                                    [{(nestedComp.probability * 100).toFixed(1)}%]
                                                  </span>
                                                )}
                                                {nestedItem.itemType === '선택' && nestedComp.selected && (
                                                  <span className="text-yellow-400 text-[10px]">✓</span>
                                                )}
                                              </div>
                                              <div className="text-[10px] text-gray-500 ml-2">
                                                {(() => {
                                                  // 하위 구성요소 단가 계산
                                                  let nestedUnitPriceInPackageType = 0;
                                                  if (nestedFinalUnitPrice) {
                                                    if (packageData.priceType === '골드') {
                                                      if (nestedFinalUnitPrice.unitType === '골드') {
                                                        nestedUnitPriceInPackageType = nestedFinalUnitPrice.unitPrice;
                                                      } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                                        nestedUnitPriceInPackageType = (nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100;
                                                      } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                        nestedUnitPriceInPackageType = nestedFinalUnitPrice.unitPrice / goldToCashPerGold;
                                                      }
                                                    } else if (packageData.priceType === '크리스탈') {
                                                      if (nestedFinalUnitPrice.unitType === '크리스탈') {
                                                        nestedUnitPriceInPackageType = nestedFinalUnitPrice.unitPrice;
                                                      } else if (nestedFinalUnitPrice.unitType === '골드' && crystalGoldRate && crystalGoldRate > 0) {
                                                        nestedUnitPriceInPackageType = (nestedFinalUnitPrice.unitPrice * 100) / crystalGoldRate;
                                                      }
                                                    } else if (packageData.priceType === '현금') {
                                                      if (nestedFinalUnitPrice.unitType === '현금') {
                                                        nestedUnitPriceInPackageType = nestedFinalUnitPrice.unitPrice;
                                                      } else if (nestedFinalUnitPrice.unitType === '골드' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                        nestedUnitPriceInPackageType = nestedFinalUnitPrice.unitPrice * goldToCashPerGold;
                                                      }
                                                    }
                                                  }
                                                  
                                                  if (nestedFinalUnitPrice && nestedUnitPriceInPackageType > 0) {
                                                    // 하위구성요소 가치 계산 (1개 기준)
                                                    let nestedCompValue = 0;
                                                    if (packageData.priceType === '골드') {
                                                      if (nestedFinalUnitPrice.unitType === '골드') {
                                                        nestedCompValue = nestedUnitPriceInPackageType * (nestedComp.quantity || 0);
                                                      } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                                        nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                                      } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                                        nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                                      }
                                                    } else if (packageData.priceType === '크리스탈') {
                                                      nestedCompValue = calculateItemPrice(
                                                        nestedComp.itemName || '직접입력',
                                                        nestedComp.quantity || 0,
                                                        'crystal',
                                                        nestedFinalUnitPrice
                                                      );
                                                    } else if (packageData.priceType === '현금') {
                                                      nestedCompValue = calculateItemPrice(
                                                        nestedComp.itemName || '직접입력',
                                                        nestedComp.quantity || 0,
                                                        'cash',
                                                        nestedFinalUnitPrice
                                                      );
                                                    }
                                                    
                                                    if (nestedItem.itemType === '확률') {
                                                      const nestedProbability = nestedComp.probability || 0;
                                                      nestedCompValue = nestedCompValue * nestedProbability;
                                                    } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                                      nestedCompValue = 0;
                                                    }
                                                    
                                                    return (
                                                      <>
                                                        단가 {formatNumberWithSignificantDigits(nestedUnitPriceInPackageType)} {packageData.priceType}
                                                        {nestedItem.itemType === '확률' && nestedComp.probability !== undefined && (
                                                          <span className="text-purple-400 ml-0.5">× {nestedComp.probability}</span>
                                                        )}
                                                        <span className="text-gray-600 mx-0.5">×</span>
                                                        수량 {formatNumberWithSignificantDigits(nestedComp.quantity || 0)}
                                                        <span className="text-gray-600 mx-0.5">=</span>
                                                        가치 <span className={`${nestedIsIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                          {nestedIsIncluded ? formatNumberWithSignificantDigits(nestedCompValue) : '0'} {packageData.priceType}
                                                        </span>
                                                      </>
                                                    );
                                                  } else {
                                                    // nestedFinalUnitPrice가 없으면 가치 계산 불가
                                                    return (
                                                      <>
                                                        수량: {formatNumberWithSignificantDigits(nestedComp.quantity || 0)}
                                                      </>
                                                    );
                                                  }
                                                })()}
                                              </div>
                                            </div>
                                          );
                                        })}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  // 일반 구성요소 표시
                                  <>
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                      <span className={`text-sm font-medium ${isIncluded ? 'text-white' : 'text-gray-500 line-through'}`}>
                                        {component.itemName || '(직접 입력)'}
                                      </span>
                                      {packageItem.itemType === '확률' && component.probability !== undefined && (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                          </svg>
                                          {(component.probability * 100).toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    
                                {/* 수량 및 가치 */}
                                <div className="mt-1 space-y-1 text-xs">
                                  {finalUnitPrice && unitPriceInPackageType > 0 ? (
                                    <div className={`${isIncluded ? 'text-gray-300' : 'text-gray-600'}`}>
                                      단가 <span className="font-semibold">{formatNumberWithSignificantDigits(unitPriceInPackageType)}</span> {unitPriceUnit}
                                      {packageItem.itemType === '확률' && component.probability !== undefined && (
                                        <span className="text-purple-400 ml-1">× {component.probability}</span>
                                      )}
                                      <span className="text-gray-500 mx-1">×</span>
                                      수량 <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                      <span className="text-gray-500 mx-1">=</span>
                                      가치 <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                        {isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'} {packageData.priceType}
                                      </span>
                                      {packageItem.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                      {packageItem.quantity && packageItem.quantity > 1 && isIncluded && (
                                        <span className="text-gray-500 ml-1">(1개 기준)</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <span className={`${isIncluded ? 'text-gray-400' : 'text-gray-600'}`}>
                                        수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                      </span>
                                      {finalUnitPrice && (
                                        <span className={`${isIncluded ? 'text-blue-400' : 'text-gray-600'}`}>
                                          가치: <span className="font-semibold">{isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'}</span> {packageData.priceType}
                                          {packageItem.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                          {packageItem.quantity && packageItem.quantity > 1 && isIncluded && (
                                            <span className="text-gray-500 ml-1">(1개 기준)</span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                        {packageItem.components.length === 0 && (
                          <div className="text-sm text-gray-500 text-center py-4 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
                            구성 요소 없음
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
                {/* 3+보너스 구성품 표시 */}
                {packageData.packageType === '3+보너스' && packageData.bonus3Items.length > 0 && packageData.bonus3Items.map((packageItem, itemIndex) => {
                  const typeColors = {
                    '확정': { border: 'border-blue-500/30', bg: 'bg-blue-500/5', icon: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
                    '확률': { border: 'border-purple-500/30', bg: 'bg-purple-500/5', icon: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400' },
                    '선택': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
                  };
                  const colors = typeColors[packageItem.itemType as keyof typeof typeColors] || typeColors['확정'];
                  
                  return (
                  <div key={`bonus3-${itemIndex}`} className={`relative bg-gray-900/70 rounded-lg p-5 border ${colors.border} ${colors.bg}`}>
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                        {packageItem.itemType}
                      </span>
                    </div>
                    
                    <div className="mb-3 pr-16">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className={`w-4 h-4 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <div className="font-bold text-white text-base">
                          {packageItem.itemName || `3+보너스 항목 ${itemIndex + 1}`}
                        </div>
                      </div>
                      {packageItem.quantity && packageItem.quantity > 1 && (
                        <div className="flex items-center gap-1 text-xs text-blue-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          묶음 ×{packageItem.quantity}
                        </div>
                      )}
                      {/* 묶음 항목 전체 가치 표시 (수량 1 이상) */}
                      {packageItem.quantity && packageItem.quantity >= 1 && (() => {
                        // 묶음 항목의 전체 가치 계산
                        let totalPackageItemValue = 0;
                        packageItem.components.forEach((comp) => {
                          // 하위묶음 항목 처리
                          if (comp.itemName === '__nested__' && comp.nestedItem) {
                            const nestedItem = comp.nestedItem;
                            let totalNestedValue = 0;
                            
                            // 하위구성요소 가치 총합 계산
                            nestedItem.components.forEach((nestedComp) => {
                              const isNestedManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
                              const nestedResolved = !isNestedManual && nestedComp.itemName ? resolveUnitPrice(nestedComp.itemName) : null;
                              const nestedFinalUnitPrice = (nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0)
                                ? { unitType: (nestedComp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: nestedComp.manualPrice }
                                : nestedResolved;
                              
                              if (nestedFinalUnitPrice) {
                                let nestedCompValue = 0;
                                if (packageData.priceType === '현금') {
                                  nestedCompValue = calculateItemPrice(
                                    nestedComp.itemName || '직접입력',
                                    nestedComp.quantity || 0,
                                    'cash',
                                    nestedFinalUnitPrice
                                  );
                                } else if (packageData.priceType === '크리스탈') {
                                  nestedCompValue = calculateItemPrice(
                                    nestedComp.itemName || '직접입력',
                                    nestedComp.quantity || 0,
                                    'crystal',
                                    nestedFinalUnitPrice
                                  );
                                } else if (packageData.priceType === '골드') {
                                  if (nestedFinalUnitPrice.unitType === '골드') {
                                    nestedCompValue = nestedFinalUnitPrice.unitPrice * (nestedComp.quantity || 0);
                                  } else if (nestedFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                    nestedCompValue = ((nestedFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (nestedComp.quantity || 0);
                                  } else if (nestedFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                    nestedCompValue = (nestedFinalUnitPrice.unitPrice / goldToCashPerGold) * (nestedComp.quantity || 0);
                                  }
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
                            
                            // 하위묶음 1개당 단가 × 하위묶음 수량 = 하위묶음 가치
                            const nestedItemUnitPrice = totalNestedValue;
                            const nestedItemQuantity = nestedItem.quantity || 1;
                            const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                            
                            // 묶음 1개당 단가 계산이므로 구성요소 수량은 곱하지 않음
                            const compValue = nestedItemTotalValue;
                            
                            if (packageItem.itemType === '확률') {
                              const probability = comp.probability || 0;
                              totalPackageItemValue += compValue * probability;
                            } else if (packageItem.itemType === '선택' && !comp.selected) {
                              // 선택되지 않은 항목은 0
                            } else {
                              totalPackageItemValue += compValue;
                            }
                          } else {
                            // 일반 구성요소 처리
                            const isCompManual = comp.itemName === '__manual__' || comp.itemName === '';
                            const compResolved = !isCompManual && comp.itemName ? resolveUnitPrice(comp.itemName) : null;
                            const compFinalUnitPrice = (comp.manualPrice !== null && comp.manualPrice !== undefined && comp.manualPrice > 0)
                              ? { unitType: (comp.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: comp.manualPrice }
                              : compResolved;
                            
                            if (compFinalUnitPrice) {
                              let compValue = 0;
                              if (packageData.priceType === '현금') {
                                compValue = calculateItemPrice(
                                  comp.itemName || '직접입력',
                                  comp.quantity || 0,
                                  'cash',
                                  compFinalUnitPrice
                                );
                              } else if (packageData.priceType === '크리스탈') {
                                compValue = calculateItemPrice(
                                  comp.itemName || '직접입력',
                                  comp.quantity || 0,
                                  'crystal',
                                  compFinalUnitPrice
                                );
                              } else if (packageData.priceType === '골드') {
                                if (compFinalUnitPrice.unitType === '골드') {
                                  compValue = compFinalUnitPrice.unitPrice * (comp.quantity || 0);
                                } else if (compFinalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                  compValue = ((compFinalUnitPrice.unitPrice * crystalGoldRate) / 100) * (comp.quantity || 0);
                                } else if (compFinalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                  compValue = (compFinalUnitPrice.unitPrice / goldToCashPerGold) * (comp.quantity || 0);
                                }
                              }
                              
                              if (packageItem.itemType === '확률') {
                                const probability = comp.probability || 0;
                                compValue = compValue * probability;
                              } else if (packageItem.itemType === '선택' && !comp.selected) {
                                compValue = 0;
                              }
                              
                              totalPackageItemValue += compValue;
                            }
                          }
                        });
                        
                        const totalValue = totalPackageItemValue * packageItem.quantity;
                        
                        return totalValue > 0 ? (
                          <div className="mt-1 text-xs text-green-400 font-medium">
                            단가 {formatNumberWithSignificantDigits(totalPackageItemValue)} {packageData.priceType}
                            <span className="text-gray-500 mx-1">×</span>
                            수량 {packageItem.quantity || 1}
                            <span className="text-gray-500 mx-1">=</span>
                            가치 {formatNumberWithSignificantDigits(totalValue)} {packageData.priceType}
                            {packageItem.itemType === '확률' && <span className="text-gray-400 ml-1">(기대값)</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {/* 구성 요소 펼치기/접기 버튼 */}
                    {packageItem.components.length > 0 && (
                      <button
                        onClick={() => toggleItemExpanded(`bonus3-${itemIndex}`)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
                      >
                        <span className="text-sm font-medium text-gray-300">
                          구성 요소 {packageItem.components.length}개
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${expandedItems[`bonus3-${itemIndex}`] ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    {/* 구성 요소 */}
                    {expandedItems[`bonus3-${itemIndex}`] && packageItem.components.length > 0 && (
                      <div className="space-y-2">
                        {packageItem.components.map((component, compIndex) => {
                          const isManual = component.itemName === '__manual__' || component.itemName === '';
                          const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                          const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                            ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                            : resolved;

                          let unitPriceInPackageType = 0;
                          let unitPriceUnit = packageData.priceType;
                          
                          if (finalUnitPrice) {
                            if (packageData.priceType === '골드') {
                              if (finalUnitPrice.unitType === '골드') {
                                unitPriceInPackageType = finalUnitPrice.unitPrice;
                              } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                unitPriceInPackageType = (finalUnitPrice.unitPrice * crystalGoldRate) / 100;
                              } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                unitPriceInPackageType = finalUnitPrice.unitPrice / goldToCashPerGold;
                              }
                            } else if (packageData.priceType === '크리스탈') {
                              if (finalUnitPrice.unitType === '크리스탈') {
                                unitPriceInPackageType = finalUnitPrice.unitPrice;
                              } else if (finalUnitPrice.unitType === '골드' && crystalGoldRate && crystalGoldRate > 0) {
                                unitPriceInPackageType = (finalUnitPrice.unitPrice * 100) / crystalGoldRate;
                              } else if (finalUnitPrice.unitType === '현금') {
                                unitPriceInPackageType = finalUnitPrice.unitPrice;
                              }
                            } else if (packageData.priceType === '현금') {
                              if (finalUnitPrice.unitType === '현금') {
                                unitPriceInPackageType = finalUnitPrice.unitPrice;
                              } else if (finalUnitPrice.unitType === '골드' && goldToCashPerGold && goldToCashPerGold > 0) {
                                unitPriceInPackageType = finalUnitPrice.unitPrice * goldToCashPerGold;
                              } else if (finalUnitPrice.unitType === '크리스탈') {
                                unitPriceInPackageType = finalUnitPrice.unitPrice;
                              }
                            }
                          }

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
                            
                            if (packageItem.itemType === '확률') {
                              const probability = component.probability || 0;
                              itemValue = itemValue * probability;
                            } else if (packageItem.itemType === '선택' && !component.selected) {
                              itemValue = 0;
                            }
                          }
                          
                          const itemQuantity = packageItem.quantity || 1;
                          const totalItemValue = itemValue * itemQuantity;

                          const isIncluded = packageItem.itemType === '확정' || 
                                           (packageItem.itemType === '확률') ||
                                           (packageItem.itemType === '선택' && component.selected);

                          const level0Colors = getLevelColors(0);
                          return (
                            <div key={compIndex} className={`${level0Colors.bg} rounded-lg p-3 border ${isIncluded ? level0Colors.border : 'border-gray-800'} ${!isIncluded && 'opacity-50'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  {packageItem.itemType === '선택' && (
                                    <label className="flex items-center gap-2 mb-2 cursor-pointer group">
                                      <input
                                        type="radio"
                                        name={`bonus3-selection-${itemIndex}`}
                                        checked={component.selected || false}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            updateBonus3Component(itemIndex, compIndex, 'selected', true);
                                          }
                                        }}
                                        className="w-4 h-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500 focus:ring-2"
                                      />
                                      <span className={`text-xs font-semibold ${component.selected ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-400'}`}>
                                        {component.selected ? '✓ 선택됨' : '선택'}
                                      </span>
                                    </label>
                                  )}
                                  
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className={`text-sm font-medium ${isIncluded ? 'text-white' : 'text-gray-500 line-through'}`}>
                                      {component.itemName === '__manual__' || component.itemName === '' ? '직접 입력' : component.itemName}
                                    </span>
                                    {packageItem.itemType === '확률' && component.probability !== undefined && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {(component.probability * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                  
                                  {finalUnitPrice && unitPriceInPackageType > 0 ? (
                                    <div className="mt-1 text-xs text-gray-300">
                                      단가 <span className="font-semibold">{formatNumberWithSignificantDigits(unitPriceInPackageType)}</span> {unitPriceUnit}
                                      {packageItem.itemType === '확률' && component.probability !== undefined && (
                                        <span className="text-purple-400 ml-1">× {component.probability}</span>
                                      )}
                                      <span className="text-gray-500 mx-1">×</span>
                                      수량 <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                      <span className="text-gray-500 mx-1">=</span>
                                      가치 <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                        {isIncluded ? formatNumberWithSignificantDigits(itemValue) : '0'} {packageData.priceType}
                                      </span>
                                      {packageItem.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                      {packageItem.quantity && packageItem.quantity > 1 && isIncluded && (
                                        <span className="text-gray-500 ml-1">(1개 기준)</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-xs text-gray-300">
                                      수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                      {isIncluded && finalUnitPrice && (
                                        <span className="text-blue-400 ml-2">
                                          가치: <span className="font-semibold">{formatNumberWithSignificantDigits(itemValue)}</span> {packageData.priceType}
                                          {packageItem.itemType === '확률' && <span className="text-gray-500 ml-1">(기대값)</span>}
                                          {packageItem.quantity && packageItem.quantity > 1 && (
                                            <span className="text-gray-500 ml-1">(1개 기준)</span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {packageItem.components.length === 0 && (
                          <div className="text-sm text-gray-500 text-center py-4 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
                            구성 요소 없음
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}
        </div>
        {/* 입력 폼 */}
        <div ref={inputFormRef} className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">상품 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">상품명</label>
              <input
                type="text"
                value={packageData.packageName}
                onChange={(e) => setPackageData((prev) => ({ ...prev, packageName: e.target.value }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                placeholder="상품명 입력"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">구분</label>
              <select
                value={packageData.category}
                onChange={(e) => {
                  const newCategory = e.target.value as '월간' | '주간' | '한정' | '패스';
                  setPackageData((prev) => {
                    // 패스 선택 시 패키지 유형을 '일반'으로 고정
                    if (newCategory === '패스') {
                      return { ...prev, category: newCategory, packageType: '일반', is3Plus1: false, is3PlusBonus: false };
                    }
                    return { ...prev, category: newCategory };
                  });
                }}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
              >
                <option value="한정">한정</option>
                <option value="월간">월간</option>
                <option value="주간">주간</option>
                <option value="패스">패스</option>
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
              <label className="block text-sm font-medium text-gray-300 mb-2">상품 유형</label>
              <div className="flex gap-4">
                <label className={`flex items-center gap-2 ${packageData.category === '패스' ? 'cursor-default' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="packageType"
                    value="일반"
                    checked={packageData.packageType === '일반'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '일반', is3Plus1: false, is3PlusBonus: false }))}
                    disabled={packageData.category === '패스'}
                    className={`w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 ${packageData.category === '패스' ? 'cursor-not-allowed opacity-50' : ''}`}
                  />
                  <span className={`text-sm ${packageData.category === '패스' ? 'text-gray-300' : 'text-gray-300'}`}>일반</span>
                </label>
                <label className={`flex items-center gap-2 ${packageData.category === '패스' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="packageType"
                    value="3+1"
                    checked={packageData.packageType === '3+1'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '3+1', is3Plus1: true }))}
                    disabled={packageData.category === '패스'}
                    className={`w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 ${packageData.category === '패스' ? 'cursor-not-allowed opacity-50' : ''}`}
                  />
                  <span className={`text-sm ${packageData.category === '패스' ? 'text-gray-500' : 'text-gray-300'}`}>3+1</span>
                </label>
                <label className={`flex items-center gap-2 ${packageData.category === '패스' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="packageType"
                    value="3+보너스"
                    checked={packageData.packageType === '3+보너스'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '3+보너스', is3Plus1: false, is3PlusBonus: false }))}
                    disabled={packageData.category === '패스'}
                    className={`w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 ${packageData.category === '패스' ? 'cursor-not-allowed opacity-50' : ''}`}
                  />
                  <span className={`text-sm ${packageData.category === '패스' ? 'text-gray-500' : 'text-gray-300'}`}>3+보너스</span>
                </label>
                <label className={`flex items-center gap-2 ${packageData.category === '패스' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="packageType"
                    value="보너스룸"
                    checked={packageData.packageType === '보너스룸'}
                    onChange={(e) => setPackageData((prev) => ({ ...prev, packageType: '보너스룸', is3Plus1: false, is3PlusBonus: false }))}
                    disabled={packageData.category === '패스'}
                    className={`w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 ${packageData.category === '패스' ? 'cursor-not-allowed opacity-50' : ''}`}
                  />
                  <span className={`text-sm ${packageData.category === '패스' ? 'text-gray-500' : 'text-gray-300'}`}>보너스룸</span>
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
                                {/* 첫 번째 줄: 라디오 버튼 + 드롭다운 */}
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
                                  <SearchableSelect
                                    value={component.itemName}
                                    onChange={(value) => {
                                      if (value === '__nested__') {
                                        // 묶음 항목 추가 선택 시 하위 묶음 항목 생성
                                        updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'itemName', '__nested__');
                                        updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', {
                                          itemName: '',
                                          itemType: '확정',
                                          quantity: 1,
                                          components: [],
                                        });
                                      } else {
                                        updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'itemName', value);
                                        // 일반 아이템 선택 시 중첩 항목 제거
                                        if (value !== '__nested__') {
                                          updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', undefined);
                                        }
                                      }
                                    }}
                                    options={componentOptions}
                                    placeholder="아이템 선택"
                                    className="flex-1 min-w-0"
                                    size="small"
                                  />
                                </div>
                                
                                {/* 두 번째 줄: 묶음 항목 추가 선택 시 항목명과 타입 입력 필드 */}
                                  {component.itemName === '__nested__' && component.nestedItem && (
                                  <div className="flex gap-2 items-center">
                                      <input
                                        type="text"
                                        value={component.nestedItem.itemName}
                                        onChange={(e) => {
                                          const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                                          updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                        }}
                                        className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                        placeholder="묶음 항목명"
                                      />
                                      <select
                                        value={component.nestedItem.itemType}
                                        onChange={(e) => {
                                          const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                          updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                        }}
                                      className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                      >
                                        <option value="확정">확정</option>
                                        <option value="확률">확률</option>
                                        <option value="선택">선택</option>
                                      </select>
                                    </div>
                                  )}
                                
                                  {/* 직접 입력 선택 시 이름 입력 필드 */}
                                  {(component.itemName === '__manual__' || (component.itemName && component.itemName !== '__nested__' && !component.itemName.includes('(실제가치)') && !availableItemNames.has(component.itemName))) && (
                                  <div>
                                      <input
                                        type="text"
                                        value={component.itemName === '__manual__' ? '' : component.itemName}
                                        onChange={(e) => {
                                          // 직접 입력 모드에서는 itemName을 사용자가 입력한 값으로 설정
                                          // 빈 문자열이면 __manual__ 유지, 값이 있으면 입력한 값으로 설정
                                          const value = e.target.value || '__manual__';
                                          updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'itemName', value);
                                        }}
                                        className="w-full px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 text-xs"
                                        placeholder="아이템 이름을 입력하세요"
                                      />
                                    </div>
                                  )}
                                
                                {/* 세 번째 줄: 수량, 확률, 삭제 버튼 */}
                                <div className="flex gap-2 items-center flex-wrap">
                                  <input
                                    type="number"
                                    value={(component.itemName === '__nested__' && component.nestedItem) ? (component.nestedItem.quantity || '') : (component.quantity || '')}
                                    onChange={(e) => {
                                      const newQuantity = parseFloat(e.target.value) || 0;
                                      updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'quantity', newQuantity);
                                      // 하위 묶음 항목인 경우 nestedItem.quantity도 함께 업데이트
                                      if (component.itemName === '__nested__' && component.nestedItem) {
                                        const nestedItem = { ...component.nestedItem, quantity: newQuantity };
                                        updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                      }
                                    }}
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
                                
                                {/* 하위 묶음 항목의 구성요소 UI */}
                                {component.itemName === '__nested__' && component.nestedItem && component.nestedItem.itemName && (() => {
                                  const level1Colors = getLevelColors(1);
                                  return (
                                  <div className={`mt-2 pl-3 border-l-2 border-blue-500/50 ${level1Colors.bg} rounded p-2`}>
                                    {/* 하위 묶음 항목 구성요소 펼치기/접기 버튼 */}
                                    {component.nestedItem.components.length > 0 && (
                                      <button
                                        onClick={() => toggleNestedItemExpanded(itemIndex, compIndex)}
                                        className="w-full flex items-center justify-between px-2 py-1 bg-gray-700/30 rounded border border-blue-500/30 hover:bg-gray-700/50 transition-colors mb-2 text-xs"
                                      >
                                        <span className="text-[10px] font-medium text-blue-300">
                                          하위 구성 요소 {component.nestedItem.components.length}개
                                        </span>
                                        <svg
                                          className={`w-3 h-3 text-blue-400 ${expandedNestedItems[`${itemIndex}-${compIndex}`] ? 'rotate-180' : ''}`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    )}
                                    <div className="space-y-2">
                                      <div className="space-y-1">
                                        <button
                                          onClick={() => {
                                            const nestedItem = {
                                              ...component.nestedItem!,
                                              components: [
                                                ...component.nestedItem!.components,
                                                { itemName: '', quantity: 0, selected: component.nestedItem!.itemType === '선택' && component.nestedItem!.components.length === 0 },
                                              ],
                                            };
                                            updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                          }}
                                          className="w-full px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors text-xs"
                                        >
                                          구성요소 추가
                                        </button>
                                        {expandedNestedItems[`${itemIndex}-${compIndex}`] && component.nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                          const nestedItemColors = getLevelColors(2); // 하위구성요소는 회색
                                          return (
                                          <div key={nestedCompIndex} className={`${nestedItemColors.bg} rounded p-1.5 border ${nestedItemColors.border}`}>
                                            <div className="space-y-1">
                                              {/* 첫 번째 줄: 드롭다운 */}
                                            <div className="flex gap-1 items-center">
                                                <SearchableSelect
                                                value={
                                                  // 직접 입력 모드: itemName이 __manual__이거나 availableItemNames에 없으면 __manual__ 유지
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
                                                    // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
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
                                                    updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                  }}
                                                  options={componentOptions}
                                                  placeholder="아이템 선택"
                                                  className="flex-1"
                                                  size="small"
                                                />
                                              </div>
                                              
                                              {/* 직접 입력 필드 */}
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
                                                  updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                }}
                                                  className="w-full px-1 py-0.5 bg-gray-600 text-white rounded border border-gray-500 text-[10px]"
                                                  placeholder="아이템 이름 입력"
                                                />
                                              )}
                                              
                                              {/* 단가 직접 입력 필드 (직접 입력 선택 시) */}
                                              {(nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || 
                                                (nestedComp.itemName && nestedComp.itemName !== '__nested__' && 
                                                 !nestedComp.itemName.includes('(실제가치)') && 
                                                 !availableItemNames.has(nestedComp.itemName))) && (
                                                <div className="flex gap-1 items-center">
                                                  <select
                                                    value={nestedComp.manualUnitType || '골드'}
                                                    onChange={(e) => {
                                                      if (!component.nestedItem) return;
                                                      const nestedComponents = [...component.nestedItem.components];
                                                      nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], manualUnitType: e.target.value as '골드' | '크리스탈' | '현금' };
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                    }}
                                                    className="px-1 py-0.5 bg-gray-600 text-white rounded border border-gray-500 text-[10px]"
                                                  >
                                                    <option value="골드">골드</option>
                                                    <option value="크리스탈">크리스탈</option>
                                                    <option value="현금">현금</option>
                                                  </select>
                                                  <input
                                                    type="text"
                                                    value={manualPriceInputs[`bonus-${roomIndex}-${itemIndex}-${compIndex}-nested-${nestedCompIndex}`] ?? (nestedComp.manualPrice?.toString() ?? '')}
                                                    onChange={(e) => {
                                                      const key = `bonus-${roomIndex}-${itemIndex}-${compIndex}-nested-${nestedCompIndex}`;
                                                      setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                                                    }}
                                                    onBlur={(e) => {
                                                      if (!component.nestedItem) return;
                                                      const key = `bonus-${roomIndex}-${itemIndex}-${compIndex}-nested-${nestedCompIndex}`;
                                                      const value = e.target.value.trim();
                                                      const numValue = value === '' ? null : parseFloat(value);
                                                      const nestedComponents = [...component.nestedItem.components];
                                                      nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], manualPrice: numValue || null };
                                                      const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                      updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
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
                                                    className="flex-1 px-1 py-0.5 bg-gray-600 text-white rounded border border-gray-500 text-[10px]"
                                                    placeholder="단가 직접 입력"
                                                  />
                                                </div>
                                              )}
                                              
                                              {/* 두 번째 줄: 수량, 확률/선택, 삭제 */}
                                              <div className="flex gap-1 items-center">
                                              <input
                                                type="number"
                                                value={nestedComp.quantity || ''}
                                                onChange={(e) => {
                                                  if (!component.nestedItem) return;
                                                  const nestedComponents = [...component.nestedItem.components];
                                                  nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], quantity: parseFloat(e.target.value) || 0 };
                                                  const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                  updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                }}
                                                className="w-16 px-1 py-0.5 bg-gray-600 text-white rounded border border-gray-500 text-[10px]"
                                                placeholder="수량"
                                                min="0"
                                              />
                                              {component.nestedItem?.itemType === '선택' && (
                                                <input
                                                  type="radio"
                                                  name={`bonus-nested-${roomIndex}-${itemIndex}-${compIndex}-selection`}
                                                  checked={nestedComp.selected || false}
                                                  onChange={(e) => {
                                                    if (!component.nestedItem) return;
                                                    const nestedComponents = component.nestedItem.components.map((c, idx) => ({
                                                      ...c,
                                                      selected: idx === nestedCompIndex,
                                                    }));
                                                    const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                    updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
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
                                                    updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                  }}
                                                  className="w-12 px-1 py-0.5 bg-gray-600 text-white rounded border border-gray-500 text-[10px]"
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
                                                  updateBonusRoomComponent(roomIndex, itemIndex, compIndex, 'nestedItem', nestedItem);
                                                }}
                                                className="px-1.5 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-[10px]"
                                              >
                                                삭제
                                              </button>
                                              </div>
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
            </div>

            <div className="space-y-4">
            {packageData.items.map((packageItem, itemIndex) => {
              const level0Colors = getLevelColors(0); // 묶음 항목 (레벨 0)
              return (
              <div key={itemIndex} className={`${level0Colors.bg} rounded-lg border ${level0Colors.border} p-4`}>
                <div className="flex items-center gap-3 mb-3">
                  {packageData.category === '패스' && (
                    <span className="text-sm font-semibold text-purple-400 whitespace-nowrap">
                      패스 레벨 {itemIndex + 1}
                    </span>
                  )}
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
                
                {/* 구성요소 펼치기/접기 버튼 */}
                {packageItem.components.length > 0 && (
                  <button
                    onClick={() => toggleItemExpanded(itemIndex)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
                  >
                    <span className="text-sm font-medium text-gray-300">
                      구성 요소 {packageItem.components.length}개
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
                {/* 구성요소: 들여쓰기 및 구분선 */}
                {expandedItems[itemIndex] && (
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
                    {packageItem.components.map((component, componentIndex) => {
                      const level0ItemColors = getLevelColors(0);
                      return (
                    <div key={componentIndex} className={`${level0ItemColors.bg} rounded-lg p-3 border ${level0ItemColors.border}`}>
                      <div className="space-y-2">
                        {/* 첫 번째 줄: 라디오 버튼 + 드롭다운 */}
                        <div className="flex gap-2 items-center">
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
                        
                          <SearchableSelect
                          value={component.itemName}
                            onChange={(value) => {
                            if (value === '__nested__') {
                              // 묶음 항목 추가 선택 시 중첩된 묶음 항목 생성
                              updateComponent(itemIndex, componentIndex, 'itemName', '__nested__');
                              updateComponent(itemIndex, componentIndex, 'nestedItem', {
                                itemName: '',
                                itemType: '확정',
                                quantity: 1,
                                components: [],
                              });
                            } else {
                              updateComponent(itemIndex, componentIndex, 'itemName', value);
                              // 일반 아이템 선택 시 중첩 항목 제거
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
                        
                        {/* 두 번째 줄: 묶음 항목 추가 선택 시 항목명과 타입 입력 필드 */}
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
                        
                        {/* 직접 입력 선택 시 이름 입력 필드 */}
                        {(component.itemName === '__manual__' || (component.itemName && component.itemName !== '__nested__' && !component.itemName.includes('(실제가치)') && !availableItemNames.has(component.itemName))) && (
                          <div>
                            <input
                              type="text"
                              value={component.itemName === '__manual__' ? '' : component.itemName}
                              onChange={(e) => {
                                // 직접 입력 모드에서는 itemName을 사용자가 입력한 값으로 설정
                                // 빈 문자열이면 __manual__ 유지, 값이 있으면 입력한 값으로 설정
                                const value = e.target.value || '__manual__';
                                updateComponent(itemIndex, componentIndex, 'itemName', value);
                              }}
                              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                              placeholder="아이템 이름을 입력하세요"
                            />
                          </div>
                        )}
                        
                        {/* 세 번째 줄: 수량, 확률, 삭제 버튼 */}
                        <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="number"
                          value={(component.itemName === '__nested__' && component.nestedItem) ? (component.nestedItem.quantity || '') : (component.quantity || '')}
                          onChange={(e) => {
                            const newQuantity = parseFloat(e.target.value) || 0;
                            updateComponent(itemIndex, componentIndex, 'quantity', newQuantity);
                            // 하위 묶음 항목인 경우 nestedItem.quantity도 함께 업데이트
                            if (component.itemName === '__nested__' && component.nestedItem) {
                              const nestedItem = { ...component.nestedItem, quantity: newQuantity };
                              updateComponent(itemIndex, componentIndex, 'nestedItem', nestedItem);
                            }
                          }}
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
                      </div>

                      {/* 하위 묶음 항목의 구성요소 UI */}
                      {component.itemName === '__nested__' && component.nestedItem && component.nestedItem.itemName && (() => {
                        const level1Colors = getLevelColors(1);
                        return (
                        <div className={`mt-3 pl-4 border-l-2 border-blue-500/50 ${level1Colors.bg} rounded-lg p-3`}>
                          {/* 중첩된 묶음 항목 구성요소 펼치기/접기 버튼 */}
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
                                const nestedItemColors = getLevelColors(2); // 하위구성요소는 회색
                                return (
                                <div key={nestedCompIndex} className={`${nestedItemColors.bg} rounded-lg p-2 border ${nestedItemColors.border}`}>
                                  <div className="space-y-2">
                                    {/* 첫 번째 줄: 드롭다운 */}
                                    <div className="flex gap-2 items-center">
                                      <SearchableSelect
                                      value={
                                        // 직접 입력 모드: itemName이 __manual__이거나 availableItemNames에 없으면 __manual__ 유지
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
                                          // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
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
                                    
                                    {/* 직접 입력 필드 */}
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
                                    
                                    {/* 단가 직접 입력 필드 (직접 입력 선택 시) */}
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
                                    
                                    {/* 두 번째 줄: 수량, 확률/선택, 삭제 */}
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
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        );
                      })()}

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

                        // 단가 계산 (패키지 가격 타입에 맞춰 변환)
                        let unitPriceInPackageType = 0;
                        let unitPriceUnit = packageData.priceType;
                        
                        if (finalUnitPrice) {
                          if (packageData.priceType === '골드') {
                            if (finalUnitPrice.unitType === '골드') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                              unitPriceInPackageType = (finalUnitPrice.unitPrice * crystalGoldRate) / 100;
                            } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                              unitPriceInPackageType = finalUnitPrice.unitPrice / goldToCashPerGold;
                            }
                          } else if (packageData.priceType === '크리스탈') {
                            if (finalUnitPrice.unitType === '크리스탈') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '골드' && crystalGoldRate && crystalGoldRate > 0) {
                              unitPriceInPackageType = (finalUnitPrice.unitPrice * 100) / crystalGoldRate;
                            } else if (finalUnitPrice.unitType === '현금') {
                              // 크리스탈 → 현금 변환은 복잡하므로 단가 직접 사용
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            }
                          } else if (packageData.priceType === '현금') {
                            if (finalUnitPrice.unitType === '현금') {
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            } else if (finalUnitPrice.unitType === '골드' && goldToCashPerGold && goldToCashPerGold > 0) {
                              unitPriceInPackageType = finalUnitPrice.unitPrice * goldToCashPerGold;
                            } else if (finalUnitPrice.unitType === '크리스탈') {
                              // 크리스탈 → 현금 변환은 복잡하므로 단가 직접 사용
                              unitPriceInPackageType = finalUnitPrice.unitPrice;
                            }
                          }
                        }

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
                              {finalUnitPrice && unitPriceInPackageType > 0 ? (
                                <>
                                  단가: {formatNumberWithSignificantDigits(unitPriceInPackageType)} {unitPriceUnit}
                                  <span className="text-gray-400 mx-1">×</span>
                                  수량: {formatNumberWithSignificantDigits(component.quantity || 0)}
                                  {packageItem.itemType === '확률' && component.probability && (
                                    <span className="text-purple-400 ml-1">× {component.probability}</span>
                                  )}
                                  {packageItem.quantity && packageItem.quantity > 1 && (
                                    <span className="text-blue-400 ml-1">× 묶음 수량 {packageItem.quantity}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  수량: {formatNumberWithSignificantDigits(component.quantity || 0)} × 단가
                                  {packageItem.quantity && packageItem.quantity > 1 && (
                                    <span className="text-blue-400 ml-1">× 묶음 수량 {packageItem.quantity}</span>
                                  )}
                                </>
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
                {packageItem.components.length === 0 && (
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
              onClick={addPackageItem}
              className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              묶음 항목 추가
            </button>
          </div>
        </div>
        )}

        {/* 3+보너스 구성품 섹션 */}
        {packageData.packageType === '3+보너스' && (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">3+보너스 구성품</h2>
              <button
                onClick={addBonus3Item}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                항목 추가
              </button>
            </div>

            <div className="space-y-4">
              {packageData.bonus3Items.map((packageItem, itemIndex) => {
                const level0Colors = getLevelColors(0);
                return (
                  <div key={itemIndex} className={`${level0Colors.bg} rounded-lg border ${level0Colors.border} p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="text"
                        value={packageItem.itemName}
                        onChange={(e) => updateBonus3Item(itemIndex, 'itemName', e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        placeholder="항목명"
                      />
                      <input
                        type="number"
                        value={packageItem.quantity || ''}
                        onChange={(e) => updateBonus3Item(itemIndex, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        placeholder="묶음 수량"
                        min="1"
                        step="1"
                      />
                      <select
                        value={packageItem.itemType}
                        onChange={(e) => updateBonus3Item(itemIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                      >
                        <option value="확정">확정</option>
                        <option value="확률">확률</option>
                        <option value="선택">선택</option>
                      </select>
                      <button
                        onClick={() => removeBonus3Item(itemIndex)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    
                    {packageItem.components.length > 0 && (
                      <button
                        onClick={() => {
                          const newExpanded = { ...expandedItems };
                          newExpanded[`bonus3-${itemIndex}`] = !newExpanded[`bonus3-${itemIndex}`];
                          setExpandedItems(newExpanded);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors mb-2"
                      >
                        <span className="text-sm font-medium text-gray-300">
                          구성 요소 {packageItem.components.length}개
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${expandedItems[`bonus3-${itemIndex}`] ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    
                    {expandedItems[`bonus3-${itemIndex}`] && (
                      <div className="space-y-2 pl-4 border-l-2 border-gray-700">
                        {packageItem.itemType === '확률' && (() => {
                          const totalProbability = packageItem.components.reduce((sum, comp) => {
                            return sum + (comp.probability || 0);
                          }, 0);
                          const isNot100Percent = Math.abs(totalProbability - 1) > 0.001;
                          return isNot100Percent ? (
                            <div className="text-red-400 text-sm font-medium bg-red-900/20 border border-red-700 rounded p-2 mb-2">
                              ⚠ 확률 합계가 {(totalProbability * 100).toFixed(1)}%입니다. (100%가 되어야 합니다)
                            </div>
                          ) : null;
                        })()}
                        {packageItem.components.map((component, componentIndex) => {
                          const level0ItemColors = getLevelColors(0);
                          return (
                            <div key={componentIndex} className={`${level0ItemColors.bg} rounded-lg p-3 border ${level0ItemColors.border}`}>
                              <div className="space-y-2">
                                <div className="flex gap-2 items-center">
                                  {packageItem.itemType === '선택' && (
                                    <input
                                      type="radio"
                                      name={`bonus3-item-${itemIndex}-selection`}
                                      checked={component.selected || false}
                                      onChange={(e) => updateBonus3Component(itemIndex, componentIndex, 'selected', e.target.checked)}
                                      className="mt-2"
                                    />
                                  )}
                                  <SearchableSelect
                                    value={component.itemName}
                                    onChange={(value) => {
                                      if (value === '__nested__') {
                                        updateBonus3Component(itemIndex, componentIndex, 'itemName', '__nested__');
                                        updateBonus3Component(itemIndex, componentIndex, 'nestedItem', {
                                          itemName: '',
                                          itemType: '확정',
                                          quantity: 1,
                                          components: [],
                                        });
                                      } else {
                                        updateBonus3Component(itemIndex, componentIndex, 'itemName', value);
                                        if (value !== '__nested__') {
                                          updateBonus3Component(itemIndex, componentIndex, 'nestedItem', undefined);
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
                                        updateBonus3Component(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                      }}
                                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                      placeholder="묶음 항목명"
                                    />
                                    <select
                                      value={component.nestedItem.itemType}
                                      onChange={(e) => {
                                        const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                        updateBonus3Component(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                      }}
                                      className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                    >
                                      <option value="확정">확정</option>
                                      <option value="확률">확률</option>
                                      <option value="선택">선택</option>
                                    </select>
                                  </div>
                                )}
                                
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={(component.itemName === '__nested__' && component.nestedItem) ? (component.nestedItem.quantity || '') : (component.quantity || '')}
                                    onChange={(e) => {
                                      const newQuantity = parseFloat(e.target.value) || 1;
                                      updateBonus3Component(itemIndex, componentIndex, 'quantity', newQuantity);
                                      // 하위 묶음 항목인 경우 nestedItem.quantity도 함께 업데이트
                                      if (component.itemName === '__nested__' && component.nestedItem) {
                                        const nestedItem = { ...component.nestedItem, quantity: newQuantity };
                                        updateBonus3Component(itemIndex, componentIndex, 'nestedItem', nestedItem);
                                      }
                                    }}
                                    className="w-24 px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                    placeholder="수량"
                                    min="0.01"
                                    step="0.01"
                                  />
                                  {packageItem.itemType === '확률' && (
                                    <input
                                      type="number"
                                      value={component.probability !== undefined ? (component.probability * 100).toFixed(1) : ''}
                                      onChange={(e) => {
                                        const probValue = parseFloat(e.target.value) || 0;
                                        updateBonus3Component(itemIndex, componentIndex, 'probability', probValue / 100);
                                      }}
                                      className="w-24 px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                      placeholder="확률(%)"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                    />
                                  )}
                                  <button
                                    onClick={() => removeBonus3Component(itemIndex, componentIndex)}
                                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                  >
                                    삭제
                                  </button>
                                </div>
                                
                                {(component.itemName === '__manual__' || component.itemName === '') && (
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      value={component.manualPrice !== null && component.manualPrice !== undefined ? component.manualPrice : ''}
                                      onChange={(e) => updateBonus3Component(itemIndex, componentIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                                      className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                      placeholder="직접 입력 가격"
                                      min="0"
                                      step="0.01"
                                    />
                                    <select
                                      value={component.manualUnitType || '골드'}
                                      onChange={(e) => updateBonus3Component(itemIndex, componentIndex, 'manualUnitType', e.target.value)}
                                      className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                                    >
                                      <option value="골드">골드</option>
                                      <option value="크리스탈">크리스탈</option>
                                      <option value="현금">현금</option>
                                    </select>
                                  </div>
                                )}
                                
                                {/* 단가와 가치 표시 */}
                                {(() => {
                                  const isManual = component.itemName === '__manual__' || component.itemName === '';
                                  const resolved = !isManual && component.itemName ? resolveUnitPrice(component.itemName) : null;
                                  const finalUnitPrice = (component.manualPrice !== null && component.manualPrice !== undefined && component.manualPrice > 0)
                                    ? { unitType: (component.manualUnitType || '골드') as '골드' | '크리스탈' | '현금', unitPrice: component.manualPrice }
                                    : resolved;

                                  // 단가 계산 (패키지 가격 타입에 맞춰 변환)
                                  let unitPriceInPackageType = 0;
                                  
                                  if (finalUnitPrice) {
                                    if (packageData.priceType === '골드') {
                                      if (finalUnitPrice.unitType === '골드') {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice;
                                      } else if (finalUnitPrice.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
                                        unitPriceInPackageType = (finalUnitPrice.unitPrice * crystalGoldRate) / 100;
                                      } else if (finalUnitPrice.unitType === '현금' && goldToCashPerGold && goldToCashPerGold > 0) {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice / goldToCashPerGold;
                                      }
                                    } else if (packageData.priceType === '크리스탈') {
                                      if (finalUnitPrice.unitType === '크리스탈') {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice;
                                      } else if (finalUnitPrice.unitType === '골드' && crystalGoldRate && crystalGoldRate > 0) {
                                        unitPriceInPackageType = (finalUnitPrice.unitPrice * 100) / crystalGoldRate;
                                      } else if (finalUnitPrice.unitType === '현금') {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice;
                                      }
                                    } else if (packageData.priceType === '현금') {
                                      if (finalUnitPrice.unitType === '현금') {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice;
                                      } else if (finalUnitPrice.unitType === '골드' && goldToCashPerGold && goldToCashPerGold > 0) {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice * goldToCashPerGold;
                                      } else if (finalUnitPrice.unitType === '크리스탈') {
                                        unitPriceInPackageType = finalUnitPrice.unitPrice;
                                      }
                                    }
                                  }

                                  // 구성요소 가치 계산 (1개 기준)
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
                                  }
                                  
                                  // 전체 가치 계산 (묶음 항목 수량 곱한 값)
                                  const itemQuantity = packageItem.quantity || 1;
                                  const totalItemValue = itemValue * itemQuantity;

                                  const isIncluded = packageItem.itemType === '확정' || 
                                                   (packageItem.itemType === '확률') ||
                                                   (packageItem.itemType === '선택' && component.selected);

                                  if (finalUnitPrice && unitPriceInPackageType > 0) {
                                    return (
                                      <div className="mt-2 space-y-1 text-xs">
                                        <div className="text-gray-300">
                                          단가 <span className="font-semibold">{formatNumberWithSignificantDigits(finalUnitPrice.unitPrice)}</span> {finalUnitPrice.unitType}
                                        </div>
                                        <div className="text-gray-300">
                                          단가 <span className="font-semibold">{formatNumberWithSignificantDigits(finalUnitPrice.unitPrice)}</span> {finalUnitPrice.unitType}
                                          {packageItem.itemType === '확률' && component.probability !== undefined && (
                                            <span className="text-purple-400 ml-1">× {component.probability}</span>
                                          )}
                                          <span className="text-gray-500 mx-1">×</span>
                                          수량 <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                          {packageItem.quantity && packageItem.quantity > 1 && (
                                            <>
                                              <span className="text-gray-500 mx-1">×</span>
                                              <span className="text-blue-400">묶음 수량 {packageItem.quantity}</span>
                                            </>
                                          )}
                                          <span className="text-gray-500 mx-1">=</span>
                                          <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                            {isIncluded ? formatNumberWithSignificantDigits(totalItemValue) : '0'} {packageData.priceType}
                                          </span>
                                          {packageItem.itemType === '확률' && isIncluded && <span className="text-gray-500 ml-1">(기대값)</span>}
                                        </div>
                                      </div>
                                    );
                                  } else if (finalUnitPrice) {
                                    return (
                                      <div className="mt-2 space-y-1 text-xs">
                                        <div className="text-gray-300">
                                          수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                          {isIncluded && (
                                            <span className="text-blue-400 ml-2">
                                              가치: <span className="font-semibold">{formatNumberWithSignificantDigits(itemValue)}</span> {packageData.priceType}
                                              {packageItem.itemType === '확률' && <span className="text-gray-500 ml-1">(기대값)</span>}
                                              {packageItem.quantity && packageItem.quantity > 1 && (
                                                <span className="text-gray-500 ml-1">(1개 기준)</span>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                        {packageItem.quantity && packageItem.quantity > 1 && isIncluded && (
                                          <div className="text-gray-300">
                                            수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                            <span className="text-gray-500 mx-1">×</span>
                                            <span className="text-blue-400">묶음 수량 {packageItem.quantity}</span>
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(totalItemValue)} {packageData.priceType}
                                            </span>
                                            {packageItem.itemType === '확률' && <span className="text-gray-500 ml-1">(기대값)</span>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          );
                        })}
                        {packageItem.components.length === 0 && (
                          <div className="text-sm text-gray-500 text-center py-4 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
                            구성 요소 없음
                          </div>
                        )}
                        <button
                          onClick={() => addBonus3Component(itemIndex)}
                          className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                        >
                          구성 요소 추가
                        </button>
                      </div>
                    )}
                    
                    {packageItem.components.length === 0 && (
                      <button
                        onClick={() => addBonus3Component(itemIndex)}
                        className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                      >
                        구성 요소 추가
                      </button>
                    )}
                  </div>
                );
              })}
              {packageData.bonus3Items.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-8 bg-gray-800/30 rounded-lg border border-dashed border-gray-700">
                  3+보너스 구성품이 없습니다. 항목을 추가해주세요.
                </div>
              )}
            </div>
          </div>
        )}



      </div>
    </div>
  );
}

