'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import { usePriceOverride } from '../contexts/PriceOverrideContext';
import { useValueDb } from '../contexts/ValueDbContext';

const INITIAL_OVERRIDES = {
  ignoreSilver: false,
  ignoreDestructionGuardStone: false,
  ignoreBreakthroughStone: false,
  ignoreFragment: false,
  cardSetGraduated: false,
  ignoreCardExp: false,
  has97Stone: false,
  hasFullRelicEngraving: false,
  ignoreFusionMaterial: false,
  ignoreBreath: false,
  ignoreLowTierCrafting: false,
  ignoreGem: false,
  ignoreHeavenChallengeTicket: false,
};

const BUTTONS: { key: keyof typeof INITIAL_OVERRIDES; label: string }[] = [
  { key: 'ignoreSilver', label: '실링' },
  { key: 'ignoreDestructionGuardStone', label: '파괴석/수호석' },
  { key: 'ignoreBreakthroughStone', label: '돌파석' },
  { key: 'ignoreFragment', label: '파편' },
  { key: 'cardSetGraduated', label: '전설 카드' },
  { key: 'ignoreCardExp', label: '카드경험치' },
  { key: 'has97Stone', label: '어빌리티 스톤' },
  { key: 'hasFullRelicEngraving', label: '유물 각인서' },
  { key: 'ignoreFusionMaterial', label: '융화 재료' },
  { key: 'ignoreBreath', label: '숨결' },
  { key: 'ignoreLowTierCrafting', label: '하위 야금/재봉' },
  { key: 'ignoreGem', label: '젬' },
  { key: 'ignoreHeavenChallengeTicket', label: '천상 도전권' },
];

export default function PriceAdjustmentBar() {
  const { state, setState } = usePriceOverride();
  const { adjustedEntries } = useValueDb();
  const [localOverrides, setLocalOverrides] = useState(state);
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [discordRate, setDiscordRate] = useState<number | null>(null);
  const [barExpanded, setBarExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('priceAdjustBarExpanded');
      return saved === null ? true : saved === '1';
    } catch { return true; }
  });

  useEffect(() => {
    setLocalOverrides(state);
  }, [state]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('themeLight');
      if (saved != null) setLightMode(saved === '1');
    } catch {}
    const handleThemeChange = (e: CustomEvent<{ light: boolean }>) => setLightMode(e.detail.light);
    window.addEventListener('theme-change', handleThemeChange as EventListener);
    return () => window.removeEventListener('theme-change', handleThemeChange as EventListener);
  }, []);

  useEffect(() => {
    fetch('/api/admin/crystal-gold')
      .then((res) => res.json())
      .then((data) => { if (data.discord != null) setDiscordRate(data.discord); })
      .catch(() => {});
  }, []);

  const goldPerWon = useMemo(() => {
    if (!lightMode && discordRate && discordRate > 0) return 100 / discordRate;
    const crystalEntry = adjustedEntries.find((e) => e.itemName === '크리스탈');
    if (crystalEntry?.unitValue != null && crystalEntry.unitValue > 0) {
      return (100 / 2750) * crystalEntry.unitValue;
    }
    return null;
  }, [adjustedEntries, lightMode, discordRate]);

  const handleReset = () => {
    setLocalOverrides(INITIAL_OVERRIDES);
    setState(INITIAL_OVERRIDES);
  };

  const handleToggle = (key: keyof typeof INITIAL_OVERRIDES) => {
    setLocalOverrides((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setTimeout(() => setState(next), 0);
      return next;
    });
  };

  return (
    <div className="sticky top-14 md:top-16 z-30 bg-gray-900 border-b border-gray-800 px-3 py-2">
      <div className="max-w-[1800px] mx-auto flex flex-col items-center gap-2">
        {/* 1행: 가격 조정 토글 + 골드 환율 + 디코기준 */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setBarExpanded((x) => {
                const next = !x;
                try { localStorage.setItem('priceAdjustBarExpanded', next ? '1' : '0'); } catch {}
                return next;
              });
            }}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 flex-shrink-0"
          >
            가격 조정 {barExpanded ? '▲' : '▼'}
          </button>
          <Link
            href="/crystal-gold"
            className="inline-flex items-center px-2 py-1 rounded border border-blue-500/60 text-[11px] text-blue-300 hover:bg-blue-900/40 hover:text-blue-100 transition-colors"
            title="골드 환율 페이지로 이동"
          >
            <span className="mr-1">📈</span>
            <span>골드 환율</span>
          </Link>
          <span className="text-xs font-semibold text-gray-300">
            {goldPerWon != null ? `1원당 ${formatNumberWithSignificantDigits(goldPerWon)}골드` : '...'}
          </span>
          <span className={`text-[11px] ${lightMode ? 'font-bold text-blue-400' : 'text-gray-500'}`}>화폐거래소</span>
          <button
            type="button"
            onClick={() => {
              const next = !lightMode;
              setLightMode(next);
              try {
                localStorage.setItem('themeLight', next ? '1' : '0');
                window.dispatchEvent(new CustomEvent('theme-change', { detail: { light: next } }));
                document.documentElement.classList.toggle('light', next);
                document.documentElement.classList.toggle('dark', !next);
              } catch {}
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border flex-shrink-0 ${
              !lightMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-700 border-gray-600'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${!lightMode ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
          <span className={`text-[11px] ${!lightMode ? 'font-bold text-purple-400' : 'text-gray-500'}`}>디코기준</span>
        </div>

        {/* 2행: 가격 조정 버튼들 (펼쳤을 때만 표시) */}
        {barExpanded && (
        <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
            <span className="text-[11px] text-gray-500 flex-shrink-0">가격 조정:</span>
            {BUTTONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleToggle(key)}
                className={`text-[11px] px-2 py-1 rounded border whitespace-nowrap ${
                  !localOverrides[key]
                    ? 'bg-blue-700/50 border-blue-500/70 text-blue-50'
                    : 'bg-gray-800 border-gray-600 text-gray-300 line-through'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] px-2 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700"
            >
              초기화
            </button>
        </div>
        )}
      </div>
    </div>
  );
}
