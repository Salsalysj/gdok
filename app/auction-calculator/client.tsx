'use client';

import { useState, useMemo } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import FavoriteButton from '../components/FavoriteButton';

type MarketItem = {
  Name: string;
  Grade?: string;
  CurrentMinPrice?: number;
  RecentPrice?: number;
  Icon?: string;
};

type AuctionCalculatorProps = {
  marketData: MarketItem[];
};

export default function AuctionCalculatorClient({ marketData }: AuctionCalculatorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [partySize, setPartySize] = useState<4 | 8 | 16>(8);
  const [copied, setCopied] = useState(false);
  
  // 검색 + 가격 정렬 (서버에서 이미 유물 각인서 + 야금술/재봉술만 전달)
  const filteredItems = useMemo(() => {
    if (!marketData || marketData.length === 0) return [];

    // 가격 높은 순 정렬
    const sorted = [...marketData].sort((a, b) => {
      const priceA = a.CurrentMinPrice ?? a.RecentPrice ?? 0;
      const priceB = b.CurrentMinPrice ?? b.RecentPrice ?? 0;
      return priceB - priceA;
    });

    if (!searchQuery.trim()) return sorted;
    
    const query = searchQuery.toLowerCase().trim();
    return sorted.filter(item => 
      (item.Name || '').toLowerCase().includes(query)
    );
  }, [marketData, searchQuery]);
  
  // 경매 계산
  const auctionResults = useMemo(() => {
    const p = parseFloat(itemPrice);
    if (!p || p <= 0) return null;
    
    const n = partySize;
    const factor = 1 + 1 / (n - 1); // 1 + 1/(n-1)
    
    // 최소 입찰가: b = 0 되는 x (다음 입찰이 손익분기)
    // x = p*0.95 / (1.1 * factor)
    const minBid = (p * 0.95) / (1.1 * factor);
    
    // 최대 입찰가: a = 0 되는 x (현재 입찰이 손익분기)
    // x = p*0.95 / factor
    const maxBid = (p * 0.95) / factor;
    
    // 추천 입찰가: a = -3*b 되는 x
    // 4*p*0.95 = x*factor*(1 + 3.3)
    // x = 3.8*p / (factor*4.3)
    const recommendedBid = (3.8 * p) / (factor * 4.3);
    
    // 추천 입찰가에서의 이득 계산
    const myProfit = p * 0.95 - recommendedBid - recommendedBid / (n - 1);
    
    return {
      minBid,
      recommendedBid,
      maxBid,
      recommendedProfit: myProfit,
    };
  }, [itemPrice, partySize]);

  // 최소/추천/최대 입찰가를 직선 위 위치(%)로 변환
  const linePositions = useMemo(() => {
    if (!auctionResults) return null;
    return {
      minPos: 0,   // 최소 입찰가: 왼쪽 0%
      recPos: 50,  // 추천 입찰가: 항상 가운데
      maxPos: 100, // 최대 입찰가: 오른쪽 100%
    };
  }, [auctionResults]);
  
  // 번호 패드 입력
  const handleNumberPad = (num: string) => {
    if (num === 'C') {
      setItemPrice('');
    } else if (num === '←') {
      setItemPrice(prev => prev.slice(0, -1));
    } else {
      setItemPrice(prev => prev + num);
    }
  };

  // 추천 입찰가 클립보드 복사
  const copyRecommendedBid = async () => {
    if (!auctionResults) return;
    
    const bidValue = Math.round(auctionResults.recommendedBid);
    try {
      await navigator.clipboard.writeText(bidValue.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-950 p-3 md:p-4 lg:p-5">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 md:mb-5">
          <div className="flex items-center gap-3 flex-wrap mb-1.5">
            <h1 className="text-2xl md:text-[26px] font-semibold tracking-tight text-white">
              경매 계산기
            </h1>
            <FavoriteButton title="경매 계산기" />
          </div>
          <p className="text-sm md:text-[13px] text-gray-400">
            레이드 클리어 후 경매 입찰 최적가를 계산하세요.
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
          {/* 왼쪽: 아이템 리스트 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 md:p-5">
            <h2 className="text-lg font-semibold text-white mb-3">아이템 목록</h2>
            
            {/* 검색 */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="아이템명 검색...(유물 각인서, 야금술/재봉술)"
              className="w-full px-3 py-1.5 mb-3 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
            />
            
            {/* 아이템 리스트 */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => {
                  const price = item.CurrentMinPrice ?? item.RecentPrice ?? null;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (price) {
                          setItemPrice(price.toString());
                        }
                      }}
                      className="w-full text-left px-3 py-2 bg-gray-900/50 rounded-md border border-gray-700 hover:bg-gray-800/50 hover:border-gray-600 transition-colors text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate text-[13px]">
                            {item.Name}
                          </div>
                          {item.Grade && (
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {item.Grade}
                            </div>
                          )}
                        </div>
                        {price && (
                          <div className="text-right ml-3">
                            <div className="text-yellow-400 font-semibold text-sm">
                              {formatNumberWithSignificantDigits(price)}
                            </div>
                            <div className="text-[11px] text-gray-500">골드</div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-gray-500">
                  {searchQuery ? '검색 결과 없음' : '아이템이 없습니다'}
                </div>
              )}
            </div>
          </div>
          
          {/* 오른쪽: 계산기 */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 md:p-5">
            <h2 className="text-lg font-semibold text-white mb-3">계산기</h2>
            
            {/* 인원수 선택 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-300 mb-1.5">인원수</label>
              <div className="grid grid-cols-3 gap-2.5">
                {([4, 8, 16] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setPartySize(size)}
                    className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                      partySize === size
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {size}인
                  </button>
                ))}
              </div>
            </div>
            
            {/* 아이템 가격 입력 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-300 mb-1.5">아이템 가격</label>
              <input
                type="text"
                value={itemPrice}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d+$/.test(value)) {
                    setItemPrice(value);
                  }
                }}
                placeholder="직접 입력"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white text-lg text-center font-semibold placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <div className="text-right text-[11px] text-gray-500 mt-0.5">골드</div>
            </div>
            
            {/* 번호 패드 */}
            <div className="mb-4 grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map(num => (
                <button
                  key={num}
                  onClick={() => handleNumberPad(num)}
                  className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                    num === 'C' || num === '←'
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            
            {/* 결과 */}
            {auctionResults && linePositions && (
              <div className="space-y-2.5">
                <div className="border-t border-gray-700 pt-3">
                  <h3 className="text-base font-semibold text-white mb-2.5">입찰 가이드</h3>
                  
                  {/* 텍스트 정보 (세 지점 요약) */}
                  <div className="flex justify-between text-[11px] text-gray-200 mb-2">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-blue-300 font-medium">최소 입찰가</span>
                      <span className="text-sm text-blue-400 font-semibold">
                        {formatNumberWithSignificantDigits(auctionResults.minBid)}
                      </span>
                      <span className="text-[10px] text-gray-500 mt-0.5">(보다 낮으면 상위입찰)</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] text-green-300 font-medium">추천 입찰가</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-green-400 font-semibold">
                          {formatNumberWithSignificantDigits(auctionResults.recommendedBid)}
                        </span>
                        <button
                          onClick={copyRecommendedBid}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                            copied
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                          }`}
                          title="클립보드에 복사"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            {copied ? (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            ) : (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            )}
                          </svg>
                          <span>{copied ? '복사됨' : '복사'}</span>
                        </button>
                      </div>
                      <span className="text-[10px] text-green-400 mt-0.5">
                        {auctionResults.recommendedProfit > 0 ? '+' : ''}
                        {formatNumberWithSignificantDigits(auctionResults.recommendedProfit)}골드 이득
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] text-red-300 font-medium">최대 입찰가</span>
                      <span className="text-sm text-red-400 font-semibold">
                        {formatNumberWithSignificantDigits(auctionResults.maxBid)}
                      </span>
                      <span className="text-[10px] text-gray-500 mt-0.5">(보다 높으면 입찰포기)</span>
                    </div>
                  </div>

                  {/* 최소-추천-최대 입찰가 라인 & 포인트 */}
                  <div className="relative mt-1.5 h-8">
                    {/* 기본 라인 */}
                    <div className="absolute left-1 right-1 top-1/2 h-[2px] bg-gray-600 rounded-full" />
                    
                    {/* 최소 입찰가 포인트 */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${linePositions.minPos}%` }}
                    >
                      <div className="w-3 h-3 rounded-full bg-blue-400 border border-blue-100 shadow-sm" />
                    </div>
                    
                    {/* 추천 입찰가 포인트 */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${linePositions.recPos}%` }}
                    >
                      <div className="w-3 h-3 rounded-full bg-green-400 border border-green-100 shadow-sm" />
                    </div>
                    
                    {/* 최대 입찰가 포인트 */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${linePositions.maxPos}%` }}
                    >
                      <div className="w-3 h-3 rounded-full bg-red-400 border border-red-100 shadow-sm" />
                    </div>
                  </div>

                  {/* 라벨 (최소 / 추천 / 최대) */}
                  <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                    <span>최소</span>
                    <span>추천</span>
                    <span>최대</span>
                  </div>
                </div>
              </div>
            )}
            
            {!auctionResults && (
              <div className="text-center py-6 text-sm text-gray-500">
                아이템 가격을 입력하세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
