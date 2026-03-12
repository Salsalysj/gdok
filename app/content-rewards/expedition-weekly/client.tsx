'use client';

import { useState, useEffect } from 'react';
import FavoriteButton from '../../components/FavoriteButton';
import GoldUnit from '../../components/GoldUnit';
import type { ContentEntry, ExpeditionWeeklyData, RewardDetail } from './page';

const ARMORY_DELAY_MS = 350;
const MIN_ITEM_LEVEL = 1640;
const TOP_N = 6;
const STORAGE_KEY = 'gcalc-expedition-weekly-search';

type RosterChar = {
  CharacterName: string;
  ItemAvgLevel?: string;
  ItemLevel?: string;
  _parsedLevel?: number;
};

type CharacterResult = {
  name: string;
  itemLevel: number;
  frontRift: { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number } | null;
  cubeHourglass: { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number } | null;
  guardian: { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number } | null;
  raids: { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number }[];
  totalWeeklyTradable: number;
  totalWeeklyTotal: number;
};

function parseItemLevel(v: unknown): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** 입장 가능 단계 중 가장 높은 것 1개만 반환 (주간 보상 포함) */
function getHighestAccessible(ilvl: number, entries: ContentEntry[]): { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number } | null {
  const accessible = entries.filter((e) => e.minLevel <= ilvl);
  if (accessible.length === 0) return null;
  const highest = accessible.sort((a, b) => b.minLevel - a.minLevel)[0];
  return {
    name: highest.name,
    weeklyTradable: highest.tradableValue * highest.weeklyCount,
    weeklyTotal: highest.totalValue * highest.weeklyCount,
    details: highest.rewardDetails || [],
    weeklyCount: highest.weeklyCount,
  };
}

/** 레이드명(마지막 공백 앞) 기준으로 동일 레이드는 최고 난이도 1개만 유지 후, 상위 3종 반환 */
function getAccessibleRaidsTop3(ilvl: number, entries: ContentEntry[], limit = 3): { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number }[] {
  const accessible = entries.filter((e) => e.minLevel <= ilvl);
  const byRaidName = new Map<string, ContentEntry>();
  const clearGold = (e: ContentEntry) =>
    (e.rewardDetails || []).find((d) => d.itemName === '골드')?.totalPrice ?? 0;

  for (const e of accessible) {
    const lastSpace = e.name.lastIndexOf(' ');
    const raidKey = lastSpace > 0 ? e.name.slice(0, lastSpace) : e.name;
    const existing = byRaidName.get(raidKey);
    if (!existing || e.minLevel > existing.minLevel || (e.minLevel === existing.minLevel && clearGold(e) > clearGold(existing))) {
      byRaidName.set(raidKey, e);
    }
  }

  return Array.from(byRaidName.values())
    .sort((a, b) => {
      if (b.minLevel !== a.minLevel) return b.minLevel - a.minLevel;
      return clearGold(b) - clearGold(a);
    })
    .slice(0, limit)
    .map((e) => ({
      name: e.name,
      weeklyTradable: e.tradableValue * e.weeklyCount,
      weeklyTotal: e.totalValue * e.weeklyCount,
      details: e.rewardDetails || [],
      weeklyCount: e.weeklyCount,
    }));
}

export default function ExpeditionWeeklyClient({ entryData }: { entryData: ExpeditionWeeklyData }) {
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<CharacterResult[] | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  /** 모바일: 주간합계 '상세' 버튼으로 연 툴팁 행 인덱스 (null이면 미표시) */
  const [mobileDetailRow, setMobileDetailRow] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved != null && typeof saved === 'string') setSearchName(saved);
    } catch (_) {}
  }, []);

  const handleSearch = async () => {
    const name = searchName.trim();
    if (!name) {
      setError('캐릭터명을 입력해주세요.');
      return;
    }
    setError('');
    setResults(null);
    setLoading(true);
    try {
      const rosterRes = await fetch(`/api/character/roster?characterName=${encodeURIComponent(name)}`);
      const rosterData = await rosterRes.json();
      if (!rosterRes.ok) {
        setError(rosterData?.error || '원정대를 찾을 수 없습니다.');
        return;
      }
      if (!Array.isArray(rosterData)) {
        setError('원정대 목록을 불러올 수 없습니다.');
        return;
      }
      const parsed: RosterChar[] = rosterData.map((c: Record<string, unknown>) => {
        const levelStr = String(c.ItemAvgLevel ?? c.ItemLevel ?? c.ItemMaxLevel ?? '0').replace(/,/g, '');
        const level = parseFloat(levelStr) || 0;
        return {
          CharacterName: String(c.CharacterName ?? c.characterName ?? ''),
          ItemAvgLevel: c.ItemAvgLevel as string | undefined,
          ItemLevel: c.ItemLevel as string | undefined,
          _parsedLevel: level,
        };
      });
      const overMin = parsed.filter((c) => c._parsedLevel != null && c._parsedLevel >= MIN_ITEM_LEVEL);
      const namesToFetch = new Set<string>(overMin.map((c) => c.CharacterName).filter(Boolean));
      const armoryLevels: Record<string, number> = {};
      const nameList = Array.from(namesToFetch);
      for (let i = 0; i < nameList.length; i++) {
        const charName = nameList[i];
        try {
          const armoryRes = await fetch('/api/character/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterName: charName }),
          });
          const armoryData = await armoryRes.json();
          if (armoryRes.ok && armoryData) {
            const profile = armoryData.ArmoryProfile || {};
            const ilvl = profile.ItemAvgLevel ?? profile.ItemLevel ?? armoryData.ItemAvgLevel ?? armoryData.ItemLevel;
            armoryLevels[charName] = parseItemLevel(ilvl);
          } else {
            const idx = parsed.findIndex((r) => r.CharacterName === charName);
            if (idx >= 0) armoryLevels[charName] = parsed[idx]._parsedLevel ?? 0;
          }
        } catch {
          const idx = parsed.findIndex((r) => r.CharacterName === charName);
          if (idx >= 0) armoryLevels[charName] = parsed[idx]._parsedLevel ?? 0;
        }
        if (i < nameList.length - 1) await new Promise((r) => setTimeout(r, ARMORY_DELAY_MS));
      }
      const withLevel = overMin
        .map((c) => ({
          name: c.CharacterName,
          itemLevel: armoryLevels[c.CharacterName] ?? c._parsedLevel ?? 0,
        }))
        .filter((x) => x.itemLevel >= MIN_ITEM_LEVEL)
        .sort((a, b) => b.itemLevel - a.itemLevel)
        .slice(0, TOP_N);
      const characterResults: CharacterResult[] = withLevel.map(({ name, itemLevel }) => {
        const fr = getHighestAccessible(itemLevel, entryData.frontRift);
        const ch = getHighestAccessible(itemLevel, entryData.cubeHourglass);
        const gd = getHighestAccessible(itemLevel, entryData.guardian);
        const rd = getAccessibleRaidsTop3(itemLevel, entryData.raids);
        const totalWeeklyTradable = (fr?.weeklyTradable ?? 0) + (ch?.weeklyTradable ?? 0) + (gd?.weeklyTradable ?? 0) + rd.reduce((s, r) => s + r.weeklyTradable, 0);
        const totalWeeklyTotal = (fr?.weeklyTotal ?? 0) + (ch?.weeklyTotal ?? 0) + (gd?.weeklyTotal ?? 0) + rd.reduce((s, r) => s + r.weeklyTotal, 0);
        return {
          name,
          itemLevel,
          frontRift: fr,
          cubeHourglass: ch,
          guardian: gd,
          raids: rd,
          totalWeeklyTradable,
          totalWeeklyTotal,
        };
      });
      setResults(characterResults);
      try {
        localStorage.setItem(STORAGE_KEY, name);
      } catch (_) {}
      if (characterResults.length === 0) {
        setError(`아이템 레벨 ${MIN_ITEM_LEVEL} 이상인 캐릭터가 없습니다.`);
      }
    } catch (err) {
      console.error(err);
      setError('원정대 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeTooltip) setActiveTooltip(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeTooltip]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="hidden md:block text-2xl font-bold text-white">원정대 주간 수익</h1>
            <div className="hidden md:block">
              <FavoriteButton title="원정대 주간 수익" />
            </div>
          </div>
          <p className="hidden md:block text-sm text-gray-400">
            캐릭터명으로 원정대를 검색하면, 아이템 레벨 상위 6캐릭터와 입장 가능한 콘텐츠를 볼 수 있습니다. (1640 미만 제외)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="캐릭터명 입력"
            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
          >
            {loading ? '검색 중…' : '검색'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-200 text-sm">
            {error}
          </div>
        )}

        {results && results.length > 0 && (() => {
          const sumTradable = results.reduce((s, c) => s + c.totalWeeklyTradable, 0);
          const sumTotal = results.reduce((s, c) => s + c.totalWeeklyTotal, 0);
          let sumSilver = 0;
          for (const c of results) {
            const addSilver = (details: { itemName: string; quantity: number }[], mult: number) => {
              for (const d of details) if (d.itemName === '실링') sumSilver += d.quantity * mult;
            };
            if (c.frontRift) addSilver(c.frontRift.details, c.frontRift.weeklyCount);
            if (c.cubeHourglass) addSilver(c.cubeHourglass.details, c.cubeHourglass.weeklyCount);
            if (c.guardian) addSilver(c.guardian.details, c.guardian.weeklyCount);
            for (const r of c.raids) addSilver(r.details, r.weeklyCount);
          }
          return (
            <>
              {/* 모바일 전용: 주간합계 '상세' 툴팁 오버레이 */}
              {mobileDetailRow != null && results[mobileDetailRow] && (
                <div className="fixed inset-0 z-50 md:hidden touch-none" aria-modal="true" role="dialog" aria-label="상세 보기">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/50 focus:outline-none"
                    onClick={() => setMobileDetailRow(null)}
                    onTouchEnd={(e) => { e.preventDefault(); setMobileDetailRow(null); }}
                    aria-label="닫기"
                  />
                  <div className="absolute bottom-0 left-0 right-0 rounded-t-xl bg-gray-800 border border-gray-700 border-b-0 shadow-2xl p-4 max-h-[70vh] overflow-y-auto touch-auto" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-sm font-semibold text-white mb-3">{results[mobileDetailRow].name} – 상세</h4>
                    <div className="space-y-4 text-xs">
                      <div>
                        <div className="text-gray-400 font-semibold mb-2">핵심 컨텐츠</div>
                        <div className="space-y-2">
                          {[
                            { label: '전선&균열', data: results[mobileDetailRow].frontRift },
                            { label: '큐브&모래시계', data: results[mobileDetailRow].cubeHourglass },
                            { label: '가디언 토벌', data: results[mobileDetailRow].guardian },
                          ].map(({ label, data }) => (
                            <div key={label} className="text-gray-200">
                              <span className="text-gray-500">{label}: </span>
                              {data ? (
                                <>
                                  <span>{data.name}</span>
                                  <span className="text-gray-400 ml-1">
                                    <span className="text-yellow-400">{Math.round(data.weeklyTradable).toLocaleString()}</span>
                                    {' / '}
                                    {Math.round(data.weeklyTotal).toLocaleString()}<GoldUnit />
                                  </span>
                                </>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 font-semibold mb-2">레이드 (상위 3종)</div>
                        <div className="space-y-2">
                          {results[mobileDetailRow].raids.length > 0 ? (
                            results[mobileDetailRow].raids.map((raid) => (
                              <div key={raid.name} className="text-gray-200">
                                <span>{raid.name}</span>
                                <span className="text-gray-400 ml-1">
                                  <span className="text-yellow-400">{Math.round(raid.weeklyTradable).toLocaleString()}</span>
                                  {' / '}
                                  {Math.round(raid.weeklyTotal).toLocaleString()}<GoldUnit />
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg"
                      onClick={() => setMobileDetailRow(null)}
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">6캐릭 핵심 컨텐츠 주간 수익 합계</h2>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-gray-400">거래가능</span>
                    <span className="ml-2 font-semibold text-yellow-400">{Math.round(sumTradable).toLocaleString()}<GoldUnit /></span>
                  </div>
                  <div>
                    <span className="text-gray-400">실링</span>
                    <span className="ml-2 font-semibold text-gray-200">{Math.round(sumSilver).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">전체(귀속포함)</span>
                    <span className="ml-2 font-semibold text-gray-300">{Math.round(sumTotal).toLocaleString()}<GoldUnit /></span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-hidden md:overflow-x-auto bg-gray-900/70 rounded-lg border border-gray-700">
            {/* 모바일 전용: 2열 테이블 (캐릭터명, 주간합계+상세) */}
            <table className="w-full text-xs table-fixed md:hidden">
              <colgroup>
                <col className="w-[45%]" />
                <col className="w-[55%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/50">
                  <th className="px-2 py-2 text-left font-semibold text-gray-300 whitespace-nowrap text-[11px]">캐릭터명</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-300 whitespace-nowrap text-[11px]">
                    <div>주간 합계</div>
                    <div className="text-[10px] font-normal text-gray-400">(<span className="text-yellow-400">거래가능</span> / 전체)</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((char, idx) => (
                  <tr key={char.name} className={`border-b border-gray-800 ${idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}`}>
                    <td className="px-2 py-2 font-medium text-white whitespace-nowrap text-[11px]">
                      <div>{char.name}</div>
                      <div className="text-[10px] text-gray-400">레벨 {Math.round(char.itemLevel)}</div>
                      {idx === 0 && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-600/40 text-amber-200">1위</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex flex-row items-center justify-end gap-2">
                        <div>
                          <div className="text-yellow-400 font-semibold whitespace-nowrap text-[11px]">
                            {Math.round(char.totalWeeklyTradable).toLocaleString()}<GoldUnit />
                          </div>
                          <div className="text-[10px] text-gray-400 whitespace-nowrap">
                            / {Math.round(char.totalWeeklyTotal).toLocaleString()}<GoldUnit />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMobileDetailRow(idx)}
                          className="flex-shrink-0 py-1.5 px-3 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium whitespace-nowrap"
                        >
                          상세
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* 데스크탑 전용: 4열 테이블 */}
            <table className="hidden md:table w-full text-sm table-fixed">
              <colgroup>
                <col className="w-1/4" />
                <col className="w-1/4" />
                <col className="w-1/4" />
                <col className="w-1/4" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/50">
                  <th className="px-3 py-3 text-left font-semibold text-gray-300 whitespace-nowrap text-base">캐릭터명</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-300 whitespace-nowrap text-base">핵심 컨텐츠</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-300 whitespace-nowrap text-base">레이드 (상위 3종)</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-300 whitespace-nowrap text-base">
                    <div>주간 합계</div>
                    <div className="text-xs font-normal text-gray-400">(<span className="text-yellow-400">거래가능</span> / 전체)</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((char, idx) => (
                  <tr key={char.name} className={`border-b border-gray-800 ${idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}`}>
                    <td className="px-3 py-3 font-medium text-white whitespace-nowrap text-base">
                      <div>{char.name}</div>
                      <div className="text-xs text-gray-400">레벨 {Math.round(char.itemLevel)}</div>
                      {idx === 0 && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-600/40 text-amber-200">1위</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-1.5 md:gap-2">
                        {(() => {
                          type BlockData = { name: string; weeklyTradable: number; weeklyTotal: number; details: RewardDetail[]; weeklyCount: number } | null;
                          const renderBlock = (label: string, data: BlockData, tooltipKey: string) => (
                            <div key={label} className="relative text-xs md:text-sm">
                              <div className="flex items-start gap-1">
                                <div>
                                  <div className="text-gray-500 text-[10px] md:text-xs">{label}</div>
                                  {data ? (
                                    <>
                                      <div className="text-gray-200">{data.name}</div>
                                      <div className="text-[10px] md:text-xs text-gray-400">
                                        <span className="text-yellow-400">{Math.round(data.weeklyTradable).toLocaleString()}</span>
                                        {' / '}
                                        {Math.round(data.weeklyTotal).toLocaleString()}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-gray-500">-</span>
                                  )}
                                </div>
                                {data?.details && data.details.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTooltip(activeTooltip === tooltipKey ? null : tooltipKey);
                                    }}
                                    className="hidden md:flex text-gray-400 hover:text-purple-400 text-xs font-bold w-4 h-4 items-center justify-center rounded-full border border-gray-600 hover:border-purple-400 flex-shrink-0 mt-0.5"
                                  >
                                    ?
                                  </button>
                                )}
                              </div>
                              {data?.details && data.details.length > 0 && activeTooltip === tooltipKey && (
                                <div onClick={(e) => e.stopPropagation()} className="absolute z-10 top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 min-w-[300px] max-w-[400px]">
                                  <div className="text-xs font-semibold text-purple-300 mb-2">상세 보상 내역 ({data.weeklyCount}회)</div>
                                  <div className="space-y-1 max-h-60 overflow-y-auto">
                                    {data.details.map((detail, di) => {
                                      const mult = data.weeklyCount;
                                      return (
                                        <div key={di} className="flex items-center justify-between text-xs gap-2">
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <span className={`${detail.isTradable ? 'text-green-300' : 'text-orange-400'} truncate`}>
                                              {detail.itemName}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${detail.isTradable ? 'bg-green-900/30 text-green-300 border border-green-600' : 'bg-orange-900/30 text-orange-400 border border-orange-600'}`}>
                                              {detail.isTradable ? '거래' : '귀속'}
                                            </span>
                                          </div>
                                          <div className="text-gray-300 whitespace-nowrap">×{(detail.quantity * mult).toLocaleString()}</div>
                                          <div className="text-yellow-300 whitespace-nowrap">{Math.round(detail.totalPrice * mult).toLocaleString()}G</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                          return (
                            <>
                              {renderBlock('전선&균열', char.frontRift, `${idx}-front`)}
                              {renderBlock('큐브&모래시계', char.cubeHourglass, `${idx}-cube`)}
                              {renderBlock('가디언 토벌', char.guardian, `${idx}-guardian`)}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {char.raids.length > 0 ? (
                        <div className="space-y-1 md:space-y-1.5">
                          {char.raids.map((raid, ri) => (
                            <div key={raid.name} className="relative">
                              <div className="flex items-center gap-1">
                                <div className="flex-1">
                                  <div className="text-gray-200 text-xs md:text-sm"><span className="md:hidden">{raid.name.replace(/\s*\([^)]*\)\s*$/, '').trim()}</span><span className="hidden md:inline">{raid.name}</span></div>
                                  <div className="text-[10px] md:text-xs text-gray-400 whitespace-nowrap">
                                    <span className="text-yellow-400">{Math.round(raid.weeklyTradable).toLocaleString()}</span>
                                    {' / '}
                                    {Math.round(raid.weeklyTotal).toLocaleString()}
                                  </div>
                                </div>
                                {raid.details.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTooltip(activeTooltip === `${idx}-raid-${ri}` ? null : `${idx}-raid-${ri}`);
                                    }}
                                    className="hidden md:flex text-gray-400 hover:text-purple-400 text-xs font-bold w-4 h-4 items-center justify-center rounded-full border border-gray-600 hover:border-purple-400 flex-shrink-0"
                                  >
                                    ?
                                  </button>
                                )}
                              </div>
                              {activeTooltip === `${idx}-raid-${ri}` && raid.details.length > 0 && (
                                <div onClick={(e) => e.stopPropagation()} className="absolute z-10 top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 min-w-[300px] max-w-[400px]">
                                  <div className="text-xs font-semibold text-purple-300 mb-2">상세 보상 내역 ({raid.weeklyCount}회, 클리어)</div>
                                  <div className="space-y-1">
                                    {raid.details.map((detail, di) => {
                                      const mult = raid.weeklyCount;
                                      return (
                                        <div key={di} className="flex items-center justify-between text-xs gap-2">
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <span className={`${detail.isTradable ? 'text-green-300' : 'text-orange-400'} truncate`}>
                                              {detail.itemName}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${detail.isTradable ? 'bg-green-900/30 text-green-300 border border-green-600' : 'bg-orange-900/30 text-orange-400 border border-orange-600'}`}>
                                              {detail.isTradable ? '거래' : '귀속'}
                                            </span>
                                          </div>
                                          <div className="text-gray-300 whitespace-nowrap">×{(detail.quantity * mult).toLocaleString()}</div>
                                          <div className="text-yellow-300 whitespace-nowrap">{Math.round(detail.totalPrice * mult).toLocaleString()}G</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="text-yellow-400 font-semibold whitespace-nowrap text-base">
                        {Math.round(char.totalWeeklyTradable).toLocaleString()}<GoldUnit />
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        / {Math.round(char.totalWeeklyTotal).toLocaleString()}<GoldUnit />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
