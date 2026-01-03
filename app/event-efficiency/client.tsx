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
  nestedItem?: RewardItemNew; // 중첩된 묶음 항목
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
  initialSavedEventEfficiency?: Array<{ id: string; name: string; created_at: string; updated_at: string; weekly_rewards?: any; cumulative_rewards?: any; event_name?: string | null; event_end_date?: string | null }>;
};

export default function EventEfficiencyClient({ etcListItems, crystalGoldRate, marketCache, discordRate, kurzanStages, initialSavedEventEfficiency = [] }: Props) {
  const { adjustPrice } = usePriceAdjustment();
  const { state: priceOverrideState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  
  // 로컬 환경에서만 이벤트 효율 저장/업데이트 허용
  const allowEventEfficiencySave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
  
  // 저장된 이벤트 효율 관련 상태
  const [savedEventEfficiency, setSavedEventEfficiency] = useState<Array<{ id: string; name: string; created_at: string; updated_at: string; weekly_rewards?: any; cumulative_rewards?: any; event_name?: string | null; event_end_date?: string | null }>>(initialSavedEventEfficiency);
  const [selectedEventEfficiencyId, setSelectedEventEfficiencyId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveEventEfficiencyName, setSaveEventEfficiencyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 이벤트 정보 상태
  const [eventName, setEventName] = useState('');
  const [eventEndDate, setEventEndDate] = useState<string | null>(null);
  
  // 디버깅: adjustedEntries 확인
  useEffect(() => {
    console.log('[이벤트 효율] adjustedEntries 개수:', adjustedEntries?.length || 0);
    if (adjustedEntries && adjustedEntries.length > 0) {
      console.log('[이벤트 효율] 첫 5개 항목:', adjustedEntries.slice(0, 5).map(e => e.itemName));
    }
  }, [adjustedEntries]);
  
  // 디버깅: 이벤트명과 종료일 상태 확인
  useEffect(() => {
    console.log('[이벤트 효율] 현재 이벤트명 상태:', eventName);
    console.log('[이벤트 효율] 현재 종료일 상태:', eventEndDate);
  }, [eventName, eventEndDate]);
  
  // 저장된 이벤트 효율 목록 불러오기 (페이지 로드 시)
  useEffect(() => {
    async function loadSavedEventEfficiency() {
      try {
        const res = await fetch('/api/event-efficiency');
        const data = await res.json();
        if (data.items) {
          setSavedEventEfficiency(data.items);
        }
      } catch (error) {
        console.error('저장된 이벤트 효율 목록 불러오기 실패:', error);
      }
    }
    loadSavedEventEfficiency();
  }, []);
  
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
  const [braceletPriceInput, setBraceletPriceInput] = useState('100');
  const [totalDaysInput, setTotalDaysInput] = useState('7');
  const [totalWeeksInput, setTotalWeeksInput] = useState('7');
  const [totalHoursInput, setTotalHoursInput] = useState('70');
  const [legendaryCardSelectionPriceInput, setLegendaryCardSelectionPriceInput] = useState('50000');
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
  
  // 아이템 단가 가져오기 (가치계산DB 우선 사용 - 가격 조정 자동 반영)
  const getItemUnitPrice = useCallback((itemName: string): number | null => {
    if (!itemName || itemName === '__nested__' || itemName === '__manual__') return null;
    
    // 1. 가치계산DB에서 찾기 (우선순위 - adjustedEntries는 가격 조정이 이미 적용된 데이터)
    if (adjustedEntries && adjustedEntries.length > 0) {
      const valueDbEntry = adjustedEntries.find(entry => entry.itemName === itemName);
      if (valueDbEntry && valueDbEntry.unitType === '골드' && valueDbEntry.unitValue !== null) {
        return valueDbEntry.unitValue;
      }
    }
    
    // 2. fallback: etc_list에서 찾기
    const etcItem = etcListItems.find(item => item.itemName === itemName);
    if (etcItem) {
      if (etcItem.gold !== null) return etcItem.gold;
      if (etcItem.crystal !== null && crystalGoldRate !== null) {
        return (etcItem.crystal * crystalGoldRate) / 100;
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
  }, [adjustedEntries, etcListItems, marketCache, crystalGoldRate, adjustPrice]);
  
  // 초기 주간 보상 데이터 (새로 만들기용)
  const initialWeeklyRewards: RewardGroup[] = [
    {
      title: '2시간 달성',
      items: [
        { itemName: '실링', itemType: '확정', quantity: 1, components: [{ itemName: '실링', quantity: 1000000 }] },
        { itemName: '배틀 아이템 종합 상자', itemType: '확정', quantity: 1, components: [{ itemName: '배틀 아이템 종합 상자', quantity: 5 }] },
      ],
    },
    {
      title: '4시간 달성',
      items: [
        { itemName: '도약의 정수', itemType: '확정', quantity: 1, components: [{ itemName: '도약의 정수', quantity: 5 }] },
        { itemName: '중급 생기 회복물약', itemType: '확정', quantity: 1, components: [{ itemName: '중급 생기 회복물약', quantity: 5 }] },
      ],
    },
    {
      title: '6시간 달성',
      items: [
        { itemName: '운명의 수호석 주머니', itemType: '확정', quantity: 1, components: [{ itemName: '운명의 수호석 주머니', quantity: 40 }] },
        { itemName: '운명의 파괴석 주머니', itemType: '확정', quantity: 1, components: [{ itemName: '운명의 파괴석 주머니', quantity: 20 }] },
      ],
    },
    {
      title: '8시간 달성',
      items: [
        { itemName: '재련 돌파석 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 돌파석 선택 상자', quantity: 10 }] },
        { itemName: '고급~영웅 젬 상자', itemType: '확정', quantity: 1, components: [{ itemName: '고급~영웅 젬 상자', quantity: 2 }] },
      ],
    },
    {
      title: '10시간 달성',
      items: [
        { itemName: '재련 보조 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 보조 선택 상자', quantity: 5 }] },
        { itemName: '재련 파편 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 파편 선택 상자', quantity: 20 }] },
      ],
    },
  ];
  
  // 초기 누적 보상 데이터 (새로 만들기용)
  const initialCumulativeRewards: RewardGroup[] = [
    {
      title: '10시간 달성',
      items: [
        { itemName: '실링', itemType: '확정', quantity: 1, components: [{ itemName: '실링', quantity: 6000000 }] },
        { itemName: '운명의 수호석 주머니', itemType: '확정', quantity: 1, components: [{ itemName: '운명의 수호석 주머니', quantity: 80 }] },
        { itemName: '운명의 파괴석 주머니', itemType: '확정', quantity: 1, components: [{ itemName: '운명의 파괴석 주머니', quantity: 40 }] },
        { itemName: '메넬리크의 서', itemType: '확정', quantity: 1, components: [{ itemName: '메넬리크의 서', quantity: 10 }] },
        { itemName: '전설~희귀 카드팩', itemType: '확정', quantity: 1, components: [{ itemName: '전설~희귀 카드팩', quantity: 15 }] },
      ],
    },
    {
      title: '30시간 달성',
      items: [
        { itemName: '재련 파편 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 파편 선택 상자', quantity: 20 }] },
        { itemName: '재련 돌파석 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 돌파석 선택 상자', quantity: 20 }] },
        { itemName: '정련된 혼돈의(무기)', itemType: '확정', quantity: 1, components: [{ itemName: '정련된 혼돈의(무기)', quantity: 10 }] },
        { itemName: '정련된 혼돈의(방어구)', itemType: '확정', quantity: 1, components: [{ itemName: '정련된 혼돈의(방어구)', quantity: 30 }] },
        { itemName: '전설~영웅 카드팩', itemType: '확정', quantity: 1, components: [{ itemName: '전설~영웅 카드팩', quantity: 10 }] },
      ],
    },
    {
      title: '50시간 달성',
      items: [
        { itemName: '[이벤트] 재봉술 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '[이벤트] 재봉술 선택 상자', quantity: 5 }] },
        { itemName: '[이벤트] 야금술 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '[이벤트] 야금술 선택 상자', quantity: 3 }] },
        { itemName: '재련 융화 재료 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 융화 재료 선택 상자', quantity: 20 }] },
        { itemName: '재련 보조 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '재련 보조 선택 상자', quantity: 20 }] },
        { itemName: '정련된 운명의 돌', itemType: '확정', quantity: 1, components: [{ itemName: '정련된 운명의 돌', quantity: 5 }] },
      ],
    },
    {
      title: '70시간 달성',
      items: [
        { itemName: '고결한 혼돈의 돌 선택 상자', itemType: '확정', quantity: 1, components: [{ itemName: '고결한 혼돈의 돌 선택 상자', quantity: 1 }] },
        { itemName: '희귀~영웅 젬 상자', itemType: '확정', quantity: 1, components: [{ itemName: '희귀~영웅 젬 상자', quantity: 7 }] },
        { itemName: '젬 가공 초기화권', itemType: '확정', quantity: 1, components: [{ itemName: '젬 가공 초기화권', quantity: 1 }] },
        { itemName: '유물 각인서 랜덤 주머니', itemType: '확정', quantity: 1, components: [{ itemName: '유물 각인서 랜덤 주머니', quantity: 1 }] },
        { itemName: '팔찌 효과 재변환권', itemType: '확정', quantity: 1, components: [{ itemName: '팔찌 효과 재변환권', quantity: 3 }] },
      ],
    },
  ];
  
  // 주간 보상 상태 (직접 입력 가능) - 새 구조 적용
  const [weeklyRewardsEditable, setWeeklyRewardsEditable] = useState<RewardGroup[]>(initialWeeklyRewards);
  
  // 누적 보상 상태 (직접 입력 가능) - 새 구조 적용
  const [cumulativeRewardsEditable, setCumulativeRewardsEditable] = useState<RewardGroup[]>(initialCumulativeRewards);
  
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
    if (!selectedKurzanStage) return null;
    const base = selectedKurzanStage.totalGold ?? 0;
    const deduction =
      (!kurzanSwitches.breakthrough ? selectedKurzanStage.breakthroughValue : 0) +
      (!kurzanSwitches.fragment ? selectedKurzanStage.fragmentValue : 0) +
      (!kurzanSwitches.cardExp ? selectedKurzanStage.cardExpValue : 0);
    return Math.max(base - deduction, 0);
  }, [selectedKurzanStage, kurzanSwitches]);

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
  }, [adjustPrice, etcListItems, allMarketItems, getMarketPrice, crystalGoldRate, braceletUnitPrice, legendaryCardSelectionUnitPrice, chaosStoneQuality, priceOverrideState]);

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
        { name: '쿠르잔 전선 보상 (휴식게이지 2배)', quantity: 2, type: 'kurzan' },
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
    convertCashToGold,
    convertCrystalToGold,
    etcListItems,
    braceletUnitPrice,
    legendaryCardSelectionUnitPrice,
    chaosStoneQuality,
    allMarketItems,
    pcBangDetailEnabled,
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
    if (!saveEventEfficiencyName.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const name = saveEventEfficiencyName.trim();
      
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
            end_date: eventEndDate || null,
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
            end_date: eventEndDate || null,
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
        setSavedEventEfficiency(listData.items);
        if (data.item) {
          setSelectedEventEfficiencyId(data.item.id);
        }
      }

      setShowSaveModal(false);
      setSaveEventEfficiencyName('');
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
          console.log('[이벤트 효율 불러오기] 전체 데이터:', itemToLoad);
          console.log('[이벤트 효율 불러오기] name 필드:', itemToLoad.name);
          console.log('[이벤트 효율 불러오기] end_date 필드:', itemToLoad.end_date);
          
          if (itemToLoad.weekly_rewards) {
            setWeeklyRewardsEditable(itemToLoad.weekly_rewards);
          }
          if (itemToLoad.cumulative_rewards) {
            setCumulativeRewardsEditable(itemToLoad.cumulative_rewards);
          }
          
          // 이벤트명과 종료일 불러오기 (Supabase 필드명: name, end_date)
          // name은 저장된 이벤트 효율의 이름이자 이벤트명
          const loadedEventName = itemToLoad.name || '';
          let loadedEndDate: string | null = null;
          
          // 날짜 형식 변환 (ISO 형식을 YYYY-MM-DD로 변환)
          if (itemToLoad.end_date) {
            const date = new Date(itemToLoad.end_date);
            if (!isNaN(date.getTime())) {
              // YYYY-MM-DD 형식으로 변환
              loadedEndDate = date.toISOString().split('T')[0];
            } else {
              // 이미 YYYY-MM-DD 형식인 경우
              loadedEndDate = itemToLoad.end_date;
            }
          }
          
          console.log('[이벤트 효율 불러오기] 설정할 이벤트명:', loadedEventName);
          console.log('[이벤트 효율 불러오기] 설정할 종료일:', loadedEndDate);
          
          setEventName(loadedEventName);
          setEventEndDate(loadedEndDate);
          
          setSelectedEventEfficiencyId(itemId);
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
    setEventEndDate(null);
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
    // 총 가치 계산 (하위 묶음 항목 포함, 각 그룹별 합산의 총합)
    const calculateTotalValue = () => {
      let total = 0;
      
      groups.forEach(group => {
        // 그룹별 총 가치 계산 (하위 묶음 항목 포함)
        const groupTotal = group.items.reduce((sum, item) => {
          if (!isNewFormatItem(item)) return sum;
          
          return sum + item.components.reduce((compSum, comp) => {
            // 하위 묶음 항목 처리
            if (comp.itemName === '__nested__' && comp.nestedItem) {
              const nestedItem = comp.nestedItem;
              let totalNestedValue = 0;
              
              nestedItem.components.forEach((nestedComp) => {
                if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return;
                
                const unitPrice = getItemUnitPrice(nestedComp.itemName);
                if (unitPrice === null || unitPrice <= 0) return;
                
                let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                
                if (nestedItem.itemType === '확률') {
                  const nestedProbability = nestedComp.probability || 0;
                  nestedCompValue = nestedCompValue * nestedProbability;
                } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                  nestedCompValue = 0;
                }
                
                totalNestedValue += nestedCompValue;
              });
              
              const nestedItemUnitPrice = totalNestedValue;
              const nestedItemQuantity = nestedItem.quantity || 1;
              let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
              
              if (item.itemType === '확률') {
                const probability = comp.probability ?? 0;
                nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
              } else if (item.itemType === '선택' && !comp.selected) {
                nestedItemTotalValue = 0;
              }
              
              const isIncluded = item.itemType === '확정' || 
                               (item.itemType === '확률') ||
                               (item.itemType === '선택' && comp.selected);
              
              if (isIncluded) {
                return compSum + nestedItemTotalValue * (item.quantity || 1);
              }
              return compSum;
            }
            
            // 일반 구성 요소 처리
            if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return compSum;
            
            const unitPrice = getItemUnitPrice(comp.itemName);
            if (unitPrice === null || unitPrice <= 0) return compSum;
            
            const isIncluded = item.itemType === '확정' || 
                              (item.itemType === '확률') || 
                              (item.itemType === '선택' && comp.selected);
            
            if (!isIncluded) return compSum;
            
            let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
            
            // 확률 타입일 경우 확률 적용
            if (item.itemType === '확률' && comp.probability !== undefined) {
              value *= comp.probability;
            }
            
            return compSum + value;
          }, 0);
        }, 0);
        
        total += groupTotal;
      });
      
      return total;
    };
    
    const totalValue = calculateTotalValue();
    
    return (
      <div className="space-y-6">
        {/* 요약 카드 - 그룹별/항목별 계산 내용 */}
        {totalValue > 0 && (
          <div className="relative bg-gradient-to-br from-gray-800/90 via-gray-800/70 to-gray-900/90 rounded-2xl border border-gray-700/50 shadow-xl p-8 overflow-hidden">
            {/* 배경 장식 */}
            <div className="absolute top-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">요약</h3>
              </div>
              
              {/* 총 가치 요약 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900/60 rounded-xl p-4 border border-purple-500/30">
                  <div className="text-sm text-gray-400 mb-1">총 가치</div>
                  <div className="text-3xl font-bold text-blue-400">
                    {formatNumberWithSignificantDigits(totalValue)} 골드
                  </div>
                </div>
                {goldToCashPerGold && (
                  <div className="bg-gray-900/60 rounded-xl p-4 border border-green-500/30">
                    <div className="text-sm text-gray-400 mb-1">현금 환산</div>
                    <div className="text-3xl font-bold text-green-400">
                      {formatNumberWithSignificantDigits(totalValue * goldToCashPerGold)} 원
                    </div>
                  </div>
                )}
              </div>
              
              {/* 그룹별/항목별 계산 내용 */}
              <div className="space-y-4">
                {groups.map((group, groupIdx) => {
                  // 그룹별 총 가치 계산 (하위 묶음 항목 포함)
                  const groupTotalValue = group.items.reduce((sum, item) => {
                    if (!isNewFormatItem(item)) return sum;
                    
                    return sum + item.components.reduce((compSum, comp) => {
                      // 하위 묶음 항목 처리
                      if (comp.itemName === '__nested__' && comp.nestedItem) {
                        const nestedItem = comp.nestedItem;
                        let totalNestedValue = 0;
                        
                        nestedItem.components.forEach((nestedComp) => {
                          if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return;
                          
                          const unitPrice = getItemUnitPrice(nestedComp.itemName);
                          if (unitPrice === null || unitPrice <= 0) return;
                          
                          let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                          
                          if (nestedItem.itemType === '확률') {
                            const nestedProbability = nestedComp.probability || 0;
                            nestedCompValue = nestedCompValue * nestedProbability;
                          } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                            nestedCompValue = 0;
                          }
                          
                          totalNestedValue += nestedCompValue;
                        });
                        
                        const nestedItemUnitPrice = totalNestedValue;
                        const nestedItemQuantity = nestedItem.quantity || 1;
                        let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                        
                        if (item.itemType === '확률') {
                          const probability = comp.probability ?? 0;
                          nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
                        } else if (item.itemType === '선택' && !comp.selected) {
                          nestedItemTotalValue = 0;
                        }
                        
                        const isIncluded = item.itemType === '확정' || 
                                         (item.itemType === '확률') ||
                                         (item.itemType === '선택' && comp.selected);
                        
                        if (isIncluded) {
                          return compSum + nestedItemTotalValue * (item.quantity || 1);
                        }
                        return compSum;
                      }
                      
                      // 일반 구성 요소 처리
                      if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return compSum;
                      
                      const unitPrice = getItemUnitPrice(comp.itemName);
                      if (unitPrice === null || unitPrice <= 0) return compSum;
                      
                      const isIncluded = item.itemType === '확정' || 
                                        (item.itemType === '확률') || 
                                        (item.itemType === '선택' && comp.selected);
                      
                      if (!isIncluded) return compSum;
                      
                      let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
                      
                      if (item.itemType === '확률' && comp.probability !== undefined) {
                        value *= comp.probability;
                      }
                      
                      return compSum + value;
                    }, 0);
                  }, 0);
                  
                  return (
                    <div key={groupIdx} className="bg-gray-900/70 rounded-xl p-5 border border-gray-700">
                      {/* 그룹 헤더 */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/50">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          <h4 className="text-lg font-bold text-white">{group.title}</h4>
                        </div>
                        <div className="text-sm font-semibold text-blue-400">
                          {formatNumberWithSignificantDigits(groupTotalValue)} 골드
                        </div>
                      </div>
                      
                      {/* 항목별 계산 내용 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {group.items.map((item, itemIdx) => {
                          if (!isNewFormatItem(item)) return null;
                          
                          // 항목별 총 가치 계산 (하위 묶음 항목 포함)
                          const itemTotalValue = item.components.reduce((sum, comp) => {
                            // 하위 묶음 항목 처리
                            if (comp.itemName === '__nested__' && comp.nestedItem) {
                              const nestedItem = comp.nestedItem;
                              let totalNestedValue = 0;
                              
                              nestedItem.components.forEach((nestedComp) => {
                                if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return;
                                
                                const unitPrice = getItemUnitPrice(nestedComp.itemName);
                                if (unitPrice === null || unitPrice <= 0) return;
                                
                                let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                                
                                if (nestedItem.itemType === '확률') {
                                  const nestedProbability = nestedComp.probability || 0;
                                  nestedCompValue = nestedCompValue * nestedProbability;
                                } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                  nestedCompValue = 0;
                                }
                                
                                totalNestedValue += nestedCompValue;
                              });
                              
                              const nestedItemUnitPrice = totalNestedValue;
                              const nestedItemQuantity = nestedItem.quantity || 1;
                              let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                              
                              if (item.itemType === '확률') {
                                const probability = comp.probability ?? 0;
                                nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
                              } else if (item.itemType === '선택' && !comp.selected) {
                                nestedItemTotalValue = 0;
                              }
                              
                              const isIncluded = item.itemType === '확정' || 
                                               (item.itemType === '확률') ||
                                               (item.itemType === '선택' && comp.selected);
                              
                              if (isIncluded) {
                                return sum + nestedItemTotalValue * (item.quantity || 1);
                              }
                              return sum;
                            }
                            
                            // 일반 구성 요소 처리
                            if (!comp.itemName || comp.itemName === '__nested__' || comp.itemName === '__manual__' || comp.itemName === '') return sum;
                            
                            const unitPrice = getItemUnitPrice(comp.itemName);
                            if (unitPrice === null || unitPrice <= 0) return sum;
                            
                            const isIncluded = item.itemType === '확정' || 
                                              (item.itemType === '확률') || 
                                              (item.itemType === '선택' && comp.selected);
                            
                            if (!isIncluded) return sum;
                            
                            let value = unitPrice * (comp.quantity || 0) * (item.quantity || 1);
                            
                            if (item.itemType === '확률' && comp.probability !== undefined) {
                              value *= comp.probability;
                            }
                            
                            return sum + value;
                          }, 0);
                          
                          const typeColors = {
                            '확정': { border: 'border-blue-500/30', bg: 'bg-blue-500/5', icon: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
                            '확률': { border: 'border-purple-500/30', bg: 'bg-purple-500/5', icon: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-400' },
                            '선택': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
                          };
                          const colors = typeColors[item.itemType as keyof typeof typeColors] || typeColors['확정'];
                          
                          return (
                            <div key={itemIdx} className={`relative bg-gray-800/50 rounded-xl p-4 border ${colors.border} ${colors.bg}`}>
                              {/* 타입 배지 */}
                              <div className="absolute top-3 right-3">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                                  {item.itemType}
                                </span>
                              </div>
                              
                              <div className="mb-3 pr-16">
                                <div className="flex items-center gap-2 mb-1">
                                  <svg className={`w-4 h-4 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                  <div className="font-bold text-white text-sm">
                                    {item.itemName || `항목 ${itemIdx + 1}`}
                                  </div>
                                </div>
                                {item.quantity && item.quantity > 1 && (
                                  <div className="flex items-center gap-1 text-xs text-blue-400">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    묶음 ×{item.quantity}
                                  </div>
                                )}
                                <div className="mt-1 text-xs text-green-400 font-medium">
                                  전체 가치: {formatNumberWithSignificantDigits(itemTotalValue)} 골드
                                  {item.itemType === '확률' && <span className="text-gray-400 ml-1">(기대값)</span>}
                                </div>
                              </div>
                              
                              {/* 구성 요소 */}
                              <div className="space-y-2">
                                {item.components.map((component, compIndex) => {
                                  // 하위 묶음 항목 처리
                                  if (component.itemName === '__nested__' && component.nestedItem) {
                                    const nestedItem = component.nestedItem;
                                    let totalNestedValue = 0;
                                    
                                    nestedItem.components.forEach((nestedComp) => {
                                      if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return;
                                      
                                      const unitPrice = getItemUnitPrice(nestedComp.itemName);
                                      if (unitPrice === null || unitPrice <= 0) return;
                                      
                                      let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                                      
                                      if (nestedItem.itemType === '확률') {
                                        const nestedProbability = nestedComp.probability || 0;
                                        nestedCompValue = nestedCompValue * nestedProbability;
                                      } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                        nestedCompValue = 0;
                                      }
                                      
                                      totalNestedValue += nestedCompValue;
                                    });
                                    
                                    const nestedItemUnitPrice = totalNestedValue;
                                    const nestedItemQuantity = nestedItem.quantity || 1;
                                    let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                                    
                                    if (item.itemType === '확률') {
                                      const probability = component.probability ?? 0;
                                      nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
                                    } else if (item.itemType === '선택' && !component.selected) {
                                      nestedItemTotalValue = 0;
                                    }
                                    
                                    const isIncluded = item.itemType === '확정' || 
                                                     (item.itemType === '확률') ||
                                                     (item.itemType === '선택' && component.selected);
                                    
                                    if (nestedItemTotalValue === 0 || !isIncluded) return null;
                                    
                                    return (
                                      <div key={compIndex} className={`bg-gray-800/50 rounded-lg p-2 border ${isIncluded ? 'border-blue-500/50' : 'border-gray-800'} ${!isIncluded && 'opacity-50'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs text-blue-400 mb-1 font-medium">
                                              📦 {nestedItem.itemName || '하위 묶음 항목'}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mb-2">
                                              단가: {formatNumberWithSignificantDigits(nestedItemUnitPrice)} 골드
                                              {item.itemType === '확률' && component.probability !== undefined && (
                                                <span className="text-purple-400 ml-0.5">× {component.probability}</span>
                                              )}
                                              <span className="text-gray-600 mx-0.5">×</span>
                                              수량: {formatNumberWithSignificantDigits(nestedItemQuantity)}
                                              {item.quantity && item.quantity > 1 && (
                                                <span className="text-blue-400 ml-0.5">× {item.quantity}</span>
                                              )}
                                              <span className="text-gray-600 mx-0.5">=</span>
                                              <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                {formatNumberWithSignificantDigits(nestedItemTotalValue)} 골드
                                              </span>
                                            </div>
                                            {/* 하위 묶음 항목의 구성 요소 */}
                                            {nestedItem.components.length > 0 && (
                                              <div className="pl-3 border-l-2 border-blue-500/30 space-y-1 mt-2">
                                                {nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                                  if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return null;
                                                  
                                                  const nestedUnitPrice = getItemUnitPrice(nestedComp.itemName);
                                                  if (nestedUnitPrice === null || nestedUnitPrice <= 0) return null;
                                                  
                                                  let nestedCompValue = nestedUnitPrice * (nestedComp.quantity || 0);
                                                  
                                                  if (nestedItem.itemType === '확률') {
                                                    const nestedProbability = nestedComp.probability || 0;
                                                    nestedCompValue = nestedCompValue * nestedProbability;
                                                  } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                                    nestedCompValue = 0;
                                                  }
                                                  
                                                  const nestedIsIncluded = nestedItem.itemType === '확정' || 
                                                                           (nestedItem.itemType === '확률') ||
                                                                           (nestedItem.itemType === '선택' && nestedComp.selected);
                                                  
                                                  return (
                                                    <div key={nestedCompIndex} className="text-[10px] text-gray-500">
                                                      • {nestedComp.itemName}
                                                      <span className="text-gray-600 mx-0.5">:</span>
                                                      <span className="text-gray-400">
                                                        단가 {formatNumberWithSignificantDigits(nestedUnitPrice)} 골드
                                                        {nestedItem.itemType === '확률' && nestedComp.probability !== undefined && (
                                                          <span className="text-purple-400 ml-0.5">× {nestedComp.probability}</span>
                                                        )}
                                                        <span className="text-gray-600 mx-0.5">×</span>
                                                        수량 {formatNumberWithSignificantDigits(nestedComp.quantity || 0)}
                                                        <span className="text-gray-600 mx-0.5">=</span>
                                                        <span className={`${nestedIsIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                          {formatNumberWithSignificantDigits(nestedCompValue)} 골드
                                                        </span>
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  // 일반 구성 요소 처리
                                  if (!component.itemName || component.itemName === '__nested__' || component.itemName === '__manual__' || component.itemName === '') return null;
                                  
                                  const unitPrice = getItemUnitPrice(component.itemName);
                                  if (unitPrice === null || unitPrice <= 0) return null;
                                  
                                  const isIncluded = item.itemType === '확정' || 
                                                    (item.itemType === '확률') || 
                                                    (item.itemType === '선택' && component.selected);
                                  
                                  let compValue = unitPrice * (component.quantity || 0) * (item.quantity || 1);
                                  
                                  if (item.itemType === '확률' && component.probability !== undefined) {
                                    compValue *= component.probability;
                                  }
                                  
                                  return (
                                    <div key={compIndex} className={`bg-gray-800/50 rounded-lg p-2 border ${isIncluded ? 'border-gray-700/50' : 'border-gray-800'} ${!isIncluded && 'opacity-50'}`}>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs text-gray-300 mb-1">
                                            {component.itemName}
                                          </div>
                                          <div className="text-[10px] text-gray-400">
                                            단가: {formatNumberWithSignificantDigits(unitPrice)} 골드
                                            <span className="text-gray-600 mx-0.5">×</span>
                                            수량: {formatNumberWithSignificantDigits(component.quantity || 0)}
                                            {item.itemType === '확률' && component.probability !== undefined && (
                                              <span className="text-purple-400 ml-0.5">× {component.probability}</span>
                                            )}
                                            {item.quantity && item.quantity > 1 && (
                                              <span className="text-blue-400 ml-0.5">× {item.quantity}</span>
                                            )}
                                            <span className="text-gray-600 mx-0.5">=</span>
                                            <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                              {formatNumberWithSignificantDigits(compValue)} 골드
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
                  
                  const unitPrice = getItemUnitPrice(comp.itemName);
                  if (unitPrice === null || unitPrice <= 0) return sum;
                  
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
                                value={component.itemName}
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
                                    handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'itemName', value);
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
                            
                            {/* 중첩 묶음 항목 입력 */}
                            {component.itemName === '__nested__' && component.nestedItem && (
                              <>
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
                                  <input
                                    type="number"
                                    value={component.nestedItem.quantity || ''}
                                    onChange={(e) => {
                                      const nestedItem = { ...component.nestedItem!, quantity: parseFloat(e.target.value) || 1 };
                                      handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                    }}
                                    className="w-24 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder="수량"
                                    min="1"
                                    step="1"
                                  />
                                </div>
                                {/* 하위 묶음 항목 단가/가치 표시 */}
                                {component.nestedItem.itemName && (() => {
                                  const nestedItem = component.nestedItem!;
                                  let totalNestedValue = 0;
                                  nestedItem.components.forEach((nestedComp) => {
                                    if (!nestedComp.itemName || nestedComp.itemName === '__nested__' || nestedComp.itemName === '__manual__' || nestedComp.itemName === '') return;
                                    const unitPrice = getItemUnitPrice(nestedComp.itemName);
                                    if (unitPrice === null || unitPrice <= 0) return;
                                    
                                    let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                                    
                                    if (nestedItem.itemType === '확률') {
                                      const nestedProbability = nestedComp.probability || 0;
                                      nestedCompValue = nestedCompValue * nestedProbability;
                                    } else if (nestedItem.itemType === '선택' && !nestedComp.selected) {
                                      nestedCompValue = 0;
                                    }
                                    
                                    totalNestedValue += nestedCompValue;
                                  });
                                  
                                  const nestedItemUnitPrice = totalNestedValue;
                                  const nestedItemQuantity = nestedItem.quantity || 1;
                                  let nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity;
                                  
                                  if (item.itemType === '확률') {
                                    const probability = component.probability ?? 0;
                                    nestedItemTotalValue = nestedItemUnitPrice * nestedItemQuantity * probability;
                                  } else if (item.itemType === '선택' && !component.selected) {
                                    nestedItemTotalValue = 0;
                                  }
                                  
                                  const isIncluded = item.itemType === '확정' || 
                                                   (item.itemType === '확률') ||
                                                   (item.itemType === '선택' && component.selected);
                                  
                                  return nestedItemTotalValue > 0 && isIncluded ? (
                                    <div className="mt-1 text-xs text-gray-300">
                                      단가 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedItemUnitPrice)}</span> 골드
                                      {item.itemType === '확률' && component.probability !== undefined && (
                                        <span className="text-purple-400 ml-1">× {component.probability}</span>
                                      )}
                                      <span className="text-gray-500 mx-1">×</span>
                                      수량 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedItemQuantity)}</span>
                                      <span className="text-gray-500 mx-1">=</span>
                                      가치 <span className={`font-semibold ${isIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                        {isIncluded ? formatNumberWithSignificantDigits(nestedItemTotalValue) : '0'} 골드
                                      </span>
                                    </div>
                                  ) : null;
                                })()}
                              </>
                            )}
                            
                            {/* 두 번째 줄: 수량 및 확률/선택 입력 (하위 묶음 항목이 아닐 때만 표시) */}
                            {component.itemName !== '__nested__' && (
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
                            )}
                            
                            {/* 하위 묶음 항목일 때 확률 입력 (상위 항목이 확률 타입일 때) */}
                            {component.itemName === '__nested__' && item.itemType === '확률' && (
                              <div className="flex gap-2 items-center">
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
                              </div>
                            )}
                            
                            {/* 하위 묶음 항목의 구성요소 UI */}
                            {component.itemName === '__nested__' && component.nestedItem && component.nestedItem.itemName && (
                              <div className="mt-3 pl-4 border-l-2 border-blue-500/50 bg-gray-900/50 rounded-lg p-3">
                                <div className="text-sm font-medium text-blue-400 mb-2">하위 묶음 항목 구성요소</div>
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
                                        handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                      }}
                                      className="w-full px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                                    >
                                      구성요소 추가
                                    </button>
                                    {component.nestedItem.components.map((nestedComp, nestedCompIndex) => (
                                      <div key={nestedCompIndex} className="bg-gray-800/50 rounded-lg p-2 border border-gray-700">
                                        <div className="space-y-2">
                                          {/* 첫 번째 줄: 드롭다운 */}
                                          <div className="flex gap-2 items-center">
                                            <SearchableSelect
                                              value={nestedComp.itemName}
                                              onChange={(value) => {
                                                if (!component.nestedItem) return;
                                                const nestedComponents = [...component.nestedItem.components];
                                                nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], itemName: value };
                                                const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              options={itemDropdownOptions}
                                              placeholder="아이템 선택"
                                              className="flex-1"
                                              size="small"
                                            />
                                          </div>
                                          
                                          {/* 직접 입력 필드 */}
                                          {(nestedComp.itemName === '__manual__' || (nestedComp.itemName && nestedComp.itemName !== '__nested__' && !itemDropdownOptions.some(opt => opt.value === nestedComp.itemName))) && (
                                            <input
                                              type="text"
                                              value={nestedComp.itemName === '__manual__' ? '' : nestedComp.itemName}
                                              onChange={(e) => {
                                                if (!component.nestedItem) return;
                                                const nestedComponents = [...component.nestedItem.components];
                                                const value = e.target.value || '__manual__';
                                                nestedComponents[nestedCompIndex] = { ...nestedComponents[nestedCompIndex], itemName: value };
                                                const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                              placeholder="아이템 이름을 입력하세요"
                                            />
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
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-xs"
                                              placeholder="수량"
                                              min="0"
                                            />
                                            {component.nestedItem?.itemType === '선택' && (
                                              <input
                                                type="radio"
                                                name={`nested-${groupIdx}-${itemIdx}-${compIdx}-selection`}
                                                checked={nestedComp.selected || false}
                                                onChange={(e) => {
                                                  if (!component.nestedItem) return;
                                                  const nestedComponents = component.nestedItem.components.map((c, idx) => ({
                                                    ...c,
                                                    selected: idx === nestedCompIndex,
                                                  }));
                                                  const nestedItem = { ...component.nestedItem, components: nestedComponents };
                                                  handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
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
                                                  handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
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
                                                handleUpdateComponent(type, groupIdx, itemIdx, compIdx, 'nestedItem', nestedItem);
                                              }}
                                              className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs"
                                            >
                                              삭제
                                            </button>
                                          </div>
                                          
                                          {/* 하위 구성 요소 단가/가치 표시 */}
                                          {nestedComp.itemName && nestedComp.itemName !== '__nested__' && nestedComp.itemName !== '__manual__' && nestedComp.itemName !== '' && (() => {
                                            const unitPrice = getItemUnitPrice(nestedComp.itemName);
                                            if (unitPrice !== null && unitPrice > 0) {
                                              let nestedCompValue = unitPrice * (nestedComp.quantity || 0);
                                              
                                              if (component.nestedItem?.itemType === '확률') {
                                                const nestedProbability = nestedComp.probability || 0;
                                                nestedCompValue = nestedCompValue * nestedProbability;
                                              } else if (component.nestedItem?.itemType === '선택' && !nestedComp.selected) {
                                                nestedCompValue = 0;
                                              }
                                              
                                              const nestedIsIncluded = component.nestedItem?.itemType === '확정' || 
                                                                       (component.nestedItem?.itemType === '확률') ||
                                                                       (component.nestedItem?.itemType === '선택' && nestedComp.selected);
                                              
                                              return (
                                                <div className="mt-1 text-[10px] text-gray-300">
                                                  단가 <span className="font-semibold">{formatNumberWithSignificantDigits(unitPrice)}</span> 골드
                                                  {component.nestedItem?.itemType === '확률' && nestedComp.probability !== undefined && (
                                                    <span className="text-purple-400 ml-0.5">× {nestedComp.probability}</span>
                                                  )}
                                                  <span className="text-gray-600 mx-0.5">×</span>
                                                  수량 <span className="font-semibold">{formatNumberWithSignificantDigits(nestedComp.quantity || 0)}</span>
                                                  <span className="text-gray-600 mx-0.5">=</span>
                                                  가치 <span className={`font-semibold ${nestedIsIncluded ? 'text-green-400' : 'text-gray-600'}`}>
                                                    {nestedIsIncluded ? formatNumberWithSignificantDigits(nestedCompValue) : '0'} 골드
                                                  </span>
                                                </div>
                                              );
                                            }
                                            return null;
                                          })()}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* 가치 계산 표시 */}
                            {component.itemName && component.itemName !== '__nested__' && component.itemName !== '__manual__' && component.itemName !== '' && (() => {
                              const unitPrice = getItemUnitPrice(component.itemName);
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
                  onClick={() => {
                    const selectedItem = savedEventEfficiency.find(item => item.id === selectedEventEfficiencyId);
                    setSaveEventEfficiencyName(selectedItem?.name || '');
                    setShowSaveModal(true);
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  저장
                </button>
              )}
            </div>
          </div>
          
          {/* 새로 만들기 버튼 */}
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
          
          {/* 저장된 이벤트 효율 목록 (배포 버전에서도 보기 가능) */}
          {(() => {
            // 배포 버전에서는 종료일이 지난 이벤트 필터링
            const isProduction = process.env.NODE_ENV === 'production';
            const filteredEvents = isProduction
              ? savedEventEfficiency.filter((item) => {
                  if (!item.end_date) return true; // 종료일이 없으면 표시
                  const endDate = new Date(item.end_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  endDate.setHours(0, 0, 0, 0);
                  return endDate >= today; // 오늘 이후거나 오늘인 경우만 표시
                })
              : savedEventEfficiency;
            
            return filteredEvents.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-white">저장된 이벤트 효율</h3>
                  <p className="text-xs text-gray-400 mt-1">버튼 클릭 시 불러오기 가능</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredEvents.map((item) => {
                    const isSelected = selectedEventEfficiencyId === item.id;
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                  <button
                        onClick={() => handleLoadEventEfficiency(item.id)}
                        className={`group relative px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50 transform hover:scale-105 active:scale-95 text-xs ${
                          isSelected
                            ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/50 ring-2 ring-purple-400 ring-offset-1 ring-offset-gray-800'
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
                          {item.name}
                          {item.end_date && (
                            <span className="text-gray-500 text-[10px] ml-1">종료: {item.end_date}</span>
                          )}
                        </span>
                  </button>
                      {allowEventEfficiencySave && (
                        <button
                          onClick={() => handleDeleteEventEfficiency(item.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                          disabled={isLoading}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })()}
          
          {/* 이벤트 정보 입력 카드 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">이벤트 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">이벤트명</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  placeholder="이벤트명 입력"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
                <input
                  type="date"
                  value={eventEndDate || ''}
                  onChange={(e) => setEventEndDate(e.target.value || null)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
          
          {/* 저장 모달 */}
          {showSaveModal && allowEventEfficiencySave && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {selectedEventEfficiencyId ? '이벤트 효율 업데이트' : '이벤트 효율 저장'}
                </h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">이름</label>
                  <input
                    type="text"
                    value={saveEventEfficiencyName}
                    onChange={(e) => setSaveEventEfficiencyName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                    placeholder="이름 입력"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowSaveModal(false);
                      setSaveEventEfficiencyName('');
                    }}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    disabled={isLoading}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEventEfficiency}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                    disabled={isLoading || !saveEventEfficiencyName.trim()}
                  >
                    {isLoading ? '처리 중...' : selectedEventEfficiencyId ? '업데이트' : '저장'}
                  </button>
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
                <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {totalWeeksNumber}주 누적 요약
                </h2>
                <p className="text-sm text-gray-300">
                  {totalWeeksNumber}주 동안 매주 {totalWeeksNumber > 0 ? (totalHoursNumber / totalWeeksNumber).toFixed(1) : 0}시간씩 접속 (총 {totalHoursNumber}시간 기준). 주간 보상 × {totalWeeksNumber}회 + 누적 보상 × 1회 +
                  상시 혜택 × 총 진행 일수({totalDaysNumber ?? 0}일)을 합산한 수치입니다.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-200 bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">총 주수:</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="px-3 py-1 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 w-24"
                      value={totalWeeksInput}
                      onChange={(e) => setTotalWeeksInput(e.target.value)}
                    />
                    <span className="text-gray-400">주</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">총 시간:</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="px-3 py-1 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 w-24"
                      value={totalHoursInput}
                      onChange={(e) => setTotalHoursInput(e.target.value)}
                    />
                    <span className="text-gray-400">시간</span>
                  </div>
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
              {aggregateRewards.filter(item => item.category === 'weekly').length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-500 rounded"></span>
                    주간 보상 ({totalWeeksNumber}주 × {totalWeeksNumber}회)
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-blue-500/30 shadow-lg">
                <table className="w-full text-sm">
                  <thead>
                        <tr className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 text-gray-200 border-b-2 border-blue-500/50">
                      <th className="px-4 py-4 text-left font-bold">아이템명</th>
                      <th className="px-4 py-4 text-right font-bold">총 수량</th>
                      <th className="px-4 py-4 text-right font-bold">단가</th>
                      <th className="px-4 py-4 text-right font-bold">총합</th>
                    </tr>
                  </thead>
                  <tbody>
                        {aggregateRewards.filter(item => item.category === 'weekly').map((item, idx) => {
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
                      const unitDisplay = isKurzanSummaryItem
                        ? kurzanValue != null
                          ? `${formatNumberWithSignificantDigits(kurzanValue)}골드`
                          : '-'
                        : isPcBangLuckyBoxSummaryItem
                          ? pcBangLuckyBoxExpectedGold != null
                            ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold)}골드`
                            : '-'
                          : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                      const totalDisplay = isKurzanSummaryItem
                        ? kurzanValue != null
                          ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드`
                          : '-'
                        : isPcBangLuckyBoxSummaryItem
                          ? pcBangLuckyBoxExpectedGold != null
                            ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold * item.quantity)}골드`
                            : '-'
                          : formatPriceDisplay(
                              priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                              priceInfo.unit
                            );
                      const composition = getCompositionInfo(getItemName(item), item.quantity);

                      return (
                      <tr
                        key={`${item.name}-${idx}`}
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
                            {isKurzanSummaryItem && (
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
                                {([
                                  { key: 'breakthrough', label: '돌파석', amount: selectedKurzanStage?.breakthroughValue ?? 0 },
                                  { key: 'fragment', label: '파편', amount: selectedKurzanStage?.fragmentValue ?? 0 },
                                  { key: 'cardExp', label: '카경', amount: selectedKurzanStage?.cardExpValue ?? 0 },
                                ] as const).map(({ key, label, amount }) => {
                                  const active = kurzanSwitches[key];
                                  const disabled = !selectedKurzanStage || amount <= 0;
                                  return (
                                    <div key={key} className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
                                      <span>{label}</span>
                                      <button
                                        type="button"
                                        onClick={() => !disabled && handleKurzanSwitchToggle(key)}
                                        disabled={disabled}
                                        className={`w-9 h-4 rounded-full border transition-colors duration-200 ${
                                          active ? 'bg-purple-600 border-purple-400' : 'bg-gray-600 border-gray-500'
                                        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                        aria-label={`${label} 가치 포함 여부`}
                                      >
                                        <span
                                          className={`inline-block w-4 h-4 rounded-full bg-white transform transition-transform ${
                                            active ? 'translate-x-4' : 'translate-x-0'
                                          }`}
                                        />
                                      </button>
                                      <span className="text-gray-500">
                                        {amount > 0 ? `${formatNumberWithSignificantDigits(amount)}골드` : '0골드'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
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
                </table>
              </div>
                </div>
              )}

              {/* 누적보상 섹션 */}
              {aggregateRewards.filter(item => item.category === 'cumulative').length > 0 && (
                <div className="space-y-3 mt-6">
                  <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                    <span className="w-1 h-6 bg-purple-500 rounded"></span>
                    누적 보상 (1회)
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-purple-500/30 shadow-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 text-gray-200 border-b-2 border-purple-500/50">
                          <th className="px-4 py-4 text-left font-bold">아이템명</th>
                          <th className="px-4 py-4 text-right font-bold">총 수량</th>
                          <th className="px-4 py-4 text-right font-bold">단가</th>
                          <th className="px-4 py-4 text-right font-bold">총합</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregateRewards.filter(item => item.category === 'cumulative').map((item, idx) => {
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
                          const unitDisplay = isKurzanSummaryItem
                            ? kurzanValue != null
                              ? `${formatNumberWithSignificantDigits(kurzanValue)}골드`
                              : '-'
                            : isPcBangLuckyBoxSummaryItem
                              ? pcBangLuckyBoxExpectedGold != null
                                ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold)}골드`
                                : '-'
                              : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                          const totalDisplay = isKurzanSummaryItem
                            ? kurzanValue != null
                              ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드`
                              : '-'
                            : isPcBangLuckyBoxSummaryItem
                              ? pcBangLuckyBoxExpectedGold != null
                                ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold * item.quantity)}골드`
                                : '-'
                              : formatPriceDisplay(
                                  priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                                  priceInfo.unit
                                );
                          const composition = getCompositionInfo(getItemName(item), item.quantity);

                          return (
                          <tr
                            key={`cumulative-${item.name}-${idx}`}
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
                              {isKurzanSummaryItem && (
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
                                  {([
                                    { key: 'breakthrough', label: '돌파석', amount: selectedKurzanStage?.breakthroughValue ?? 0 },
                                    { key: 'fragment', label: '파편', amount: selectedKurzanStage?.fragmentValue ?? 0 },
                                    { key: 'cardExp', label: '카경', amount: selectedKurzanStage?.cardExpValue ?? 0 },
                                  ] as const).map(({ key, label, amount }) => {
                                    const active = kurzanSwitches[key];
                                    const disabled = !selectedKurzanStage || amount <= 0;
                                    return (
                                      <div key={key} className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
                                        <span>{label}</span>
                                        <button
                                          type="button"
                                          onClick={() => !disabled && handleKurzanSwitchToggle(key)}
                                          disabled={disabled}
                                          className={`w-9 h-4 rounded-full border transition-colors duration-200 ${
                                            active ? 'bg-purple-600 border-purple-400' : 'bg-gray-600 border-gray-500'
                                          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                          aria-label={`${label} 가치 포함 여부`}
                                        >
                                          <span
                                            className={`inline-block w-4 h-4 rounded-full bg-white transform transition-transform ${
                                              active ? 'translate-x-4' : 'translate-x-0'
                                            }`}
                                          />
                                        </button>
                                        <span className="text-gray-500">
                                          {amount > 0 ? `${formatNumberWithSignificantDigits(amount)}골드` : '0골드'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
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
                    </table>
                  </div>
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
                          const unitDisplay = isKurzanSummaryItem
                            ? kurzanValue != null
                              ? `${formatNumberWithSignificantDigits(kurzanValue)}골드`
                              : '-'
                            : isPcBangLuckyBoxSummaryItem
                              ? pcBangLuckyBoxExpectedGold != null
                                ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold)}골드`
                                : '-'
                              : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                          const totalDisplay = isKurzanSummaryItem
                            ? kurzanValue != null
                              ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드`
                              : '-'
                            : isPcBangLuckyBoxSummaryItem
                              ? pcBangLuckyBoxExpectedGold != null
                                ? `${formatNumberWithSignificantDigits(pcBangLuckyBoxExpectedGold * item.quantity)}골드`
                                : '-'
                              : formatPriceDisplay(
                                  priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                                  priceInfo.unit
                                );
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
                              {isKurzanSummaryItem && (
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
                                  {([
                                    { key: 'breakthrough', label: '돌파석', amount: selectedKurzanStage?.breakthroughValue ?? 0 },
                                    { key: 'fragment', label: '파편', amount: selectedKurzanStage?.fragmentValue ?? 0 },
                                    { key: 'cardExp', label: '카경', amount: selectedKurzanStage?.cardExpValue ?? 0 },
                                  ] as const).map(({ key, label, amount }) => {
                                    const active = kurzanSwitches[key];
                                    const disabled = !selectedKurzanStage || amount <= 0;
                                    return (
                                      <div key={key} className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
                                        <span>{label}</span>
                                        <button
                                          type="button"
                                          onClick={() => !disabled && handleKurzanSwitchToggle(key)}
                                          disabled={disabled}
                                          className={`w-9 h-4 rounded-full border transition-colors duration-200 ${
                                            active ? 'bg-purple-600 border-purple-400' : 'bg-gray-600 border-gray-500'
                                          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                          aria-label={`${label} 가치 포함 여부`}
                                        >
                                          <span
                                            className={`inline-block w-4 h-4 rounded-full bg-white transform transition-transform ${
                                              active ? 'translate-x-4' : 'translate-x-0'
                                            }`}
                                          />
                                        </button>
                                        <span className="text-gray-500">
                                          {amount > 0 ? `${formatNumberWithSignificantDigits(amount)}골드` : '0골드'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
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