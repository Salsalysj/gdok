'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';

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

type RewardItem = {
  name: string;
  quantity: number;
  type?: 'kurzan';
  excludeFromSummary?: boolean;
};

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
};

type PriceInfo = {
  unit: 'gold' | 'crystal' | 'cash' | null;
  unitAmount: number | null;
  goldEquivalent: number | null;
  cashEquivalent: number | null;
  note?: string | null;
};

const PC_BANG_LUCKY_SUMMARY_NAME = 'PC방 행운의 상자 (기대값)';

const eventTabs: EventTab[] = [
  {
    key: 'pcbang',
    label: 'PC방 이벤트',
    period: '2025/11/5 ~ 2025/12/24',
  },
];

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
};

export default function EventEfficiencyClient({ etcListItems, crystalGoldRate, marketCache, discordRate, kurzanStages }: Props) {
  const [activeTab, setActiveTab] = useState<EventTab>(eventTabs[0]);
  const [activeSubTab, setActiveSubTab] = useState<typeof eventSubTabs[number]>(eventSubTabs[0]);
  const [chaosStoneQuality, setChaosStoneQuality] = useState<90 | 95>(90);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [enabledRewards, setEnabledRewards] = useState<Record<string, boolean>>({});
  const [braceletPriceInput, setBraceletPriceInput] = useState('100');
  const [totalDaysInput, setTotalDaysInput] = useState('7');
  const [legendaryCardSelectionPriceInput, setLegendaryCardSelectionPriceInput] = useState('50000');
  const [kurzanSwitches, setKurzanSwitches] = useState({
    breakthrough: true,
    fragment: true,
    cardExp: true,
  });
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

  const getItemPriceInfo = (itemName: string): PriceInfo => {
    const defaultResult: PriceInfo = { unit: null, unitAmount: null, goldEquivalent: null, cashEquivalent: null, note: null };

    // 실링, 배틀 아이템은 제외
    if (itemName === '실링' || itemName === '배틀 아이템 종합 상자') {
      return defaultResult;
    }

    // 1. etc_list에서 찾기
    if (itemName === '팔찌 효과 재변환권') {
      const value = braceletUnitPrice ?? 100;
      return {
        unit: 'gold',
        unitAmount: value,
        goldEquivalent: value,
        cashEquivalent: null,
        note: '사용자 입력 단가',
      };
    }

    if (itemName === '전설 카드 선택팩' || itemName === '도약의 전설 카드 선택팩') {
      const value = legendaryCardSelectionUnitPrice;
      return {
        unit: 'gold',
        unitAmount: value,
        goldEquivalent: value,
        cashEquivalent: null,
        note: '사용자 입력 단가',
      };
    }

    if (itemName === '전설 카드팩') {
      const unitAmount = 575;
      const goldEquivalent =
        crystalGoldRate && crystalGoldRate > 0 ? (unitAmount * crystalGoldRate) / 100 : null;
      return {
        unit: 'crystal',
        unitAmount,
        goldEquivalent,
        cashEquivalent: null,
        note: '크리스탈 시세 기준',
      };
    }

    const etcItem = etcListItems.find(item => item.itemName === itemName);
    if (etcItem) {
      const hasOriginalGold = etcItem.originalGold !== null;
      const hasCrystalOnly = !hasOriginalGold && etcItem.originalCrystal !== null;

      if (hasCrystalOnly) {
        return {
          unit: 'crystal',
          unitAmount: etcItem.crystal ?? etcItem.originalCrystal,
          goldEquivalent: etcItem.gold,
          cashEquivalent: null,
          note: null,
        };
      }

      if (etcItem.gold !== null) {
        return {
          unit: 'gold',
          unitAmount: etcItem.gold,
          goldEquivalent: etcItem.gold,
          cashEquivalent: null,
          note: null,
        };
      }

      if (etcItem.cash !== null) {
        return {
          unit: 'cash',
          unitAmount: etcItem.cash,
          goldEquivalent: null,
          cashEquivalent: etcItem.cash,
          note: null,
        };
      }
    }

    // 2. 시장 캐시에서 직접 찾기
    const marketPrice = getMarketPrice(itemName);
    if (marketPrice !== null) {
      return {
        unit: 'gold',
        unitAmount: marketPrice,
        goldEquivalent: marketPrice,
        cashEquivalent: null,
        note: null,
      };
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
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }
      
      case '운명의 파괴석 주머니': {
        const price = getMarketPrice('운명의 파괴석');
        if (price === null) return defaultResult;
        const perUnit = price / 100;
        const value = perUnit * 75;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }
      
      case '재련 돌파석 선택 상자': {
        const price = getMarketPrice('운명의 돌파석');
        if (price === null) return defaultResult;
        const value = price * 5;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
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
        return {
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note: null,
        };
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
        return {
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note,
        };
      }
      
      case '재련 파편 선택 상자': {
        const price = getMarketPrice('운명의 파편 주머니(소)');
        if (price === null) return defaultResult;
        const value = price * 2;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
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
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null, note };
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
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null, note };
      }
      
      case '재련 융화 재료 선택 상자': {
        const price = getMarketPrice('아비도스 융화 재료');
        if (price === null) return defaultResult;
        const value = price * 5;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
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
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }

      case '정련된 운명의 돌': {
        const value = 1000;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }
      
      case '유물 각인서 랜덤 주머니': {
        const relicEngravings = allMarketItems.filter(i => i.Grade === '유물' && i.tier === '유물 각인서');
        if (relicEngravings.length === 0) return defaultResult;
        
        const total = relicEngravings.reduce((sum, e) => sum + (e.CurrentMinPrice || 0), 0);
        const value = total / relicEngravings.length;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }
      
      case '고결한 혼돈의 돌 선택 상자': {
        const value = chaosStoneQuality === 90 ? 117647 : 266667;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }
      
      case '고결한 혼돈의 돌 (무기)': {
        const value = chaosStoneQuality === 90 ? 117647 : 266667;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }

      case '고결한 혼돈의 돌 (방어구)': {
        const value = chaosStoneQuality === 90 ? 44118 : 100000;
        return { unit: 'gold', unitAmount: value, goldEquivalent: value, cashEquivalent: null };
      }

      case '희귀~영웅 젬 상자': {
        const rareAvg = getTier4GemAverage('희귀');
        const heroicAvg = getTier4GemAverage('영웅');

        if (!rareAvg && !heroicAvg) return defaultResult;
        const value = (rareAvg ?? 0) * 0.9 + (heroicAvg ?? 0) * 0.1;
        return {
          unit: 'gold',
          unitAmount: value,
          goldEquivalent: value,
          cashEquivalent: null,
          note: null,
        };
      }

      case '운명의 파편': {
        const fragmentPrice = getMarketPrice('운명의 파편 주머니(소)');
        if (fragmentPrice === null) return defaultResult;
        const perFragment = fragmentPrice / 1000;
        return {
          unit: 'gold',
          unitAmount: perFragment,
          goldEquivalent: perFragment,
          cashEquivalent: null,
        };
      }
      
      default:
        return defaultResult;
    }
  };

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

  // PC방 이벤트 보상 데이터
  const weeklyRewards: RewardGroup[] = [
    {
      title: '2시간 달성',
      items: [
        { name: '실링', quantity: 1000000 },
        { name: '배틀 아이템 종합 상자', quantity: 5 },
      ],
    },
    {
      title: '4시간 달성',
      items: [
        { name: '도약의 정수', quantity: 5 },
        { name: '중급 생기 회복물약', quantity: 5 },
      ],
    },
    {
      title: '6시간 달성',
      items: [
        { name: '운명의 수호석 주머니', quantity: 40 },
        { name: '운명의 파괴석 주머니', quantity: 20 },
      ],
    },
    {
      title: '8시간 달성',
      items: [
        { name: '재련 돌파석 선택 상자', quantity: 10 },
        { name: '고급~영웅 젬 상자', quantity: 2 },
      ],
    },
    {
      title: '10시간 달성',
      items: [
        { name: '재련 보조 선택 상자', quantity: 5 },
        { name: '재련 파편 선택 상자', quantity: 20 },
      ],
    },
  ];

  const cumulativeRewards: RewardGroup[] = [
    {
      title: '10시간 달성',
      items: [
        { name: '실링', quantity: 6000000 },
        { name: '운명의 수호석 주머니', quantity: 80 },
        { name: '운명의 파괴석 주머니', quantity: 40 },
        { name: '메넬리크의 서', quantity: 10 },
        { name: '전설~희귀 카드팩', quantity: 15 },
      ],
    },
    {
      title: '30시간 달성',
      items: [
        { name: '재련 파편 선택 상자', quantity: 20 },
        { name: '재련 돌파석 선택 상자', quantity: 20 },
        { name: '정련된 혼돈의(무기)', quantity: 10 },
        { name: '정련된 혼돈의(방어구)', quantity: 30 },
        { name: '전설~영웅 카드팩', quantity: 10 },
      ],
    },
    {
      title: '50시간 달성',
      items: [
        { name: '[이벤트] 재봉술 선택 상자', quantity: 5 },
        { name: '[이벤트] 야금술 선택 상자', quantity: 3 },
        { name: '재련 융화 재료 선택 상자', quantity: 20 },
        { name: '재련 보조 선택 상자', quantity: 20 },
        { name: '정련된 운명의 돌', quantity: 5 },
      ],
    },
    {
      title: '70시간 달성',
      items: [
        { name: '고결한 혼돈의 돌 선택 상자', quantity: 1 },
        { name: '희귀~영웅 젬 상자', quantity: 7 },
        { name: '젬 가공 초기화권', quantity: 1 },
        { name: '유물 각인서 랜덤 주머니', quantity: 1 },
        { name: '팔찌 효과 재변환권', quantity: 3 },
      ],
    },
  ];

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
    const weeklyFactor = 7; // 7주 동안 매주 주간 보상 수령
    const dailyFactor = totalDaysNumber ?? 0;
    const aggregatedMap = new Map<string, AggregatedReward>();

    const addItem = (item: RewardItem, multiplier: number, isWeekly: boolean) => {
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
        });
      }
    };

    weeklyRewards.forEach(group => {
      group.items.forEach(item => addItem(item, weeklyFactor, true));
    });

    cumulativeRewards.forEach(group => {
      group.items.forEach(item => addItem(item, 1, false));
    });

    if (dailyFactor > 0) {
      dailyBenefits.forEach(group => {
        group.items.forEach(item => addItem(item, dailyFactor, false));
      });
    }

    const aggregatedList = Array.from(aggregatedMap.values());

    if (pcBangLuckyBoxQuantity > 0) {
      aggregatedList.push({
        name: PC_BANG_LUCKY_SUMMARY_NAME,
        quantity: pcBangLuckyBoxQuantity,
        perUnitNote: '총 진행 일수 × 3개',
        isWeekly: false,
      });
    }

    return aggregatedList;
  }, [weeklyRewards, cumulativeRewards, dailyBenefits, totalDaysNumber, pcBangLuckyBoxQuantity]);

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
    const hours = 70;

    return {
      totalGold,
      totalCash: goldToCash,
      hourlyGold: hours > 0 ? totalGold / hours : null,
      hourlyCash: goldToCash && hours > 0 ? goldToCash / hours : null,
    };
  }, [aggregateRewards, enabledRewards, getItemPriceInfo, goldToCashPerGold, adjustedKurzanValue, pcBangLuckyBoxExpectedGold]);

  const renderRewardTable = (groups: RewardGroup[], sectionTitle: string, summaryLabel?: string) => {
    const totalGold = groups.reduce((sumSection, group) => {
      return (
        sumSection +
        group.items.reduce((sum, item) => {
          if (item.type === 'kurzan') {
            const goldValue = adjustedKurzanValue;
            return goldValue != null ? sum + goldValue * item.quantity : sum;
          }
          const isPcBangLuckyBox = item.name.startsWith('PC방 행운의 상자');
          if (isPcBangLuckyBox) {
            return pcBangLuckyBoxExpectedGold != null
              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
              : sum;
          }
          const priceInfo = getItemPriceInfo(item.name);
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
              {group.items.some(item => item.name === '고결한 혼돈의 돌 선택 상자') && (
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
                    const isPcBangLuckyBox = item.name.startsWith('PC방 행운의 상자');
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
                          : getItemPriceInfo(item.name);
                    const unitDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue)}골드` : '-')
                      : formatPriceDisplay(priceInfo.unitAmount, priceInfo.unit);
                    const totalDisplay = isKurzanItem
                      ? (kurzanValue != null ? `${formatNumberWithSignificantDigits(kurzanValue * item.quantity)}골드` : '-')
                      : formatPriceDisplay(
                          priceInfo.unitAmount !== null ? priceInfo.unitAmount * item.quantity : null,
                          priceInfo.unit
                        );
                    const composition = getCompositionInfo(item.name, item.quantity);
                    
                    return (
                      <tr key={itemIdx} className="border-b border-gray-700/50 hover:bg-gray-700/40 transition-colors duration-200">
                        <td className="px-4 py-3 text-white">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <span>{item.name}</span>
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
                          const enabled = enabledRewards[item.name] ?? true;
                          if (!enabled) return sum;
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const isPcBangLuckyBox = item.name.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          if (item.name === '쿠르잔 전선 보상 (휴식게이지 2배)') {
                            const kurzanValue = adjustedKurzanValue;
                            return kurzanValue != null ? sum + kurzanValue * item.quantity : sum;
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
                          const enabled = enabledRewards[item.name] ?? true;
                          if (!enabled) return sum;
                          if (item.type === 'kurzan') {
                            const goldValue = adjustedKurzanValue;
                            return goldValue != null ? sum + goldValue * item.quantity : sum;
                          }
                          const isPcBangLuckyBox = item.name.startsWith('PC방 행운의 상자');
                          if (isPcBangLuckyBox) {
                            return pcBangLuckyBoxExpectedGold != null
                              ? sum + pcBangLuckyBoxExpectedGold * item.quantity
                              : sum;
                          }
                          if (item.name === '쿠르잔 전선 보상 (휴식게이지 2배)') {
                            const kurzanValue = adjustedKurzanValue;
                            return kurzanValue != null ? sum + kurzanValue * item.quantity : sum;
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl font-bold text-white">이벤트 효율</h1>
            <div className="flex flex-wrap gap-2">
              {eventTabs.map((tab) => {
                const isActive = tab.key === activeTab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl border transition-all text-sm font-semibold ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-transparent shadow-lg'
                        : 'text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col leading-tight text-left">
                      <span>{tab.label}</span>
                      <span className="text-xs text-gray-300 font-normal">{tab.period}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">7주 누적 요약</h2>
                <p className="text-sm text-gray-300">
                  7주 동안 매주 10시간씩 접속 (총 70시간 기준). 주간 보상 × 7회 + 누적 보상 × 1회 +
                  상시 혜택 × 총 진행 일수({totalDaysNumber ?? 0}일)을 합산한 수치입니다.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-200">
                  <span>총 70시간 진행 일수</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    className="px-3 py-1 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 w-32"
                    value={totalDaysInput}
                    onChange={(e) => setTotalDaysInput(e.target.value)}
                  />
                  <span className="text-gray-400">
                    (
                    {totalDaysNumber && daysPerWeek
                      ? `주당 ${formatNumberWithSignificantDigits(daysPerWeek)}일`
                      : '주당 계산 불가'}
                    )
                  </span>
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

              <div className="overflow-x-auto rounded-xl border border-gray-700 shadow-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 text-gray-200 border-b-2 border-purple-500/50">
                      <th className="px-4 py-4 text-left font-bold">아이템명</th>
                      <th className="px-4 py-4 text-right font-bold">총 수량</th>
                      <th className="px-4 py-4 text-right font-bold">단가</th>
                      <th className="px-4 py-4 text-right font-bold">총합</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregateRewards.map((item, idx) => {
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
                          : getItemPriceInfo(item.name);
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
                      const composition = getCompositionInfo(item.name, item.quantity);

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
                              {item.name === '고결한 혼돈의 돌 선택 상자' && (
                                <select
                                  value={chaosStoneQuality}
                                  onChange={(e) => setChaosStoneQuality(Number(e.target.value) as 90 | 95)}
                                  className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                  <option value={90}>품질 90</option>
                                  <option value={95}>품질 95</option>
                                </select>
                              )}
                              {item.name === '팔찌 효과 재변환권' && (
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

            {activeSubTab.key === 'weekly' && renderRewardTable(weeklyRewards, '주간 보상', '주간 보상 총합')}
            {activeSubTab.key === 'cumulative' && renderRewardTable(cumulativeRewards, '누적 보상', '누적 보상 총합')}
            {activeSubTab.key === 'daily' && renderRewardTable(dailyBenefits, '상시 혜택 (일일)', '상시 혜택 총합')}
          </div>
        </div>
      </div>
    </div>
  );
}