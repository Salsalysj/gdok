'use client';

import { useMemo, useState } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { useValueDb } from '../contexts/ValueDbContext';

export default function ValueDBClient() {
  const { adjustedEntries } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');

  // 검색 필터링 및 자동완성
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 자동완성 제안
  const autocompleteSuggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) return [];
    const query = searchQuery.toLowerCase().trim();
    const matches = adjustedEntries
      .filter(entry => entry.itemName.toLowerCase().includes(query))
      .slice(0, 10)
      .map(entry => entry.itemName);
    return matches;
  }, [adjustedEntries, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div>
        <div className="mb-6 md:mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">가치 계산 DB</h1>
          <p className="text-base text-gray-400 mb-4">
            과금 효율 탭에서 선택 가능한 아이템들의 기준 가치를 확인합니다. 크리스탈/골드/현금 항목은
            각 단위로 표시되며, 별도 정보가 없으면 시장가(골드 기준)가 사용됩니다.
          </p>
          
          {/* 검색 입력 */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="아이템명 검색..."
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                aria-label="검색 초기화"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            
            {/* 자동완성 드롭다운 */}
            {autocompleteSuggestions.length > 0 && searchQuery.trim() && (
              <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSearchQuery(suggestion);
                    }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto bg-gray-900/70 rounded-xl border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800 text-sm md:text-base">
            <thead className="bg-gray-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-200 w-28">단위</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-200 w-40">가치</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-200">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredEntries.map((entry) => (
                <tr key={entry.itemName}>
                  <td className="px-4 py-3 text-white">{entry.itemName}</td>
                  <td className="px-4 py-3 text-gray-300">{entry.unitType ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-yellow-300">
                    {entry.unitValue != null
                      ? formatNumberWithSignificantDigits(entry.unitValue)
                      : '정보 없음'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{entry.note ?? ''}</td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    표시할 아이템이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          ※ 값이 0 또는 “정보 없음”으로 표시되는 항목은 etc_list.csv나 시장 데이터에 값이 없거나, 계산 로직이
          적용되지 않은 항목입니다.
        </p>
      </div>
    </div>
  );
}


