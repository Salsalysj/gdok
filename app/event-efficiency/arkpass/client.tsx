'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useValueDb } from '../../contexts/ValueDbContext';

// 숫자 포맷팅 함수
function formatNumberWithSignificantDigits(value: number): string {
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  } else if (absValue >= 100) {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  } else if (absValue >= 10) {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  } else {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
  }
}

type EtcListItem = {
  itemName: string;
  crystal: number | null;
  gold: number | null;
  cash: number | null;
  originalCrystal: number | null;
  originalGold: number | null;
};

type ComponentItem = {
  itemName: string;
  quantity: number;
  manualPrice?: number | null;
  manualUnitType?: '골드' | '크리스탈' | '현금' | null;
  nestedItem?: BundleItem | null;
};

type BundleItem = {
  itemName: string;
  itemType: '확정' | '확률' | '선택';
  quantity: number;
  components: ComponentItem[];
};

type LevelChoice = {
  left: BundleItem[];
  right: BundleItem[];
};

type ArkpassGuideClientProps = {
  crystalGoldRate: number | null;
  etcListItems: EtcListItem[];
  initialSavedGuides: Array<{ id: string; name: string; pass_name: string; start_date: string; end_date: string; levels: LevelChoice[]; created_at: string; updated_at: string }>;
};

export default function ArkpassGuideClient({
  crystalGoldRate,
  etcListItems,
  initialSavedGuides,
}: ArkpassGuideClientProps) {
  const { adjustedEntries } = useValueDb();
  
  // 로컬 환경에서만 저장/업데이트 허용
  const allowSave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
  
  // SearchableSelect 컴포넌트
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
  
  // 아이템 드롭다운 옵션
  const itemDropdownOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    
    // 가치계산DB에서 가져오기
    if (adjustedEntries && adjustedEntries.length > 0) {
      adjustedEntries.forEach(entry => {
        if (entry.itemName && entry.unitType === '골드' && entry.unitValue !== null) {
          options.push({
            value: entry.itemName,
            label: `${entry.itemName} (${formatNumberWithSignificantDigits(entry.unitValue)}골드)`,
          });
        }
      });
    }
    
    // etc_list에서 추가
    etcListItems.forEach(item => {
      if (!options.find(opt => opt.value === item.itemName)) {
        if (item.gold !== null) {
          options.push({
            value: item.itemName,
            label: `${item.itemName} (${formatNumberWithSignificantDigits(item.gold)}골드)`,
          });
        } else if (item.crystal !== null && crystalGoldRate !== null) {
          const goldValue = (item.crystal * crystalGoldRate) / 100;
          options.push({
            value: item.itemName,
            label: `${item.itemName} (${formatNumberWithSignificantDigits(goldValue)}골드)`,
          });
        }
      }
    });
    
    // 기본 옵션 추가
    return [
      { value: '', label: '아이템 선택' },
      { value: '__nested__', label: '묶음 항목 추가' },
      { value: '__manual__', label: '(직접 입력)' },
      ...options.sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'))
    ];
  }, [adjustedEntries, etcListItems, crystalGoldRate]);
  
  // 저장된 가이드 관련 상태
  const [savedGuides, setSavedGuides] = useState<Array<{ id: string; name: string; pass_name: string; start_date: string; end_date: string; levels: LevelChoice[]; created_at: string; updated_at: string }>>(initialSavedGuides);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveGuideName, setSaveGuideName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // 기본 정보
  const [passName, setPassName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 레벨 데이터
  const [levels, setLevels] = useState<LevelChoice[]>([]);
  
  // 아이템 단가 가져오기
  const getItemUnitPrice = useCallback((itemName: string): number | null => {
    if (!itemName || itemName === '__manual__') return null;
    
    // 1. 가치계산DB에서 찾기
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
    
    return null;
  }, [adjustedEntries, etcListItems, crystalGoldRate]);
  
  // 중첩된 묶음 항목의 가치를 재귀적으로 계산하는 함수
  const calculateNestedItemValue = useCallback((nestedItem: BundleItem): number => {
    let nestedValue = 0;
    nestedItem.components.forEach((nestedComp) => {
      // 중첩된 항목 내부에 또 중첩이 있는 경우 재귀 호출
      if (nestedComp.itemName === '__nested__' && nestedComp.nestedItem) {
        const nestedNestedValue = calculateNestedItemValue(nestedComp.nestedItem);
        nestedValue += nestedNestedValue * (nestedComp.quantity || 1);
        return;
      }
      
      // 직접 입력인 경우
      const isManual = nestedComp.itemName === '__manual__' || (nestedComp.itemName && nestedComp.itemName !== '__nested__' && !getItemUnitPrice(nestedComp.itemName));
      if (isManual && nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined && nestedComp.manualPrice > 0) {
        nestedValue += nestedComp.manualPrice * (nestedComp.quantity || 1);
        return;
      }
      
      // 일반 아이템인 경우
      const unitPrice = getItemUnitPrice(nestedComp.itemName);
      if (unitPrice !== null && unitPrice > 0) {
        nestedValue += unitPrice * (nestedComp.quantity || 1);
      }
    });
    return nestedValue * nestedItem.quantity;
  }, [getItemUnitPrice]);
  
  // 묶음 항목 가치 계산
  const calculateBundleValue = useCallback((bundle: BundleItem[]): number => {
    return bundle.reduce((sum, item) => {
      const itemValue = item.components.reduce((componentSum, comp) => {
        // 중첩된 묶음 항목인 경우
        if (comp.itemName === '__nested__' && comp.nestedItem) {
          const nestedValue = calculateNestedItemValue(comp.nestedItem);
          return componentSum + nestedValue * (comp.quantity || 1) * item.quantity;
        }
        
        // 직접 입력인 경우
        const isManual = comp.itemName === '__manual__' || comp.itemName === '';
        if (isManual && comp.manualPrice !== null && comp.manualPrice !== undefined && comp.manualPrice > 0) {
          return componentSum + comp.manualPrice * (comp.quantity || 1) * item.quantity;
        }
        
        // 일반 아이템인 경우
        const unitPrice = getItemUnitPrice(comp.itemName);
        if (unitPrice === null || unitPrice <= 0) return componentSum;
        return componentSum + (unitPrice * comp.quantity * item.quantity);
      }, 0);
      return sum + itemValue;
    }, 0);
  }, [getItemUnitPrice, calculateNestedItemValue]);
  
  // 레벨 추가
  const handleAddLevel = useCallback(() => {
    setLevels(prev => [...prev, {
      left: [],
      right: [],
    }]);
  }, []);
  
  // 레벨 삭제
  const handleRemoveLevel = useCallback((levelIndex: number) => {
    setLevels(prev => prev.filter((_, idx) => idx !== levelIndex));
  }, []);
  
  // 묶음 항목 추가
  const handleAddBundle = useCallback((levelIndex: number, side: 'left' | 'right') => {
    const newBundle: BundleItem = {
      itemName: '',
      itemType: '확정',
      quantity: 1,
      components: [],
    };
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? { ...level, [side]: [...level[side], newBundle] }
        : level
    ));
  }, []);
  
  // 묶음 항목 삭제
  const handleRemoveBundle = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? { ...level, [side]: level[side].filter((_, bIdx) => bIdx !== bundleIndex) }
        : level
    ));
  }, []);
  
  // 묶음 항목 업데이트
  const handleUpdateBundle = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, field: keyof BundleItem, value: any) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex ? { ...bundle, [field]: value } : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 구성 요소 추가
  const handleAddComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number) => {
    const newComponent: ComponentItem = {
      itemName: '',
      quantity: 1,
    };
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? { ...bundle, components: [...bundle.components, newComponent] }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 구성 요소 삭제
  const handleRemoveComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, componentIndex: number) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? { ...bundle, components: bundle.components.filter((_, cIdx) => cIdx !== componentIndex) }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 구성 요소 업데이트
  const handleUpdateComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, componentIndex: number, field: keyof ComponentItem, value: any) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? {
                    ...bundle,
                    components: bundle.components.map((comp, cIdx) => 
                      cIdx === componentIndex ? { ...comp, [field]: value } : comp
                    ),
                  }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 중첩된 묶음 항목의 구성 요소 추가
  const handleAddNestedComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, componentIndex: number) => {
    const newComponent: ComponentItem = {
      itemName: '',
      quantity: 1,
    };
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? {
                    ...bundle,
                    components: bundle.components.map((comp, cIdx) => 
                      cIdx === componentIndex && comp.nestedItem
                        ? {
                            ...comp,
                            nestedItem: {
                              ...comp.nestedItem,
                              components: [...comp.nestedItem.components, newComponent],
                            },
                          }
                        : comp
                    ),
                  }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 중첩된 묶음 항목의 구성 요소 삭제
  const handleRemoveNestedComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, componentIndex: number, nestedComponentIndex: number) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? {
                    ...bundle,
                    components: bundle.components.map((comp, cIdx) => 
                      cIdx === componentIndex && comp.nestedItem
                        ? {
                            ...comp,
                            nestedItem: {
                              ...comp.nestedItem,
                              components: comp.nestedItem.components.filter((_, ncIdx) => ncIdx !== nestedComponentIndex),
                            },
                          }
                        : comp
                    ),
                  }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 중첩된 묶음 항목의 구성 요소 업데이트
  const handleUpdateNestedComponent = useCallback((levelIndex: number, side: 'left' | 'right', bundleIndex: number, componentIndex: number, nestedComponentIndex: number, field: keyof ComponentItem, value: any) => {
    setLevels(prev => prev.map((level, idx) => 
      idx === levelIndex 
        ? {
            ...level,
            [side]: level[side].map((bundle, bIdx) => 
              bIdx === bundleIndex 
                ? {
                    ...bundle,
                    components: bundle.components.map((comp, cIdx) => 
                      cIdx === componentIndex && comp.nestedItem
                        ? {
                            ...comp,
                            nestedItem: {
                              ...comp.nestedItem,
                              components: comp.nestedItem.components.map((nestedComp, ncIdx) => 
                                ncIdx === nestedComponentIndex ? { ...nestedComp, [field]: value } : nestedComp
                              ),
                            },
                          }
                        : comp
                    ),
                  }
                : bundle
            ),
          }
        : level
    ));
  }, []);
  
  // 새로 만들기
  const handleNew = useCallback(() => {
    if (passName || startDate || endDate || levels.length > 0) {
      if (!confirm('작성 중인 내용이 있습니다. 새로 만들기를 진행하시겠습니까?')) {
        return;
      }
    }
    setPassName('');
    setStartDate('');
    setEndDate('');
    setLevels([]);
    setSelectedGuideId(null);
  }, [passName, startDate, endDate, levels]);
  
  // 저장
  const handleSave = async () => {
    if (!saveGuideName.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    setIsLoading(true);
    try {
      const method = selectedGuideId ? 'PUT' : 'POST';
      const url = selectedGuideId ? `/api/arkpass-guides/${selectedGuideId}` : '/api/arkpass-guides';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveGuideName,
          pass_name: passName,
          start_date: startDate,
          end_date: endDate,
          levels,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }
      
      // 목록 다시 불러오기
      const listRes = await fetch('/api/arkpass-guides');
      const listData = await listRes.json();
      if (listData.items) {
        setSavedGuides(listData.items);
        if (selectedGuideId) {
          setSelectedGuideId(data.item.id);
        }
      }
      
      setShowSaveModal(false);
      setSaveGuideName('');
      alert(selectedGuideId ? '아크패스 가이드가 업데이트되었습니다.' : '아크패스 가이드가 저장되었습니다.');
    } catch (error: any) {
      console.error('아크패스 가이드 저장 실패:', error);
      alert(error.message || '아크패스 가이드 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 불러오기
  const handleLoad = async (itemId: string, silent: boolean = false) => {
    setIsLoading(true);
    try {
      const itemToLoad = savedGuides.find(item => item.id === itemId);
      if (itemToLoad) {
        setPassName(itemToLoad.pass_name || '');
        setStartDate(itemToLoad.start_date || '');
        setEndDate(itemToLoad.end_date || '');
        if (itemToLoad.levels) {
          setLevels(itemToLoad.levels);
        }
        setSelectedGuideId(itemId);
        if (!silent) {
          alert('아크패스 가이드가 불러와졌습니다.');
        }
      } else {
        throw new Error('아크패스 가이드를 찾을 수 없습니다.');
      }
    } catch (error: any) {
      console.error('아크패스 가이드 불러오기 실패:', error);
      if (!silent) {
        alert(error.message || '아크패스 가이드 불러오기에 실패했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // 삭제
  const handleDelete = async (itemId: string) => {
    if (!confirm('이 아크패스 가이드를 삭제하시겠습니까?')) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/arkpass-guides/${itemId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '삭제에 실패했습니다.');
      }
      
      // 목록 다시 불러오기
      const listRes = await fetch('/api/arkpass-guides');
      const listData = await listRes.json();
      if (listData.items) {
        setSavedGuides(listData.items);
      }
      
      if (selectedGuideId === itemId) {
        setSelectedGuideId(null);
      }
      
      alert('아크패스 가이드가 삭제되었습니다.');
    } catch (error: any) {
      console.error('아크패스 가이드 삭제 실패:', error);
      alert(error.message || '아크패스 가이드 삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-2xl font-bold text-white">아크패스 선택 가이드</h1>
              <div className="flex flex-wrap gap-2">
                {/* 저장 버튼 (로컬에서만 표시) */}
                {allowSave && (
                  <button
                    onClick={() => {
                      const selectedItem = savedGuides.find(item => item.id === selectedGuideId);
                      // 업데이트 시에는 기존 이름, 새로 저장 시에는 패스 이름을 기본값으로 사용
                      setSaveGuideName(selectedItem?.name || passName || '');
                      setShowSaveModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {selectedGuideId ? '업데이트' : '저장'}
                  </button>
                )}
                
                {/* 새로 만들기 버튼 */}
                <button
                  onClick={handleNew}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  새로 만들기
                </button>
              </div>
            </div>
            
            {/* 저장된 가이드 목록 */}
            {savedGuides.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white mb-1">저장된 아크패스 가이드</h3>
                  <p className="text-xs text-gray-400">카드를 클릭하여 선택하거나 불러오기</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedGuides.map((item) => {
                    // 종료일 체크
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    let isExpired = false;
                    if (item.end_date) {
                      const endDate = new Date(item.end_date);
                      endDate.setHours(23, 59, 59, 999);
                      isExpired = endDate < today;
                    }
                    const statusText = isExpired ? '기간 만료' : '보상 수령 가능';
                    const statusColor = isExpired ? 'text-gray-400' : 'text-green-400';
                    const isSelected = selectedGuideId === item.id;
                    
                    // 날짜 포맷팅
                    const formatDate = (dateStr: string) => {
                      if (!dateStr) return '-';
                      try {
                        const date = new Date(dateStr);
                        return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
                      } catch {
                        return dateStr;
                      }
                    };
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleLoad(item.id)}
                        className={`relative bg-gradient-to-br ${
                          isSelected
                            ? 'from-purple-900/80 to-purple-800/80 border-2 border-purple-500'
                            : isExpired
                            ? 'from-gray-800/60 to-gray-700/60 border border-gray-600'
                            : 'from-gray-800/80 to-gray-700/80 border border-gray-600'
                        } rounded-xl p-4 cursor-pointer transition-all hover:scale-105 hover:shadow-lg ${
                          isSelected ? 'shadow-purple-500/20' : 'hover:shadow-gray-500/20'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <span className="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded">선택됨</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between">
                            <h4 className={`text-lg font-bold ${isExpired ? 'text-gray-400' : 'text-white'} pr-12`}>
                              {item.name}
                            </h4>
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm text-gray-300">
                              <span className="text-gray-400">패스:</span> {item.pass_name || '-'}
                            </div>
                            <div className="text-sm text-gray-300">
                              <span className="text-gray-400">기간:</span>{' '}
                              {item.start_date && item.end_date
                                ? `${formatDate(item.start_date)} ~ ${formatDate(item.end_date)}`
                                : '-'}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-xs font-semibold px-2 py-1 rounded ${statusColor} ${
                                isExpired ? 'bg-gray-700/50' : 'bg-green-500/20'
                              }`}>
                                {statusText}
                              </span>
                            </div>
                          </div>
                          {allowSave && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item.id);
                              }}
                              className="absolute bottom-2 right-2 px-2 py-1 bg-red-600/80 hover:bg-red-700 text-white rounded text-xs transition-colors"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* 저장 모달 */}
            {showSaveModal && allowSave && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    {selectedGuideId ? '아크패스 가이드 업데이트' : '아크패스 가이드 저장'}
                  </h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">이름</label>
                    <input
                      type="text"
                      value={saveGuideName}
                      onChange={(e) => setSaveGuideName(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                      placeholder="이름 입력"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowSaveModal(false);
                        setSaveGuideName('');
                      }}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                      disabled={isLoading}
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                      disabled={isLoading || !saveGuideName.trim()}
                    >
                      {isLoading ? '처리 중...' : selectedGuideId ? '업데이트' : '저장'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 기본 정보 카드 */}
        <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-4">기본 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">패스 이름</label>
              <input
                type="text"
                value={passName}
                onChange={(e) => setPassName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
                placeholder="예: 2025년 2월 아크패스"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
        
        {/* 선택 아이템 카드 */}
        <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">선택 아이템</h2>
            <button
              onClick={handleAddLevel}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              + 레벨 추가
            </button>
          </div>
          
          {/* 레벨 목록 */}
          <div className="space-y-6">
            {levels.map((level, levelIndex) => {
              const leftValue = calculateBundleValue(level.left);
              const rightValue = calculateBundleValue(level.right);
              const highlightLeft = leftValue > rightValue;
              const highlightRight = rightValue > leftValue;
              
              return (
                <div key={levelIndex} className="bg-gray-800/60 rounded-xl border border-gray-700 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-purple-300">레벨 {levelIndex + 1}</h3>
                    <button
                      onClick={() => handleRemoveLevel(levelIndex)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                    >
                      레벨 삭제
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 왼쪽 선택지 */}
                    <div className={`bg-gray-900/50 rounded-lg p-4 border-2 ${highlightLeft ? 'border-yellow-500 shadow-lg shadow-yellow-500/30' : 'border-gray-700'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-blue-300">선택지 A</h4>
                          {highlightLeft && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">추천</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleAddBundle(levelIndex, 'left')}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                        >
                          + 묶음 추가
                        </button>
                      </div>
                      <div className="text-sm text-gray-400 mb-2">
                        총 가치: <span className="text-yellow-400 font-bold">{leftValue.toFixed(0)}골드</span>
                      </div>
                      {/* 묶음 항목 렌더링 */}
                      <div className="space-y-2 mt-3">
                        {level.left.map((bundle, bundleIndex) => (
                          <div key={bundleIndex} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                              <input
                                type="text"
                                value={bundle.itemName}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'left', bundleIndex, 'itemName', e.target.value)}
                                className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-sm mr-2"
                                placeholder="묶음 항목명"
                              />
                              <select
                                value={bundle.itemType}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'left', bundleIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                                className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-xs mr-2"
                              >
                                <option value="확정">확정</option>
                                <option value="확률">확률</option>
                                <option value="선택">선택</option>
                              </select>
                              <input
                                type="number"
                                value={bundle.quantity}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'left', bundleIndex, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-sm mr-2"
                                min="1"
                              />
                              <button
                                onClick={() => handleRemoveBundle(levelIndex, 'left', bundleIndex)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                              >
                                ×
                              </button>
                            </div>
                            {/* 구성 요소 목록 */}
                            <div className="space-y-2 mt-2">
                              {bundle.components.map((component, componentIndex) => {
                                const isNested = component.itemName === '__nested__';
                                const isInDropdown = itemDropdownOptions.some(opt => opt.value === component.itemName);
                                const isManual = component.itemName === '__manual__' || component.itemName === '' || (!isNested && !isInDropdown && component.itemName !== '');
                                const unitPrice = !isManual && !isNested ? getItemUnitPrice(component.itemName) : null;
                                const manualPrice = isManual && component.manualPrice !== null && component.manualPrice !== undefined ? component.manualPrice : null;
                                const nestedValue = isNested && component.nestedItem ? calculateNestedItemValue(component.nestedItem) : null;
                                
                                let value = 0;
                                if (isManual && manualPrice !== null) {
                                  value = manualPrice * component.quantity * bundle.quantity;
                                } else if (isNested && nestedValue !== null) {
                                  value = nestedValue * component.quantity;
                                } else if (unitPrice !== null && unitPrice > 0) {
                                  value = unitPrice * component.quantity * bundle.quantity;
                                }
                                
                                return (
                                  <div key={componentIndex} className="bg-gray-700/50 rounded p-2 space-y-1">
                                    <div className="flex gap-2 items-center">
                                      <SearchableSelect
                                        value={isManual ? '__manual__' : component.itemName}
                                        onChange={(value) => {
                                          if (value === '__nested__') {
                                            handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'itemName', '__nested__');
                                            handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', {
                                              itemName: '',
                                              itemType: '확정',
                                              quantity: 1,
                                              components: [],
                                            });
                                          } else if (value === '__manual__') {
                                            handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'itemName', '__manual__');
                                            handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', null);
                                          } else {
                                            handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'itemName', value);
                                            if (value !== '__nested__') {
                                              handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', null);
                                            }
                                            if (value !== '__manual__') {
                                              handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'manualPrice', null);
                                            }
                                          }
                                        }}
                                        options={itemDropdownOptions}
                                        placeholder="아이템 선택"
                                        className="flex-1"
                                        size="small"
                                      />
                                      <input
                                        type="number"
                                        value={component.quantity}
                                        onChange={(e) => handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-16 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                        min="1"
                                      />
                                      <button
                                        onClick={() => handleRemoveComponent(levelIndex, 'left', bundleIndex, componentIndex)}
                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    
                                    {/* 직접 입력 필드 */}
                                    {isManual && (
                                      <div className="space-y-1" onMouseDown={(e) => e.stopPropagation()}>
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="text"
                                            value={component.itemName === '__manual__' ? '' : component.itemName}
                                            onChange={(e) => {
                                              // 직접 입력 모드에서는 itemName을 실제 입력값으로 저장하되, SearchableSelect는 __manual__로 유지
                                              const inputValue = e.target.value;
                                              if (inputValue === '') {
                                                handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'itemName', '__manual__');
                                              } else {
                                                handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'itemName', inputValue);
                                              }
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => e.stopPropagation()}
                                            onFocus={(e) => e.stopPropagation()}
                                            className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                            placeholder="아이템 이름을 입력하세요"
                                          />
                                        </div>
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="number"
                                            value={component.manualPrice || ''}
                                            onChange={(e) => handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                                            className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                            placeholder="단가 (골드)"
                                            min="0"
                                            step="0.01"
                                          />
                                          <select
                                            value={component.manualUnitType || '골드'}
                                            onChange={(e) => handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                                            className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                          >
                                            <option value="골드">골드</option>
                                            <option value="크리스탈">크리스탈</option>
                                            <option value="현금">현금</option>
                                          </select>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 중첩된 묶음 항목 입력 */}
                                    {isNested && component.nestedItem && (
                                      <div className="bg-gray-600/50 rounded p-2 space-y-2 mt-1">
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="text"
                                            value={component.nestedItem.itemName}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                                              handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-xs"
                                            placeholder="중첩 묶음 항목명"
                                          />
                                          <select
                                            value={component.nestedItem.itemType}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                              handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-xs"
                                          >
                                            <option value="확정">확정</option>
                                            <option value="확률">확률</option>
                                            <option value="선택">선택</option>
                                          </select>
                                          <input
                                            type="number"
                                            value={component.nestedItem.quantity}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, quantity: parseInt(e.target.value) || 1 };
                                              handleUpdateComponent(levelIndex, 'left', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-xs"
                                            min="1"
                                          />
                                        </div>
                                        
                                        {/* 중첩된 묶음 항목의 구성 요소 목록 */}
                                        <div className="space-y-2 mt-2">
                                          {component.nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                            const nestedIsNested = nestedComp.itemName === '__nested__';
                                            const nestedIsInDropdown = itemDropdownOptions.some(opt => opt.value === nestedComp.itemName);
                                            const nestedIsManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || (!nestedIsNested && !nestedIsInDropdown && nestedComp.itemName !== '');
                                            const nestedUnitPrice = !nestedIsManual && !nestedIsNested ? getItemUnitPrice(nestedComp.itemName) : null;
                                            const nestedManualPrice = nestedIsManual && nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined ? nestedComp.manualPrice : null;
                                            
                                            let nestedCompValue = 0;
                                            if (nestedIsManual && nestedManualPrice !== null) {
                                              nestedCompValue = nestedManualPrice * nestedComp.quantity * component.nestedItem!.quantity;
                                            } else if (nestedUnitPrice !== null && nestedUnitPrice > 0) {
                                              nestedCompValue = nestedUnitPrice * nestedComp.quantity * component.nestedItem!.quantity;
                                            }
                                            
                                            return (
                                              <div key={nestedCompIndex} className="bg-gray-700/50 rounded p-2 space-y-1">
                                                <div className="flex gap-2 items-center">
                                                  <SearchableSelect
                                                    value={nestedIsManual ? '__manual__' : nestedComp.itemName}
                                                    onChange={(value) => {
                                                      if (value === '__nested__') {
                                                        handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__nested__');
                                                        handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', {
                                                          itemName: '',
                                                          itemType: '확정',
                                                          quantity: 1,
                                                          components: [],
                                                        });
                                                      } else if (value === '__manual__') {
                                                        handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__manual__');
                                                        handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', null);
                                                      } else {
                                                        handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'itemName', value);
                                                        if (value !== '__nested__') {
                                                          handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', null);
                                                        }
                                                        if (value !== '__manual__') {
                                                          handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'manualPrice', null);
                                                        }
                                                      }
                                                    }}
                                                    options={itemDropdownOptions}
                                                    placeholder="아이템 선택"
                                                    className="flex-1"
                                                    size="small"
                                                  />
                                                  <input
                                                    type="number"
                                                    value={nestedComp.quantity}
                                                    onChange={(e) => handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'quantity', parseInt(e.target.value) || 1)}
                                                    className="w-16 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                                    min="1"
                                                  />
                                                  <button
                                                    onClick={() => handleRemoveNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex)}
                                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                                
                                                {/* 직접 입력 필드 */}
                                                {nestedIsManual && (
                                                  <div className="space-y-1" onMouseDown={(e) => e.stopPropagation()}>
                                                    <div className="flex gap-2 items-center">
                                                      <input
                                                        type="text"
                                                        value={nestedComp.itemName === '__manual__' ? '' : nestedComp.itemName}
                                                        onChange={(e) => {
                                                          const inputValue = e.target.value;
                                                          if (inputValue === '') {
                                                            handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__manual__');
                                                          } else {
                                                            handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'itemName', inputValue);
                                                          }
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onFocus={(e) => e.stopPropagation()}
                                                        className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                                        placeholder="아이템 이름을 입력하세요"
                                                      />
                                                    </div>
                                                    <div className="flex gap-2 items-center">
                                                      <input
                                                        type="number"
                                                        value={nestedComp.manualPrice || ''}
                                                        onChange={(e) => handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                                                        className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                                        placeholder="단가 (골드)"
                                                        min="0"
                                                        step="0.01"
                                                      />
                                                      <select
                                                        value={nestedComp.manualUnitType || '골드'}
                                                        onChange={(e) => handleUpdateNestedComponent(levelIndex, 'left', bundleIndex, componentIndex, nestedCompIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                                                        className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-xs"
                                                      >
                                                        <option value="골드">골드</option>
                                                        <option value="크리스탈">크리스탈</option>
                                                        <option value="현금">현금</option>
                                                      </select>
                                                    </div>
                                                  </div>
                                                )}
                                                
                                                {/* 가치 계산 표시 */}
                                                {((!nestedIsManual && !nestedIsNested && nestedUnitPrice !== null && nestedUnitPrice > 0) || (nestedIsManual && nestedManualPrice !== null)) && (
                                                  <div className="text-xs text-gray-300">
                                                    {nestedIsManual ? (
                                                      <>
                                                        단가: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedManualPrice || 0)}</span> {nestedComp.manualUnitType || '골드'}
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        수량: <span className="font-semibold">{nestedComp.quantity}</span>
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        묶음: <span className="font-semibold">{component.nestedItem!.quantity}</span>
                                                        <span className="text-gray-500 mx-1">=</span>
                                                        <span className="font-semibold text-green-400">
                                                          {formatNumberWithSignificantDigits(nestedCompValue)} 골드
                                                        </span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        단가: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedUnitPrice || 0)}</span> 골드
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        수량: <span className="font-semibold">{nestedComp.quantity}</span>
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        묶음: <span className="font-semibold">{component.nestedItem!.quantity}</span>
                                                        <span className="text-gray-500 mx-1">=</span>
                                                        <span className="font-semibold text-green-400">
                                                          {formatNumberWithSignificantDigits(nestedCompValue)} 골드
                                                        </span>
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          <button
                                            onClick={() => handleAddNestedComponent(levelIndex, 'left', bundleIndex, componentIndex)}
                                            className="w-full px-2 py-1 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors text-xs"
                                          >
                                            + 구성 요소 추가
                                          </button>
                                        </div>
                                        
                                        <div className="text-xs text-gray-400">
                                          중첩 구성 요소: {component.nestedItem.components.length}개
                                          {nestedValue !== null && (
                                            <span className="ml-2 text-yellow-400">
                                              (가치: {formatNumberWithSignificantDigits(nestedValue)}골드)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 가치 계산 표시 */}
                                    {((!isManual && !isNested && unitPrice !== null && unitPrice > 0) || (isManual && manualPrice !== null) || (isNested && nestedValue !== null)) && (
                                      <div className="text-xs text-gray-300">
                                        {isManual ? (
                                          <>
                                            단가: <span className="font-semibold">{formatNumberWithSignificantDigits(manualPrice || 0)}</span> {component.manualUnitType || '골드'}
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        ) : isNested ? (
                                          <>
                                            중첩 가치: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedValue || 0)}</span> 골드
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            단가: <span className="font-semibold">{formatNumberWithSignificantDigits(unitPrice || 0)}</span> 골드
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <button
                                onClick={() => handleAddComponent(levelIndex, 'left', bundleIndex)}
                                className="w-full px-2 py-1 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors text-xs"
                              >
                                + 구성 요소 추가
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* 오른쪽 선택지 */}
                    <div className={`bg-gray-900/50 rounded-lg p-4 border-2 ${highlightRight ? 'border-yellow-500 shadow-lg shadow-yellow-500/30' : 'border-gray-700'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-pink-300">선택지 B</h4>
                          {highlightRight && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">추천</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleAddBundle(levelIndex, 'right')}
                          className="px-2 py-1 bg-pink-600 hover:bg-pink-700 text-white rounded text-xs transition-colors"
                        >
                          + 묶음 추가
                        </button>
                      </div>
                      <div className="text-sm text-gray-400 mb-2">
                        총 가치: <span className="text-yellow-400 font-bold">{rightValue.toFixed(0)}골드</span>
                      </div>
                      {/* 묶음 항목 렌더링 */}
                      <div className="space-y-2 mt-3">
                        {level.right.map((bundle, bundleIndex) => (
                          <div key={bundleIndex} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                              <input
                                type="text"
                                value={bundle.itemName}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'right', bundleIndex, 'itemName', e.target.value)}
                                className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-sm mr-2"
                                placeholder="묶음 항목명"
                              />
                              <select
                                value={bundle.itemType}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'right', bundleIndex, 'itemType', e.target.value as '확정' | '확률' | '선택')}
                                className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-xs mr-2"
                              >
                                <option value="확정">확정</option>
                                <option value="확률">확률</option>
                                <option value="선택">선택</option>
                              </select>
                              <input
                                type="number"
                                value={bundle.quantity}
                                onChange={(e) => handleUpdateBundle(levelIndex, 'right', bundleIndex, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-sm mr-2"
                                min="1"
                              />
                              <button
                                onClick={() => handleRemoveBundle(levelIndex, 'right', bundleIndex)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                              >
                                ×
                              </button>
                            </div>
                            {/* 구성 요소 목록 */}
                            <div className="space-y-2 mt-2">
                              {bundle.components.map((component, componentIndex) => {
                                const isNested = component.itemName === '__nested__';
                                const isInDropdown = itemDropdownOptions.some(opt => opt.value === component.itemName);
                                const isManual = component.itemName === '__manual__' || component.itemName === '' || (!isNested && !isInDropdown && component.itemName !== '');
                                const unitPrice = !isManual && !isNested ? getItemUnitPrice(component.itemName) : null;
                                const manualPrice = isManual && component.manualPrice !== null && component.manualPrice !== undefined ? component.manualPrice : null;
                                const nestedValue = isNested && component.nestedItem ? calculateNestedItemValue(component.nestedItem) : null;
                                
                                let value = 0;
                                if (isManual && manualPrice !== null) {
                                  value = manualPrice * component.quantity * bundle.quantity;
                                } else if (isNested && nestedValue !== null) {
                                  value = nestedValue * component.quantity;
                                } else if (unitPrice !== null && unitPrice > 0) {
                                  value = unitPrice * component.quantity * bundle.quantity;
                                }
                                
                                return (
                                  <div key={componentIndex} className="bg-gray-700/50 rounded p-2 space-y-1">
                                    <div className="flex gap-2 items-center">
                                      <SearchableSelect
                                        value={isManual ? '__manual__' : component.itemName}
                                        onChange={(value) => {
                                          if (value === '__nested__') {
                                            handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'itemName', '__nested__');
                                            handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', {
                                              itemName: '',
                                              itemType: '확정',
                                              quantity: 1,
                                              components: [],
                                            });
                                          } else if (value === '__manual__') {
                                            handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'itemName', '__manual__');
                                            handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', null);
                                          } else {
                                            handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'itemName', value);
                                            if (value !== '__nested__') {
                                              handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', null);
                                            }
                                            if (value !== '__manual__') {
                                              handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'manualPrice', null);
                                            }
                                          }
                                        }}
                                        options={itemDropdownOptions}
                                        placeholder="아이템 선택"
                                        className="flex-1"
                                        size="small"
                                      />
                                      <input
                                        type="number"
                                        value={component.quantity}
                                        onChange={(e) => handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-16 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                        min="1"
                                      />
                                      <button
                                        onClick={() => handleRemoveComponent(levelIndex, 'right', bundleIndex, componentIndex)}
                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    
                                    {/* 직접 입력 필드 */}
                                    {isManual && (
                                      <div className="space-y-1" onMouseDown={(e) => e.stopPropagation()}>
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="text"
                                            value={component.itemName === '__manual__' ? '' : component.itemName}
                                            onChange={(e) => {
                                              const inputValue = e.target.value;
                                              if (inputValue === '') {
                                                handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'itemName', '__manual__');
                                              } else {
                                                handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'itemName', inputValue);
                                              }
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => e.stopPropagation()}
                                            onFocus={(e) => e.stopPropagation()}
                                            className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                            placeholder="아이템 이름을 입력하세요"
                                          />
                                        </div>
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="number"
                                            value={component.manualPrice || ''}
                                            onChange={(e) => handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                                            className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                            placeholder="단가 (골드)"
                                            min="0"
                                            step="0.01"
                                          />
                                          <select
                                            value={component.manualUnitType || '골드'}
                                            onChange={(e) => handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                                            className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                          >
                                            <option value="골드">골드</option>
                                            <option value="크리스탈">크리스탈</option>
                                            <option value="현금">현금</option>
                                          </select>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 중첩된 묶음 항목 입력 */}
                                    {isNested && component.nestedItem && (
                                      <div className="bg-gray-600/50 rounded p-2 space-y-2 mt-1">
                                        <div className="flex gap-2 items-center">
                                          <input
                                            type="text"
                                            value={component.nestedItem.itemName}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, itemName: e.target.value };
                                              handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-xs"
                                            placeholder="중첩 묶음 항목명"
                                          />
                                          <select
                                            value={component.nestedItem.itemType}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, itemType: e.target.value as '확정' | '확률' | '선택' };
                                              handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-xs"
                                          >
                                            <option value="확정">확정</option>
                                            <option value="확률">확률</option>
                                            <option value="선택">선택</option>
                                          </select>
                                          <input
                                            type="number"
                                            value={component.nestedItem.quantity}
                                            onChange={(e) => {
                                              const nestedItem = { ...component.nestedItem!, quantity: parseInt(e.target.value) || 1 };
                                              handleUpdateComponent(levelIndex, 'right', bundleIndex, componentIndex, 'nestedItem', nestedItem);
                                            }}
                                            className="w-16 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-pink-500 text-xs"
                                            min="1"
                                          />
                                        </div>
                                        
                                        {/* 중첩된 묶음 항목의 구성 요소 목록 */}
                                        <div className="space-y-2 mt-2">
                                          {component.nestedItem.components.map((nestedComp, nestedCompIndex) => {
                                            const nestedIsNested = nestedComp.itemName === '__nested__';
                                            const nestedIsInDropdown = itemDropdownOptions.some(opt => opt.value === nestedComp.itemName);
                                            const nestedIsManual = nestedComp.itemName === '__manual__' || nestedComp.itemName === '' || (!nestedIsNested && !nestedIsInDropdown && nestedComp.itemName !== '');
                                            const nestedUnitPrice = !nestedIsManual && !nestedIsNested ? getItemUnitPrice(nestedComp.itemName) : null;
                                            const nestedManualPrice = nestedIsManual && nestedComp.manualPrice !== null && nestedComp.manualPrice !== undefined ? nestedComp.manualPrice : null;
                                            
                                            let nestedCompValue = 0;
                                            if (nestedIsManual && nestedManualPrice !== null) {
                                              nestedCompValue = nestedManualPrice * nestedComp.quantity * component.nestedItem!.quantity;
                                            } else if (nestedUnitPrice !== null && nestedUnitPrice > 0) {
                                              nestedCompValue = nestedUnitPrice * nestedComp.quantity * component.nestedItem!.quantity;
                                            }
                                            
                                            return (
                                              <div key={nestedCompIndex} className="bg-gray-700/50 rounded p-2 space-y-1">
                                                <div className="flex gap-2 items-center">
                                                  <SearchableSelect
                                                    value={nestedIsManual ? '__manual__' : nestedComp.itemName}
                                                    onChange={(value) => {
                                                      if (value === '__nested__') {
                                                        handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__nested__');
                                                        handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', {
                                                          itemName: '',
                                                          itemType: '확정',
                                                          quantity: 1,
                                                          components: [],
                                                        });
                                                      } else if (value === '__manual__') {
                                                        handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__manual__');
                                                        handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', null);
                                                      } else {
                                                        handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'itemName', value);
                                                        if (value !== '__nested__') {
                                                          handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'nestedItem', null);
                                                        }
                                                        if (value !== '__manual__') {
                                                          handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'manualPrice', null);
                                                        }
                                                      }
                                                    }}
                                                    options={itemDropdownOptions}
                                                    placeholder="아이템 선택"
                                                    className="flex-1"
                                                    size="small"
                                                  />
                                                  <input
                                                    type="number"
                                                    value={nestedComp.quantity}
                                                    onChange={(e) => handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'quantity', parseInt(e.target.value) || 1)}
                                                    className="w-16 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                                    min="1"
                                                  />
                                                  <button
                                                    onClick={() => handleRemoveNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex)}
                                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                                
                                                {/* 직접 입력 필드 */}
                                                {nestedIsManual && (
                                                  <div className="space-y-1" onMouseDown={(e) => e.stopPropagation()}>
                                                    <div className="flex gap-2 items-center">
                                                      <input
                                                        type="text"
                                                        value={nestedComp.itemName === '__manual__' ? '' : nestedComp.itemName}
                                                        onChange={(e) => {
                                                          const inputValue = e.target.value;
                                                          if (inputValue === '') {
                                                            handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'itemName', '__manual__');
                                                          } else {
                                                            handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'itemName', inputValue);
                                                          }
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onFocus={(e) => e.stopPropagation()}
                                                        className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                                        placeholder="아이템 이름을 입력하세요"
                                                      />
                                                    </div>
                                                    <div className="flex gap-2 items-center">
                                                      <input
                                                        type="number"
                                                        value={nestedComp.manualPrice || ''}
                                                        onChange={(e) => handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'manualPrice', parseFloat(e.target.value) || null)}
                                                        className="flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                                        placeholder="단가 (골드)"
                                                        min="0"
                                                        step="0.01"
                                                      />
                                                      <select
                                                        value={nestedComp.manualUnitType || '골드'}
                                                        onChange={(e) => handleUpdateNestedComponent(levelIndex, 'right', bundleIndex, componentIndex, nestedCompIndex, 'manualUnitType', e.target.value as '골드' | '크리스탈' | '현금')}
                                                        className="w-20 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:outline-none focus:border-pink-500 text-xs"
                                                      >
                                                        <option value="골드">골드</option>
                                                        <option value="크리스탈">크리스탈</option>
                                                        <option value="현금">현금</option>
                                                      </select>
                                                    </div>
                                                  </div>
                                                )}
                                                
                                                {/* 가치 계산 표시 */}
                                                {((!nestedIsManual && !nestedIsNested && nestedUnitPrice !== null && nestedUnitPrice > 0) || (nestedIsManual && nestedManualPrice !== null)) && (
                                                  <div className="text-xs text-gray-300">
                                                    {nestedIsManual ? (
                                                      <>
                                                        단가: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedManualPrice || 0)}</span> {nestedComp.manualUnitType || '골드'}
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        수량: <span className="font-semibold">{nestedComp.quantity}</span>
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        묶음: <span className="font-semibold">{component.nestedItem!.quantity}</span>
                                                        <span className="text-gray-500 mx-1">=</span>
                                                        <span className="font-semibold text-green-400">
                                                          {formatNumberWithSignificantDigits(nestedCompValue)} 골드
                                                        </span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        단가: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedUnitPrice || 0)}</span> 골드
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        수량: <span className="font-semibold">{nestedComp.quantity}</span>
                                                        <span className="text-gray-500 mx-1">×</span>
                                                        묶음: <span className="font-semibold">{component.nestedItem!.quantity}</span>
                                                        <span className="text-gray-500 mx-1">=</span>
                                                        <span className="font-semibold text-green-400">
                                                          {formatNumberWithSignificantDigits(nestedCompValue)} 골드
                                                        </span>
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          <button
                                            onClick={() => handleAddNestedComponent(levelIndex, 'right', bundleIndex, componentIndex)}
                                            className="w-full px-2 py-1 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors text-xs"
                                          >
                                            + 구성 요소 추가
                                          </button>
                                        </div>
                                        
                                        <div className="text-xs text-gray-400">
                                          중첩 구성 요소: {component.nestedItem.components.length}개
                                          {nestedValue !== null && (
                                            <span className="ml-2 text-yellow-400">
                                              (가치: {formatNumberWithSignificantDigits(nestedValue)}골드)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 가치 계산 표시 */}
                                    {((!isManual && !isNested && unitPrice !== null && unitPrice > 0) || (isManual && manualPrice !== null) || (isNested && nestedValue !== null)) && (
                                      <div className="text-xs text-gray-300">
                                        {isManual ? (
                                          <>
                                            단가: <span className="font-semibold">{formatNumberWithSignificantDigits(manualPrice || 0)}</span> {component.manualUnitType || '골드'}
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        ) : isNested ? (
                                          <>
                                            중첩 가치: <span className="font-semibold">{formatNumberWithSignificantDigits(nestedValue || 0)}</span> 골드
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            단가: <span className="font-semibold">{formatNumberWithSignificantDigits(unitPrice || 0)}</span> 골드
                                            <span className="text-gray-500 mx-1">×</span>
                                            수량: <span className="font-semibold">{component.quantity}</span>
                                            {bundle.quantity > 1 && (
                                              <span className="text-blue-400 ml-1">× 묶음 {bundle.quantity}</span>
                                            )}
                                            <span className="text-gray-500 mx-1">=</span>
                                            <span className="font-semibold text-green-400">
                                              {formatNumberWithSignificantDigits(value)} 골드
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <button
                                onClick={() => handleAddComponent(levelIndex, 'right', bundleIndex)}
                                className="w-full px-2 py-1 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors text-xs"
                              >
                                + 구성 요소 추가
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {levels.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>레벨을 추가하여 선택 아이템을 입력하세요.</p>
                <p className="text-sm mt-2">각 레벨마다 2개의 선택지를 비교할 수 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

