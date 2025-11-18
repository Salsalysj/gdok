'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ItemIcon from '../components/ItemIcon';

type FeaturedItem = {
  id: number;
  name: string;
  type?: string;
};

type SearchItem = {
  Id: number;
  Name: string;
  Grade?: string;
  Icon?: string;
};

export default function AdminPage() {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newItem, setNewItem] = useState({ id: '', name: '' });
  const [adding, setAdding] = useState(false);
  
  // 검색 관련 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchType, setSearchType] = useState<'market' | 'auction'>('market');
  
  // 캐시 갱신 관련 상태
  const [refreshing, setRefreshing] = useState(false);
  
  // 크리스탈 골드 환율 관련 상태
  const [exchangeRate, setExchangeRate] = useState({ exchange: '', discord: '' });
  const [savingRate, setSavingRate] = useState(false);
  const [updatingExchange, setUpdatingExchange] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/items');
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      } else {
        setError(data.error || '리스트 로드 실패');
      }
    } catch (err) {
      setError('리스트를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualCrystalRefresh = async () => {
    if (!confirm('크리스탈 환율을 즉시 갱신하시겠습니까? 외부 API를 호출하여 최신 값을 가져옵니다.')) {
      return;
    }

    try {
      setUpdatingExchange(true);
      setError('');
      const res = await fetch('/api/admin/crystal-gold/update-exchange', {
        method: 'POST',
      });

      const data = await res.json();
      if (res.ok) {
        alert('크리스탈 환율이 갱신되었습니다.');
      } else {
        setError(data.error || '크리스탈 환율 갱신에 실패했습니다.');
      }
    } catch (err) {
      setError('크리스탈 환율 갱신 중 오류가 발생했습니다.');
    } finally {
      setUpdatingExchange(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.id || !newItem.name) {
      setError('ID와 이름을 모두 입력해주세요.');
      return;
    }

    try {
      setAdding(true);
      setError('');
      const res = await fetch('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(newItem.id),
          name: newItem.name.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        setNewItem({ id: '', name: '' });
      } else {
        setError(data.error || '추가 실패');
      }
    } catch (err) {
      setError('추가 중 오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      setError('');
      const res = await fetch(`/api/admin/items?id=${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
      } else {
        setError(data.error || '삭제 실패');
      }
    } catch (err) {
      setError('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setError('검색어를 입력해주세요.');
      return;
    }

    try {
      setSearching(true);
      setError('');
      
      // 거래소 또는 경매장 선택에 따라 API 엔드포인트 변경
      const endpoint = searchType === 'auction' ? '/api/auction/search' : '/api/market/search';
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName: searchQuery.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.Items) {
        setSearchResults(data.Items);
      } else {
        setSearchResults([]);
        setError('검색 결과가 없습니다.');
      }
    } catch (err) {
      setError('검색 중 오류가 발생했습니다.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddFromSearch = async (item: SearchItem, sourceType: 'market' | 'auction' = 'market') => {
    // 이미 추가되어 있는지 확인
    if (items.some(i => i.id === item.Id || i.name === item.Name)) {
      setError('이미 추가된 아이템입니다.');
      return;
    }

    try {
      setError('');
      const res = await fetch('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.Id,
          name: item.Name,
          type: sourceType,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        // 검색 결과에서도 제거
        setSearchResults(searchResults.filter(r => r.Id !== item.Id));
      } else {
        setError(data.error || '추가 실패');
      }
    } catch (err) {
      setError('추가 중 오류가 발생했습니다.');
    }
  };

  const handleMove = async (id: number, direction: 'up' | 'down') => {
    try {
      setError('');
      const res = await fetch('/api/admin/items/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, direction }),
      });

      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
      } else {
        setError(data.error || '순서 변경 실패');
      }
    } catch (err) {
      setError('순서 변경 중 오류가 발생했습니다.');
    }
  };

  const handleRefreshCache = async () => {
    if (!confirm('주요 아이템 시세 캐시를 강제로 갱신하시겠습니까? 이 작업은 시간이 걸릴 수 있습니다.')) {
      return;
    }

    try {
      setRefreshing(true);
      setError('');
      const res = await fetch('/api/market/cache/update', {
        method: 'POST',
      });

      const data = await res.json();
      if (res.ok) {
        alert('캐시 갱신이 완료되었습니다! 시세 페이지를 새로고침해주세요.');
      } else {
        setError(data.error || '캐시 갱신 실패');
      }
    } catch (err) {
      setError('캐시 갱신 중 오류가 발생했습니다.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveExchangeRate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const exchange = parseFloat(exchangeRate.exchange);
    const discord = parseFloat(exchangeRate.discord);
    
    if (isNaN(exchange) || isNaN(discord) || exchange <= 0 || discord <= 0) {
      setError('화폐거래소와 디스코드 값을 모두 올바른 숫자로 입력해주세요.');
      return;
    }

    try {
      setSavingRate(true);
      setError('');
      const res = await fetch('/api/admin/crystal-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, discord }),
      });

      const data = await res.json();
      if (res.ok) {
        alert('크리스탈 골드 환율이 저장되었습니다.');
        setExchangeRate({ exchange: '', discord: '' });
      } else {
        setError(data.error || '환율 저장 실패');
      }
    } catch (err) {
      setError('환율 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/market" className="text-blue-400 hover:text-blue-300 mb-4 inline-block">
            ← 시세 페이지로 돌아가기
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">주요 아이템 관리</h1>
              <p className="text-gray-400">주요 아이템 시세 페이지에 표시할 아이템을 관리하세요.</p>
            </div>
            <button
              onClick={handleRefreshCache}
              disabled={refreshing}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {refreshing ? '갱신 중...' : '캐시 강제 갱신'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* 아이템 검색 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">아이템 검색</h2>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSearchType('market')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    searchType === 'market'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  거래소
                </button>
                <button
                  type="button"
                  onClick={() => setSearchType('auction')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    searchType === 'auction'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  경매장
                </button>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="아이템 이름을 입력하세요 (예: 파괴강석)"
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {searching ? '검색 중...' : '검색'}
              </button>
            </div>
          </form>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-300 mb-2">검색 결과</h3>
              <div className="divide-y divide-gray-700 max-h-64 overflow-y-auto">
                {searchResults.map((result) => {
                  const isAlreadyAdded = items.some(i => i.id === result.Id || i.name === result.Name);
                  return (
                    <div
                      key={result.Id}
                      className="p-3 flex items-center justify-between hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ItemIcon icon={result.Icon} name={result.Name} size="sm" />
                        <div>
                          <div className="text-white font-medium">{result.Name}</div>
                          <div className="text-sm text-gray-400">ID: {result.Id}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddFromSearch(result, searchType)}
                        disabled={isAlreadyAdded}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          isAlreadyAdded
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {isAlreadyAdded ? '추가됨' : '추가'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 수동 추가 폼 (선택사항) */}
        <details className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <summary className="text-xl font-semibold text-white mb-4 cursor-pointer">
            수동으로 추가하기
          </summary>
          <form onSubmit={handleAdd} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  아이템 ID
                </label>
                <input
                  type="number"
                  value={newItem.id}
                  onChange={(e) => setNewItem({ ...newItem, id: e.target.value })}
                  placeholder="예: 662000"
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  아이템 이름
                </label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="예: 파괴강석"
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={adding || !newItem.id || !newItem.name}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {adding ? '추가 중...' : '추가'}
            </button>
          </form>
        </details>

        {/* 아이템 리스트 */}
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">
              현재 아이템 목록 ({items.length}개)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">로딩 중...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              등록된 아이템이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* 순서 변경 버튼 */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMove(item.id, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        title="위로 이동"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMove(item.id, 'down')}
                        disabled={index === items.length - 1}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        title="아래로 이동"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{item.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        item.type === 'auction'
                          ? 'bg-purple-900/30 text-purple-300 border border-purple-600'
                          : 'bg-blue-900/30 text-blue-300 border border-blue-600'
                      }`}>
                        {item.type === 'auction' ? '경매장' : '거래소'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">ID: {item.id || '-'}</div>
                  </div>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 크리스탈 골드 환율 입력 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold text-white">크리스탈 골드 환율 입력</h2>
            <button
              onClick={handleManualCrystalRefresh}
              disabled={updatingExchange}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all"
            >
              {updatingExchange ? '갱신 중...' : '즉시 갱신'}
            </button>
          </div>
          <form onSubmit={handleSaveExchangeRate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  화폐거래소 (100크리당 골드)
                </label>
                <input
                  type="number"
                  value={exchangeRate.exchange}
                  onChange={(e) => setExchangeRate({ ...exchangeRate, exchange: e.target.value })}
                  placeholder="예: 120000"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  디스코드 (100:n에서 n 값)
                </label>
                <input
                  type="number"
                  value={exchangeRate.discord}
                  onChange={(e) => setExchangeRate({ ...exchangeRate, discord: e.target.value })}
                  placeholder="예: 5000"
                  step="1"
                  min="0"
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingRate}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all"
            >
              {savingRate ? '저장 중...' : '환율 저장'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

