'use client';

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import ItemIcon from '../components/ItemIcon';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
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

type ItemStats = {
  Date: string;
  AvgPrice: number;
  TradeCount: number;
};

type ItemDetail = {
  Id?: number;
  Name?: string;
  displayName: string;
  Icon?: string;
  source?: string;
  tier?: string;
  grade?: string;
  YDayAvgPrice?: number;
  RecentPrice?: number;
  CurrentMinPrice?: number;
  Stats?: ItemStats[];
};

function formatPrice(n?: number, allowZero: boolean = true): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '-';
  if (!allowZero && n === 0) return '-';
  return formatNumberWithSignificantDigits(n);
}

function trendColor(recent?: number, yavg?: number): string {
  if (typeof recent !== 'number' || typeof yavg !== 'number') return 'text-gray-300';
  if (recent > yavg) return 'text-green-400';
  if (recent < yavg) return 'text-red-400';
  return 'text-gray-300';
}

function getGradeColor(grade: string): string {
  const colors: { [key: string]: string } = {
    '전설': 'text-orange-400',
    '영웅': 'text-purple-400',
    '희귀': 'text-blue-400',
    '고급': 'text-green-400',
    '일반': 'text-gray-400',
  };
  return colors[grade] || 'text-gray-300';
}

export default function MarketTableServer({ items }: { items: ItemDetail[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-700">
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">아이템명</th>
              <th className="px-6 py-4 text-center text-sm font-semibold text-gray-300">출처</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">최근 거래가</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">전일 평균가</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">현재 최저가</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">자세히</th>
            </tr>
          </thead>
          <tbody>
              {items.map((it, idx) => (
              <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750 transition-colors">
                <td className="px-6 py-4 text-sm text-white font-medium">
                  <div className="flex items-center gap-3">
                    <ItemIcon icon={it.Icon} name={it.displayName || it.Name} size="md" />
                    <div>
                      <div className="font-medium">{it.displayName || it.Name || '-'}</div>
                      {it.grade && (
                        <div className={`text-xs mt-1 ${getGradeColor(it.grade)}`}>
                          {it.grade}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    it.source === '경매장' 
                      ? 'bg-purple-900/30 text-purple-300 border border-purple-600' 
                      : 'bg-blue-900/30 text-blue-300 border border-blue-600'
                  }`}>
                    {it.source || '거래소'}
                  </span>
                </td>
                <td className={`px-6 py-4 text-sm text-right font-semibold ${trendColor(it.RecentPrice, it.YDayAvgPrice)}`}>
                  {formatPrice(it.RecentPrice)}
                </td>
                <td className="px-6 py-4 text-sm text-right text-blue-400">
                  {it.source === '경매장' ? '-' : formatPrice(it.YDayAvgPrice, false)}
                </td>
                <td className="px-6 py-4 text-sm text-right text-green-400 font-semibold">{formatPrice(it.CurrentMinPrice)}</td>
                <td className="px-6 py-4 text-sm text-right">
                  <button
                    className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
                    onClick={() => setOpenIdx(idx)}
                  >
                    자세히 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openIdx !== null && (
        <ItemModal
          item={items[openIdx]}
          onClose={() => setOpenIdx(null)}
        />)
      }
    </div>
  );
}

function ItemModal({ item, onClose }: { item: ItemDetail; onClose: () => void }) {
  const last14 = useMemo(() => (item.Stats || []).slice(0, 14).reverse(), [item.Stats]);
  const labels = last14.map((s) => s.Date?.slice(5, 10) || '');
  const data = useMemo(() => ({
    labels,
    datasets: [
      {
        label: '평균가',
        data: last14.map((s) => s.AvgPrice),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        fill: true,
        tension: 0.3,
      },
    ],
  }), [labels, last14]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{item.displayName || item.Name} — 14일 시세</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-white">닫기</button>
        </div>
        <div className="p-4">
          {last14.length > 0 ? (
            <Line
              data={data}
              options={{
                responsive: true,
                plugins: { legend: { display: true, labels: { color: '#e5e7eb' } } },
                scales: {
                  x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                },
              }}
            />
          ) : (
            <div className="text-gray-400">차트 데이터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}


