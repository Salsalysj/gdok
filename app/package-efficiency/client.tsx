'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';

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
  components: ComponentItem[];
};

type PackageData = {
  packageName: string;
  category: '월간' | '주간' | '한정';
  priceType: '현금' | '크리스탈' | '골드';
  price: number;
  is3Plus1: boolean;
  purchaseCount: number;
  endDate: string | null;
  items: PackageItem[];
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

export default function PackageEfficiencyClient({
  itemList,
  etcListData,
  crystalGoldRate,
  marketPriceMap,
  marketData,
  cubeStageTotals,
}: {
  itemList: string[];
  etcListData: { [key: string]: EtcListItem };
  crystalGoldRate: number | null;
  marketPriceMap: Record<string, number>;
  marketData: any;
  cubeStageTotals: Record<string, number>;
}) {
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);

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
    is3Plus1: false,
    purchaseCount: 1,
    endDate: null,
    items: [],
  });

  // 저장된 패키지 관련 상태
  const [savedPackages, setSavedPackages] = useState<Array<{ id: string; package_name: string; created_at: string; updated_at: string }>>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePackageName, setSavePackageName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
  function resolveUnitPrice(itemName: string): { unitType: '골드' | '크리스탈' | '현금'; unitPrice: number } | null {
    // 에브니 큐브 입장권: 괄호 안 단계에 맞는 합계 사용
    if (itemName.startsWith('에브니 큐브 입장권')) {
      const m = itemName.match(/\(([^)]+)\)/);
      const key = m ? m[1] : '';
      if (key && cubeStageTotals[key] != null) {
        return { unitType: '골드', unitPrice: cubeStageTotals[key] };
      }
    }
    // 젬 아이템 처리
    if (itemName === '고급 젬') {
      const price = calculateGemPriceByGrade('고급');
      if (price != null) return { unitType: '골드', unitPrice: price };
    } else if (itemName === '희귀 젬') {
      const price = calculateGemPriceByGrade('희귀');
      if (price != null) return { unitType: '골드', unitPrice: price };
    } else if (itemName === '영웅 젬') {
      const price = calculateGemPriceByGrade('영웅');
      if (price != null) return { unitType: '골드', unitPrice: price };
    }
    
    const etc = etcListData[itemName];
    if (etc) {
      if (etc.cash != null) return { unitType: '현금', unitPrice: etc.cash };
      if (etc.gold != null) return { unitType: '골드', unitPrice: etc.gold };
      if (etc.crystal != null) return { unitType: '크리스탈', unitPrice: etc.crystal };
    }
    const market = marketPriceMap[itemName];
    if (market != null && market > 0) return { unitType: '골드', unitPrice: market };
    return null;
  }

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
    packageData.items.forEach((packageItem) => {
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

        // 타입별 처리
        if (packageItem.itemType === '확정') {
          // 확정: 모든 구성요소 가치 합산
          total += componentValue;
        } else if (packageItem.itemType === '확률') {
          // 확률: 가치 * 확률(0~1)로 기대값 합산
          const probability = component.probability || 0;
          total += componentValue * probability;
        } else if (packageItem.itemType === '선택') {
          // 선택: 선택된 구성요소만 가치 합산
          if (component.selected) {
            total += componentValue;
          }
        }
      });
    });
    return total;
  }, [packageData.items, packageData.priceType, etcListData, crystalGoldRate, goldToCashPerGold, marketPriceMap]);

  // 효율 계산 (배수)
  const efficiency = useMemo(() => {
    if (packageData.price <= 0) return null;
    let effectivePrice = packageData.price;
    
    // 3+1 적용 (4개 구매 시 3개 가격으로 계산)
    if (packageData.is3Plus1) {
      effectivePrice = (packageData.price * 3) / 4;
    }
    
    return totalValue / effectivePrice;
  }, [totalValue, packageData.price, packageData.is3Plus1]);

  const addPackageItem = () => {
    setPackageData((prev) => ({
      ...prev,
      items: [...prev.items, { itemName: '', itemType: '확정', components: [] }],
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

  // 새로 만들기 (초기화)
  const handleNewPackage = () => {
    if (packageData.packageName || packageData.items.length > 0) {
      if (!confirm('현재 작성 중인 내용이 있습니다. 새로 만들기를 하시겠습니까?')) {
        return;
      }
    }
    
    setPackageData({
      packageName: '',
      category: '월간',
      priceType: '골드',
      price: 0,
      is3Plus1: false,
      purchaseCount: 1,
      endDate: null,
      items: [],
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
          setPackageData(packageToLoad.package_data);
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
          is3Plus1: false,
          purchaseCount: 1,
          endDate: null,
          items: [],
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
              <label className="block text-sm font-medium text-gray-300 mb-2">가격 타입</label>
              <select
                value={packageData.priceType}
                onChange={(e) => setPackageData((prev) => ({ ...prev, priceType: e.target.value as '현금' | '크리스탈' | '골드' }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
              >
                <option value="현금">현금</option>
                <option value="크리스탈">크리스탈</option>
                <option value="골드">골드</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">가격</label>
              <input
                type="number"
                value={packageData.price || ''}
                onChange={(e) => setPackageData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">구매 가능 횟수</label>
              <input
                type="number"
                value={packageData.purchaseCount || ''}
                onChange={(e) => setPackageData((prev) => ({ ...prev, purchaseCount: parseInt(e.target.value) || 1 }))}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
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
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <input
                  type="checkbox"
                  checked={packageData.is3Plus1}
                  onChange={(e) => setPackageData((prev) => ({ ...prev, is3Plus1: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                />
                3+1 여부
              </label>
            </div>
          </div>
        </div>

        {/* 구성품 */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">구성품</h2>
            <button
              onClick={addPackageItem}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              항목 추가
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
                              수량: {formatNumberWithSignificantDigits(component.quantity || 0)} × 단가 = 
                              {primaryValue > 0 && (
                                <>
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

        {/* 계산 결과 */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-white mb-4">계산 결과</h2>
          
          {/* 패키지 개요 카드 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">패키지 개요</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">패키지명</div>
                <div className="text-base font-medium text-white">
                  {packageData.packageName || '(미입력)'}
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
                  {packageData.is3Plus1 && (
                    <span className="text-xs text-gray-400 ml-2">
                      (3+1: {formatNumberWithSignificantDigits((packageData.price * 3) / 4)} {packageData.priceType})
                    </span>
                  )}
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
          {packageData.items.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">구성품 내용</h3>
              <div className="space-y-3">
                {packageData.items.map((packageItem, itemIndex) => (
                  <div key={itemIndex} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="font-medium text-white mb-2">
                      {packageItem.itemName || `항목 ${itemIndex + 1}`} 
                      <span className="text-xs text-gray-400 ml-2">({packageItem.itemType})</span>
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
                        }

                        const isIncluded = packageItem.itemType === '확정' || 
                                         (packageItem.itemType === '확률') ||
                                         (packageItem.itemType === '선택' && component.selected);

                        return (
                          <div key={compIndex} className={`text-sm ${isIncluded ? 'text-gray-300' : 'text-gray-500 line-through'}`}>
                            {packageItem.itemType === '선택' && (
                              <span className={component.selected ? 'text-green-400' : 'text-gray-500'}>
                                {component.selected ? '✓ ' : '○ '}
                              </span>
                            )}
                            {packageItem.itemType === '확률' && component.probability !== undefined && (
                              <span className="text-purple-400">
                                [{(component.probability * 100).toFixed(1)}%] 
                              </span>
                            )}
                            • {component.itemName || '(직접 입력)'} × {formatNumberWithSignificantDigits(component.quantity || 0)}
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
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">합산 효율</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <div className="text-sm text-gray-400 mb-2">패키지 가격</div>
                <div className="text-2xl font-bold text-white">
                  {formatNumberWithSignificantDigits(packageData.is3Plus1 ? (packageData.price * 3) / 4 : packageData.price)} {packageData.priceType}
                </div>
                {packageData.is3Plus1 && (
                  <div className="text-xs text-gray-500 mt-1">3+1 적용</div>
                )}
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

