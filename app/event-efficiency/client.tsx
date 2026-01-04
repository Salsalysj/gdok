'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';

type EventTab = {
  key: string;
  label: string;
  period: string;
};

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
  originalCrystal: number | null;
  originalGold: number | null;
};

type ItemDetail = {
  Id?: number;
  Name?: string;
  displayName?: string;
  Grade?: string;
  Icon?: string;
  BundleCount?: number;
  TradeRemainCount?: number | null;
  YDayAvgPrice?: number;
  RecentPrice?: number;
  CurrentMinPrice?: number;
  source?: string;
  tier?: string;
  grade?: string;
};

type CachedMarketData = {
  lastUpdated: string;
  data: {
    tier4Results: ItemDetail[];
    tier3Results: ItemDetail[];
    gemResults: ItemDetail[];
    otherResults: ItemDetail[];
    relicEngravingResults: ItemDetail[];
  };
};

// 구성 요소 타입 (과금 효율과 동일)
type ComponentItem = {
  itemName: string;
  quantity: number;
  manualPrice?: number | null;
  manualUnitType?: '골드' | '크리스탈' | '현금' | null;
  probability?: number; // 확률 타입용
  selected?: boolean; // 선택 타입용
  nestedItem?: RewardItemNew; // 하위 묶음 항목
};

// 새로운 보상 아이템 타입 (과금 효율의 PackageItem과 동일)
type RewardItemNew = {
  itemName: string;
  itemType: '확정' | '확률' | '선택';
  quantity: number;
  components: ComponentItem[];
  type?: 'kurzan';
  excludeFromSummary?: boolean;
};

// 기존 호환성을 위한 단순 타입
type RewardItemLegacy = {
  name: string;
  quantity: number;
  type?: 'kurzan';
  excludeFromSummary?: boolean;
};

// Union 타입으로 양쪽 모두 지원
type RewardItem = RewardItemNew | RewardItemLegacy;

type RewardGroup = {
  title: string;
  items: RewardItem[];
};

type KurzanStageOption = {
  key: string;
  level: string;
  stage: string;
  totalGold: number;
  breakthroughValue: number;
  fragmentValue: number;
  cardExpValue: number;
};

type AggregatedReward = {
  name: string;
  quantity: number;
  perUnitNote?: string | null;
  isWeekly?: boolean;
  category: 'weekly' | 'cumulative' | 'daily';
};

type PriceInfo = {
  unit: 'gold' | 'crystal' | 'cash' | null;
  unitAmount: number | null;
  goldEquivalent: number | null;
  cashEquivalent: number | null;
  note?: string | null;
};

const PC_BANG_LUCKY_SUMMARY_NAME = 'PC방 행운의 상자 (기대값)';

const eventTabs: EventTab[] = [];

const eventSubTabs = [
  { key: 'summary', label: '요약' },
  { key: 'weekly', label: '주간 보상' },
  { key: 'cumulative', label: '누적 보상' },
  { key: 'daily', label: '상시 혜택 (일일)' },
] as const;

type Props = {
  etcListItems: EtcListItem[];
  crystalGoldRate: number | null;
  marketCache: CachedMarketData | null;
  discordRate: number | null;
  kurzanStages: {
    level: string;
    stage: string;
    totalGold: number;
    breakthroughValue?: number;
    fragmentValue?: number;
    cardExpValue?: number;
  }[];
  initialSavedEventEfficiency?: Array<{ id: string; name: string; created_at: string; updated_at: string; weekly_rewards?: any; cumulative_rewards?: any; end_date?: string | null; total_weeks?: number | null; total_hours?: number | null }>;
};

export default function EventEfficiencyClient({ etcListItems, crystalGoldRate, marketCache, discordRate, kurzanStages, initialSavedEventEfficiency = [] }: Props) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  
  // 로컬 환경에서만 이벤트 효율 저장/업데이트 허용
  const allowEventEfficiencySave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
  
  // 단가 직접 입력 필드의 임시 값 저장 (입력 중에는 문자열로 유지)
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  
  // 초기값 설정 함수들 (useState 호출 전에 정의)
  // 가장 최근에 작성된 항목 찾기 (created_at 기준 내림차순 정렬된 배열에서 첫 번째 항목)
  const getLatestEvent = () => {
    if (initialSavedEventEfficiency.length === 0) return null;
    // created_at 기준으로 정렬 (이미 서버에서 정렬되어 있지만 안전을 위해)
    const sorted = [...initialSavedEventEfficiency].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // 내림차순 (최신이 먼저)
    });
    return sorted[0];
  };
  
  const getInitialWeeklyRewards = (): RewardGroup[] => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.weekly_rewards) {
      return latestEvent.weekly_rewards;
    }
    return [];
  };
  
  const getInitialCumulativeRewards = (): RewardGroup[] => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.cumulative_rewards) {
      return latestEvent.cumulative_rewards;
    }
    return [];
  };
  
  const getInitialEventName = (): string => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.name) {
      return latestEvent.name;
    }
    return '';
  };
  
  const getInitialEndDate = (): string => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.end_date) {
      return latestEvent.end_date;
    }
    return '';
  };
  
  const getInitialSelectedId = (): string | null => {
    const latestEvent = getLatestEvent();
    if (latestEvent) {
      return latestEvent.id;
    }
    return null;
  };
  
  const getInitialTotalWeeks = (): string => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.total_weeks != null) {
      return latestEvent.total_weeks.toString();
    }
    return '7';
  };
  
  const getInitialTotalHours = (): string => {
    const latestEvent = getLatestEvent();
    if (latestEvent && latestEvent.total_hours != null) {
      return latestEvent.total_hours.toString();
    }
    return '70';
  };
  
  // 저장된 이벤트 효율 관련 상태
  const [savedEventEfficiency, setSavedEventEfficiency] = useState<Array<{ id: string; name: string; created_at: string; updated_at: string; weekly_rewards?: any; cumulative_rewards?: any; end_date?: string | null; total_weeks?: number | null; total_hours?: number | null }>>(initialSavedEventEfficiency);
  const [selectedEventEfficiencyId, setSelectedEventEfficiencyId] = useState<string | null>(getInitialSelectedId());
  const [isLoading, setIsLoading] = useState(false);
  
  // 초기 데이터 로드 시 최신 데이터 다시 불러오기
  useEffect(() => {
    console.log('[이벤트 효율] 초기 저장된 이벤트 효율:', initialSavedEventEfficiency.map(item => ({ id: item.id, name: item.name })));
    
    // 페이지 로드 시 서버에서 최신 데이터 다시 불러오기
    const fetchLatestData = async () => {
      try {
        const res = await fetch('/api/event-efficiency');
        const data = await res.json();
        if (data.items) {
          console.log('[이벤트 효율] 서버에서 불러온 최신 데이터:', data.items.map((item: any) => ({ id: item.id, name: item.name })));
          setSavedEventEfficiency(data.items);
          
          // 저장된 이벤트가 없거나 모두 종료일이 지난 경우 기본정보 카드 숨김
          if (data.items.length === 0) {
            setShowBasicInfo(false);
          } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const hasActive = data.items.some((item: any) => {
              if (!item.end_date) return true;
              const end = new Date(item.end_date);
              end.setHours(23, 59, 59, 999);
              return end >= today;
            });
            setShowBasicInfo(hasActive);
          }
        }
      } catch (error) {
        console.error('[이벤트 효율] 최신 데이터 불러오기 실패:', error);
      }
    };
    
    fetchLatestData();
  }, []);
  
  // 디버깅: adjustedEntries 확인
  useEffect(() => {
    console.log('[이벤트 효율] adjustedEntries 개수:', adjustedEntries?.length || 0);
    if (adjustedEntries && adjustedEntries.length > 0) {
      console.log('[이벤트 효율] 첫 5개 항목:', adjustedEntries.slice(0, 5).map(e => e.itemName));
    }
  }, [adjustedEntries]);
  
  // 타입 가드: 새 형식 RewardItem인지 확인
  const isNewFormatItem = (item: RewardItem): item is RewardItemNew => {
    return 'itemName' in item && 'components' in item;
  };
  
  // 헬퍼: 아이템 이름 가져오기
  const getItemName = (item: RewardItem): string => {
    return isNewFormatItem(item) ? item.itemName : item.name;
  };
  
  // 헬퍼: 아이템 수량 가져오기 (구성 요소의 총 수량)
  const getItemTotalQuantity = (item: RewardItem): number => {
    if (isNewFormatItem(item)) {
      // components의 수량 합계 반환
      return item.components.reduce((sum, comp) => {
        if (comp.itemName === '__nested__' && comp.nestedItem) {
          return sum + getItemTotalQuantity(comp.nestedItem) * comp.quantity;
        }
        return sum + comp.quantity;
      }, 0);
    }
    return item.quantity;
  };
  
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
    
    // 디버깅: options 확인
    useEffect(() => {
      if (isOpen) {
        console.log('[이벤트 효율] SearchableSelect 열림, options 개수:', options.length);
        console.log('[이벤트 효율] options 첫 10개:', options.slice(0, 10).map(o => o.label));
      }
    }, [isOpen, options]);
    
    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) {
        console.log('[이벤트 효율] 필터링 없음, 전체 options:', options.length, '개');
        return options;
      }
      const query = searchQuery.toLowerCase();
      const filtered = options.filter(opt => opt.label.toLowerCase().includes(query));
      console.log('[이벤트 효율] 검색어:', query, '필터링 결과:', filtered.length, '개');
      return filtered;
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
  const [activeTab, setActiveTab] = useState<EventTab | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<typeof eventSubTabs[number]>(eventSubTabs[0]);
  const [chaosStoneQuality, setChaosStoneQuality] = useState<90 | 95>(90);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [enabledRewards, setEnabledRewards] = useState<Record<string, boolean>>({});
  const [expandedBundleItemsSummary, setExpandedBundleItemsSummary] = useState<Set<string>>(new Set());
  const [braceletPriceInput, setBraceletPriceInput] = useState('100');
  const [totalDaysInput, setTotalDaysInput] = useState('20');
  const [totalWeeksInput, setTotalWeeksInput] = useState(getInitialTotalWeeks());
  const [totalHoursInput, setTotalHoursInput] = useState(getInitialTotalHours());
  const [legendaryCardSelectionPriceInput, setLegendaryCardSelectionPriceInput] = useState('50000');
  const [eventName, setEventName] = useState(getInitialEventName());
  const [endDate, setEndDate] = useState(getInitialEndDate());
  
  // 활성 이벤트(종료일이 지나지 않은 이벤트)가 있는지 확인
  const hasActiveEvent = useMemo(() => {
    if (savedEventEfficiency.length === 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return savedEventEfficiency.some((item) => {
      if (!item.end_date) return true; // 종료일이 없으면 활성
      const end = new Date(item.end_date);
      end.setHours(23, 59, 59, 999);
      return end >= today;
    });
  }, [savedEventEfficiency]);
  
  // 기본정보 카드 표시 여부 (활성 이벤트가 있거나 선택된 이벤트가 있으면 표시)
  const [showBasicInfo, setShowBasicInfo] = useState(() => {
    // 초기값: 저장된 이벤트가 있고 활성 이벤트가 있으면 표시
    const latestEvent = getLatestEvent();
    if (latestEvent) {
      // 가장 최근 항목이 활성 이벤트인지 확인
      if (!latestEvent.end_date) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(latestEvent.end_date);
      end.setHours(23, 59, 59, 999);
      return end >= today;
    }
    return false;
  });
  const [kurzanSwitches, setKurzanSwitches] = useState({
    breakthrough: true,
    fragment: true,
    cardExp: true,
  });
  
  // 아이템 드롭다운 옵션 (가치계산DB 우선, fallback으로 etc_list + 시세)
  const itemDropdownOptions = useMemo(() => {
    let itemNames: string[] = [];
    
    console.log('[이벤트 효율] itemDropdownOptions 재계산 시작');
    console.log('[이벤트 효율] adjustedEntries:', adjustedEntries?.length || 0, '개');
    console.log('[이벤트 효율] adjustedEntries 타입:', typeof adjustedEntries, Array.isArray(adjustedEntries));
    
    // 1. 가치계산DB에서 가져오기 (우선순위)
    if (adjustedEntries && adjustedEntries.length > 0) {
      itemNames = adjustedEntries
        .map(entry => entry.itemName)
        .filter((name): name is string => name != null && name !== '');
      console.log('[이벤트 효율] 가치계산DB에서 아이템 로드:', itemNames.length, '개');
      if (itemNames.length > 0) {
        console.log('[이벤트 효율] 첫 10개 아이템명:', itemNames.slice(0, 10));
      }
    } else {
      console.log('[이벤트 효율] adjustedEntries가 비어있어 fallback 사용');
      // 2. fallback: etc_list + 시세 캐시
      const etcItemNames = etcListItems.map(item => item.itemName);
      const allMarketItems = [
        ...(marketCache?.data?.tier4Results || []),
        ...(marketCache?.data?.tier3Results || []),
        ...(marketCache?.data?.gemResults || []),
        ...(marketCache?.data?.otherResults || []),
        ...(marketCache?.data?.relicEngravingResults || []),
      ];
      const marketItemNames = allMarketItems
        .map(item => item.displayName || item.Name)
        .filter((name): name is string => name != null);
      
      itemNames = Array.from(new Set([...etcItemNames, ...marketItemNames]));
      console.log('[이벤트 효율] fallback에서 아이템 로드:', itemNames.length, '개');
    }
    
    const options = [
      { value: '', label: '아이템 선택' },
      { value: '__nested__', label: '묶음 항목 추가' },
      { value: '__manual__', label: '(직접 입력)' },
      ...itemNames.map(item => ({ value: item, label: item }))
    ];
    
    console.log('[이벤트 효율] 최종 드롭다운 옵션 개수:', options.length, '개');
    
    return options;
  }, [adjustedEntries, etcListItems, marketCache]);
  
  // 드롭다운에 있는 항목 목록 (직접 입력 필드 표시 여부 확인용)
  const availableItemNames = useMemo(() => {
    return new Set(itemDropdownOptions.map(opt => opt.value).filter(v => v && v !== '__nested__' && v !== '__manual__' && v !== ''));
  }, [itemDropdownOptions]);
  
  // 아이템 단가 가져오기 (가치계산DB 우선 사용 - 가격 조정 자동 반영)
  // component 또는 nestedComp 객체를 받아서 manualPrice도 확인
  const getItemUnitPrice = useCallback((itemName: string, component?: ComponentItem): number | null => {
    if (!itemName || itemName === '__nested__' || itemName === '__manual__') return null;
    
    // 직접 입력된 단가가 있으면 우선 사용
    if (component && component.manualPrice !== null && component.manualPrice !== undefined) {
      // 단위 변환 필요 시 여기서 처리 (현재는 골드 기준)
      if (component.manualUnitType === '골드') {
        return component.manualPrice;
      } else if (component.manualUnitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
        return (component.manualPrice * crystalGoldRate) / 100;
      } else if (component.manualUnitType === '현금') {
        // 현금을 골드로 변환
        // cashMode에 따라 다른 환율 사용
        if (cashMode === 'discord') {
          // 디스코드: discordRate는 "100골드당 현금"을 의미하므로, 1골드당 현금 = discordRate / 100
          // 따라서 현금을 골드로 변환: 골드 = 현금 / (discordRate / 100) = 현금 * 100 / discordRate
          if (discordRate && discordRate > 0) {
            return (component.manualPrice * 100) / discordRate;
          }
        } else {
          // 화폐거래소: 1골드 = 2750 / crystalGoldRate 원
          // 따라서 현금을 골드로 변환: 골드 = 현금 / (2750 / crystalGoldRate) = 현금 * crystalGoldRate / 2750
          if (crystalGoldRate && crystalGoldRate > 0) {
            return (component.manualPrice * crystalGoldRate) / 2750;
          }
        }
        // 환율 정보가 없으면 null 반환
        return null;
      }
      return component.manualPrice; // 기본값
    }
    
    // 1. 가치계산DB에서 찾기 (우선순위 - adjustedEntries는 가격 조정이 이미 적용된 데이터)
    if (adjustedEntries && adjustedEntries.length > 0) {
      const valueDbEntry = adjustedEntries.find(entry => entry.itemName === itemName);
      if (valueDbEntry && valueDbEntry.unitValue !== null) {
        if (valueDbEntry.unitType === '골드') {
          return valueDbEntry.unitValue;
        } else if (valueDbEntry.unitType === '크리스탈' && crystalGoldRate && crystalGoldRate > 0) {
          return (valueDbEntry.unitValue * crystalGoldRate) / 100;
        } else if (valueDbEntry.unitType === '현금') {
          // 현금을 골드로 변환
          if (cashMode === 'discord' && discordRate && discordRate > 0) {
            return (valueDbEntry.unitValue * 100) / discordRate;
          } else if (cashMode === 'exchange' && crystalGoldRate && crystalGoldRate > 0) {
            return (valueDbEntry.unitValue * crystalGoldRate) / 2750;
          }
        }
      }
    }
    
    // 2. fallback: etc_list에서 찾기
    const etcItem = etcListItems.find(item => item.itemName === itemName);
    if (etcItem) {
      if (etcItem.gold !== null) return etcItem.gold;
      if (etcItem.crystal !== null && crystalGoldRate !== null) {
        return (etcItem.crystal * crystalGoldRate) / 100;
      }
      if (etcItem.cash !== null && etcItem.cash > 0) {
        // 현금을 골드로 변환
        if (cashMode === 'discord' && discordRate && discordRate > 0) {
          return (etcItem.cash * 100) / discordRate;
        } else if (cashMode === 'exchange' && crystalGoldRate && crystalGoldRate > 0) {
          return (etcItem.cash * crystalGoldRate) / 2750;
        }
      }
    }
    
    // 3. fallback: 시세 캐시에서 찾기
    const allMarketItems = [
      ...(marketCache?.data?.tier4Results || []),
      ...(marketCache?.data?.tier3Results || []),
      ...(marketCache?.data?.gemResults || []),
      ...(marketCache?.data?.otherResults || []),
      ...(marketCache?.data?.relicEngravingResults || []),
    ];
    
    const marketItem = allMarketItems.find(item => 
      (item.displayName || item.Name) === itemName
    );
    
    if (marketItem) {
      const price = marketItem.CurrentMinPrice || marketItem.RecentPrice || marketItem.YDayAvgPrice;
      if (price) return adjustPrice(itemName, price);
    }
    
    return null;
  }, [adjustedEntries, etcListItems, marketCache, crystalGoldRate, adjustPrice, discordRate, lightMode]);
  
  // 주간 보상 상태 (직접 입력 가능) - 새 구조 적용
  const [weeklyRewardsEditable, setWeeklyRewardsEditable] = useState<RewardGroup[]>(getInitialWeeklyRewards());
  
  // 누적 보상 상태 (직접 입력 가능) - 새 구조 적용
  const [cumulativeRewardsEditable, setCumulativeRewardsEditable] = useState<RewardGroup[]>(getInitialCumulativeRewards());

  // 주간보상 총 가치 계산 (주간보상 탭에서 사용하는 계산 로직과 동일)
  const weeklyRewardsTotalValue = useMemo(() => {
    let total = 0;
    weeklyRewardsEditable.forEach(group => {
      group.items.forEach(item => {
        if (!isNewFormatItem(item)) return;
        item.components.forEach(comp => {
          if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return;
          const unitPrice = getItemUnitPrice(comp.itemName, comp);
          if (unitPrice === null) return;
          const isIncluded = item.itemType === '확정' || 
                            (item.itemType === '확률') || 
                            (item.itemType === '선택' && comp.selected);
          if (!isIncluded) return;
          let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
          if (item.itemType === '확률' && comp.probability !== undefined) {
            value *= comp.probability;
          }
          total += value;
        });
      });
    });
    return total;
  }, [weeklyRewardsEditable, getItemUnitPrice]);

  // 누적보상 총 가치 계산 (누적보상 탭에서 사용하는 계산 로직과 동일)
  const cumulativeRewardsTotalValue = useMemo(() => {
    let total = 0;
    cumulativeRewardsEditable.forEach(group => {
      group.items.forEach(item => {
        if (!isNewFormatItem(item)) return;
        item.components.forEach(comp => {
          if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return;
          const unitPrice = getItemUnitPrice(comp.itemName, comp);
          if (unitPrice === null) return;
          const isIncluded = item.itemType === '확정' || 
                            (item.itemType === '확률') || 
                            (item.itemType === '선택' && comp.selected);
          if (!isIncluded) return;
          let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
          if (item.itemType === '확률' && comp.probability !== undefined) {
            value *= comp.probability;
          }
          total += value;
        });
      });
    });
    return total;
  }, [cumulativeRewardsEditable, getItemUnitPrice]);

  // 주간보상 그룹별 상세 정보 계산 (주간보상 탭에서 사용하는 계산 로직과 동일)
  const weeklyRewardsGroupDetails = useMemo(() => {
    // 하위 묶음 항목의 가치를 재귀적으로 계산하는 함수 (useMemo 내부에서 정의)
    const calculateNestedItemValue = (nestedItem: RewardItemNew, priceType: 'gold'): number => {
      let nestedUnitPrice = 0;
      nestedItem.components.forEach((nestedComp) => {
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem, priceType);
          nestedUnitPrice += nestedNestedUnitPrice * (nestedComp.quantity || 1);
          return;
        }
        const isManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
        const unitPrice = !isManual && nestedComp.itemName ? getItemUnitPrice(nestedComp.itemName, nestedComp) : null;
        if (unitPrice === null) return;
        const isIncluded = nestedItem.itemType === '확정' || 
                          (nestedItem.itemType === '확률') || 
                          (nestedItem.itemType === '선택' && nestedComp.selected);
        if (!isIncluded) return;
        let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
        if (nestedItem.itemType === '확정') {
          nestedUnitPrice += nestedCompValue;
        } else if (nestedItem.itemType === '확률') {
          const probability = nestedComp.probability || 0;
          nestedUnitPrice += nestedCompValue * probability;
        } else if (nestedItem.itemType === '선택') {
          if (nestedComp.selected) {
            nestedUnitPrice += nestedCompValue;
          }
        }
      });
      return nestedUnitPrice;
    };
    
    return weeklyRewardsEditable.map((group) => {
      let groupTotal = 0;
      const items = group.items
        .filter(item => isNewFormatItem(item))
        .map(item => {
          // 묶음 항목 1개당 단가 계산
          let bundleUnitPrice = 0;
          const itemDetails: Array<{
            itemName: string;
            unitPrice: number;
            componentQuantity: number;
            bundleQuantity: number;
            probability?: number;
            value: number;
            isIncluded: boolean;
          }> = [];
          
          item.components.forEach(comp => {
            // 하위 묶음 항목 처리
            if (comp.itemName === '__nested__' && comp.nestedItem) {
              const nestedItemUnitPrice = calculateNestedItemValue(comp.nestedItem, 'gold');
              const nestedItemQuantity = comp.nestedItem.quantity || 1;
              const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
              
              const isIncluded = item.itemType === '확정' || 
                                (item.itemType === '확률') || 
                                (item.itemType === '선택' && comp.selected);
              
              if (isIncluded) {
                let value = nestedItemTotalValue;
                if (item.itemType === '확률' && comp.probability !== undefined) {
                  value *= comp.probability;
                }
                bundleUnitPrice += value;
                groupTotal += value * (item.quantity || 1);
                itemDetails.push({
                  itemName: '하위 묶음 항목',
                  unitPrice: nestedItemUnitPrice,
                  componentQuantity: nestedItemQuantity,
                  bundleQuantity: item.quantity || 1,
                  probability: item.itemType === '확률' ? comp.probability : undefined,
                  value: value * (item.quantity || 1),
                  isIncluded,
                });
              }
              return;
            }
            
            // 일반 구성요소 처리
            if (!comp.itemName || comp.itemName === '__manual__' || comp.itemName === '') return;
            const unitPrice = getItemUnitPrice(comp.itemName, comp);
            if (unitPrice === null) return;
            const isIncluded = item.itemType === '확정' || 
                              (item.itemType === '확률') || 
                              (item.itemType === '선택' && comp.selected);
            if (!isIncluded) return;
            let value = unitPrice * (comp.quantity || 0);
            if (item.itemType === '확률' && comp.probability !== undefined) {
              value *= comp.probability;
            }
            bundleUnitPrice += value;
            groupTotal += value * (item.quantity || 1);
            itemDetails.push({
              itemName: comp.itemName,
              unitPrice,
              componentQuantity: comp.quantity || 0,
              bundleQuantity: item.quantity || 1,
              probability: item.itemType === '확률' ? comp.probability : undefined,
              value: value * (item.quantity || 1),
              isIncluded,
            });
          });
          
          return {
            itemName: item.itemName,
            itemType: item.itemType,
            bundleQuantity: item.quantity || 1,
            bundleUnitPrice,
            details: itemDetails,
          };
        });
      return {
        groupTitle: group.title,
        groupTotal,
        items,
        };
      });
    }, [weeklyRewardsEditable, getItemUnitPrice]);

  // 누적보상 그룹별 상세 정보 계산 (누적보상 탭에서 사용하는 계산 로직과 동일)
  const cumulativeRewardsGroupDetails = useMemo(() => {
    // 하위 묶음 항목의 가치를 재귀적으로 계산하는 함수 (useMemo 내부에서 정의)
    const calculateNestedItemValue = (nestedItem: RewardItemNew, priceType: 'gold'): number => {
      let nestedUnitPrice = 0;
      nestedItem.components.forEach((nestedComp) => {
        if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
          const nestedNestedUnitPrice = calculateNestedItemValue(nestedComp.nestedItem, priceType);
          nestedUnitPrice += nestedNestedUnitPrice * (nestedComp.quantity || 1);
          return;
        }
        const isManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '';
        const unitPrice = !isManual && nestedComp.itemName ? getItemUnitPrice(nestedComp.itemName, nestedComp) : null;
        if (unitPrice === null) return;
        const isIncluded = nestedItem.itemType === '확정' || 
                          (nestedItem.itemType === '확률') || 
                          (nestedItem.itemType === '선택' && nestedComp.selected);
        if (!isIncluded) return;
        let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
        if (nestedItem.itemType === '확정') {
          nestedUnitPrice += nestedCompValue;
        } else if (nestedItem.itemType === '확률') {
          const probability = nestedComp.probability || 0;
          nestedUnitPrice += nestedCompValue * probability;
        } else if (nestedItem.itemType === '선택') {
          if (nestedComp.selected) {
            nestedUnitPrice += nestedCompValue;
          }
        }
      });
      return nestedUnitPrice;
    };
    
    return cumulativeRewardsEditable.map((group) => {
      let groupTotal = 0;
      const items = group.items
        .filter(item => isNewFormatItem(item))
        .map(item => {
          // 묶음 항목 1개당 단가 계산
          let bundleUnitPrice = 0;
          const itemDetails: Array<{
            itemName: string;
            unitPrice: number;
            componentQuantity: number;
            bundleQuantity: number;
            probability?: number;
            value: number;
            isIncluded: boolean;
          }> = [];
          
          item.components.forEach(comp => {
            // 하위 묶음 항목 처리
            if (comp.itemName === '__nested__' && comp.nestedItem) {
              const nestedItemUnitPrice = calculateNestedItemValue(comp.nestedItem, 'gold');
              const nestedItemQuantity = comp.nestedItem.quantity || 1;
              const nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
              
              const isIncluded = item.itemType === '확정' || 
                                (item.itemType === '확률') || 
                                (item.itemType === '선택' && comp.selected);
              
              if (isIncluded) {
                let value = nestedItemTotalValue;
                if (item.itemType === '확률' && comp.probability !== undefined) {
                  value *= comp.probability;
                }
                bundleUnitPrice += value;
                groupTotal += value * (item.quantity || 1);
                itemDetails.push({
                  itemName: '하위 묶음 항목',
                  unitPrice: nestedItemUnitPrice,
                  componentQuantity: nestedItemQuantity,
                  bundleQuantity: item.quantity || 1,
                  probability: item.itemType === '확률' ? comp.probability : undefined,
                  value: value * (item.quantity || 1),
                  isIncluded,
                });
              }
              return;
            }
            
            // 일반 구성요소 처리
            if (!comp.itemName || comp.itemName === '__manual__' || comp.itemName === '') return;
            const unitPrice = getItemUnitPrice(comp.itemName, comp);
            if (unitPrice === null) return;
            const isIncluded = item.itemType === '확정' || 
                              (item.itemType === '확률') || 
                              (item.itemType === '선택' && comp.selected);
            if (!isIncluded) return;
            let value = unitPrice * (comp.quantity || 0);
            if (item.itemType === '확률' && comp.probability !== undefined) {
              value *= comp.probability;
            }
            bundleUnitPrice += value;
            groupTotal += value * (item.quantity || 1);
            itemDetails.push({
              itemName: comp.itemName,
              unitPrice,
              componentQuantity: comp.quantity || 0,
              bundleQuantity: item.quantity || 1,
              probability: item.itemType === '확률' ? comp.probability : undefined,
              value: value * (item.quantity || 1),
              isIncluded,
            });
          });
          
          return {
            itemName: item.itemName,
            itemType: item.itemType,
            bundleQuantity: item.quantity || 1,
            bundleUnitPrice,
            details: itemDetails,
          };
        });
      return {
        groupTitle: group.title,
        groupTotal,
        items,
        };
      });
    }, [cumulativeRewardsEditable, getItemUnitPrice]);
  
  const kurzanStageOptions = useMemo<KurzanStageOption[]>(() => {
    return kurzanStages.map((stage, idx) => ({
      key: `${stage.level}-${stage.stage}-${idx}`,
      level: stage.level,
      stage: stage.stage,
      totalGold: stage.totalGold,
      breakthroughValue: stage.breakthroughValue ?? 0,
      fragmentValue: stage.fragmentValue ?? 0,
      cardExpValue: stage.cardExpValue ?? 0,
    }));
  }, [kurzanStages]);
  const [selectedKurzanKey, setSelectedKurzanKey] = useState<string>('');
  const [showPcBangBoxDetails, setShowPcBangBoxDetails] = useState(false);
  const [pcBangDetailEnabled, setPcBangDetailEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (kurzanStageOptions.length === 0) return;
    // 1720단계를 우선 찾고, 없으면 첫 번째 옵션 사용
    const defaultOption = kurzanStageOptions.find((opt) => opt.level === '1720') || kurzanStageOptions[0];
    if (!selectedKurzanKey || !kurzanStageOptions.some((opt) => opt.key === selectedKurzanKey)) {
      setSelectedKurzanKey(defaultOption.key);
    }
  }, [kurzanStageOptions, selectedKurzanKey]);

  const selectedKurzanStage = useMemo(() => {
    return kurzanStageOptions.find((opt) => opt.key === selectedKurzanKey) || null;
  }, [kurzanStageOptions, selectedKurzanKey]);

  // 글로벌 디코기준 스위치 상태 감지 (Navigation과 동일)
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

  const braceletUnitPrice = useMemo(() => {
    const val = parseFloat(braceletPriceInput);
    if (!Number.isNaN(val) && val > 0) return val;
    return null;
  }, [braceletPriceInput]);

  const legendaryCardSelectionUnitPrice = useMemo(() => {
    const val = parseFloat(legendaryCardSelectionPriceInput);
    if (!Number.isNaN(val) && val > 0) return val;
    return 50000;
  }, [legendaryCardSelectionPriceInput]);

  const totalDaysNumber = useMemo(() => {
    const val = parseFloat(totalDaysInput);
    if (!Number.isNaN(val) && val > 0) return val;
    return null;
  }, [totalDaysInput]);

  const totalWeeksNumber = useMemo(() => {
    const val = parseFloat(totalWeeksInput);
    if (!Number.isNaN(val) && val > 0) return val;
    return 7; // 기본값 7주
  }, [totalWeeksInput]);

  const totalHoursNumber = useMemo(() => {
    const val = parseFloat(totalHoursInput);
    if (!Number.isNaN(val) && val > 0) return val;
    return 70; // 기본값 70시간
  }, [totalHoursInput]);

  const daysPerWeek = useMemo(() => {
    if (totalDaysNumber == null) return null;
    return totalDaysNumber / 7;
  }, [totalDaysNumber]);

  const pcBangLuckyBoxQuantity = useMemo(() => {
    if (!totalDaysNumber || totalDaysNumber <= 0) return 0;
    return totalDaysNumber * 3;
  }, [totalDaysNumber]);

  const adjustedKurzanValue = useMemo(() => {
    // 상시 혜택의 쿠르잔 전선 보상은 가치계산DB의 "휴식 게이지 회복 비약" 가치의 2배 사용
    if (adjustedEntries && adjustedEntries.length > 0) {
      const restGaugePotion = adjustedEntries.find(entry => entry.itemName === '휴식 게이지 회복 비약');
      if (restGaugePotion && restGaugePotion.unitType === '골드' && restGaugePotion.unitValue != null) {
        return restGaugePotion.unitValue * 2;
      }
    }
    // fallback: 기존 로직 (쿠르잔 스테이지 가치)
    if (!selectedKurzanStage) return null;
    const base = selectedKurzanStage.totalGold ?? 0;
    const deduction =
      (!kurzanSwitches.breakthrough ? selectedKurzanStage.breakthroughValue : 0) +
      (!kurzanSwitches.fragment ? selectedKurzanStage.fragmentValue : 0) +
      (!kurzanSwitches.cardExp ? selectedKurzanStage.cardExpValue : 0);
    return Math.max(base - deduction, 0);
  }, [adjustedEntries, selectedKurzanStage, kurzanSwitches]);

  const handleKurzanSwitchToggle = (key: 'breakthrough' | 'fragment' | 'cardExp') => {
    setKurzanSwitches((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const togglePcBangDetail = (name: string) => {
    setPcBangDetailEnabled((prev) => ({
      ...prev,
      [name]: !(prev[name] ?? true),
    }));
  };

  const cashMode: 'exchange' | 'discord' = lightMode ? 'exchange' : 'discord';

  // 모든 시장 아이템 통합
  const allMarketItems = useMemo(() => {
    if (!marketCache) return [];
    const { tier4Results = [], tier3Results = [], gemResults = [], otherResults = [], relicEngravingResults = [] } = marketCache.data;
    return [...tier4Results, ...tier3Results, ...gemResults, ...otherResults, ...relicEngravingResults];
  }, [marketCache]);

  // 시장에서 아이템 가격 찾기
  const getMarketPrice = (itemName: string, grade?: string): number | null => {
    const item = allMarketItems.find(i => {
      const nameMatch = i.Name === itemName || i.displayName === itemName;
      if (grade) {
        return nameMatch && i.Grade === grade;
      }
      return nameMatch;
    });
    
    return item?.CurrentMinPrice ?? null;
  };

  // 아이템 가치 계산
  const goldToCashPerGold = useMemo(() => {
    if (cashMode === 'discord') {
      if (discordRate && discordRate > 0) return discordRate / 100;
      return null;
    }
    if (crystalGoldRate && crystalGoldRate > 0) return 2750 / crystalGoldRate;
    return null;
  }, [cashMode, discordRate, crystalGoldRate]);

  const convertCashToGold = useCallback(
    (cash: number | null) => {
      if (cash === null || !goldToCashPerGold || goldToCashPerGold <= 0) return null;
      return cash / goldToCashPerGold;
    },
    [goldToCashPerGold]
  );

  const convertCrystalToGold = useCallback(
    (crystalAmount: number | null) => {
      if (crystalAmount === null || !crystalGoldRate || crystalGoldRate <= 0) return null;
      return (crystalAmount * crystalGoldRate) / 100;
    },
    [crystalGoldRate]
  );

  const getItemPriceInfo = useCallback((itemName: string): PriceInfo => {
    const defaultResult: PriceInfo = { unit: null, unitAmount: null, goldEquivalent: null, cashEquivalent: null, note: null };

    // 실링, 배틀 아이템은 제외
    if (itemName === '실링' || itemName === '배틀 아이템 종합 상자') {
      return defaultResult;
    }

    // 0. 가치계산DB에서 먼저 찾기 (우선순위 - 가격 조정이 이미 적용된 데이터)
    if (adjustedEntries && adjustedEntries.length > 0) {
      const valueDbEntry = adjustedEntries.find(entry => entry.itemName === itemName);
      if (valueDbEntry && valueDbEntry.unitType === '골드' && valueDbEntry.unitValue != null) {
        return {
          unit: 'gold',
          unitAmount: valueDbEntry.unitValue,
          goldEquivalent: valueDbEntry.unitValue,
          cashEquivalent: null,
          note: valueDbEntry.note || null,
        };
      }
    }

    // 가격 조정을 적용하는 헬퍼 함수
    const applyPriceAdjustment = (priceInfo: PriceInfo): PriceInfo => {
      // 먼저 아이템 이름으로 가격 조정 확인 (originalPrice가 null이어도 작동)
      // 이는 카드경험치 미반영, 97돌 오우너, 풀유각 오우너 등을 처리
      const nameBasedAdjustment = adjustPrice(itemName, null);
      
      // 아이템 이름 기반으로 0이 되면 모든 단위를 0으로 설정
      if (nameBasedAdjustment === 0) {
        return {
          ...priceInfo,
          unitAmount: 0,
          goldEquivalent: 0,
          cashEquivalent: priceInfo.cashEquivalent != null ? 0 : null,
        };
      }
      
      // goldEquivalent가 있는 경우 가격 조정 적용
      if (priceInfo.goldEquivalent != null) {
        const adjustedGold = adjustPrice(itemName, priceInfo.goldEquivalent);
        if (adjustedGold === 0) {
          return {
            ...priceInfo,
            unitAmount: 0,
            goldEquivalent: 0,
            cashEquivalent: priceInfo.cashEquivalent != null ? 0 : null,
          };
        }
        return {
          ...priceInfo,
          goldEquivalent: adjustedGold,
          unitAmount: priceInfo.unit === 'gold' ? adjustedGold : priceInfo.unitAmount,
        };
      }
      
      // 현금 단위인 경우: nameBasedAdjustment가 0이면 이미 위에서 처리됨
      // 여기서는 nameBasedAdjustment가 0이 아닌 경우이므로 원래 가격 유지
      
      return priceInfo;
    };

    // 1. etc_list에서 찾기
    if (itemName === '팔찌 효과 재변환권') {
      const value = braceletUnitPrice ?? 100;
      return applyPriceAdjustment({
        unit: 'gold',
        unitAmount: value,
        goldEquivalent: value,
        cashEquivalent: null,
        note: '사용자 입력 단가',
      });
    }

    if (itemName === '전설 카드 선택팩' || itemName === '도약의 전설 카드 선택팩') {
      const value = legendaryCardSelectionUnitPrice;
      return applyPriceAdjustment({
        unit: 'gold',
        unitAmount: value,
        goldEquivalent: value,
        cashEquivalent: null,
        note: '사용자 입력 단가',
      });
    }

    if (itemName === '전설 카드팩') {
      const unitAmount = 575;
      const goldEquivalent =
        crystalGoldRate && crystalGoldRate > 0 ? (unitAmount * crystalGoldRate) / 100 : null;
      return applyPriceAdjustment({
        unit: 'crystal',
        unitAmount,
        goldEquivalent,
        cashEquivalent: null,
        note: '크리스탈 시세 기준',
      });
    }

    const etcItem = etcListItems.find(item => item.itemName === itemName);
    if (etcItem) {
      const hasOriginalGold = etcItem.originalGold !== null;
      const hasCrystalOnly = !hasOriginalGold && etcItem.originalCrystal !== null;

      if (hasCrystalOnly) {
        return applyPriceAdjustment({
          unit: 'crystal',
          unitAmount: etcItem.crystal ?? etcItem.originalCrystal,
          goldEquivalent: etcItem.gold,
          cashEquivalent: null,
          note: null,
        });
      }

      if (etcItem.gold !== null) {
        return applyPriceAdjustment({
          unit: 'gold',
          unitAmount: etcItem.gold,
          goldEquivalent: etcItem.gold,
          cashEquivalent: null,
          note: null,
        });
      }

      if (etcItem.cash !== null) {
        // 현금 단위인 경우에도 가격 조정 적용
        const priceInfo = {
          unit: 'cash' as const,
          unitAmount: etcItem.cash,
          goldEquivalent: null,
          cashEquivalent: etcItem.cash,
          note: null,
        };
        return applyPriceAdjustment(priceInfo);
      }
    }

    // 2. 시장 캐시에서 직접 찾기
    const marketPrice = getMarketPrice(itemName);
    if (marketPrice !== null) {
      return applyPriceAdjustment({
        unit: 'gold',
        unitAmount: marketPrice,
        goldEquivalent: marketPrice,
        cashEquivalent: null,
        note: null,
      });
    }

    // 3. 계산식에 따라 가격 산정
    const tier4GemNames = [
      '질서의 젬 : 불변',
      '질서의 젬 : 견고',
      '질서의 젬 : 안정',
      '혼돈의 젬 : 침식',
      '혼돈의 젬 : 왜곡',
      '혼돈의 젬 : 붕괴',
    ];

    const getTier4GemAverage = (grade: string): number | null => {
      const prices: number[] = [];
      tier4GemNames.forEach(name => {
        const item = allMarketItems.find(i =>
          i.Grade === grade &&
          (i.Name === name || i.displayName === name)
        );
        if (item?.CurrentMinPrice && item.CurrentMinPrice > 0) {
          prices.push(item.CurrentMinPrice);
        }
      });
      if (prices.length === 0) return null;
      const sum = prices.reduce((acc, cur) => acc + cur, 0);
      return sum / prices.length;
    };

    switch (itemName) {
      case '운명의 수호석 주머니': {
        const price = getMarketPrice('운명의 수호석');
        if (price === null) return defaultResult;
        const perUnit = price / 100; // 100개 묶음 기준 → 1개 단가
        const value = perUnit * 75;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '운명의 파괴석 주머니': {
        const price = getMarketPrice('운명의 파괴석');
        if (price === null) return defaultResult;
        const perUnit = price / 100;
        const value = perUnit * 75;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '재련 돌파석 선택 상자': {
        const price = getMarketPrice('운명의 돌파석');
        if (price === null) return defaultResult;
        const value = price * 5;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '고급~영웅 젬 상자': {
        const advancedAvg = getTier4GemAverage('고급');
        const rareAvg = getTier4GemAverage('희귀');
        const heroicAvg = getTier4GemAverage('영웅');

        if (!advancedAvg && !rareAvg && !heroicAvg) return defaultResult;

        const value =
          (advancedAvg ?? 0) * 0.8 +
          (rareAvg ?? 0) * 0.15 +
          (heroicAvg ?? 0) * 0.05;
        return applyPriceAdjustment({
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note: null,
        });
      }
      
      case '재련 보조 선택 상자': {
        const lavaPrice = getMarketPrice('용암의 숨결');
        const icePrice = getMarketPrice('빙하의 숨결');
        
        if (lavaPrice === null && icePrice === null) return defaultResult;
        
        const lavaValue = lavaPrice !== null ? lavaPrice * 3 : 0;
        const iceValue = icePrice !== null ? icePrice * 9 : 0;
        
        const value = Math.max(lavaValue, iceValue);
        if (value <= 0) return defaultResult;
        const note =
          value === lavaValue
            ? `용암의 숨결 기준 (3개)`
            : `빙하의 숨결 기준 (9개)`;
        return applyPriceAdjustment({
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note,
        });
      }
      
      case '재련 파편 선택 상자': {
        const price = getMarketPrice('운명의 파편 주머니(소)');
        if (price === null) return defaultResult;
        const value = price * 2;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '[이벤트] 재봉술 선택 상자': {
        const option1 = getMarketPrice('재봉술 : 업화 [15-18]');
        const option2 = getMarketPrice('재봉술 : 업화 [11-14]');
        const option3 = getMarketPrice('장인의 재봉술 : 2단계');
        const option4 = getMarketPrice('장인의 재봉술 : 1단계');
        
        const prices = [
          option1 !== null ? option1 * 1 : 0,
          option2 !== null ? option2 * 2 : 0,
          option3 !== null ? option3 * 1 : 0,
          option4 !== null ? option4 * 2 : 0,
        ].filter(p => p > 0);
        
        if (prices.length === 0) return defaultResult;
        const value = Math.max(...prices);
        const noteIndex = prices.indexOf(value);
        const noteMap = [
          '재봉술 : 업화 [15-18] ×1 기준',
          '재봉술 : 업화 [11-14] ×2 기준',
          '장인의 재봉술 : 2단계 ×1 기준',
          '장인의 재봉술 : 1단계 ×2 기준',
        ];
        const note = noteMap[noteIndex] || null;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null, note });
      }
      
      case '[이벤트] 야금술 선택 상자': {
        const option1 = getMarketPrice('야금술 : 업화 [15-18]');
        const option2 = getMarketPrice('야금술 : 업화 [11-14]');
        const option3 = getMarketPrice('장인의 야금술 : 2단계');
        const option4 = getMarketPrice('장인의 야금술 : 1단계');
        
        const prices = [
          option1 !== null ? option1 * 1 : 0,
          option2 !== null ? option2 * 2 : 0,
          option3 !== null ? option3 * 1 : 0,
          option4 !== null ? option4 * 2 : 0,
        ].filter(p => p > 0);
        
        if (prices.length === 0) return defaultResult;
        const value = Math.max(...prices);
        const noteIndex = prices.indexOf(value);
        const noteMap = [
          '야금술 : 업화 [15-18] ×1 기준',
          '야금술 : 업화 [11-14] ×2 기준',
          '장인의 야금술 : 2단계 ×1 기준',
          '장인의 야금술 : 1단계 ×2 기준',
        ];
        const note = noteMap[noteIndex] || null;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null, note });
      }
      
      case '재련 융화 재료 선택 상자': {
        const price = getMarketPrice('아비도스 융화 재료');
        if (price === null) return defaultResult;
        const value = price * 5;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '유물 각인서 선택 주머니': {
        const relicEngravings = allMarketItems.filter(
          (i) => i.Grade === '유물' && i.tier === '유물 각인서'
        );
        if (relicEngravings.length === 0) return defaultResult;
        const prices = relicEngravings
          .map((e) => e.CurrentMinPrice || 0)
          .filter((value) => value > 0);
        if (prices.length === 0) return defaultResult;
        const value = Math.max(...prices);
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }

      case '정련된 운명의 돌': {
        const value = 1000;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '유물 각인서 랜덤 주머니': {
        const relicEngravings = allMarketItems.filter(i => i.Grade === '유물' && i.tier === '유물 각인서');
        if (relicEngravings.length === 0) return defaultResult;
        
        const total = relicEngravings.reduce((sum, e) => sum + (e.CurrentMinPrice || 0), 0);
        const value = total / relicEngravings.length;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '고결한 혼돈의 돌 선택 상자': {
        const value = chaosStoneQuality === 90 ? 117647 : 266667;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }
      
      case '고결한 혼돈의 돌 (무기)': {
        const value = chaosStoneQuality === 90 ? 117647 : 266667;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }

      case '고결한 혼돈의 돌 (방어구)': {
        const value = chaosStoneQuality === 90 ? 44118 : 100000;
        return applyPriceAdjustment({ unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null });
      }

      case '희귀~영웅 젬 상자': {
        const rareAvg = getTier4GemAverage('희귀');
        const heroicAvg = getTier4GemAverage('영웅');

        if (!rareAvg && !heroicAvg) return defaultResult;
        const value = (rareAvg ?? 0) * 0.9 + (heroicAvg ?? 0) * 0.1;
        return applyPriceAdjustment({
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note: null,
        });
      }

      case '운명의 파편': {
        const fragmentPrice = getMarketPrice('운명의 파편 주머니(소)');
        if (fragmentPrice === null) return defaultResult;
        const perFragment = fragmentPrice / 1000;
        return applyPriceAdjustment({
          unit: 'gold',
          unitAmount: perFragment,
          goldEquivalent: perFragment,
          cashEquivalent: null,
        });
      }
      
      default:
        return defaultResult;
    }
  }, [adjustPrice, etcListItems, allMarketItems, getMarketPrice, crystalGoldRate, braceletUnitPrice, legendaryCardSelectionUnitPrice, chaosStoneQuality, priceOverrideState, adjustedEntries]);

  const formatCount = (value: number) => formatNumberWithSignificantDigits(value);

  const getCompositionInfo = (itemName: string, quantity: number) => {
    switch (itemName) {
      case '운명의 수호석 주머니': {
        const perUnit = '운명의 수호석 75개';
        const total = `운명의 수호석 ${formatCount(75 * quantity)}개`;
        return { perUnit, total };
      }
      case '운명의 파괴석 주머니': {
        const perUnit = '운명의 파괴석 75개';
        const total = `운명의 파괴석 ${formatCount(75 * quantity)}개`;
        return { perUnit, total };
      }
      case '재련 돌파석 선택 상자': {
        const perUnit = '운명의 돌파석 5개';
        const total = `운명의 돌파석 ${formatCount(5 * quantity)}개`;
        return { perUnit, total };
      }
      case '재련 파편 선택 상자': {
        const perUnit = '운명의 파편 2,000개';
        const total = `운명의 파편 ${formatCount(2000 * quantity)}개`;
        return { perUnit, total };
      }
      case '재련 융화 재료 선택 상자': {
        const perUnit = '아비도스 융화 재료 5개';
        const total = `아비도스 융화 재료 ${formatCount(5 * quantity)}개`;
        return { perUnit, total };
      }
      case '재련 보조 선택 상자': {
        const perUnit = '용암의 숨결 3개 vs 빙하의 숨결 9개';
        const total = `용암 ${formatCount(3 * quantity)}개 vs 빙하 ${formatCount(9 * quantity)}개`;
        return { perUnit, total };
      }
      case '고급~영웅 젬 상자': {
        const perUnit = '고급80% + 희귀15% + 영웅5%';
        return { perUnit, total: null };
      }
      case '희귀~영웅 젬 상자': {
        const perUnit = '희귀90% + 영웅10% (가중 평균)';
        return { perUnit, total: null };
      }
      case '[이벤트] 재봉술 선택 상자': {
        const perUnit = '업화 15-18 ×1 vs 업화 11-14 ×2 vs 장인 2단계 ×1 vs 장인 1단계 ×2';
        return { perUnit, total: null };
      }
      case '[이벤트] 야금술 선택 상자': {
        const perUnit = '업화 15-18 ×1 vs 업화 11-14 ×2 vs 장인 2단계 ×1 vs 장인 1단계 ×2';
        return { perUnit, total: null };
      }
      case '유물 각인서 랜덤 주머니': {
        const perUnit = '유물 각인서 43종 평균';
        return { perUnit, total: null };
      }
      case PC_BANG_LUCKY_SUMMARY_NAME: {
        const perUnit = '상세 구성 기대값';
        const total = `총 진행 일수 × 3 = ${formatCount(quantity)}개`;
        return { perUnit, total };
      }
      default:
        return { perUnit: null, total: null };
    }
  };

  const formatPriceDisplay = (amount: number | null, unit: 'gold' | 'crystal' | 'cash' | null) => {
    if (amount === null || !unit) return '-';
    const formatted = formatNumberWithSignificantDigits(amount);
    if (unit === 'gold') return `${formatted}골드`;
    if (unit === 'crystal') return `${formatted}크리`;
    return `${formatted}원`;
  };

  // weeklyRewards와 cumulativeRewards는 이제 상태로 관리됨 (weeklyRewardsEditable, cumulativeRewardsEditable)
  const weeklyRewards = weeklyRewardsEditable;
  const cumulativeRewards = cumulativeRewardsEditable;

  const pcBangLuckyBoxDetails = useMemo(
    () => [
      { displayName: '유물 각인서 선택 주머니', itemName: '유물 각인서 선택 주머니', probability: 0.001, quantity: 1, chanceText: '0.1%' },
      { displayName: '고결한 혼돈의 돌 (무기)', itemName: '고결한 혼돈의 돌 (무기)', probability: 0.001, quantity: 1, chanceText: '0.1%' },
      { displayName: '고결한 혼돈의 돌 (방어구)', itemName: '고결한 혼돈의 돌 (방어구)', probability: 0.003, quantity: 1, chanceText: '0.3%' },
      { displayName: '도약의 전설 카드 선택팩', itemName: '전설 카드 선택팩', probability: 0.005, quantity: 1, chanceText: '0.5%' },
      { displayName: '팔찌 효과 재변환권 3개', itemName: '팔찌 효과 재변환권', probability: 0.015, quantity: 3, chanceText: '1.5%' },
      { displayName: '전설 카드팩', itemName: '전설 카드팩', probability: 0.03, quantity: 1, chanceText: '3%' },
      { displayName: '[이벤트] 재봉술 선택 상자', itemName: '[이벤트] 재봉술 선택 상자', probability: 0.05, quantity: 1, chanceText: '5%' },
      { displayName: '[이벤트] 야금술 선택 상자', itemName: '[이벤트] 야금술 선택 상자', probability: 0.05, quantity: 1, chanceText: '5%' },
      { displayName: '전설~영웅 카드팩', itemName: '전설~영웅 카드팩', probability: 0.065, quantity: 1, chanceText: '6.5%' },
      { displayName: '도약의 정수x2', itemName: '도약의 정수', probability: 0.065, quantity: 2, chanceText: '6.5%' },
      { displayName: '영웅 카드 선택팩', itemName: '영웅 카드 선택팩', probability: 0.065, quantity: 1, chanceText: '6.5%' },
      { displayName: '희귀 카드 선택팩x2', itemName: '희귀 카드 선택팩', probability: 0.065, quantity: 2, chanceText: '6.5%' },
      { displayName: '고급 카드 선택팩x3', itemName: '고급 카드 선택팩', probability: 0.065, quantity: 3, chanceText: '6.5%' },
      { displayName: '일반 카드 선택팩x3', itemName: '일반 카드 선택팩', probability: 0.065, quantity: 3, chanceText: '6.5%' },
      { displayName: '메넬리크의 서x2', itemName: '메넬리크의 서', probability: 0.065, quantity: 2, chanceText: '6.5%' },
      { displayName: '페온x3', itemName: '페온', probability: 0.065, quantity: 3, chanceText: '6.5%' },
      { displayName: '운명의 파편 6000개', itemName: '운명의 파편', probability: 0.065, quantity: 6000, chanceText: '6.5%' },
      { displayName: '빙하의 숨결x10', itemName: '빙하의 숨결', probability: 0.065, quantity: 10, chanceText: '6.5%' },
      { displayName: '용암의 숨결x3', itemName: '용암의 숨결', probability: 0.065, quantity: 3, chanceText: '6.5%' },
    ],
    []
  );

  useEffect(() => {
    setPcBangDetailEnabled((prev) => {
      const updated = { ...prev };
      let changed = false;
      pcBangLuckyBoxDetails.forEach((detail) => {
        if (updated[detail.displayName] === undefined) {
          updated[detail.displayName] = true;
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [pcBangLuckyBoxDetails]);

  const dailyBenefits: RewardGroup[] = [
    {
      title: '카오스 던전/쿠르잔 전선 1회 공짜',
      items: [
        { name: '쿠르잔 전선 보상 (휴식게이지 2배)', quantity: 1, type: 'kurzan' },
      ],
    },
    {
      title: 'PC방 행운의 상자 (매일 최대 3개)',
      items: [
        { name: 'PC방 행운의 상자 (30분)', quantity: 1, excludeFromSummary: true },
        { name: 'PC방 행운의 상자 (60분)', quantity: 2, excludeFromSummary: true },
      ],
    },
  ];

  const pcBangLuckyBoxExpectedGold = useMemo(() => {
    let sum = 0;
    pcBangLuckyBoxDetails.forEach((detail) => {
      const enabled = pcBangDetailEnabled[detail.displayName] ?? true;
      if (!enabled) return;
      const priceInfo = getItemPriceInfo(detail.itemName);
      let goldValue = priceInfo.goldEquivalent;

      if (goldValue == null && priceInfo.cashEquivalent !== null) {
        goldValue = convertCashToGold(priceInfo.cashEquivalent);
      }

      if (goldValue == null && priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null) {
        goldValue = convertCrystalToGold(priceInfo.unitAmount);
      }

      if (goldValue != null) {
        sum += goldValue * detail.quantity * detail.probability;
      }
    });
    return sum > 0 ? sum : null;
  }, [
    pcBangLuckyBoxDetails,
    getItemPriceInfo,
    convertCashToGold,
    convertCrystalToGold,
    etcListItems,
    braceletUnitPrice,
    legendaryCardSelectionUnitPrice,
    chaosStoneQuality,
    allMarketItems,
    pcBangDetailEnabled,
    adjustedEntries,
  ]);

  const aggregateRewards = useMemo(() => {
    const weeklyFactor = totalWeeksNumber; // 주수 동안 매주 주간 보상 수령
    const dailyFactor = totalDaysNumber ?? 0;
    const aggregatedMap = new Map<string, AggregatedReward>();

    // RewardItemNew 구조 처리: 각 컴포넌트를 개별 아이템으로 추가
    const addItemNew = (item: RewardItemNew, multiplier: number, isWeekly: boolean, category: 'weekly' | 'cumulative' | 'daily') => {
      if (item.excludeFromSummary) return;
      
      item.components.forEach(comp => {
        if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return;
        
        // 확정/확률/선택 타입에 따른 포함 여부 확인
        const isIncluded = item.itemType === '확정' || 
                          (item.itemType === '확률' && comp.probability !== undefined) ||
                          (item.itemType === '선택' && comp.selected);
        
        if (!isIncluded) return;
        
        // 확률 타입일 경우 확률 적용
        const probabilityMultiplier = item.itemType === '확률' && comp.probability !== undefined ? comp.probability : 1;
        
        // 수량 계산: 컴포넌트 수량 × 아이템 수량 × 주수(주간인 경우) × 확률
        const quantity = comp.quantity * item.quantity * multiplier * probabilityMultiplier;
        
        const key = comp.itemName;
        const existing = aggregatedMap.get(key);
        
        if (existing) {
          existing.quantity += quantity;
        } else {
          aggregatedMap.set(key, {
            name: comp.itemName,
            quantity,
            perUnitNote: null,
            isWeekly,
            category,
          });
        }
      });
    };

    // 기존 RewardItemLegacy 구조 처리 (하위 호환성)
    const addItemLegacy = (item: RewardItemLegacy, multiplier: number, isWeekly: boolean, category: 'weekly' | 'cumulative' | 'daily') => {
      if (item.excludeFromSummary) return;
      const key = item.name;
      const quantity = item.quantity * multiplier;
      const existing = aggregatedMap.get(key);

      if (existing) {
        existing.quantity += quantity;
      } else {
        aggregatedMap.set(key, {
          name: item.name,
          quantity,
          perUnitNote: null,
          isWeekly,
          category,
        });
      }
    };

    weeklyRewards.forEach(group => {
      group.items.forEach(item => {
        if (isNewFormatItem(item)) {
          addItemNew(item, weeklyFactor, true, 'weekly');
        } else {
          addItemLegacy(item, weeklyFactor, true, 'weekly');
        }
      });
    });

    cumulativeRewards.forEach(group => {
      group.items.forEach(item => {
        if (isNewFormatItem(item)) {
          addItemNew(item, 1, false, 'cumulative');
        } else {
          addItemLegacy(item, 1, false, 'cumulative');
        }
      });
    });

    if (dailyFactor > 0) {
      dailyBenefits.forEach(group => {
        group.items.forEach(item => {
          if (isNewFormatItem(item)) {
            addItemNew(item, dailyFactor, false, 'daily');
          } else {
            addItemLegacy(item, dailyFactor, false, 'daily');
          }
        });
      });
    }

    const aggregatedList = Array.from(aggregatedMap.values());

    if (pcBangLuckyBoxQuantity > 0) {
      aggregatedList.push({
        name: PC_BANG_LUCKY_SUMMARY_NAME,
        quantity: pcBangLuckyBoxQuantity,
        perUnitNote: '총 진행 일수 × 3개',
        isWeekly: false,
        category: 'daily',
      });
    }

    return aggregatedList;
  }, [weeklyRewards, cumulativeRewards, dailyBenefits, totalDaysNumber, totalWeeksNumber, pcBangLuckyBoxQuantity]);

  useEffect(() => {
    setEnabledRewards((prev) => {
      const updated = { ...prev };
      let changed = false;
      aggregateRewards.forEach((item) => {
        if (updated[item.name] === undefined) {
          updated[item.name] = true;
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [aggregateRewards]);

  const toggleReward = (name: string) => {
    setEnabledRewards((prev) => ({
      ...prev,
      [name]: !(prev[name] ?? true),
    }));
  };

  const aggregateTotals = useMemo(() => {
    const totalGold = aggregateRewards.reduce((sum, item) => {
      const enabled = enabledRewards[item.name] ?? true;
      if (!enabled) return sum;
      if (item.name === '쿠르잔 전선 보상 (휴식게이지 2배)') {
        if (adjustedKurzanValue != null) {
          return sum + adjustedKurzanValue * item.quantity;
        }
        return sum;
      }
      if (item.name === PC_BANG_LUCKY_SUMMARY_NAME) {
        if (pcBangLuckyBoxExpectedGold != null) {
          return sum + pcBangLuckyBoxExpectedGold * item.quantity;
        }
        return sum;
      }
      const priceInfo = getItemPriceInfo(item.name);
      let goldValue: number | null = null;
      if (priceInfo.goldEquivalent !== null) {
        goldValue = priceInfo.goldEquivalent;
      } else if (priceInfo.cashEquivalent !== null) {
        goldValue = convertCashToGold(priceInfo.cashEquivalent);
      }
      if (goldValue !== null) {
        return sum + goldValue * item.quantity;
      }
      return sum;
    }, 0);

    const goldToCash = goldToCashPerGold ? totalGold * goldToCashPerGold : null;
    const hours = totalHoursNumber;

    return {
      totalGold,
      totalCash: goldToCash,
      hourlyGold: hours > 0 ? totalGold / hours : null,
      hourlyCash: goldToCash && hours > 0 ? goldToCash / hours : null,
    };
  }, [aggregateRewards, enabledRewards, getItemPriceInfo, goldToCashPerGold, adjustedKurzanValue, pcBangLuckyBoxExpectedGold, totalHoursNumber]);

  // 주간/누적 보상 편집 핸들러 (과금 효율과 동일한 로직)
  const handleAddRewardGroup = useCallback((type: 'weekly' | 'cumulative') => {
    const newGroup: RewardGroup = {
      title: '새로운 보상',
      items: [],
    };
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => [...prev, newGroup]);
    } else {
      setCumulativeRewardsEditable(prev => [...prev, newGroup]);
    }
  }, []);

  const handleRemoveRewardGroup = useCallback((type: 'weekly' | 'cumulative', groupIndex: number) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.filter((_, idx) => idx !== groupIndex));
    } else {
      setCumulativeRewardsEditable(prev => prev.filter((_, idx) => idx !== groupIndex));
    }
  }, []);

  const handleUpdateGroupTitle = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, newTitle: string) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, title: newTitle } : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, title: newTitle } : group
      ));
    }
  }, []);

  // 묶음 항목 추가 (과금 효율과 동일)
  const handleAddRewardItem = useCallback((type: 'weekly' | 'cumulative', groupIndex: number) => {
    const newItem: RewardItemNew = {
      itemName: '새 묶음 항목',
      itemType: '확정',
      quantity: 1,
      components: [],
    };
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, items: [...group.items, newItem] } : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, items: [...group.items, newItem] } : group
      ));
    }
  }, []);

  // 묶음 항목 제거
  const handleRemoveRewardItem = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, itemIndex: number) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, items: group.items.filter((_, iIdx) => iIdx !== itemIndex) } : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex ? { ...group, items: group.items.filter((_, iIdx) => iIdx !== itemIndex) } : group
      ));
    }
  }, []);

  // 묶음 항목 업데이트
  const handleUpdateRewardItem = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, itemIndex: number, field: keyof RewardItemNew, value: any) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex 
          ? { 
              ...group, 
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item) ? { ...item, [field]: value } : item
              ) 
            }
          : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, idx) => 
        idx === groupIndex 
          ? { 
              ...group, 
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item) ? { ...item, [field]: value } : item
              ) 
            }
          : group
      ));
    }
  }, []);

  // 구성 요소 추가
  const handleAddComponent = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, itemIndex: number) => {
    const newComponent: ComponentItem = {
      itemName: '',
      quantity: 1,
    };
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { ...item, components: [...item.components, newComponent] }
                  : item
              )
            }
          : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { ...item, components: [...item.components, newComponent] }
                  : item
              )
            }
          : group
      ));
    }
  }, []);

  // 구성 요소 제거
  const handleRemoveComponent = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, itemIndex: number, compIndex: number) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { ...item, components: item.components.filter((_, cIdx) => cIdx !== compIndex) }
                  : item
              )
            }
          : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { ...item, components: item.components.filter((_, cIdx) => cIdx !== compIndex) }
                  : item
              )
            }
          : group
      ));
    }
  }, []);

  // 구성 요소 업데이트
  const handleUpdateComponent = useCallback((type: 'weekly' | 'cumulative', groupIndex: number, itemIndex: number, compIndex: number, field: keyof ComponentItem, value: any) => {
    if (type === 'weekly') {
      setWeeklyRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { 
                      ...item, 
                      components: item.components.map((comp, cIdx) => 
                        cIdx === compIndex ? { ...comp, [field]: value } : comp
                      ) 
                    }
                  : item
              )
            }
          : group
      ));
    } else {
      setCumulativeRewardsEditable(prev => prev.map((group, gIdx) => 
        gIdx === groupIndex 
          ? {
              ...group,
              items: group.items.map((item, iIdx) => 
                iIdx === itemIndex && isNewFormatItem(item)
                  ? { 
                      ...item, 
                      components: item.components.map((comp, cIdx) => 
                        cIdx === compIndex ? { ...comp, [field]: value } : comp
                      ) 
                    }
                  : item
              )
            }
          : group
      ));
    }
  }, []);

  // 이벤트 효율 저장
  const handleSaveEventEfficiency = async () => {
    // eventName이 없으면 저장 불가
    if (!eventName.trim()) {
      alert('이벤트명을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const name = eventName.trim();
      console.log('[이벤트 효율 저장] 저장할 이름:', name);
      console.log('[이벤트 효율 저장] 선택된 ID:', selectedEventEfficiencyId);
      
      let res;
      if (selectedEventEfficiencyId) {
        // 업데이트
        res = await fetch(`/api/event-efficiency/${selectedEventEfficiencyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            weekly_rewards: weeklyRewardsEditable,
            cumulative_rewards: cumulativeRewardsEditable,
            end_date: endDate || null,
            total_weeks: totalWeeksInput ? parseFloat(totalWeeksInput) || null : null,
            total_hours: totalHoursInput ? parseFloat(totalHoursInput) || null : null,
          }),
        });
      } else {
        // 새로 저장
        res = await fetch('/api/event-efficiency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            weekly_rewards: weeklyRewardsEditable,
            cumulative_rewards: cumulativeRewardsEditable,
            end_date: endDate || null,
            total_weeks: totalWeeksInput ? parseFloat(totalWeeksInput) || null : null,
            total_hours: totalHoursInput ? parseFloat(totalHoursInput) || null : null,
          }),
        });
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      // 저장된 이벤트 효율 목록 다시 불러오기
      const listRes = await fetch('/api/event-efficiency');
      const listData = await listRes.json();
      if (listData.items) {
        console.log('[이벤트 효율 저장] 불러온 목록:', listData.items.map((item: any) => ({ id: item.id, name: item.name })));
        setSavedEventEfficiency(listData.items);
        if (data.item) {
          setSelectedEventEfficiencyId(data.item.id);
        }
      }

      alert(selectedEventEfficiencyId ? '이벤트 효율이 업데이트되었습니다.' : '이벤트 효율이 저장되었습니다.');
    } catch (error: any) {
      console.error('이벤트 효율 저장 실패:', error);
      alert(error.message || '이벤트 효율 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 저장된 이벤트 효율 불러오기
  const handleLoadEventEfficiency = async (itemId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/event-efficiency');
      const data = await res.json();
      
      if (data.items) {
        const itemToLoad = data.items.find((item: any) => item.id === itemId);
        if (itemToLoad) {
          if (itemToLoad.weekly_rewards) {
            setWeeklyRewardsEditable(itemToLoad.weekly_rewards);
          }
          if (itemToLoad.cumulative_rewards) {
            setCumulativeRewardsEditable(itemToLoad.cumulative_rewards);
          }
          // 이벤트명과 종료일도 불러오기
          if (itemToLoad.name) {
            setEventName(itemToLoad.name);
          }
          if (itemToLoad.end_date) {
            setEndDate(itemToLoad.end_date);
          } else {
            setEndDate('');
          }
          if (itemToLoad.total_weeks != null) {
            setTotalWeeksInput(itemToLoad.total_weeks.toString());
          } else {
            setTotalWeeksInput('7');
          }
          if (itemToLoad.total_hours != null) {
            setTotalHoursInput(itemToLoad.total_hours.toString());
          } else {
            setTotalHoursInput('70');
          }
          setSelectedEventEfficiencyId(itemId);
          setShowBasicInfo(true); // 이벤트를 불러올 때 기본정보 카드 표시
          alert('이벤트 효율이 불러와졌습니다.');
        } else {
          throw new Error('이벤트 효율을 찾을 수 없습니다.');
        }
      }
    } catch (error: any) {
      console.error('이벤트 효율 불러오기 실패:', error);
      alert(error.message || '이벤트 효율 불러오기에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 이벤트 효율 삭제
  const handleDeleteEventEfficiency = async (itemId: string) => {
    if (!confirm('이 이벤트 효율을 삭제하시겠습니까?')) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/event-efficiency/${itemId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }

      // 저장된 이벤트 효율 목록 다시 불러오기
      const listRes = await fetch('/api/event-efficiency');
      const listData = await listRes.json();
      if (listData.items) {
        setSavedEventEfficiency(listData.items);
      }

      if (selectedEventEfficiencyId === itemId) {
        setSelectedEventEfficiencyId(null);
      }

      alert('이벤트 효율이 삭제되었습니다.');
    } catch (error: any) {
      console.error('이벤트 효율 삭제 실패:', error);
      alert(error.message || '이벤트 효율 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 새로 만들기 (초기화)
  const handleNewEventEfficiency = () => {
    const hasWeeklyData = weeklyRewardsEditable.length > 0;
    const hasCumulativeData = cumulativeRewardsEditable.length > 0;
    
    if (hasWeeklyData || hasCumulativeData) {
      if (!confirm('현재 작성 중인 내용이 있습니다. 새로 만들기를 하시겠습니까?')) {
        return;
      }
    }
    
    // 빈 상태로 초기화 (과금 효율과 동일)
    setWeeklyRewardsEditable([]);
    setCumulativeRewardsEditable([]);
    setSelectedEventEfficiencyId(null);
    setEventName('');
    setEndDate('');
    setTotalWeeksInput('7');
    setTotalHoursInput('70');
    setShowBasicInfo(true); // 새로 만들기 버튼 클릭 시 기본정보 카드 표시
  };

  // 레거시 함수 - 사용되지 않음 (renderEditableRewardTableNew 사용)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _renderEditableRewardTable = (groups: RewardGroup[], type: 'weekly' | 'cumulative', sectionTitle: string, summaryLabel?: string) => {
    const totalGold = groups.reduce((sumSection, group) => {
      return (
        sumSection +
        group.items.reduce((sum, item) => {
          if (item.type === 'kurzan') {
            const goldValue = adjustedKurzanValue;
            return goldValue != null ? sum + goldValue * item.quantity : sum;
          }
          const itemName = getItemName(item);
          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
          if (isPcBangLuckyBox) {
            return pcBangLuckyBoxExpectedGold != null
              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
              : sum;
          }
          const priceInfo = getItemPriceInfo(itemName);
          let goldValue: number | null = null;
          if (priceInfo.goldEquivalent !== null) {
            goldValue = priceInfo.goldEquivalent;
          } else if (priceInfo.cashEquivalent !== null) {
            goldValue = convertCashToGold(priceInfo.cashEquivalent);
          }
          return goldValue != null ? sum + goldValue * item.quantity : sum;
        }, 0)
      );
    }, 0);
    const sectionTotals = {
      totalGold,
      totalCash: goldToCashPerGold ? totalGold * goldToCashPerGold : null,
    };

    return (
      <div className="space-y-6">
        {/* 섹션 제목 */}
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl px-5 py-4 shadow-lg flex justify-between items-center">
          <h3 className="text-xl font-bold text-white tracking-wide">{sectionTitle}</h3>
          <button
            onClick={() => handleAddRewardGroup(type)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + 보상 그룹 추가
          </button>
        </div>
        
        {/* 섹션 요약 */}
        {summaryLabel && (
          <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border-2 border-yellow-500/40 rounded-xl px-5 py-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-bold text-lg text-white">{summaryLabel}</span>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-gray-300">총합:</span>
                  <span className="text-yellow-300 font-bold text-lg">
                    {sectionTotals.totalGold > 0
                      ? `${formatNumberWithSignificantDigits(sectionTotals.totalGold)}골드`
                      : '-'}
                  </span>
                </span>
                {sectionTotals.totalCash && (
                  <span className="text-green-300 font-bold text-lg">
                    ≈ {formatNumberWithSignificantDigits(sectionTotals.totalCash)}원
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="bg-gray-800/60 rounded-xl border border-gray-700 overflow-hidden shadow-lg hover:shadow-purple-500/20 transition-shadow duration-300">
            <div className="bg-gradient-to-r from-gray-900/70 to-gray-800/70 px-5 py-3 border-b border-gray-700/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={group.title}
                  onChange={(e) => handleUpdateGroupTitle(type, groupIdx, e.target.value)}
                  className="text-lg font-bold text-purple-300 bg-gray-700/50 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => {/* 레거시 함수 - 사용되지 않음 */}}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                >
                  + 아이템 추가
                </button>
                <button
                  onClick={() => handleRemoveRewardGroup(type, groupIdx)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                >
                  그룹 삭제
                </button>
                
                {/* PC방 행운의 상자 내역 보기 버튼 */}
                {group.title === 'PC방 행운의 상자 (매일 최대 3개)' && (
                  <button
                    type="button"
                    onClick={() => setShowPcBangBoxDetails((prev) => !prev)}
                    className="px-3 py-1 text-xs rounded border border-purple-500/60 text-purple-200 hover:bg-purple-500/20 transition-colors"
                  >
                    {showPcBangBoxDetails ? '내역 닫기' : '내역 보기'}
                  </button>
                )}
              </div>
              
              {/* 고결한 혼돈의 돌 품질 선택 */}
              {group.items.some(item => getItemName(item) === '고결한 혼돈의 돌 선택 상자') && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">품질:</span>
                  <select
                    value={chaosStoneQuality}
                    onChange={(e) => setChaosStoneQuality(Number(e.target.value) as 90 | 95)}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
                  >
                    <option value={90}>90</option>
                    <option value={95}>95</option>
                  </select>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-900/50 to-gray-800/50 border-b-2 border-gray-600/70">
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-200">아이템명</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">수량</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">단가</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">총합</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, itemIdx) => {
                    const isKurzanItem = item.type === 'kurzan';
                    const isPcBangLuckyBox = getItemName(item).startsWith('PC방 행운의 상자');
                    const kurzanValue = adjustedKurzanValue;
                    const priceInfo =
                      isKurzanItem && kurzanValue != null
                        ? {
                            unit: 'gold' as const,
                            unitAmount: kurzanValue,
                            goldEquivalent: kurzanValue,
                            cashEquivalent: null,
                            note: null,
                          }
                        : isPcBangLuckyBox
                          ? {
                              unit: pcBangLuckyBoxExpectedGold != null ? ('gold' as const) : null,
                              unitAmount: pcBangLuckyBoxExpectedGold,
                              goldEquivalent: pcBangLuckyBoxExpectedGold,
                              cashEquivalent: null,
                              note: pcBangLuckyBoxExpectedGold != null ? '상세 구성 기대값' : null,
                            }
                          : getItemPriceInfo(getItemName(item));
                    const unitDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue)}골드` : '-')
                      : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                    const totalDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드` : '-')
                      : formatPriceDisplay(
                          priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                          priceInfo.unit
                        );
                    const composition = getCompositionInfo(getItemName(item), item.quantity);
                    
                    return (
                      <tr key={itemIdx} className="border-b border-gray-700/50 hover:bg-gray-700/40 transition-colors duration-200">
                        <td className="px-4 py-3 text-white">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <input
                                type="text"
                                value={getItemName(item)}
                                onChange={(e) => {/* 레거시 함수 - 사용되지 않음 */}}
                                className="bg-gray-700/50 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-500 flex-1 min-w-[200px]"
                              />
                              <button
                                onClick={() => {/* 레거시 함수 - 사용되지 않음 */}}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                              >
                                삭제
                              </button>
                              {isKurzanItem && kurzanStageOptions.length > 0 && (
                                <select
                                  value={selectedKurzanKey}
                                  onChange={(e) => setSelectedKurzanKey(e.target.value)}
                                  className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                  {kurzanStageOptions.map((option) => (
                                    <option key={option.key} value={option.key}>
                                      {option.level} / {option.stage}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {composition.perUnit && !isKurzanItem && !isPcBangLuckyBox && (
                              <div className="text-xs text-gray-400 mt-1">1개당 {composition.perUnit}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {/* 레거시 함수 - 사용되지 않음 */}}
                            className="bg-gray-700/50 border border-gray-600 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-purple-500 w-24"
                          />
                          {isKurzanItem && selectedKurzanStage && (
                            <div className="text-xs text-gray-500 mt-1">
                              ({selectedKurzanStage.level} / {selectedKurzanStage.stage})
                            </div>
                          )}
                          {composition.total && !isKurzanItem && !isPcBangLuckyBox && (
                            <div className="text-xs text-gray-500 mt-1">({composition.total})</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {unitDisplay}
                        </td>
                        <td className="px-4 py-3 text-right text-yellow-400 font-semibold">
                          {totalDisplay}
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* 합계 행 */}
                  <tr className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-t-2 border-purple-500/60">
                    <td className="px-4 py-4 text-white font-bold text-base">소계 (골드 환산)</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-right text-yellow-300 font-bold text-base">
                      {(() => {
                        const totalGold = group.items.reduce((sum, item) => {
                          const itemName = getItemName(item);
                          const enabled = enabledRewards[itemName] ?? true;
                          if (!enabled) return sum;
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          if (itemName === '쿠르잔 전선 보상 (휴식게이지 2배)') {
                            const kurzanValue = adjustedKurzanValue;
                            return kurzanValue != null ? sum + kurzanValue * item.quantity : sum;
                          }
                          const priceInfo = getItemPriceInfo(itemName);
                          let goldValue: number | null = null;
                          if (priceInfo.goldEquivalent !== null) {
                            goldValue = priceInfo.goldEquivalent;
                          } else if (priceInfo.cashEquivalent !== null) {
                            goldValue = convertCashToGold(priceInfo.cashEquivalent);
                          }
                          if (goldValue !== null) {
                            return sum + goldValue * item.quantity;
                          }
                          return sum;
                        }, 0);
                        return totalGold > 0
                          ? `${formatNumberWithSignificantDigits(totalGold)}골드`
                          : '-';
                      })()}
                    </td>
                  </tr>
                  <tr className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-t border-green-500/40">
                    <td className="px-4 py-4 text-white font-bold text-base">소계 (현금 환산)</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-xs text-gray-400 text-right">
                      {goldToCashPerGold
                        ? cashMode === 'discord'
                          ? `디스코드: 100골드 ${discordRate ?? '-'}원`
                          : `화폐거래소: 100크리 ${crystalGoldRate ?? '-'}골드`
                        : '환산 불가'}
                    </td>
                    <td className="px-4 py-4 text-right text-green-300 font-bold text-base">
                      {(() => {
                        const totalGold = group.items.reduce((sum, item) => {
                          const itemName = getItemName(item);
                          const enabled = enabledRewards[itemName] ?? true;
                          if (!enabled) return sum;
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          if (itemName === '쿠르잔 전선 보상 (휴식게이지 2배)') {
                            const kurzanValue = adjustedKurzanValue;
                            return kurzanValue != null ? sum + kurzanValue * item.quantity : sum;
                          }
                          const priceInfo = getItemPriceInfo(itemName);
                          let goldValue: number | null = null;
                          if (priceInfo.goldEquivalent !== null) {
                            goldValue = priceInfo.goldEquivalent;
                          } else if (priceInfo.cashEquivalent !== null) {
                            goldValue = convertCashToGold(priceInfo.cashEquivalent);
                          }
                          if (goldValue !== null) {
                            return sum + goldValue * item.quantity;
                          }
                          return sum;
                        }, 0);
                        if (!goldToCashPerGold || totalGold === 0) return '-';
                        const cashValue = totalGold * goldToCashPerGold;
                        return `${formatNumberWithSignificantDigits(cashValue)}원`;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* PC방 행운의 상자 내역 */}
            {group.title === 'PC방 행운의 상자 (매일 최대 3개)' && showPcBangBoxDetails && (
              <div className="px-5 py-4 bg-gray-900/40">
                <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-purple-900/30 text-gray-300 border-b border-purple-500/30">
                        <th className="px-2 py-2 text-left">아이템</th>
                        <th className="px-2 py-2 text-center">수량</th>
                        <th className="px-2 py-2 text-center">확률</th>
                        <th className="px-2 py-2 text-right">단가</th>
                        <th className="px-2 py-2 text-right">기대값</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pcBangLuckyBoxDetails.map((detail) => {
                        const priceInfo = getItemPriceInfo(detail.itemName);
                        let goldValue = priceInfo.goldEquivalent;
                        if (goldValue == null && priceInfo.cashEquivalent !== null) {
                          goldValue = convertCashToGold(priceInfo.cashEquivalent);
                        }
                        if (goldValue == null && priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null) {
                          goldValue = convertCrystalToGold(priceInfo.unitAmount);
                        }
                        const itemTotalValue = goldValue !== null ? goldValue * detail.quantity : null;
                        const detailEnabled = pcBangDetailEnabled[detail.displayName] ?? true;
                        const expectedValue =
                          detailEnabled && itemTotalValue !== null ? itemTotalValue * detail.probability : null;
                        
                        return (
                          <tr
                            key={detail.displayName}
                            className={`border-b border-gray-800/50 hover:bg-gray-800/40 ${
                              detailEnabled ? '' : 'opacity-40'
                            }`}
                          >
                            <td className="px-2 py-2 text-gray-100">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => togglePcBangDetail(detail.displayName)}
                                    className={`w-8 h-4 rounded-full border transition-colors ${
                                      detailEnabled
                                        ? 'bg-purple-600 border-purple-500'
                                        : 'bg-gray-600 border-gray-500'
                                    }`}
                                    aria-label={`${detail.displayName} 포함 여부`}
                                  >
                                    <span
                                      className={`inline-block w-3.5 h-3.5 rounded-full bg-white transform transition-transform ${
                                        detailEnabled ? 'translate-x-3' : 'translate-x-0.5'
                                      }`}
                                    />
                                  </button>
                                  <span>{detail.displayName}</span>
                                </div>
                                {priceInfo.note && (
                                  <span className="text-[10px] text-gray-400">({priceInfo.note})</span>
                                )}
                                {detail.itemName === '전설 카드 선택팩' && (
                                  <input
                                    type="number"
                                    min="1000"
                                    step="100"
                                    value={legendaryCardSelectionPriceInput}
                                    onChange={(e) => setLegendaryCardSelectionPriceInput(e.target.value)}
                                    className="w-24 bg-gray-800 text-white border border-purple-500/40 rounded px-2 py-1 text-[11px]"
                                    title="전설 카드 선택팩 단가(골드)"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-gray-300">
                              {formatNumberWithSignificantDigits(detail.quantity)}
                            </td>
                            <td className="px-2 py-2 text-center text-purple-300 font-semibold">
                              {detail.chanceText}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-blue-300">{formatNumberWithSignificantDigits(priceInfo.unitAmount)}크리</span>
                                  {goldValue !== null && (
                                    <span className="text-[10px] text-gray-400">
                                      ({formatNumberWithSignificantDigits(goldValue)}골드)
                                    </span>
                                  )}
                                </div>
                              ) : goldValue !== null ? (
                                `${formatNumberWithSignificantDigits(goldValue)}골드`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-yellow-300 font-semibold">
                              {expectedValue !== null
                                ? `${formatNumberWithSignificantDigits(expectedValue)}골드`
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 border-t-2 border-purple-500/60">
                        <td colSpan={4} className="px-2 py-2 text-gray-200 font-bold">
                          상자 1개 기대값 합계
                        </td>
                        <td className="px-2 py-2 text-right text-yellow-300 font-bold">
                          {pcBangLuckyBoxExpectedGold !== null
                            ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold)}골드`
                            : '-'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 새로운 편집 가능한 보상 테이블 (과금 효율과 동일한 UI)
  const renderEditableRewardTableNew = (groups: RewardGroup[], type: 'weekly' | 'cumulative', sectionTitle: string) => {
    // 총 가치 계산
    const calculateTotalValue = () => {
      let total = 0;
      
      groups.forEach(group => {
        group.items.forEach(item => {
          if (!isNewFormatItem(item)) return;
          
          item.components.forEach(comp => {
            if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return;
            
            const unitPrice = getItemUnitPrice(comp.itemName, comp);
            if (unitPrice === null) return; // null인 경우만 제외, 0인 경우는 포함
            
            const isIncluded = item.itemType === '확정' || 
                              (item.itemType === '확률') || 
                              (item.itemType === '선택' && comp.selected);
            
            if (!isIncluded) return;
            
            let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
            
            // 확률 타입일 경우 확률 적용
            if (item.itemType === '확률' && comp.probability !== undefined) {
              value *= comp.probability;
            }
            
            total += value;
          });
        });
      });
      
      return total;
    };
    
    const totalValue = calculateTotalValue();
    
    // 보상 그룹별 계산 과정 데이터 생성
    const calculateGroupDetails = () => {
      return groups.map((group, groupIdx) => {
        let groupTotal = 0;
        const items = group.items
          .filter(item => isNewFormatItem(item))
          .map(item => {
            const itemDetails = item.components
              .filter(comp => comp.itemName && comp.itemName !== '__nested__' && comp.itemName !== '__manual__' && comp.itemName !== '')
              .map(comp => {
                const unitPrice = getItemUnitPrice(comp.itemName, comp);
                if (unitPrice === null) return null; // null인 경우만 제외, 0인 경우는 포함
                
                const isIncluded = item.itemType === '확정' || 
                                  (item.itemType === '확률') || 
                                  (item.itemType === '선택' && comp.selected);
                
                if (!isIncluded) return null;
                
                let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
                
                // 확률 타입일 경우 확률 적용
                if (item.itemType === '확률' && comp.probability !== undefined) {
                  value *= comp.probability;
                }
                
                // 하위 묶음 항목 수량 계산 (하위 묶음 항목이 포함된 구성 요소의 수량)
                let nestedItemCount = 0;
                if (comp.itemName === '__nested__' && comp.nestedItem) {
                  // 하위 묶음 항목의 구성 요소 수량 합계
                  nestedItemCount = comp.nestedItem.components
                    .filter(nestedComp => nestedComp.itemName && nestedComp.itemName !== '__nested__' && nestedComp.itemName !== '__manual__' && nestedComp.itemName !== '')
                    .reduce((sum, nestedComp) => {
                      const isNestedIncluded = comp.nestedItem!.itemType === '확정' || 
                                              (comp.nestedItem!.itemType === '확률') || 
                                              (comp.nestedItem!.itemType === '선택' && nestedComp.selected);
                      if (!isNestedIncluded) return sum;
                      return sum + (nestedComp.quantity || 0);
                    }, 0);
                }
                
                groupTotal += value;
                
                return {
                  itemName: comp.itemName,
                  unitPrice,
                  componentQuantity: comp.quantity || 0,
                  bundleQuantity: item.quantity || 1,
                  nestedItemCount,
                  probability: item.itemType === '확률' ? comp.probability : undefined,
                  value,
                  isIncluded,
                };
              })
              .filter((detail): detail is NonNullable<typeof detail> => detail !== null);
            
            const bundleItemCount = item.components.filter(comp => 
              comp.itemName && comp.itemName !== '__nested__' && comp.itemName !== '__manual__' && comp.itemName !== ''
            ).length;
            
            const nestedBundleCount = item.components.filter(comp => 
              comp.itemName === '__nested__' && comp.nestedItem
            ).length;
            
            return {
              itemName: item.itemName,
              itemType: item.itemType,
              bundleQuantity: item.quantity || 1,
              bundleItemCount,
              nestedBundleCount,
              details: itemDetails,
            };
          });
        
        return {
          groupTitle: group.title,
          groupTotal,
          items,
        };
      });
    };
    
    const groupDetails = calculateGroupDetails();
    
    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        {totalValue > 0 && (
          <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border-2 border-purple-500/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-2xl font-bold text-white">요약</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* 총 가치 */}
              <div className="bg-gray-900/60 rounded-xl p-4 border border-purple-500/30">
                <div className="text-sm text-gray-400 mb-1">총 가치</div>
                <div className="text-3xl font-bold text-blue-400">
                  {formatNumberWithSignificantDigits(totalValue)} 골드
                </div>
              </div>
              
              {/* 현금 환산 */}
              {goldToCashPerGold && (
                <div className="bg-gray-900/60 rounded-xl p-4 border border-green-500/30">
                  <div className="text-sm text-gray-400 mb-1">현금 환산</div>
                  <div className="text-3xl font-bold text-green-400">
                    {formatNumberWithSignificantDigits(totalValue * goldToCashPerGold)} 원
                  </div>
                </div>
              )}
            </div>
            
            {/* 계산 과정 상세 */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white">계산 과정</h4>
              {groupDetails.map((group, groupIdx) => (
                <div key={groupIdx} className="bg-gray-900/60 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-base font-semibold text-purple-300">{group.groupTitle}</h5>
                    <div className="text-sm text-gray-400">
                      그룹 합계: <span className="text-yellow-400 font-bold">{formatNumberWithSignificantDigits(group.groupTotal)} 골드</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {group.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{item.itemName}</span>
                            <span className="text-xs text-gray-400">({item.itemType})</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            묶음 수량: <span className="text-blue-400 font-semibold">{item.bundleQuantity}</span>
                            {item.bundleItemCount > 0 && (
                              <span className="ml-2">
                                구성요소: <span className="text-green-400 font-semibold">{item.bundleItemCount}개</span>
                              </span>
                            )}
                            {item.nestedBundleCount > 0 && (
                              <span className="ml-2">
                                하위 묶음: <span className="text-purple-400 font-semibold">{item.nestedBundleCount}개</span>
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-1 pl-4 border-l-2 border-gray-700">
                          {item.details.map((detail, detailIdx) => (
                            <div key={detailIdx} className="text-xs text-gray-300">
                              <span className="text-gray-400">• {detail.itemName}:</span>
                              <span className="ml-1">단가 {formatNumberWithSignificantDigits(detail.unitPrice)}골드</span>
                              <span className="text-gray-500 mx-1">×</span>
                              <span>구성요소 수량 {formatNumberWithSignificantDigits(detail.componentQuantity)}</span>
                              {detail.probability !== undefined && (
                                <>
                                  <span className="text-gray-500 mx-1">×</span>
                                  <span className="text-purple-400">확률 {formatNumberWithSignificantDigits(detail.probability * 100)}%</span>
                                </>
                              )}
                              {detail.bundleQuantity > 1 && (
                                <>
                                  <span className="text-gray-500 mx-1">×</span>
                                  <span className="text-blue-400">묶음 수량 {detail.bundleQuantity}</span>
                                </>
                              )}
                              {detail.nestedItemCount > 0 && (
                                <>
                                  <span className="text-gray-500 mx-1">×</span>
                                  <span className="text-purple-400">하위 묶음 {detail.nestedItemCount}개</span>
                                </>
                              )}
                              <span className="text-gray-500 mx-1">=</span>
                              <span className={`font-semibold ${detail.isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                {formatNumberWithSignificantDigits(detail.value)} 골드
                              </span>
                              {!detail.isIncluded && <span className="text-gray-500 ml-1">(미포함)</span>}
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
        )}
        
        {/* 섹션 제목 및 그룹 추가 버튼 */}
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl px-5 py-4 shadow-lg flex justify-between items-center">
          <h3 className="text-xl font-bold text-white tracking-wide">{sectionTitle}</h3>
          <button
            onClick={() => handleAddRewardGroup(type)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + 보상 그룹 추가
          </button>
        </div>
        
        {/* 빈 상태 안내 */}
        {groups.length === 0 && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400 mb-4">보상 그룹이 없습니다.</p>
            <p className="text-sm text-gray-500">위의 "+ 보상 그룹 추가" 버튼을 클릭하여 보상을 추가하세요.</p>
          </div>
        )}
        
        {/* 각 보상 그룹 */}
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="bg-gray-800/60 rounded-xl border border-gray-700 p-6 space-y-4">
            {/* 그룹 제목 및 그룹 삭제 버튼 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                value={group.title}
                onChange={(e) => handleUpdateGroupTitle(type, groupIdx, e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500 text-lg font-bold"
                placeholder="그룹 제목"
              />
              <button
                onClick={() => handleRemoveRewardGroup(type, groupIdx)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                그룹 삭제
              </button>
            </div>
            
            {/* 묶음 항목 리스트 */}
            <div className="space-y-4">
              {group.items.map((item, itemIdx) => {
                if (!isNewFormatItem(item)) return null; // 새 형식만 렌더링
                
                // 이 묶음 항목의 총 가치 계산
                const itemTotalValue = item.components.reduce((sum, comp) => {
                  if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return sum;
                  
                  const unitPrice = getItemUnitPrice(comp.itemName, comp);
                  if (unitPrice === null) return sum; // null인 경우만 제외, 0인 경우는 포함
                  
                  const isIncluded = item.itemType === '확정' || 
                                    (item.itemType === '확률') || 
                                    (item.itemType === '선택' && comp.selected);
                  
                  if (!isIncluded) return sum;
                  
                  let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
                  
                  // 확률 타입일 경우 확률 적용
                  if (item.itemType === '확률' && comp.probability !== undefined) {
                    value *= comp.probability;
                  }
                  
                  return sum + value;
                }, 0);
                
                return (
                  <div key={itemIdx} className="bg-gray-900/50 rounded-lg border border-gray-700 p-4">
                    {/* 묶음 항목 헤더 */}
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="text"
                        value={item.itemName}
                        onChange={(e) => handleUpdateRewardItem(type, groupIdx, itemIdx, 'itemName', e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        placeholder="묶음 항목명"
                      />
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => handleUpdateRewardItem(type, groupIdx, itemIdx, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-28 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                        placeholder="묶음 수량"
                        min="1"
                        step="1"
                      />
                      <select
                        value={item.itemType}
                        onChange={(e) => handleUpdateRewardItem(type, groupIdx, itemIdx, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                      >
                        <option value="확정">확정</option>
                        <option value="확률">확률</option>
                        <option value="선택">선택</option>
                      </select>
                      {itemTotalValue > 0 && (
                        <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                          <div className="text-xs text-gray-400">가치</div>
                          <div className="text-sm font-bold text-blue-400">
                            {formatNumberWithSignificantDigits(itemTotalValue)}G
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveRewardItem(type, groupIdx, itemIdx)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    
                    {/* 구성 요소 리스트 */}
                    <div className="space-y-2 pl-4 border-l-2 border-gray-700">
                      {/* 확률 타입일 때 확률 합계 경고 */}
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
                      
                      {item.components.map((component, compIdx) => (
                        <div key={compIdx} className="bg-gray-900/40 rounded-lg p-3 border border-gray-700">
                          <div className="space-y-2">
                            {/* 첫 번째 줄: 라디오 버튼 + 드롭다운 + 삭제 버튼 */}
                            <div className="flex gap-2 items-center">
                              {/* 선택 타입: 라디오 버튼 */}
                              {item.itemType === '선택' && (
                                <input
                                  type="radio"
                                  name={`group-${groupIdx}-item-${itemIdx}-selection`}
                                  checked={component.selected || false}
                                  onChange={() => {
                                    // 선택된 것만 true로 설정
                                    const updatedComponents = item.components.map((c, idx) => ({
                                      ...c,
                                      selected: idx === compIdx
                                    }));
                                    handleUpdateRewardItem(type, groupIdx, itemIdx, 'components', updatedComponents);
                                  }}
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
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'itemName', '__nested__');
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', {
                                      itemName: '',
                                      itemType: '확정',
                                      quantity: 1,
                                      components: [],
                                    });
                                  } else {
                                    const oldItemName = component.itemName;
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'itemName', value);
                                    // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
                                    if (oldItemName !== value) {
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'manualPrice', null);
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'manualUnitType', null);
                                    }
                                    if (value !== '__nested__') {
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', undefined);
                                    }
                                  }
                                }}
                                options={itemDropdownOptions}
                                placeholder="아이템 선택"
                                className="flex-1"
                                size="small"
                              />
                              
                              <button
                                onClick={() => handleRemoveComponent(type, groupIdx, itemIdx, compIdx)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                              >
                                삭제
                              </button>
                            </div>
                            
                            {/* 직접 입력 필드 */}
                            {(component.itemName === '__manual__' || component.itemName === '' || 
                              (component.itemName && component.itemName !== '__nested__' && 
                               !component.itemName.includes('(실제가치)') && 
                               !availableItemNames.has(component.itemName))) && (
                              <div>
                                <input
                                  type="text"
                                  value={component.itemName === '__manual__' || component.itemName === '' ? '' : component.itemName}
                                  onChange={(e) => {
                                    const value = e.target.value || '__manual__';
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'itemName', value);
                                  }}
                                  className="w-full px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                  placeholder="아이템 이름을 입력하세요"
                                />
                              </div>
                            )}
                            
                            {/* 단가 직접 입력 필드 (직접 입력 선택 시) */}
                            {(component.itemName === '__manual__' || component.itemName === '' || 
                              (component.itemName && component.itemName !== '__nested__' && 
                               !component.itemName.includes('(실제가치)') && 
                               !availableItemNames.has(component.itemName))) && (
                              <div className="flex gap-2 items-center">
                                <select
                                  value={component.manualUnitType || '골드'}
                                  onChange={(e) => {
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금');
                                  }}
                                  className="px-2 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                >
                                  <option value="골드">골드</option>
                                  <option value="크리스탈">크리스탈</option>
                                  <option value="현금">현금</option>
                                </select>
                                <input
                                  type="text"
                                  value={manualPriceInputs[`${type}-${groupIdx}-${itemIdx}-${compIdx}`] ?? (component.manualPrice?.toString() ?? '')}
                                  onChange={(e) => {
                                    const key = `${type}-${groupIdx}-${itemIdx}-${compIdx}`;
                                    setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                                  }}
                                  onBlur={(e) => {
                                    const key = `${type}-${groupIdx}-${itemIdx}-${compIdx}`;
                                    const value = e.target.value.trim();
                                    const numValue = value === '' ? null : parseFloat(value);
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'manualPrice', numValue || null);
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
                                  className="flex-1 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                  placeholder="단가 직접 입력"
                                />
                              </div>
                            )}
                            
                            {/* 하위 묶음 항목 입력 */}
                            {component.itemName === '__nested__' && component.nestedItem && (
                              <div className="space-y-3 pl-4 border-l-2 border-purple-500/50 bg-gray-800/30 rounded-lg p-3">
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="text"
                                    value={component.nestedItem.itemName}
                                    onChange={(e) => {
                                      const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                    }}
                                    className="flex-1 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder="하위 묶음 항목명"
                                  />
                                  <select
                                    value={component.nestedItem.itemType}
                                    onChange={(e) => {
                                      const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                    }}
                                    className="w-20 px-2 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                  >
                                    <option value="확정">확정</option>
                                    <option value="확률">확률</option>
                                    <option value="선택">선택</option>
                                  </select>
                                </div>
                                
                                {/* 하위 묶음 항목의 확률 타입일 때 확률 합계 경고 */}
                                {component.nestedItem.itemType === '확률' && (() => {
                                  const totalProbability = component.nestedItem.components.reduce((sum, nestedComp) => {
                                    return sum + (nestedComp.probability || 0);
                                  }, 0);
                                  const isNot100Percent = Math.abs(totalProbability - 1) > 0.001;
                                  return isNot100Percent ? (
                                    <div className="text-red-400 text-xs font-medium bg-red-900/20 border border-red-700 rounded p-2">
                                      ⚠ 확률 합계가 {(totalProbability * 100).toFixed(1)}%입니다. (100%가 되어야 합니다)
                                    </div>
                                  ) : null;
                                })()}
                                
                                {/* 하위 묶음 항목의 구성 요소 리스트 */}
                                <div className="space-y-2">
                                  {component.nestedItem.components.map((nestedComp, nestedCompIdx) => (
                                    <div key={nestedCompIdx} className="bg-gray-900/40 rounded-lg p-2 border border-gray-700">
                                      <div className="space-y-2">
                                        {/* 첫 번째 줄: 라디오 버튼 + 드롭다운 + 삭제 버튼 */}
                                        <div className="flex gap-2 items-center">
                                          {/* 선택 타입: 라디오 버튼 */}
                                          {component.nestedItem!.itemType === '선택' && (
                                            <input
                                              type="radio"
                                              name={`group-${groupIdx}-item-${itemIdx}-comp-${compIdx}-nested-selection`}
                                              checked={nestedComp.selected || false}
                                              onChange={() => {
                                                const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => ({
                                                  ...c,
                                                  selected: idx === nestedCompIdx
                                                }));
                                                const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="mt-1"
                                            />
                                          )}
                                          
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
                                              const oldItemName = nestedComp.itemName;
                                              const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => {
                                                if (idx === nestedCompIdx) {
                                                  // itemName이 변경될 때 manualPrice와 manualUnitType 초기화
                                                  if (oldItemName !== value) {
                                                    return { ...c, itemName: value, manualPrice: null, manualUnitType: null };
                                                  }
                                                  return { ...c, itemName: value };
                                                }
                                                return c;
                                              });
                                              const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                              handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                            }}
                                            options={itemDropdownOptions}
                                            placeholder="아이템 선택"
                                            className="flex-1"
                                            size="small"
                                          />
                                          
                                          <button
                                            onClick={() => {
                                              const updatedNestedComponents = component.nestedItem!.components.filter((_, idx) => idx !== nestedCompIdx);
                                              const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                              handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                            }}
                                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                                          >
                                            삭제
                                          </button>
                                        </div>
                                        
                                        {/* 직접 입력 필드 */}
                                        {(nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || 
                                          (nestedComp.itemName && nestedComp.itemName !== '__nested__' && 
                                           !nestedComp.itemName.includes('(실제가치)') && 
                                           !availableItemNames.has(nestedComp.itemName))) && (
                                          <div>
                                            <input
                                              type="text"
                                              value={nestedComp.itemName === '__manual__' || nestedComp.itemName === '' ? '' : nestedComp.itemName}
                                              onChange={(e) => {
                                                const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => 
                                                  idx === nestedCompIdx ? { ...c, itemName: e.target.value || '__manual__' } : c
                                                );
                                                const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="w-full px-2 py-1 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-xs"
                                              placeholder="아이템 이름을 입력하세요"
                                            />
                                          </div>
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
                                                const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => 
                                                  idx === nestedCompIdx ? { ...c, manualUnitType: e.target.value as '골드' | '크리스탈' | '현금' } : c
                                                );
                                                const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="px-2 py-1 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-xs"
                                            >
                                              <option value="골드">골드</option>
                                              <option value="크리스탈">크리스탈</option>
                                              <option value="현금">현금</option>
                                            </select>
                                            <input
                                              type="text"
                                              value={manualPriceInputs[`${type}-${groupIdx}-${itemIdx}-${compIdx}-nested-${nestedCompIdx}`] ?? (nestedComp.manualPrice?.toString() ?? '')}
                                              onChange={(e) => {
                                                const key = `${type}-${groupIdx}-${itemIdx}-${compIdx}-nested-${nestedCompIdx}`;
                                                setManualPriceInputs(prev => ({ ...prev, [key]: e.target.value }));
                                              }}
                                              onBlur={(e) => {
                                                const key = `${type}-${groupIdx}-${itemIdx}-${compIdx}-nested-${nestedCompIdx}`;
                                                const value = e.target.value.trim();
                                                const numValue = value === '' ? null : parseFloat(value);
                                                const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => 
                                                  idx === nestedCompIdx ? { ...c, manualPrice: numValue || null } : c
                                                );
                                                const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
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
                                              className="flex-1 px-2 py-1 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-xs"
                                              placeholder="단가 직접 입력"
                                            />
                                          </div>
                                        )}
                                        
                                        {/* 두 번째 줄: 수량 및 확률 입력 */}
                                        <div className="flex gap-2 items-center">
                                          <span className="text-xs text-gray-400 whitespace-nowrap">수량:</span>
                                          <input
                                            type="number"
                                            value={nestedComp.quantity || ''}
                                            onChange={(e) => {
                                              const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => 
                                                idx === nestedCompIdx ? { ...c, quantity: parseFloat(e.target.value) || 1 } : c
                                              );
                                              const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                              handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                            }}
                                            className="w-24 px-2 py-1 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-xs"
                                            placeholder="수량"
                                            min="1"
                                          />
                                          
                                          {/* 확률 타입: 확률 입력 */}
                                          {component.nestedItem!.itemType === '확률' && (
                                            <>
                                              <span className="text-xs text-gray-400 whitespace-nowrap">확률:</span>
                                              <input
                                                type="number"
                                                value={(nestedComp.probability || 0) * 100}
                                                onChange={(e) => {
                                                  const updatedNestedComponents = component.nestedItem!.components.map((c, idx) => 
                                                    idx === nestedCompIdx ? { ...c, probability: parseFloat(e.target.value) / 100 || 0 } : c
                                                  );
                                                  const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                                  handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                                }}
                                                className="w-24 px-2 py-1 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-xs"
                                                placeholder="0-100"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                              />
                                              <span className="text-xs text-gray-400">%</span>
                                            </>
                                          )}
                                        </div>
                                        
                                        {/* 가치 계산 표시 */}
                                        {nestedComp.itemName && nestedComp.itemName !== '__nested__' && nestedComp.itemName !== '' && (() => {
                                          const unitPrice = getItemUnitPrice(nestedComp.itemName, nestedComp);
                                          if (unitPrice !== null && unitPrice > 0) {
                                            const isNestedIncluded = component.nestedItem!.itemType === '확정' || 
                                                                    (component.nestedItem!.itemType === '확률') || 
                                                                    (component.nestedItem!.itemType === '선택' && nestedComp.selected);
                                            
                                            let nestedValue = unitPrice * (nestedComp.quantity || 0) * (component.quantity || 1) * (item.quantity || 1);
                                            
                                            // 확률 타입일 경우 확률 적용
                                            if (component.nestedItem!.itemType === '확률' && nestedComp.probability !== undefined) {
                                              nestedValue *= nestedComp.probability;
                                            }
                                            
                                            return (
                                              <div className={`text-xs ${isNestedIncluded ? 'text-gray-300' : 'text-gray-600'}`}>
                                                단가: <span className="font-semibold">{formatNumberWithSignificantDigits(unitPrice)}</span> 골드
                                                <span className="text-gray-500 mx-1">×</span>
                                                수량: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedComp.quantity || 0)}</span>
                                                {component.nestedItem!.itemType === '확률' && nestedComp.probability !== undefined && (
                                                  <span className="text-purple-400 ml-1">× {nestedComp.probability}</span>
                                                )}
                                                <span className="text-gray-500 mx-1">×</span>
                                                <span className="text-blue-400">하위 구성요소 수량 {component.quantity || 1}</span>
                                                {item.quantity && item.quantity > 1 && (
                                                  <>
                                                    <span className="text-gray-500 mx-1">×</span>
                                                    <span className="text-blue-400">묶음 {item.quantity}</span>
                                                  </>
                                                )}
                                                <span className="text-gray-500 mx-1">=</span>
                                                <span className={`font-semibold ${isNestedIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                  {formatNumberWithSignificantDigits(nestedValue)} 골드
                                                </span>
                                                {component.nestedItem!.itemType === '확률' && <span className="text-gray-500 ml-1">(기대값)</span>}
                                                {!isNestedIncluded && <span className="text-gray-500 ml-1">(미포함)</span>}
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {/* 하위 묶음 항목에 구성 요소 추가 버튼 */}
                                  <button
                                    onClick={() => {
                                      const newNestedComponent: ComponentItem = {
                                        itemName: '',
                                        quantity: 1,
                                      };
                                      const updatedNestedComponents = [...component.nestedItem!.components, newNestedComponent];
                                      const nestedItem = { ...component.nestedItem!, components: updatedNestedComponents };
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                    }}
                                    className="w-full px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-xs"
                                  >
                                    + 구성 요소 추가
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {/* 두 번째 줄: 수량 및 확률/선택 입력 */}
                            <div className="flex gap-2 items-center">
                              <span className="text-sm text-gray-400 whitespace-nowrap">수량:</span>
                              <input
                                type="number"
                                value={component.quantity || ''}
                                onChange={(e) => handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'quantity', parseFloat(e.target.value) || 1)}
                                className="w-24 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                placeholder="수량"
                                min="1"
                              />
                              
                              {/* 확률 타입: 확률 입력 */}
                              {item.itemType === '확률' && (
                                <>
                                  <span className="text-sm text-gray-400 whitespace-nowrap">확률:</span>
                                  <input
                                    type="number"
                                    value={(component.probability || 0) * 100}
                                    onChange={(e) => handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'probability', parseFloat(e.target.value) / 100 || 0)}
                                    className="w-24 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder="0-100"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                  />
                                  <span className="text-sm text-gray-400">%</span>
                                </>
                              )}
                            </div>
                            
                            {/* 가치 계산 표시 */}
                            {component.itemName && component.itemName !== '__nested__' && component.itemName !== '' && (() => {
                              const unitPrice = getItemUnitPrice(component.itemName, component);
                              if (unitPrice !== null && unitPrice > 0) {
                                const isIncluded = item.itemType === '확정' || 
                                                  (item.itemType === '확률') || 
                                                  (item.itemType === '선택' && component.selected);
                                
                                let value = unitPrice * (component.quantity || 0) * (item.quantity || 1);
                                
                                // 확률 타입일 경우 확률 적용
                                if (item.itemType === '확률' && component.probability !== undefined) {
                                  value *= component.probability;
                                }
                                
                                return (
                                  <div className={`text-xs ${isIncluded ? 'text-gray-300' : 'text-gray-600'}`}>
                                    단가: <span className="font-semibold">{formatNumberWithSignificantDigits(unitPrice)}</span> 골드
                                    <span className="text-gray-500 mx-1">×</span>
                                    수량: <span className="font-semibold">{formatNumberWithSignificantDigits(component.quantity || 0)}</span>
                                    {item.itemType === '확률' && component.probability !== undefined && (
                                      <span className="text-purple-400 ml-1">× {component.probability}</span>
                                    )}
                                    {item.quantity && item.quantity > 1 && (
                                      <span className="text-blue-400 ml-1">× 묶음 {item.quantity}</span>
                                    )}
                                    <span className="text-gray-500 mx-1">=</span>
                                    <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                      {formatNumberWithSignificantDigits(value)} 골드
                                    </span>
                                    {item.itemType === '확률' && <span className="text-gray-500 ml-1">(기대값)</span>}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      ))}
                      
                      {/* 구성 요소 추가 버튼 */}
                      <button
                        onClick={() => handleAddComponent(type, groupIdx, itemIdx)}
                        className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                      >
                        + 구성 요소 추가
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {/* 묶음 항목 추가 버튼 */}
              <button
                onClick={() => handleAddRewardItem(type, groupIdx)}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                + 묶음 항목 추가
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 읽기 전용 보상 테이블 (상시 혜택용)
  const renderReadOnlyRewardTable = (groups: RewardGroup[], sectionTitle: string, summaryLabel?: string) => {
    const totalGold = groups.reduce((sumSection, group) => {
      return (
        sumSection +
        group.items.reduce((sum, item) => {
          if (item.type === 'kurzan') {
            const goldValue = adjustedKurzanValue;
            return goldValue != null ? sum + goldValue * item.quantity : sum;
          }
          const itemName = getItemName(item);
          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
          if (isPcBangLuckyBox) {
            return pcBangLuckyBoxExpectedGold != null
              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
              : sum;
          }
          const priceInfo = getItemPriceInfo(itemName);
          let goldValue: number | null = null;
          if (priceInfo.goldEquivalent !== null) {
            goldValue = priceInfo.goldEquivalent;
          } else if (priceInfo.cashEquivalent !== null) {
            goldValue = convertCashToGold(priceInfo.cashEquivalent);
          }
          return goldValue != null ? sum + goldValue * item.quantity : sum;
        }, 0)
      );
    }, 0);
    const sectionTotals = {
      totalGold,
      totalCash: goldToCashPerGold ? totalGold * goldToCashPerGold : null,
    };

    return (
      <div className="space-y-6">
        {/* 섹션 제목 */}
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl px-5 py-4 shadow-lg">
          <h3 className="text-xl font-bold text-white tracking-wide">{sectionTitle}</h3>
        </div>
        
        {/* 섹션 요약 */}
        {summaryLabel && (
          <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/80 border-2 border-yellow-500/40 rounded-xl px-5 py-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-bold text-lg text-white">{summaryLabel}</span>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-gray-300">총합:</span>
                  <span className="text-yellow-300 font-bold text-lg">
                    {sectionTotals.totalGold > 0
                      ? `${formatNumberWithSignificantDigits(sectionTotals.totalGold)}골드`
                      : '-'}
                  </span>
                </span>
                {sectionTotals.totalCash && (
                  <span className="text-green-300 font-bold text-lg">
                    ≈ {formatNumberWithSignificantDigits(sectionTotals.totalCash)}원
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="bg-gray-800/60 rounded-xl border border-gray-700 overflow-hidden shadow-lg hover:shadow-purple-500/20 transition-shadow duration-300">
            <div className="bg-gradient-to-r from-gray-900/70 to-gray-800/70 px-5 py-3 border-b border-gray-700/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h4 className="text-lg font-bold text-purple-300">{group.title}</h4>
                
                {/* PC방 행운의 상자 내역 보기 버튼 */}
                {group.title === 'PC방 행운의 상자 (매일 최대 3개)' && (
                  <button
                    type="button"
                    onClick={() => setShowPcBangBoxDetails((prev) => !prev)}
                    className="px-3 py-1 text-xs rounded border border-purple-500/60 text-purple-200 hover:bg-purple-500/20 transition-colors"
                  >
                    {showPcBangBoxDetails ? '내역 닫기' : '내역 보기'}
                  </button>
                )}
              </div>
              
              {/* 고결한 혼돈의 돌 품질 선택 */}
              {group.items.some(item => getItemName(item) === '고결한 혼돈의 돌 선택 상자') && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">품질:</span>
                  <select
                    value={chaosStoneQuality}
                    onChange={(e) => setChaosStoneQuality(Number(e.target.value) as 90 | 95)}
                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
                  >
                    <option value={90}>90</option>
                    <option value={95}>95</option>
                  </select>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-900/50 to-gray-800/50 border-b-2 border-gray-600/70">
                    <th className="px-4 py-3 text-left text-sm font-bold text-gray-200">아이템명</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">수량</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">단가</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-200">총합</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, itemIdx) => {
                    const isKurzanItem = item.type === 'kurzan';
                    const isPcBangLuckyBox = getItemName(item).startsWith('PC방 행운의 상자');
                    const kurzanValue = adjustedKurzanValue;
                    const priceInfo =
                      isKurzanItem && kurzanValue != null
                        ? {
                            unit: 'gold' as const,
                            unitAmount: kurzanValue,
                            goldEquivalent: kurzanValue,
                            cashEquivalent: null,
                            note: null,
                          }
                        : isPcBangLuckyBox
                          ? {
                              unit: pcBangLuckyBoxExpectedGold != null ? ('gold' as const) : null,
                              unitAmount: pcBangLuckyBoxExpectedGold,
                              goldEquivalent: pcBangLuckyBoxExpectedGold,
                              cashEquivalent: null,
                              note: pcBangLuckyBoxExpectedGold != null ? '상세 구성 기대값' : null,
                            }
                          : getItemPriceInfo(getItemName(item));
                    const unitDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue)}골드` : '-')
                      : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                    const totalDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드` : '-')
                      : formatPriceDisplay(
                          priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                          priceInfo.unit
                        );
                    const composition = getCompositionInfo(getItemName(item), item.quantity);
                    
                    return (
                      <tr key={itemIdx} className="border-b border-gray-700/50 hover:bg-gray-700/40 transition-colors duration-200">
                        <td className="px-4 py-3 text-white">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <span>{getItemName(item)}</span>
                              {isKurzanItem && kurzanStageOptions.length > 0 && (
                                <select
                                  value={selectedKurzanKey}
                                  onChange={(e) => setSelectedKurzanKey(e.target.value)}
                                  className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                  {kurzanStageOptions.map((option) => (
                                    <option key={option.key} value={option.key}>
                                      {option.level} / {option.stage}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {composition.perUnit && !isKurzanItem && !isPcBangLuckyBox && (
                              <div className="text-xs text-gray-400 mt-1">1개당 {composition.perUnit}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          <div>{formatNumberWithSignificantDigits(item.quantity)}</div>
                          {isKurzanItem && selectedKurzanStage && (
                            <div className="text-xs text-gray-500 mt-1">
                              ({selectedKurzanStage.level} / {selectedKurzanStage.stage})
                            </div>
                          )}
                          {composition.total && !isKurzanItem && !isPcBangLuckyBox && (
                            <div className="text-xs text-gray-500 mt-1">({composition.total})</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {unitDisplay}
                        </td>
                        <td className="px-4 py-3 text-right text-yellow-400 font-semibold">
                          {totalDisplay}
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* 합계 행 */}
                  <tr className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-t-2 border-purple-500/60">
                    <td className="px-4 py-4 text-white font-bold text-base">소계 (골드 환산)</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-right text-yellow-300 font-bold text-base">
                      {(() => {
                        const totalGold = group.items.reduce((sum, item) => {
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const itemName = getItemName(item);
                          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          const priceInfo = getItemPriceInfo(itemName);
                          let goldValue: number | null = null;
                          if (priceInfo.goldEquivalent !== null) {
                            goldValue = priceInfo.goldEquivalent;
                          } else if (priceInfo.cashEquivalent !== null) {
                            goldValue = convertCashToGold(priceInfo.cashEquivalent);
                          }
                          return goldValue != null ? sum + goldValue * item.quantity : sum;
                        }, 0);
                        return totalGold > 0
                          ? `${formatNumberWithSignificantDigits(totalGold)}골드`
                          : '-';
                      })()}
                    </td>
                  </tr>
                  <tr className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-t border-green-500/40">
                    <td className="px-4 py-4 text-white font-bold text-base">소계 (현금 환산)</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-xs text-gray-400 text-right">
                      {goldToCashPerGold
                        ? cashMode === 'discord'
                          ? `디스코드: 100골드 ${discordRate ?? '-'}원`
                          : `화폐거래소: 100크리 ${crystalGoldRate ?? '-'}골드`
                        : '환산 불가'}
                    </td>
                    <td className="px-4 py-4 text-right text-green-300 font-bold text-base">
                      {(() => {
                        const totalGold = group.items.reduce((sum, item) => {
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const itemName = getItemName(item);
                          const isPcBangLuckyBox = itemName.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          const priceInfo = getItemPriceInfo(itemName);
                          let goldValue: number | null = null;
                          if (priceInfo.goldEquivalent !== null) {
                            goldValue = priceInfo.goldEquivalent;
                          } else if (priceInfo.cashEquivalent !== null) {
                            goldValue = convertCashToGold(priceInfo.cashEquivalent);
                          }
                          return goldValue != null ? sum + goldValue * item.quantity : sum;
                        }, 0);
                        if (!goldToCashPerGold || totalGold === 0) return '-';
                        const cashValue = totalGold * goldToCashPerGold;
                        return `${formatNumberWithSignificantDigits(cashValue)}원`;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* PC방 행운의 상자 내역 */}
            {group.title === 'PC방 행운의 상자 (매일 최대 3개)' && showPcBangBoxDetails && (
              <div className="px-5 py-4 bg-gray-900/40">
                <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-purple-900/30 text-gray-300 border-b border-purple-500/30">
                        <th className="px-2 py-2 text-left">아이템</th>
                        <th className="px-2 py-2 text-center">수량</th>
                        <th className="px-2 py-2 text-center">확률</th>
                        <th className="px-2 py-2 text-right">단가</th>
                        <th className="px-2 py-2 text-right">기대값</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pcBangLuckyBoxDetails.map((detail) => {
                        const priceInfo = getItemPriceInfo(detail.itemName);
                        let goldValue: number | null = null;
                        if (priceInfo.goldEquivalent !== null) {
                          goldValue = priceInfo.goldEquivalent;
                        } else if (priceInfo.cashEquivalent !== null) {
                          goldValue = convertCashToGold(priceInfo.cashEquivalent);
                        }
                        const expectedValue = goldValue !== null ? goldValue * detail.probability * detail.quantity : null;
                        return (
                          <tr key={detail.displayName} className="border-b border-purple-500/20 hover:bg-purple-900/20">
                            <td className="px-2 py-2 text-gray-200">
                              <div className="flex items-center gap-2">
                                <span>{detail.displayName}</span>
                                {priceInfo.note && (
                                  <span className="text-[10px] text-gray-400">({priceInfo.note})</span>
                                )}
                                {detail.itemName === '전설 카드 선택팩' && (
                                  <input
                                    type="number"
                                    min="1000"
                                    step="100"
                                    value={legendaryCardSelectionPriceInput}
                                    onChange={(e) => setLegendaryCardSelectionPriceInput(e.target.value)}
                                    className="w-24 bg-gray-800 text-white border border-purple-500/40 rounded px-2 py-1 text-[11px]"
                                    title="전설 카드 선택팩 단가(골드)"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-gray-300">
                              {formatNumberWithSignificantDigits(detail.quantity)}
                            </td>
                            <td className="px-2 py-2 text-center text-purple-300 font-semibold">
                              {detail.chanceText}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              {priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-blue-300">{formatNumberWithSignificantDigits(priceInfo.unitAmount)}크리</span>
                                  {goldValue !== null && (
                                    <span className="text-[10px] text-gray-400">
                                      ({formatNumberWithSignificantDigits(goldValue)}골드)
                                    </span>
                                  )}
                                </div>
                              ) : goldValue !== null ? (
                                `${formatNumberWithSignificantDigits(goldValue)}골드`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-yellow-300 font-semibold">
                              {expectedValue !== null
                                ? `${formatNumberWithSignificantDigits(expectedValue)}골드`
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 border-t-2 border-purple-500/60">
                        <td colSpan={4} className="px-2 py-2 text-gray-200 font-bold">
                          총 기대값 (1회)
                        </td>
                        <td className="px-2 py-2 text-right text-yellow-300 font-bold">
                          {pcBangLuckyBoxExpectedGold !== null
                            ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold)}골드`
                            : '-'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 종료일 체크 (배포 환경에서만)
  const isEventExpired = useMemo(() => {
    if (process.env.NODE_ENV === 'development') {
      return false; // 개발 환경에서는 항상 표시
    }
    if (!endDate) {
      return false; // 종료일이 설정되지 않았으면 표시
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return today > end;
  }, [endDate]);

  // 종료일이 지났으면 배포 버전에서 숨기기
  if (isEventExpired) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl font-bold text-white">PC방 이벤트</h1>
            <div className="flex flex-wrap gap-2">
              {/* 저장 버튼 (로컬에서만 표시) */}
              {allowEventEfficiencySave && (
                <button
                  onClick={handleSaveEventEfficiency}
                  disabled={isLoading || !eventName.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  저장
                </button>
              )}
            </div>
          </div>
          
          {/* 새로 만들기 버튼 (로컬에서만 표시) */}
          {allowEventEfficiencySave && (
            <div className="mb-3">
              <button
                onClick={handleNewEventEfficiency}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 font-semibold shadow-md shadow-green-500/30 hover:shadow-lg hover:shadow-green-500/50 transform hover:scale-105 active:scale-95 border border-green-500/50"
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
          )}
          
          {/* 저장된 이벤트 효율 드롭다운 */}
          {savedEventEfficiency.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-white mb-2">저장된 이벤트 효율</h3>
                <div className="flex gap-2">
                  <select
                    value={selectedEventEfficiencyId || ''}
                    onChange={(e) => {
                      const itemId = e.target.value;
                      if (itemId) {
                        handleLoadEventEfficiency(itemId);
                      } else {
                        // 빈 값 선택 시 초기화
                        setSelectedEventEfficiencyId(null);
                        setWeeklyRewardsEditable([]);
                        setCumulativeRewardsEditable([]);
                        setEventName('');
                        setEndDate('');
                        setTotalWeeksInput('7');
                        setTotalHoursInput('70');
                        // 활성 이벤트가 없으면 기본정보 카드 숨김
                        setShowBasicInfo(hasActiveEvent);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    disabled={isLoading}
                  >
                    <option value="">이벤트 선택...</option>
                    {savedEventEfficiency.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.end_date ? ` (종료일: ${new Date(item.end_date).toLocaleDateString('ko-KR')})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedEventEfficiencyId && allowEventEfficiencySave && (
                    <button
                      onClick={() => {
                        if (selectedEventEfficiencyId) {
                          handleDeleteEventEfficiency(selectedEventEfficiencyId);
                        }
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                      disabled={isLoading}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* 기본정보 입력 카드 */}
          {showBasicInfo && (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
            <h3 className="text-base font-semibold text-white mb-4">기본정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">이벤트명</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="이벤트명을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">총 주수</label>
                <input
                  type="number"
                  value={totalWeeksInput}
                  onChange={(e) => setTotalWeeksInput(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="총 주수"
                  min="1"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">총 시간</label>
                <input
                  type="number"
                  value={totalHoursInput}
                  onChange={(e) => setTotalHoursInput(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="총 시간"
                  min="1"
                  step="1"
                />
              </div>
            </div>
          </div>
          )}

          <div className="flex flex-wrap gap-2">
            {eventSubTabs.map((subTab) => {
              const isActive = subTab.key === activeSubTab.key;
              return (
                <button
                  key={subTab.key}
                  onClick={() => setActiveSubTab(subTab)}
                  className={`px-4 py-2 rounded-xl border transition-all text-sm font-semibold ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent shadow-lg'
                      : 'text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                  }`}
                >
                  {subTab.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            {activeSubTab.key === 'summary' && (
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/40 rounded-2xl p-6 space-y-6 shadow-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-200 bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">총 진행 일수:</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                      className="px-3 py-1 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 w-24"
                    value={totalDaysInput}
                    onChange={(e) => setTotalDaysInput(e.target.value)}
                  />
                    <span className="text-gray-400">일</span>
                    {totalDaysNumber && daysPerWeek && (
                  <span className="text-gray-400">
                        (주당 {formatNumberWithSignificantDigits(daysPerWeek)}일)
                  </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 border border-yellow-500/30 rounded-xl p-5 shadow-lg hover:shadow-yellow-500/20 transition-shadow duration-300">
                  <div className="text-sm text-gray-400">총 골드 가치</div>
                  <div className="text-2xl font-bold text-yellow-300 mt-1">
                    {aggregateTotals.totalGold > 0
                      ? `${formatNumberWithSignificantDigits(aggregateTotals.totalGold)}골드`
                      : '-'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 border border-green-500/30 rounded-xl p-5 shadow-lg hover:shadow-green-500/20 transition-shadow duration-300">
                  <div className="text-sm text-gray-400">총 현금 환산</div>
                  <div className="text-2xl font-bold text-green-300 mt-1">
                    {aggregateTotals.totalCash
                      ? `${formatNumberWithSignificantDigits(aggregateTotals.totalCash)}원`
                      : '-'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 border border-yellow-500/30 rounded-xl p-5 shadow-lg hover:shadow-yellow-500/20 transition-shadow duration-300">
                  <div className="text-sm text-gray-400">시간당 골드</div>
                  <div className="text-2xl font-bold text-yellow-300 mt-1">
                    {aggregateTotals.hourlyGold
                      ? `${formatNumberWithSignificantDigits(aggregateTotals.hourlyGold)}골드`
                      : '-'}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 border border-green-500/30 rounded-xl p-5 shadow-lg hover:shadow-green-500/20 transition-shadow duration-300">
                  <div className="text-sm text-gray-400">시간당 현금 환산</div>
                  <div className="text-2xl font-bold text-green-300 mt-1">
                    {aggregateTotals.hourlyCash
                      ? `${formatNumberWithSignificantDigits(aggregateTotals.hourlyCash)}원`
                      : '-'}
                  </div>
                </div>
              </div>

              {/* 주간보상 섹션 */}
              {weeklyRewardsGroupDetails.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                      <span className="w-1 h-6 bg-blue-500 rounded"></span>
                      주간 보상
                    </h3>
                  </div>
                  
                  {/* 총합 정보 */}
                  <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl p-4 border border-blue-500/30">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">1회 총합</div>
                        <div className="text-xl font-bold text-blue-300">
                          {weeklyRewardsTotalValue > 0 ? `${formatNumberWithSignificantDigits(weeklyRewardsTotalValue)}골드` : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">총 주수</div>
                        <div className="text-xl font-bold text-blue-300">
                          {totalWeeksNumber}주
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">전체 가치</div>
                        <div className="text-xl font-bold text-yellow-300">
                          {weeklyRewardsTotalValue > 0 && totalWeeksNumber > 0
                            ? `${formatNumberWithSignificantDigits(weeklyRewardsTotalValue * totalWeeksNumber)}골드`
                            : '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 그룹별 상세 테이블 */}
                  {weeklyRewardsGroupDetails.map((group, groupIdx) => (
                    <div key={groupIdx} className="space-y-2">
                      <h4 className="text-base font-semibold text-blue-300">{group.groupTitle}</h4>
                      <div className="overflow-x-auto rounded-xl border border-blue-500/30 shadow-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 text-gray-200 border-b-2 border-blue-500/50">
                              <th className="px-4 py-3 text-left font-bold">묶음 항목</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 단가</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 수량</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 가치</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item, itemIdx) => {
                              const bundleKey = `summary-weekly-${groupIdx}-${itemIdx}-${item.itemName}`;
                              const isExpanded = expandedBundleItemsSummary.has(bundleKey);
                              return (
                                <>
                                  <tr key={`item-${itemIdx}`} className="border-b border-gray-800/70 hover:bg-gray-700/30 transition-colors">
                                    <td className="px-4 py-3 text-white font-medium">
                                      <div className="flex items-center gap-2">
                                        {item.details.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newExpanded = new Set(expandedBundleItemsSummary);
                                              if (isExpanded) {
                                                newExpanded.delete(bundleKey);
                                              } else {
                                                newExpanded.add(bundleKey);
                                              }
                                              setExpandedBundleItemsSummary(newExpanded);
                                            }}
                                            className="text-gray-400 hover:text-white transition-colors"
                                            aria-label={isExpanded ? '접기' : '펼치기'}
                                          >
                                            {isExpanded ? '▼' : '▶'}
                                          </button>
                                        )}
                                        <span>
                                          {item.itemName}
                                          <span className="ml-2 text-xs text-gray-400">({item.itemType})</span>
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-300">
                                      {item.bundleUnitPrice > 0 ? `${formatNumberWithSignificantDigits(item.bundleUnitPrice)}골드` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-300">
                                      {item.bundleQuantity}
                                    </td>
                                    <td className="px-4 py-3 text-right text-yellow-300 font-semibold">
                                      {item.bundleUnitPrice > 0
                                        ? `${formatNumberWithSignificantDigits(item.bundleUnitPrice * item.bundleQuantity)}골드`
                                        : '-'}
                                    </td>
                                  </tr>
                                  {isExpanded && item.details.map((detail, detailIdx) => (
                                    <tr key={`detail-${itemIdx}-${detailIdx}`} className="bg-gray-900/30 border-b border-gray-800/50">
                                      <td className="px-4 py-2 text-gray-400 text-xs pl-8">
                                        • {detail.itemName}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.unitPrice > 0 ? `${formatNumberWithSignificantDigits(detail.unitPrice)}골드` : '-'}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.componentQuantity}
                                        {detail.probability !== undefined && (
                                          <span className="text-purple-400 ml-1">× {formatNumberWithSignificantDigits(detail.probability * 100)}%</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.value > 0 ? `${formatNumberWithSignificantDigits(detail.value)}골드` : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gradient-to-r from-blue-900/60 to-purple-900/60 border-t-2 border-blue-500/60">
                              <td colSpan={3} className="px-4 py-2 text-right text-gray-200 font-bold">
                                그룹 합계
                              </td>
                              <td className="px-4 py-2 text-right text-yellow-300 font-bold">
                                {group.groupTotal > 0 ? `${formatNumberWithSignificantDigits(group.groupTotal)}골드` : '-'}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 누적보상 섹션 */}
              {cumulativeRewardsGroupDetails.length > 0 && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                      <span className="w-1 h-6 bg-purple-500 rounded"></span>
                      누적 보상
                    </h3>
                  </div>
                  
                  {/* 총합 정보 */}
                  <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 rounded-xl p-4 border border-purple-500/30">
                    <div>
                      <div className="text-sm text-gray-400 mb-1">총합</div>
                      <div className="text-xl font-bold text-purple-300">
                        {cumulativeRewardsTotalValue > 0 ? `${formatNumberWithSignificantDigits(cumulativeRewardsTotalValue)}골드` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* 그룹별 상세 테이블 */}
                  {cumulativeRewardsGroupDetails.map((group, groupIdx) => (
                    <div key={groupIdx} className="space-y-2">
                      <h4 className="text-base font-semibold text-purple-300">{group.groupTitle}</h4>
                      <div className="overflow-x-auto rounded-xl border border-purple-500/30 shadow-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 text-gray-200 border-b-2 border-purple-500/50">
                              <th className="px-4 py-3 text-left font-bold">묶음 항목</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 단가</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 수량</th>
                              <th className="px-4 py-3 text-right font-bold">묶음 가치</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item, itemIdx) => {
                              const bundleKey = `summary-cumulative-${groupIdx}-${itemIdx}-${item.itemName}`;
                              const isExpanded = expandedBundleItemsSummary.has(bundleKey);
                              return (
                                <>
                                  <tr key={`item-${itemIdx}`} className="border-b border-gray-800/70 hover:bg-gray-700/30 transition-colors">
                                    <td className="px-4 py-3 text-white font-medium">
                                      <div className="flex items-center gap-2">
                                        {item.details.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newExpanded = new Set(expandedBundleItemsSummary);
                                              if (isExpanded) {
                                                newExpanded.delete(bundleKey);
                                              } else {
                                                newExpanded.add(bundleKey);
                                              }
                                              setExpandedBundleItemsSummary(newExpanded);
                                            }}
                                            className="text-gray-400 hover:text-white transition-colors"
                                            aria-label={isExpanded ? '접기' : '펼치기'}
                                          >
                                            {isExpanded ? '▼' : '▶'}
                                          </button>
                                        )}
                                        <span>
                                          {item.itemName}
                                          <span className="ml-2 text-xs text-gray-400">({item.itemType})</span>
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-300">
                                      {item.bundleUnitPrice > 0 ? `${formatNumberWithSignificantDigits(item.bundleUnitPrice)}골드` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-300">
                                      {item.bundleQuantity}
                                    </td>
                                    <td className="px-4 py-3 text-right text-yellow-300 font-semibold">
                                      {item.bundleUnitPrice > 0
                                        ? `${formatNumberWithSignificantDigits(item.bundleUnitPrice * item.bundleQuantity)}골드`
                                        : '-'}
                                    </td>
                                  </tr>
                                  {isExpanded && item.details.map((detail, detailIdx) => (
                                    <tr key={`detail-${itemIdx}-${detailIdx}`} className="bg-gray-900/30 border-b border-gray-800/50">
                                      <td className="px-4 py-2 text-gray-400 text-xs pl-8">
                                        • {detail.itemName}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.unitPrice > 0 ? `${formatNumberWithSignificantDigits(detail.unitPrice)}골드` : '-'}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.componentQuantity}
                                        {detail.probability !== undefined && (
                                          <span className="text-purple-400 ml-1">× {formatNumberWithSignificantDigits(detail.probability * 100)}%</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                        {detail.value > 0 ? `${formatNumberWithSignificantDigits(detail.value)}골드` : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gradient-to-r from-purple-900/60 to-pink-900/60 border-t-2 border-purple-500/60">
                              <td colSpan={3} className="px-4 py-2 text-right text-gray-200 font-bold">
                                그룹 합계
                              </td>
                              <td className="px-4 py-2 text-right text-yellow-300 font-bold">
                                {group.groupTotal > 0 ? `${formatNumberWithSignificantDigits(group.groupTotal)}골드` : '-'}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 상시혜택 섹션 */}
              {aggregateRewards.filter(item => item.category === 'daily').length > 0 && (
                <div className="space-y-3 mt-6">
                  <h3 className="text-lg font-bold text-green-400 flex items-center gap-2">
                    <span className="w-1 h-6 bg-green-500 rounded"></span>
                    상시 혜택 (일일) ({totalDaysNumber ?? 0}일)
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-green-500/30 shadow-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 text-gray-200 border-b-2 border-green-500/50">
                          <th className="px-4 py-4 text-left font-bold">아이템명</th>
                          <th className="px-4 py-4 text-right font-bold">총 수량</th>
                          <th className="px-4 py-4 text-right font-bold">단가</th>
                          <th className="px-4 py-4 text-right font-bold">총합</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregateRewards.filter(item => item.category === 'daily').map((item, idx) => {
                          const enabled = enabledRewards[item.name] ?? true;
                          const isKurzanSummaryItem = item.name === '쿠르잔 전선 보상 (휴식게이지 2배)';
                          const isPcBangLuckyBoxSummaryItem = item.name === PC_BANG_LUCKY_SUMMARY_NAME;
                          const kurzanValue = adjustedKurzanValue;
                          const priceInfo = isKurzanSummaryItem
                            ? {
                                unit: 'gold' as const,
                                unitAmount: kurzanValue,
                                goldEquivalent: kurzanValue,
                                cashEquivalent: null,
                                note: null,
                              }
                            : isPcBangLuckyBoxSummaryItem
                              ? {
                                  unit: pcBangLuckyBoxExpectedGold != null ? ('gold' as const) : null,
                                  unitAmount: pcBangLuckyBoxExpectedGold,
                                  goldEquivalent: pcBangLuckyBoxExpectedGold,
                                  cashEquivalent: null,
                                  note: pcBangLuckyBoxExpectedGold != null ? '상세 구성 기대값' : null,
                                }
                              : getItemPriceInfo(getItemName(item));
                          // 단가를 골드로 통일
                          let unitPriceInGold: number | null = null;
                          if (isKurzanSummaryItem) {
                            unitPriceInGold = kurzanValue;
                          } else if (isPcBangLuckyBoxSummaryItem) {
                            unitPriceInGold = pcBangLuckyBoxExpectedGold;
                          } else {
                            // priceInfo에서 골드 가치 가져오기
                            if (priceInfo.goldEquivalent !== null) {
                              unitPriceInGold = priceInfo.goldEquivalent;
                            } else if (priceInfo.cashEquivalent !== null) {
                              unitPriceInGold = convertCashToGold(priceInfo.cashEquivalent);
                            } else if (priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null) {
                              unitPriceInGold = convertCrystalToGold(priceInfo.unitAmount);
                            }
                          }
                          const unitDisplay = unitPriceInGold != null
                            ? `${formatNumberWithSignificantDigits(unitPriceInGold)}골드`
                            : '-';
                          const totalDisplay = unitPriceInGold != null && item.quantity > 0
                            ? `${formatNumberWithSignificantDigits(unitPriceInGold * item.quantity)}골드`
                            : '-';
                          const composition = getCompositionInfo(getItemName(item), item.quantity);

                          return (
                          <tr
                            key={`daily-${item.name}-${idx}`}
                            className={`border-b border-gray-800/70 hover:bg-gray-700/30 transition-colors duration-200 ${!enabled ? 'opacity-40' : ''}`}
                          >
                            <td className="px-4 py-3 text-white">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleReward(item.name)}
                                  className={`w-10 h-5 rounded-full border transition-colors ${
                                    enabled
                                      ? 'bg-purple-600 border-purple-500'
                                      : 'bg-gray-600 border-gray-500'
                                  }`}
                                  aria-label={`${item.name} 포함 여부`}
                                >
                                  <span
                                    className={`inline-block w-4 h-4 rounded-full bg-white transform transition-transform ${
                                      enabled ? 'translate-x-5' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                                <span>
                                  {item.name}
                                  {isKurzanSummaryItem && selectedKurzanStage && (
                                    <span className="ml-2 text-xs text-gray-400">
                                      ({selectedKurzanStage.level} / {selectedKurzanStage.stage})
                                    </span>
                                  )}
                                </span>
                                {getItemName(item) === '고결한 혼돈의 돌 선택 상자' && (
                                  <select
                                    value={chaosStoneQuality}
                                    onChange={(e) => setChaosStoneQuality(Number(e.target.value) as 90 | 95)}
                                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                  >
                                    <option value={90}>품질 90</option>
                                    <option value={95}>품질 95</option>
                                  </select>
                                )}
                                {getItemName(item) === '팔찌 효과 재변환권' && (
                                  <input
                                    type="number"
                                    min="1"
                                    value={braceletPriceInput}
                                    onChange={(e) => setBraceletPriceInput(e.target.value)}
                                    className="w-24 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                  />
                                )}
                              </div>
                              {composition.perUnit && (
                                <div className="text-xs text-gray-400 mt-1">1개당 {composition.perUnit}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">
                              <div>{formatNumberWithSignificantDigits(item.quantity)}</div>
                              {composition.total && (
                                <div className="text-xs text-gray-500 mt-1">({composition.total})</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">
                              {unitDisplay}
                              {priceInfo.note && (
                                <div className="text-xs text-gray-500 mt-1">{priceInfo.note}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-yellow-300 font-semibold">
                              {totalDisplay}
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gradient-to-r from-green-900/60 to-emerald-900/60 border-t-2 border-green-500/60">
                          <td colSpan={3} className="px-4 py-3 text-right text-gray-200 font-bold">
                            상시 혜택 총합
                          </td>
                          <td className="px-4 py-3 text-right text-yellow-300 font-bold text-lg">
                            {(() => {
                              const dailyTotal = aggregateRewards
                                .filter(item => item.category === 'daily')
                                .reduce((sum, item) => {
                                  const enabled = enabledRewards[item.name] ?? true;
                                  if (!enabled) return sum;
                                  const isKurzanSummaryItem = item.name === '쿠르잔 전선 보상 (휴식게이지 2배)';
                                  const isPcBangLuckyBoxSummaryItem = item.name === PC_BANG_LUCKY_SUMMARY_NAME;
                                  const kurzanValue = adjustedKurzanValue;
                                  let unitPriceInGold: number | null = null;
                                  if (isKurzanSummaryItem) {
                                    unitPriceInGold = kurzanValue;
                                  } else if (isPcBangLuckyBoxSummaryItem) {
                                    unitPriceInGold = pcBangLuckyBoxExpectedGold;
                                  } else {
                                    const priceInfo = getItemPriceInfo(getItemName(item));
                                    if (priceInfo.goldEquivalent !== null) {
                                      unitPriceInGold = priceInfo.goldEquivalent;
                                    } else if (priceInfo.cashEquivalent !== null) {
                                      unitPriceInGold = convertCashToGold(priceInfo.cashEquivalent);
                                    } else if (priceInfo.unit === 'crystal' && priceInfo.unitAmount !== null) {
                                      unitPriceInGold = convertCrystalToGold(priceInfo.unitAmount);
                                    }
                                  }
                                  if (unitPriceInGold != null) {
                                    return sum + unitPriceInGold * item.quantity;
                                  }
                                  return sum;
                                }, 0);
                              return dailyTotal > 0 ? `${formatNumberWithSignificantDigits(dailyTotal)}골드` : '-';
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
            )}

            {activeSubTab.key === 'summary' && (
              <div className="text-sm text-gray-400 flex flex-wrap gap-2">
                <span>현금 환산 기준:</span>
                {cashMode === 'discord'
                  ? discordRate
                    ? `디스코드 (100골드 = ${discordRate}원 · 1골드 ≈ ${
                        goldToCashPerGold ? formatNumberWithSignificantDigits(goldToCashPerGold) : '-'
                      }원)`
                    : '디스코드 환율 정보를 불러올 수 없습니다.'
                  : crystalGoldRate
                    ? `화폐거래소 (100크리 = ${formatNumberWithSignificantDigits(crystalGoldRate)}골드 · 1골드 ≈ ${
                        goldToCashPerGold ? formatNumberWithSignificantDigits(goldToCashPerGold) : '-'
                      }원)`
                    : '화폐거래소 환율 정보를 불러올 수 없습니다.'}
              </div>
            )}

            {activeSubTab.key === 'weekly' && renderEditableRewardTableNew(weeklyRewards, 'weekly', '주간 보상')}
            {activeSubTab.key === 'cumulative' && renderEditableRewardTableNew(cumulativeRewards, 'cumulative', '누적 보상')}
            {activeSubTab.key === 'daily' && renderReadOnlyRewardTable(dailyBenefits, '상시 혜택 (일일)', '상시 혜택 총합')}
          </div>
        </div>
      </div>
    </div>
  );
}