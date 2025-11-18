'use client';

import { useState, useEffect, useRef } from 'react';
import ItemIcon from './components/ItemIcon';
import { formatNumberWithSignificantDigits } from './utils/formatNumber';

interface MarketItem {
  Id: number;
  Name: string;
  Grade: string;
  Icon: string;
  BundleCount: number;
  TradeRemainCount: number | null;
  YDayAvgPrice: number;
  RecentPrice: number;
  CurrentMinPrice: number;
}

interface AutocompleteItem {
  Id: number;
  Name: string;
  Grade: string;
  Icon: string;
}

export default function Home() {
  const [itemName, setItemName] = useState('');
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 자동완성 API 호출 (debounce)
  useEffect(() => {
    if (!itemName.trim() || itemName.trim().length < 2) {
      setAutocompleteItems([]);
      setShowAutocomplete(false);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/market/autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: itemName.trim() }),
        });

        const data = await response.json();

        if (data.Items && data.Items.length > 0) {
          setAutocompleteItems(data.Items);
          setShowAutocomplete(true);
          setSelectedIndex(-1);
        } else {
          setAutocompleteItems([]);
          setShowAutocomplete(false);
        }
      } catch (err) {
        setAutocompleteItems([]);
        setShowAutocomplete(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [itemName]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!itemName.trim()) {
      setError('아이템 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setItems([]);
    setShowAutocomplete(false);

    try {
      const response = await fetch('/api/market/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemName: itemName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '검색 실패');
      }

      if (data.Items && data.Items.length > 0) {
        setItems(data.Items);
      } else {
        setError('검색 결과가 없습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutocompleteSelect = (item: AutocompleteItem) => {
    setItemName(item.Name);
    setShowAutocomplete(false);
    setAutocompleteItems([]);
    // 자동으로 검색 실행
    setTimeout(() => {
      handleSearch();
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || autocompleteItems.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < autocompleteItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < autocompleteItems.length) {
          handleAutocompleteSelect(autocompleteItems[selectedIndex]);
        } else if (autocompleteItems.length > 0) {
          handleAutocompleteSelect(autocompleteItems[0]);
        }
        break;
      case 'Escape':
        setShowAutocomplete(false);
        break;
    }
  };

  const formatPrice = (price: number) => {
    return formatNumberWithSignificantDigits(price);
  };

  const getGradeColor = (grade: string) => {
    const colors: { [key: string]: string } = {
      '전설': 'text-orange-400',
      '영웅': 'text-purple-400',
      '희귀': 'text-blue-400',
      '고급': 'text-green-400',
      '일반': 'text-gray-400',
    };
    return colors[grade] || 'text-gray-300';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            아이템 검색
          </h1>
          <p className="text-gray-400">거래소 아이템 시세를 확인하세요</p>
        </div>

        {/* 검색 폼 */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4 relative">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (autocompleteItems.length > 0) {
                    setShowAutocomplete(true);
                  }
                }}
                placeholder="아이템 이름을 입력하세요 (예: 파괴강석)"
                className="w-full px-6 py-4 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                disabled={loading}
              />
              
              {/* 자동완성 드롭다운 */}
              {showAutocomplete && autocompleteItems.length > 0 && (
                <div
                  ref={autocompleteRef}
                  className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-96 overflow-y-auto"
                >
                  {autocompleteItems.map((item, index) => (
                    <div
                      key={item.Id}
                      onClick={() => handleAutocompleteSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 ${
                        index === selectedIndex
                          ? 'bg-gray-700'
                          : 'bg-gray-800 hover:bg-gray-750'
                      } ${index === 0 ? 'rounded-t-lg' : ''} ${
                        index === autocompleteItems.length - 1 ? 'rounded-b-lg' : 'border-b border-gray-700'
                      }`}
                    >
                      <ItemIcon icon={item.Icon} name={item.Name} size="sm" />
                      <div className="flex-1">
                        <div className="text-white font-medium">{item.Name}</div>
                        <div className="text-xs text-gray-400">{item.Grade}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {loading ? '검색 중...' : '검색'}
            </button>
          </div>
        </form>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* 검색 결과 테이블 */}
        {items.length > 0 && (
          <div className="bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">등급</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">아이템명</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">묶음 개수</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">최근 거래가</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">전일 평균가</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">현재 최저가</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.Id}
                      className="border-b border-gray-700 hover:bg-gray-750 transition-colors"
                    >
                      <td className={`px-6 py-4 text-sm font-semibold ${getGradeColor(item.Grade)}`}>
                        {item.Grade}
                      </td>
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        <div className="flex items-center gap-3">
                          <ItemIcon icon={item.Icon} name={item.Name} size="md" />
                          <span>{item.Name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 text-right">
                        {item.BundleCount}개
                      </td>
                      <td className="px-6 py-4 text-sm text-yellow-400 text-right font-semibold">
                        {formatPrice(item.RecentPrice)}
                      </td>
                      <td className="px-6 py-4 text-sm text-blue-400 text-right">
                        {formatPrice(item.YDayAvgPrice)}
                      </td>
                      <td className="px-6 py-4 text-sm text-green-400 text-right font-semibold">
                        {formatPrice(item.CurrentMinPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 결과가 없을 때 */}
        {!loading && items.length === 0 && !error && (
          <div className="text-center py-16 text-gray-500">
            <svg
              className="mx-auto h-16 w-16 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-lg">아이템을 검색해보세요</p>
          </div>
        )}
        {/* 하단 관리자 링크 */}
        <div className="mt-16 border-t border-gray-800 pt-6">
          <div className="flex justify-center">
            <a
              href="/admin"
              className="px-5 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors"
            >
              관리자
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

