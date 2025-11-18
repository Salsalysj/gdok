'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type ExchangeRateEntry = {
  date: string;
  exchange: number; // 화폐거래소 100크리당 골드
  discord: number;  // 디스코드 100:n에서 n 값
};

type CrystalGoldData = {
  exchange?: number | null;
  exchangeTimestamp?: string | null;
  updatedAt?: string | null; // 실제 갱신 시간
  discord?: number | null;
  exchangeRates?: ExchangeRateEntry[]; // 하위 호환성
};

export default function CrystalGoldPage() {
  const [data, setData] = useState<CrystalGoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'exchange' | 'discord'>('exchange');
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordValue, setDiscordValue] = useState<string>('');
  const [isEditingDiscord, setIsEditingDiscord] = useState(false);
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [userDiscordValue, setUserDiscordValue] = useState<number | null>(null);

  useEffect(() => {
    loadCrystalGold();
    // 로컬 스토리지에서 사용자가 수정한 디스코드 값 불러오기
    try {
      const saved = localStorage.getItem('userDiscordRate');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) {
          setUserDiscordValue(parsed);
        }
      }
    } catch (err) {
      // 로컬 스토리지 접근 실패 시 무시
    }
  }, []);

  // 디스코드 값이 로드되면 입력 필드에 설정 (편집 모드가 아닐 때만)
  useEffect(() => {
    if (!isEditingDiscord) {
      // 사용자가 수정한 값이 있으면 그것을, 없으면 서버에서 가져온 기본값 사용
      const valueToShow = userDiscordValue ?? data?.discord ?? null;
      if (valueToShow != null) {
        setDiscordValue(String(Math.round(valueToShow)));
      }
    }
  }, [data?.discord, userDiscordValue, isEditingDiscord]);

  // 네비게이션 스위치(전역)와 동기화
  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) setLightMode(saved === '1');
    } catch {}

    const handler = (e: any) => {
      setLightMode(!!e?.detail?.light);
      // 밝은 모드에서는 디스코드 탭 숨김 → 탭 강제 전환
      if (e?.detail?.light) setActiveTab('exchange');
    };
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  const loadCrystalGold = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/admin/crystal-gold');
      const json = await res.json();

      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || '크리스탈 골드 시세를 가져올 수 없습니다.');
      }
    } catch (err) {
      setError('시세를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number | undefined | null) => {
    if (typeof price !== 'number' || isNaN(price)) return '-';
    return formatNumberWithSignificantDigits(price);
  };

  const handleSaveDiscord = async () => {
    const discordNum = parseFloat(discordValue);
    
    if (isNaN(discordNum) || discordNum <= 0) {
      setError('올바른 숫자를 입력해주세요.');
      return;
    }

    try {
      setSavingDiscord(true);
      setError('');
      
      // 로컬 스토리지에 저장 (서버에는 저장하지 않음)
      try {
        localStorage.setItem('userDiscordRate', String(discordNum));
        setUserDiscordValue(discordNum);
        setIsEditingDiscord(false);
      } catch (err) {
        setError('로컬 스토리지 저장에 실패했습니다.');
      }
    } catch (err) {
      setError('디스코드 환율 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingDiscord(false);
    }
  };

  const handleCancelDiscord = () => {
    // 사용자가 수정한 값이 있으면 그것을, 없으면 서버에서 가져온 기본값 사용
    const valueToShow = userDiscordValue ?? data?.discord ?? null;
    if (valueToShow != null) {
      setDiscordValue(String(Math.round(valueToShow)));
    }
    setIsEditingDiscord(false);
    setError('');
  };

  const handleResetDiscord = () => {
    // 로컬 스토리지에서 삭제하고 서버 기본값으로 복원
    try {
      localStorage.removeItem('userDiscordRate');
      setUserDiscordValue(null);
      if (data?.discord != null) {
        setDiscordValue(String(Math.round(data.discord)));
      }
      setIsEditingDiscord(false);
      setError('');
    } catch (err) {
      setError('초기화 중 오류가 발생했습니다.');
    }
  };

  const displayExchange = data?.exchange ?? null;
  const displayTimestamp = data?.exchangeTimestamp ?? null; // API에서 제공한 시간 사용
  // 사용자가 수정한 값이 있으면 그것을, 없으면 서버에서 가져온 기본값 사용
  const displayDiscord = userDiscordValue ?? data?.discord ?? null;

  // 차트 데이터 준비 (캐시 데이터 사용)
  const chartData = useMemo(() => {
    // 차트는 현재 지원하지 않음 (시간별 캐시 데이터 구조가 다름)
    // 필요시 별도 API 엔드포인트로 캐시 데이터를 시간별로 가져와야 함
    return null;
  }, [data, activeTab]);

  // 테마 고정: 항상 다크 테마 유지
  const titleText = 'text-white';
  const descText = 'text-gray-400';
  const labelText = 'text-gray-400';
  const cardBg = 'bg-gray-800 text-gray-300 border-gray-700';

  // 1원당 x골드 계산: x = (100크리당 골드) / 2750
  const perWonGold = typeof displayExchange === 'number' ? (displayExchange / 2750) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className={`text-4xl font-bold ${titleText} mb-2`}>골드 환율</h1>
          <p className={descText}>골드 환율 정보를 확인하세요.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
            <div className="text-gray-400">로딩 중...</div>
          </div>
        ) : displayExchange ? (
          <div className="space-y-6">
            {/* 서브탭 선택 */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('exchange')}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  activeTab === 'exchange'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                화폐거래소
              </button>
              {!lightMode && (
                <button
                  onClick={() => setActiveTab('discord')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === 'discord'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  디스코드
                </button>
              )}
            </div>

            {/* 현재 환율 표시 */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              {activeTab === 'exchange' ? (
                <div>
                  <div className={`text-sm ${labelText} mb-2`}>화폐거래소</div>
                  <div className="text-4xl font-bold text-blue-500 mb-2">
                    {formatPrice(displayExchange)} 골드
                  </div>
                  <div className={descText}>100크리당 골드 가격</div>
                  <div className={`text-sm ${labelText} mt-2`}>
                    크리스탈 1개당 {formatPrice(displayExchange != null ? displayExchange / 100 : null)} 골드
                  </div>
                  {typeof perWonGold === 'number' && (
                    <div className={`text-sm ${labelText} mt-1`}>
                      1원당 {formatPrice(perWonGold)} 골드
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className={`text-sm ${labelText} mb-2`}>디스코드</div>
                  {isEditingDiscord ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          100:n에서 n 값
                        </label>
                        <input
                          type="number"
                          value={discordValue}
                          onChange={(e) => setDiscordValue(e.target.value)}
                          placeholder="예: 5000"
                          step="1"
                          min="0"
                          className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveDiscord}
                          disabled={savingDiscord}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all"
                        >
                          {savingDiscord ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={handleCancelDiscord}
                          disabled={savingDiscord}
                          className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {displayDiscord ? (
                        <>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="text-4xl font-bold text-purple-500">
                              100 : {Math.round(displayDiscord).toLocaleString('ko-KR')}
                            </div>
                            <button
                              onClick={() => setIsEditingDiscord(true)}
                              className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                            >
                              수정
                            </button>
                            {userDiscordValue != null && (
                              <button
                                onClick={handleResetDiscord}
                                className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                                title="기본값으로 복원"
                              >
                                초기화
                              </button>
                            )}
                          </div>
                          {userDiscordValue != null && (
                            <div className="text-xs text-purple-400 mb-2">
                              * 사용자 지정 값 (기본값: {data?.discord ? Math.round(data.discord).toLocaleString('ko-KR') : '-'})
                            </div>
                          )}
                          <div className={descText}>골드 : 현금 비율</div>
                          {typeof perWonGold === 'number' && (
                            <div className={`text-sm ${labelText} mt-1`}>
                              1원당 {formatPrice(perWonGold)} 골드
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className={descText}>디스코드 환율 정보가 없습니다.</div>
                          <button
                            onClick={() => setIsEditingDiscord(true)}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all"
                          >
                            환율 입력
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-4">
                마지막 업데이트: {displayTimestamp ? new Date(displayTimestamp).toLocaleString('ko-KR') : '정보 없음'}
              </div>
            </div>

            {/* 차트 */}
            {chartData && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold text-white mb-4">
                  최근 30일 추이
                </h2>
                <div style={{ height: '300px', position: 'relative' }}>
                  <Line
                    data={chartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: true,
                          labels: { color: '#e5e7eb' }
                        },
                        tooltip: {
                          backgroundColor: 'rgba(0, 0, 0, 0.8)',
                          titleColor: '#fff',
                          bodyColor: '#fff',
                        }
                      },
                    scales: {
                      x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                      },
                      y: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                      },
                    },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`${cardBg} rounded-lg p-12 text-center border`}>
            <div className={`${descText} mb-4`}>골드 환율 정보가 없습니다.</div>
            <div className={`text-sm ${labelText}`}>
              관리자 페이지에서 환율을 입력해주세요.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
