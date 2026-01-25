'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

// 일간 그래프에서 화요일과 수요일 사이에 굵은 선을 그리는 플러그인 생성 함수
const createWeeklyDividerPlugin = (period: string, dayOfWeeks: number[] | null) => {
  return {
    id: 'weeklyDivider',
    afterDraw: (chart: any) => {
      if (period !== 'daily' || !dayOfWeeks || dayOfWeeks.length === 0) {
        return;
      }

      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      const meta = chart.getDatasetMeta(0);
      
      if (!meta.data) {
        return;
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);

      // 각 데이터 포인트 사이를 확인하여 화요일과 수요일 사이에 선 그리기
      for (let i = 0; i < dayOfWeeks.length - 1; i++) {
        const currentDay = dayOfWeeks[i];
        const nextDay = dayOfWeeks[i + 1];
        
        if (currentDay === 2 && nextDay === 3) {
          // 화요일 다음이 수요일인 경우
          const currentPoint = meta.data[i];
          const nextPoint = meta.data[i + 1];
          
          if (currentPoint && nextPoint) {
            const x = (currentPoint.x + nextPoint.x) / 2;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }
  };
};

type ExchangeRateEntry = {
  date: string;
  exchange: number; // 화폐거래소 100크리당 골드
  discord: number;  // 디스코드 100:n에서 n 값
};

type ExchangeHistoryEntry = {
  timestamp: string;
  exchange: number;
};

type CrystalGoldData = {
  exchange?: number | null;
  exchangeTimestamp?: string | null;
  updatedAt?: string | null; // 실제 갱신 시간
  discord?: number | null;
  exchangeRates?: ExchangeRateEntry[]; // 하위 호환성
  exchangeHistory?: ExchangeHistoryEntry[]; // 히스토리 데이터
};

export default function CrystalGoldPage() {
  const [data, setData] = useState<CrystalGoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'exchange' | 'discord'>('exchange');
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
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

  const [allowDiscordEdit, setAllowDiscordEdit] = useState(false);

  // 환경 변수 체크: 수정 버튼 표시 여부
  useEffect(() => {
    const checkEditPermission = async () => {
      try {
        const res = await fetch('/api/env/check');
        const data = await res.json();
        // allowPackageSave와 동일한 로직 사용
        setAllowDiscordEdit(data.allowPackageSave || false);
      } catch (error) {
        console.error('환경 설정 확인 실패:', error);
        setAllowDiscordEdit(false);
      }
    };
    checkEditPermission();
  }, []);

  const handleSaveDiscord = async () => {
    const discordNum = parseFloat(discordValue);
    
    if (isNaN(discordNum) || discordNum <= 0) {
      setError('올바른 숫자를 입력해주세요.');
      return;
    }

    try {
      setSavingDiscord(true);
      setError('');
      
      // Supabase에 저장
      const res = await fetch('/api/admin/crystal-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord: discordNum }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // 저장 성공 후 데이터 다시 불러오기
        await loadCrystalGold();
        setIsEditingDiscord(false);
        // 사용자 지정 값 초기화 (서버 값 사용)
        setUserDiscordValue(null);
        try {
          localStorage.removeItem('userDiscordRate');
        } catch (err) {
          // 무시
        }
      } else {
        setError(result.error || '디스코드 환율 저장에 실패했습니다.');
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

  // 수요일 기준 주차 계산 함수
  const getWeekKey = (date: Date): string => {
    // 수요일부터 다음 화요일까지를 한 주로 계산
    // 해당 주의 수요일 날짜를 키로 사용
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay(); // 0: 일요일, 3: 수요일, 6: 토요일
    
    // 가장 최근 수요일(포함) 찾기
    // 수요일~토요일(3~6): 이번 주 수요일 (dayOfWeek - 3 일 전)
    // 일요일~화요일(0~2): 지난 주 수요일 (dayOfWeek + 4 일 전)
    const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
    
    const wednesday = new Date(year, month, day - daysToSubtract);
    const wYear = wednesday.getFullYear();
    const wMonth = String(wednesday.getMonth() + 1).padStart(2, '0');
    const wDay = String(wednesday.getDate()).padStart(2, '0');
    return `${wYear}-${wMonth}-${wDay}`;
  };

  // 월 키 생성 함수
  const getMonthKey = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // 차트 데이터 준비 (히스토리 데이터 사용)
  const chartData = useMemo(() => {
    if (!data?.exchangeHistory || data.exchangeHistory.length === 0 || activeTab !== 'exchange') {
      return null;
    }

    type GroupedData = { [key: string]: number[] };
    const grouped: GroupedData = {};
    
    // 선택된 기간에 따라 데이터 그룹화
    data.exchangeHistory.forEach((entry) => {
      const date = new Date(entry.timestamp);
      let key: string;
      
      if (chartPeriod === 'daily') {
        // 로컬 날짜 기준으로 YYYY-MM-DD 생성
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        key = `${year}-${month}-${day}`;
      } else if (chartPeriod === 'weekly') {
        key = getWeekKey(date); // 수요일 기준
        // 디버깅: 처음 몇 개만 출력
        if (Object.keys(grouped).length < 5) {
          const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
          console.log(`[주간] ${entry.timestamp.split('T')[0]} (${dayNames[date.getDay()]}요일) -> ${key} 주`);
        }
      } else {
        key = getMonthKey(date); // YYYY-MM
      }
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(entry.exchange);
    });

    // 정렬 및 최소/최대값 계산
    const keys = Object.keys(grouped).sort();
    const minMaxData = keys.map(key => {
      const values = grouped[key];
      const min = Math.min(...values);
      const max = Math.max(...values);
      return { key, min, max };
    });

    // 일간 그래프의 경우: 데이터가 없는 날짜도 포함하여 연속적인 날짜 생성
    let finalMinMaxData = minMaxData;
    let allDates: string[] = [];
    
    if (chartPeriod === 'daily' && minMaxData.length > 0) {
      // 최신 날짜와 가장 오래된 날짜 찾기
      const sortedKeys = keys.sort();
      const oldestDate = new Date(sortedKeys[0]);
      const newestDate = new Date(sortedKeys[sortedKeys.length - 1]);
      
      // 모든 날짜 생성 (가장 오래된 날짜부터 최신 날짜까지)
      const dateMap = new Map<string, { min: number; max: number }>();
      minMaxData.forEach(item => {
        dateMap.set(item.key, { min: item.min, max: item.max });
      });
      
      const currentDate = new Date(oldestDate);
      while (currentDate <= newestDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        allDates.push(dateKey);
        
        // 데이터가 없는 날짜는 null로 표시
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { min: NaN, max: NaN });
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // 날짜 순서대로 정렬하여 최종 데이터 생성
      finalMinMaxData = allDates.map(key => {
        const data = dateMap.get(key);
        return {
          key,
          min: data?.min ?? NaN,
          max: data?.max ?? NaN,
        };
      });
    }

    // 표시할 라벨 생성 및 요일 정보 저장 (일간 그래프용)
    const labels = finalMinMaxData.map(item => {
      if (chartPeriod === 'daily') {
        const date = new Date(item.key);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      } else if (chartPeriod === 'weekly') {
        const date = new Date(item.key);
        return `${date.getMonth() + 1}/${date.getDate()} 주`;
      } else {
        const [year, month] = item.key.split('-');
        return `${year}년 ${parseInt(month)}월`;
      }
    });

    // 전체 최소/최대값 계산 (y축 범위용) - 데이터가 있는 날짜만 계산
    const validData = finalMinMaxData.filter(d => !isNaN(d.min) && !isNaN(d.max));
    const allMins = validData.map(d => d.min);
    const allMaxs = validData.map(d => d.max);
    const globalMin = allMins.length > 0 ? Math.min(...allMins) : 0;
    const globalMax = allMaxs.length > 0 ? Math.max(...allMaxs) : 100;

    // 일간 그래프용: 각 날짜의 요일 정보 저장 (화요일 다음이 수요일인지 확인용)
    const dayOfWeeks = chartPeriod === 'daily' 
      ? finalMinMaxData.map(item => {
          const date = new Date(item.key);
          return date.getDay(); // 0: 일, 1: 월, 2: 화, 3: 수, ...
        })
      : null;

    // 바 차트용 데이터 (floating bar: [min, max])
    // 데이터가 없는 날짜는 투명하게 표시하기 위해 매우 작은 값으로 설정
    const barData = finalMinMaxData.map(item => {
      if (isNaN(item.min) || isNaN(item.max)) {
        // 데이터가 없는 날짜: y축 최소값으로 설정하여 보이지 않게
        return [globalMin, globalMin];
      }
      return [item.min, item.max];
    });

    return {
      labels,
      datasets: [
        {
          label: '환율 범위 (최소-최대)',
          data: barData,
          backgroundColor: finalMinMaxData.map((item, index) => {
            // 데이터가 없는 날짜는 투명하게
            if (isNaN(item.min) || isNaN(item.max)) {
              return 'transparent';
            }
            return 'rgba(59, 130, 246, 0.5)'; // blue-500 with opacity
          }),
          borderColor: finalMinMaxData.map((item) => {
            // 데이터가 없는 날짜는 투명하게
            if (isNaN(item.min) || isNaN(item.max)) {
              return 'transparent';
            }
            return 'rgba(59, 130, 246, 1)';
          }),
          borderWidth: 1,
        },
      ],
      yAxisRange: {
        min: globalMin * 0.8, // 최소값 -20%
        max: globalMax * 1.2, // 최대값 +20%
      },
      dayOfWeeks, // 일간 그래프용 요일 정보
    };
  }, [data, activeTab, chartPeriod]);

  // 테마 고정: 항상 다크 테마 유지
  const titleText = 'text-white';
  const descText = 'text-gray-400';
  const labelText = 'text-gray-400';
  const cardBg = 'bg-gray-800 text-gray-300 border-gray-700';

  // 1원당 x골드 계산: x = (100크리당 골드) / 2750
  const perWonGold = typeof displayExchange === 'number' ? (displayExchange / 2750) : undefined;
  // 100원당 골드 계산
  const per100WonGoldExchange = typeof displayExchange === 'number' ? (displayExchange * 100 / 2750) : undefined;
  const per100WonGoldDiscord = typeof displayDiscord === 'number' ? (100 * 100 / displayDiscord) : undefined;

  return (
    <div className="min-h-screen bg-gray-950 sm:p-6 lg:p-8">
      <div>
        <div className="mb-4 sm:mb-6 md:mb-10 px-4 sm:px-0">
          <h1 className={`text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight ${titleText} mb-1 sm:mb-2`}>골드 환율</h1>
          <p className={`text-[10px] sm:text-xs md:text-sm ${descText} whitespace-normal break-words`}>골드 환율 정보를 확인하세요.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-4 sm:p-6 md:p-12 text-center border-x-0 sm:border-x border-gray-700">
            <div className="text-[10px] sm:text-xs md:text-sm text-gray-400">로딩 중...</div>
          </div>
        ) : displayExchange ? (
          <div className="space-y-3 sm:space-y-4 md:space-y-6 px-4 sm:px-0">
            {/* 서브탭 선택 */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('exchange')}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  activeTab === 'exchange'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                화폐거래소
              </button>
              {!lightMode && (
                <button
                  onClick={() => setActiveTab('discord')}
                  className={`px-6 py-3 rounded-lg font-semibold ${
                    activeTab === 'discord'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  디스코드
                </button>
              )}
            </div>

            {/* 현재 환율 표시 */}
            <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
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
                  {typeof per100WonGoldExchange === 'number' && (
                    <div className={`text-sm ${labelText} mt-1`}>
                      100원당 {formatPrice(per100WonGoldExchange)} 골드
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
                          className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                          {savingDiscord ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={handleCancelDiscord}
                          disabled={savingDiscord}
                          className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            {allowDiscordEdit && (
                              <button
                                onClick={() => setIsEditingDiscord(true)}
                                className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                              >
                                수정
                              </button>
                            )}
                            {userDiscordValue != null && (
                              <button
                                onClick={handleResetDiscord}
                                className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
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
                          {typeof displayDiscord === 'number' && displayDiscord > 0 && (
                            <>
                              <div className={`text-sm ${labelText} mt-1`}>
                                1원당 {formatPrice(100 / displayDiscord)} 골드
                              </div>
                              <div className={`text-sm ${labelText} mt-1`}>
                                100원당 {formatPrice(100 * 100 / displayDiscord)} 골드
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className={descText}>디스코드 환율 정보가 없습니다.</div>
                          {allowDiscordEdit && (
                            <button
                              onClick={() => setIsEditingDiscord(true)}
                              className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700"
                            >
                              환율 입력
                            </button>
                          )}
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
            {chartData && activeTab === 'exchange' && (
              <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-white">
                    화폐거래소 환율 추이 (100크리당 골드)
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChartPeriod('daily')}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                        chartPeriod === 'daily'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      일간
                    </button>
                    <button
                      onClick={() => setChartPeriod('weekly')}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                        chartPeriod === 'weekly'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      주간
                    </button>
                    <button
                      onClick={() => setChartPeriod('monthly')}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                        chartPeriod === 'monthly'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      월간
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  * 각 막대는 해당 {chartPeriod === 'daily' ? '날짜' : chartPeriod === 'weekly' ? '주' : '월'}의 최소값과 최대값을 나타냅니다
                  {chartPeriod === 'weekly' && ' (매주 수요일 기준)'}
                </div>
                <div style={{ height: '300px', position: 'relative' }}>
                  <Bar
                    data={chartData}
                    plugins={[createWeeklyDividerPlugin(chartPeriod, chartData.dayOfWeeks)]}
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
                          callbacks: {
                            label: function(context) {
                              const value = context.raw as [number, number];
                              if (Array.isArray(value)) {
                                return [
                                  `최소: ${formatNumberWithSignificantDigits(value[0])} 골드`,
                                  `최대: ${formatNumberWithSignificantDigits(value[1])} 골드`,
                                  `범위: ${formatNumberWithSignificantDigits(value[1] - value[0])} 골드`,
                                ];
                              }
                              return '';
                            }
                          }
                        }
                      },
                      scales: {
                        x: {
                          ticks: { 
                            color: '#9ca3af',
                            maxRotation: 45,
                            minRotation: 45,
                          },
                          grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        y: {
                          min: chartData.yAxisRange.min,
                          max: chartData.yAxisRange.max,
                          ticks: { 
                            color: '#9ca3af',
                            callback: function(value) {
                              return formatNumberWithSignificantDigits(value as number);
                            }
                          },
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
          <div className={`${cardBg} rounded-none sm:rounded-lg p-4 sm:p-6 md:p-12 text-center border-x-0 sm:border-x px-4 sm:px-0`}>
            <div className={`text-[10px] sm:text-xs md:text-sm ${descText} mb-3 sm:mb-4 whitespace-normal break-words`}>골드 환율 정보가 없습니다.</div>
            <div className={`text-[10px] sm:text-xs md:text-sm ${labelText} whitespace-normal break-words`}>
              관리자 페이지에서 환율을 입력해주세요.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
