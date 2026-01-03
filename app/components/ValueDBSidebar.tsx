'use client';

import { useMemo, useState } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';
import type { ValueDbEntry } from '@/lib/valueDb';

export default function ValueDBSidebar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const [searchQuery, setSearchQuery] = useState('');

  // 검색 필터링
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return adjustedEntries;
    const query = searchQuery.toLowerCase().trim();
    return adjustedEntries.filter(entry =>
      entry.itemName.toLowerCase().includes(query)
    );
  }, [adjustedEntries, searchQuery]);

  // 카테고리별 그룹화
  const categorizedEntries = useMemo(() => {
    const currencyItems = ['크리스탈', '실링', '페온', '1레벨 보석 (4T)', '8레벨 보석 (4T)'];
    const growthItems = ['운명의 파괴석', '운명의 수호석', '운명의 돌파석', '순환 돌파석', '운명의 파편 주머니(소)', '운명의 파편 1개당', '아비도스 융화 재료', '용암의 숨결', '빙하의 숨결'];
    const cardItems = ['전설 카드팩 (확률)', '전설~고급 카드팩', '전설~영웅 카드팩', '전설~희귀 카드팩', '전체 카드팩', '전설 카드 선택팩', '메넬리크의 서', '영겁의 정수', '영혼의 잎사귀', '태초의 조각', '카드경험치 1당'];

    const currency: ValueDbEntry[] = [];
    const growth: ValueDbEntry[] = [];
    const card: ValueDbEntry[] = [];
    const others: ValueDbEntry[] = [];

    filteredEntries.forEach(entry => {
      if (currencyItems.includes(entry.itemName)) {
        currency.push(entry);
      } else if (growthItems.includes(entry.itemName)) {
        growth.push(entry);
      } else if (cardItems.includes(entry.itemName)) {
        card.push(entry);
      } else {
        others.push(entry);
      }
    });

    // 각 카테고리 내에서 지정된 순서대로 정렬
    const sortByOrder = (entries: ValueDbEntry[], order: string[]) => {
      return entries.sort((a, b) => {
        const aIndex = order.indexOf(a.itemName);
        const bIndex = order.indexOf(b.itemName);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    };

    return {
      currency: sortByOrder(currency, currencyItems),
      growth: sortByOrder(growth, growthItems),
      card: sortByOrder(card, cardItems),
      others: others.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko')),
    };
  }, [filteredEntries]);

  return (
    <div className="h-full flex flex-col bg-gray-900/70 border-r border-gray-800">
      {/* 가격 조정 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">가격 조정</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreBreakthroughStone}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreBreakthroughStone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>돌파석 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreFragment}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreFragment: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>파편 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.ignoreCardExp}
              onChange={(e) => setState((prev) => ({ ...prev, ignoreCardExp: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>카드경험치 미반영</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.has97Stone}
              onChange={(e) => setState((prev) => ({ ...prev, has97Stone: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>97돌 오우너</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={state.hasFullRelicEngraving}
              onChange={(e) => setState((prev) => ({ ...prev, hasFullRelicEngraving: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span>풀유각 오우너</span>
          </label>
        </div>
      </div>
      
      {/* 가치 계산 DB 섹션 */}
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">가치 계산 DB</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아이템명 검색..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <table className="w-full text-xs divide-y divide-gray-800">
            <thead className="bg-gray-800/60 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-200">아이템명</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-200 w-20">단위</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-200 w-24">가치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {/* 기본재화 카테고리 */}
              {categorizedEntries.currency.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      기본재화
                    </td>
                  </tr>
                  {categorizedEntries.currency.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 성장 재료 카테고리 */}
              {categorizedEntries.growth.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      성장 재료
                    </td>
                  </tr>
                  {categorizedEntries.growth.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 카드 카테고리 */}
              {categorizedEntries.card.length > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                      카드
                    </td>
                  </tr>
                  {categorizedEntries.card.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {/* 기타 카테고리 */}
              {categorizedEntries.others.length > 0 && (
                <>
                  {categorizedEntries.currency.length > 0 || categorizedEntries.growth.length > 0 || categorizedEntries.card.length > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 bg-gray-800/40 text-gray-300 font-semibold text-xs">
                        기타
                      </td>
                    </tr>
                  ) : null}
                  {categorizedEntries.others.map((entry) => (
                    <tr key={entry.itemName} className="hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 text-white truncate" title={entry.itemName}>{entry.itemName}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs whitespace-nowrap">
                        {entry.unitType === '크리스탈' ? '크리' : entry.unitType ?? '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-yellow-300 text-xs">
                        {entry.unitValue != null
                          ? formatNumberWithSignificantDigits(entry.unitValue)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-gray-400 text-xs">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

