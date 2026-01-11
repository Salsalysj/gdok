'use client';

import { useMemo, useState, useEffect } from 'react';
import { formatNumberWithSignificantDigits } from '../utils/formatNumber';
import type { RefiningStage, MarketItemInfo } from './page';
import { usePriceAdjustment } from '../hooks/usePriceAdjustment';

type CharacterEquipment = {
  Type?: string;
  Name?: string;
  Icon?: string;
  Grade?: string;
  Tooltip?: string | any;
  ItemLevel?: number;
  ItemMaxLevel?: number;
  [key: string]: any;
};

type CharacterArmory = {
  CharacterName?: string;
  CharacterClassName?: string;
  ItemLevel?: string;
  ArmoryEquipment?: CharacterEquipment[];
  Armories?: {
    Equipment?: CharacterEquipment[];
  };
  Equipment?: CharacterEquipment[];
};

type RosterCharacter = {
  CharacterName?: string;
  CharacterClassName?: string;
  ItemAvgLevel?: string;
  ItemLevel?: string;
  ItemMaxLevel?: string;
  ServerName?: string;
  [key: string]: any; // 다른 필드도 허용
};

function CharacterSimulation({ weaponStages, armorStages, marketInfo }: { weaponStages: RefiningStage[]; armorStages: RefiningStage[]; marketInfo: Record<string, MarketItemInfo> }) {
  const [characterName, setCharacterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [characterData, setCharacterData] = useState<CharacterArmory | null>(null);
  const [rosterCharacters, setRosterCharacters] = useState<RosterCharacter[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // 원정대 캐릭터 목록 불러오기
  const loadRoster = async (name: string) => {
    if (!name.trim()) return;
    
    try {
      setLoadingRoster(true);
      const res = await fetch(`/api/character/roster?characterName=${encodeURIComponent(name.trim())}`);
      const data = await res.json();
      
      console.log('원정대 API 응답:', JSON.stringify(data, null, 2));
      
      if (res.ok && Array.isArray(data)) {
        // 각 캐릭터의 최신 아이템 레벨을 가져오기 위해 상세 정보 조회
        const characterPromises = data.map(async (char: any) => {
          const characterName = char.CharacterName || char.characterName;
          if (!characterName) {
            // 기본 정보만 사용
            const itemLevel = char.ItemAvgLevel
              || char.ItemLevel 
              || char.ItemMaxLevel 
              || char.itemAvgLevel
              || char.itemLevel
              || char.itemMaxLevel
              || char.CharacterItemLevel
              || char.characterItemLevel
              || '?';
            
            return {
              CharacterName: characterName,
              CharacterClassName: char.CharacterClassName || char.characterClassName,
              ItemAvgLevel: char.ItemAvgLevel || char.itemAvgLevel || itemLevel,
              ItemLevel: char.ItemLevel || char.itemLevel || itemLevel,
              ItemMaxLevel: char.ItemMaxLevel || char.itemMaxLevel,
              ServerName: char.ServerName || char.serverName,
            };
          }
          
          // 각 캐릭터의 상세 정보 조회하여 최신 아이템 레벨 가져오기
          try {
            const detailRes = await fetch('/api/character/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterName }),
            });
            
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              
              // ArmoryProfile에서 ItemAvgLevel 가져오기 (Lost Ark API의 실제 구조)
              // Lost Ark API는 ArmoryProfile 객체 안에 ItemAvgLevel을 저장
              const armoryProfile = detailData.ArmoryProfile || {};
              
              // 최신 아이템 레벨 우선순위: ArmoryProfile.ItemAvgLevel > ArmoryProfile.ItemLevel > 기타
              const latestItemAvgLevel = armoryProfile.ItemAvgLevel 
                || armoryProfile.ItemLevel
                || detailData.ItemAvgLevel
                || detailData.ItemLevel
                || detailData.ItemMaxLevel
                || detailData.itemAvgLevel
                || detailData.itemLevel
                || detailData.itemMaxLevel
                || null;
              
              // 최신 아이템 레벨 필드 찾기 (fallback)
              const itemLevel = latestItemAvgLevel
                || char.ItemAvgLevel
                || char.ItemLevel
                || char.ItemMaxLevel
                || char.itemAvgLevel
                || char.itemLevel
                || char.itemMaxLevel
                || '?';
              
              // ItemAvgLevel과 ItemLevel 모두 저장 (드롭다운에서 ItemAvgLevel을 우선 사용)
              return {
                CharacterName: characterName,
                CharacterClassName: char.CharacterClassName || char.characterClassName,
                ItemAvgLevel: armoryProfile.ItemAvgLevel || latestItemAvgLevel || itemLevel,
                ItemLevel: armoryProfile.ItemLevel || detailData.ItemLevel || detailData.itemLevel || itemLevel,
                ItemMaxLevel: armoryProfile.ItemMaxLevel || detailData.ItemMaxLevel || detailData.itemMaxLevel,
                ServerName: char.ServerName || char.serverName,
              };
            }
          } catch (err) {
            console.warn(`캐릭터 ${characterName} 상세 정보 조회 실패:`, err);
          }
          
          // 상세 정보 조회 실패 시 기본 정보 사용
          const itemLevel = char.ItemAvgLevel
            || char.ItemLevel 
            || char.ItemMaxLevel 
            || char.itemAvgLevel
            || char.itemLevel
            || char.itemMaxLevel
            || char.CharacterItemLevel
            || char.characterItemLevel
            || '?';
          
          return {
            CharacterName: characterName,
            CharacterClassName: char.CharacterClassName || char.characterClassName,
            ItemAvgLevel: char.ItemAvgLevel || char.itemAvgLevel || itemLevel,
            ItemLevel: char.ItemLevel || char.itemLevel || itemLevel,
            ItemMaxLevel: char.ItemMaxLevel || char.itemMaxLevel,
            ServerName: char.ServerName || char.serverName,
          };
        });
        
        const characters = await Promise.all(characterPromises);
        setRosterCharacters(characters);
      } else {
        setRosterCharacters([]);
      }
    } catch (err) {
      console.error('원정대 정보 조회 실패:', err);
      setRosterCharacters([]);
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleSearch = async (searchName?: string) => {
    const nameToSearch = searchName || characterName.trim();
    if (!nameToSearch) {
      setError('캐릭터명을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/character/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterName: nameToSearch }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log('API 응답 데이터:', JSON.stringify(data, null, 2));
        console.log('아이템 레벨 필드 확인:', {
          ItemAvgLevel: data.ItemAvgLevel,
          ItemLevel: data.ItemLevel,
          ItemMaxLevel: data.ItemMaxLevel,
          itemAvgLevel: data.itemAvgLevel,
          itemLevel: data.itemLevel,
          itemMaxLevel: data.itemMaxLevel,
          CharacterItemLevel: data.CharacterItemLevel,
        });
        setCharacterData(data);
        // 원정대 목록도 함께 불러오기
        loadRoster(nameToSearch);
      } else {
        setError(data.error || '캐릭터를 찾을 수 없습니다.');
        setCharacterData(null);
        setRosterCharacters([]);
      }
    } catch (err) {
      setError('캐릭터 검색 중 오류가 발생했습니다.');
      setCharacterData(null);
      setRosterCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  // 드롭다운에서 캐릭터 선택
  const handleCharacterSelect = (selectedName: string) => {
    setCharacterName(selectedName);
    handleSearch(selectedName);
  };

  // 장비 타입 한글명 매핑
  const equipmentTypeMap: Record<string, string> = {
    '무기': '무기',
    '투구': '투구',
    '상의': '상의',
    '하의': '하의',
    '장갑': '장갑',
    '어깨': '어깨',
  };

  // 재련 단계 추출 (Tooltip에서)
  const extractRefiningLevel = (tooltip: string | any): number | null => {
    if (!tooltip) return null;
    
    // Tooltip이 문자열인 경우
    if (typeof tooltip === 'string') {
      // HTML 형식 파싱
      const match = tooltip.match(/재련\s*단계[:\s]*\+?(\d+)/i) 
        || tooltip.match(/\+(\d+)/)
        || tooltip.match(/재련[:\s]*(\d+)/i);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    // Tooltip이 객체인 경우 (Lost Ark API 형식)
    if (typeof tooltip === 'object') {
      const tooltipStr = JSON.stringify(tooltip);
      const match = tooltipStr.match(/재련\s*단계[:\s]*\+?(\d+)/i) 
        || tooltipStr.match(/\+(\d+)/)
        || tooltipStr.match(/재련[:\s]*(\d+)/i);
      if (match) {
        return parseInt(match[1]);
      }
      
      // Element_001 필드에서 찾기 (일부 API 응답 형식)
      if (tooltip.Element_001) {
        const elementStr = typeof tooltip.Element_001 === 'string' 
          ? tooltip.Element_001 
          : JSON.stringify(tooltip.Element_001);
        const match = elementStr.match(/\+(\d+)/) || elementStr.match(/(\d+)/);
        if (match) {
          return parseInt(match[1]);
        }
      }
    }
    
    return null;
  };

  // 장비 타입 추출
  const getEquipmentType = (equipment: CharacterEquipment): string => {
    // Type 필드가 직접 있는 경우
    if (equipment.Type) {
      const mapped = equipmentTypeMap[equipment.Type];
      if (mapped) return mapped;
    }
    
    // Tooltip에서 타입 추출
    if (equipment.Tooltip) {
      let tooltipStr = '';
      if (typeof equipment.Tooltip === 'string') {
        tooltipStr = equipment.Tooltip;
      } else if (typeof equipment.Tooltip === 'object') {
        tooltipStr = JSON.stringify(equipment.Tooltip);
      }
      
      if (tooltipStr) {
        const typeMatch = tooltipStr.match(/<FONT[^>]*>([^<]+)<\/FONT>/);
        if (typeMatch) {
          const type = typeMatch[1].trim();
          return equipmentTypeMap[type] || type;
        }
      }
    }
    
    // Name에서 추출 시도
    const name = equipment.Name || '';
    if (name.includes('무기') || name.includes('Weapon')) return '무기';
    if (name.includes('투구') || name.includes('Helmet') || name.includes('머리')) return '투구';
    if (name.includes('상의') || name.includes('Top') || name.includes('갑옷')) return '상의';
    if (name.includes('하의') || name.includes('Bottom') || name.includes('바지')) return '하의';
    if (name.includes('장갑') || name.includes('Gloves') || name.includes('장갑')) return '장갑';
    if (name.includes('어깨') || name.includes('Shoulder') || name.includes('어깨')) return '어깨';
    
    return equipment.Type || '알 수 없음';
  };

  // 장비의 아이템 레벨 추출 (티어 확인용)
  const extractItemLevel = (equipment: any): number | null => {
    // ItemLevel 또는 ItemMaxLevel 필드 확인
    if (equipment.ItemLevel != null) {
      return Number(equipment.ItemLevel);
    }
    if (equipment.ItemMaxLevel != null) {
      return Number(equipment.ItemMaxLevel);
    }
    if (equipment.itemLevel != null) {
      return Number(equipment.itemLevel);
    }
    if (equipment.itemMaxLevel != null) {
      return Number(equipment.itemMaxLevel);
    }
    
    // Tooltip에서 아이템 레벨 추출 시도
    if (equipment.Tooltip) {
      let tooltipStr = '';
      if (typeof equipment.Tooltip === 'string') {
        tooltipStr = equipment.Tooltip;
      } else if (typeof equipment.Tooltip === 'object') {
        tooltipStr = JSON.stringify(equipment.Tooltip);
      }
      
      // 아이템 레벨 패턴 찾기 (예: "아이템 레벨: 1640" 또는 "ItemLevel: 1640")
      const levelMatch = tooltipStr.match(/아이템\s*레벨[:\s]*(\d+)/i) 
        || tooltipStr.match(/ItemLevel[:\s]*(\d+)/i)
        || tooltipStr.match(/아이템레벨[:\s]*(\d+)/i);
      if (levelMatch) {
        return parseInt(levelMatch[1]);
      }
    }
    
    return null;
  };

  // 3티어 장비(1640 미만) 착용 여부 확인
  const hasTier3Equipment = useMemo(() => {
    if (!characterData) return false;
    
    let equipment: any[] = [];
    
    if (Array.isArray(characterData.ArmoryEquipment)) {
      equipment = characterData.ArmoryEquipment;
    } else if (characterData.Armories?.Equipment && Array.isArray(characterData.Armories.Equipment)) {
      equipment = characterData.Armories.Equipment;
    } else if (Array.isArray(characterData.Equipment)) {
      equipment = characterData.Equipment;
    } else if (characterData.Armories && Array.isArray(characterData.Armories)) {
      equipment = characterData.Armories;
    }
    
    if (!Array.isArray(equipment) || equipment.length === 0) {
      return false;
    }
    
    // 무기와 방어구 5종만 확인
    const equipmentOrder = ['무기', '투구', '상의', '하의', '장갑', '어깨'];
    const mainEquipment = equipment
      .map(eq => ({
        ...eq,
        type: getEquipmentType(eq),
      }))
      .filter(eq => equipmentOrder.slice(0, 6).includes(eq.type));
    
    // 하나라도 1640 미만이면 true
    return mainEquipment.some(eq => {
      const itemLevel = extractItemLevel(eq);
      return itemLevel != null && itemLevel < 1640;
    });
  }, [characterData]);

  // 장비 목록 정렬 (무기, 투구, 상의, 하의, 장갑, 어깨 순서) - 무기와 방어구 5종만
  const equipmentOrder = ['무기', '투구', '상의', '하의', '장갑', '어깨'];
  const sortedEquipment = useMemo(() => {
    if (!characterData) {
      return [];
    }
    
    // Lost Ark API 응답 구조에 따라 장비 배열 찾기
    let equipment: any[] = [];
    
    // 여러 가능한 경로 확인
    if (Array.isArray(characterData.ArmoryEquipment)) {
      equipment = characterData.ArmoryEquipment;
    } else if (characterData.Armories?.Equipment && Array.isArray(characterData.Armories.Equipment)) {
      equipment = characterData.Armories.Equipment;
    } else if (Array.isArray(characterData.Equipment)) {
      equipment = characterData.Equipment;
    } else if (characterData.Armories && Array.isArray(characterData.Armories)) {
      equipment = characterData.Armories;
    }
    
    if (!Array.isArray(equipment) || equipment.length === 0) {
      return [];
    }
    
    const mapped = equipment
      .map(eq => {
        const type = getEquipmentType(eq);
        const level = extractRefiningLevel(eq.Tooltip);
        return {
          ...eq,
          type,
          level,
        };
      })
      .filter(eq => equipmentOrder.slice(0, 6).includes(eq.type)) // 무기 + 방어구 5종만
      .sort((a, b) => {
        const aIndex = equipmentOrder.indexOf(a.type);
        const bIndex = equipmentOrder.indexOf(b.type);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    
    return mapped;
  }, [characterData]);

  // 각 장비의 가치 계산
  // 가격 조정 훅 사용
  const { adjustPrice } = usePriceAdjustment();

  // 가격 조정이 적용된 marketInfo 생성
  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    return adjusted;
  }, [marketInfo, adjustPrice]);

  // 가격 조정 스위치 변경 시 equipmentWithValues 재계산을 위한 refresh key
  const [refreshKey, setRefreshKey] = useState(0);
  
  useEffect(() => {
    const handlePriceOverrideChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('price-override-change', handlePriceOverrideChange);
    return () => {
      window.removeEventListener('price-override-change', handlePriceOverrideChange);
    };
  }, []);

  const equipmentWithValues = useMemo(() => {
    if (!sortedEquipment.length) return [];
    
    return sortedEquipment.map(eq => {
      const isWeapon = eq.type === '무기';
      const stages = isWeapon ? weaponStages : armorStages;
      // 목표 재련 단계는 현재 재련 단계 + 1
      const targetLevel = eq.level != null ? eq.level + 1 : null;
      const stage = targetLevel != null ? stages.find(s => s.level === targetLevel) : null;
      
      if (!stage || eq.level == null || targetLevel == null) {
        return {
          ...eq,
          craftValue: null,
          breathValue: null,
          breakthroughValue: null,
          targetLevel: targetLevel,
        };
      }

      // 최적 전략 계산 (가격 조정이 적용된 marketInfo 사용)
      const { materialValueAnalysis } = calculateOptimalStrategy(stage, adjustedMarketInfo);
      
      // 야금/재봉 가치 및 아이템 정보
      const craftValue = materialValueAnalysis?.metallurgy?.actualValuePerItem ?? null;
      const craftItemName = stage.metallurgyMaterial?.name || null;
      const craftMarketPrice = craftItemName ? (adjustedMarketInfo[craftItemName]?.unitPrice ?? null) : null;
      
      // 숨결 가치 및 아이템 정보
      const breathValue = materialValueAnalysis?.breath?.actualValuePerItem ?? null;
      const breathItemName = stage.breathMaterial?.name || null;
      const breathMarketPrice = breathItemName ? (adjustedMarketInfo[breathItemName]?.unitPrice ?? null) : null;
      
      // 순환 돌파석 가치 계산 (가격 조정이 적용된 marketInfo 사용)
      const { optimalStrategy } = calculateOptimalStrategy(stage, adjustedMarketInfo);
      const expInfo = stage.expMaterial ? (adjustedMarketInfo[stage.expMaterial.name] || { unitPrice: 0 }) : null;
      const expMaterialCost = stage.expMaterial && expInfo
        ? expInfo.unitPrice * stage.expMaterial.quantity
        : 0;
      
      const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
      const baseSuccessRate = stage.baseSuccessRate / 100;
      
      // 순환 돌파석 소모 개수
      const getBreakthroughStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
        if (type === 'weapon') {
          if (level >= 10 && level <= 12) return 30;
          if (level >= 13 && level <= 16) return 40;
          if (level >= 17 && level <= 25) return 50;
        } else {
          if (level >= 10 && level <= 12) return 12;
          if (level >= 13 && level <= 16) return 16;
          if (level >= 17 && level <= 25) return 20;
        }
        return 0;
      };
      
      const stoneCount = getBreakthroughStoneCount(targetLevel, isWeapon ? 'weapon' : 'armor');
      const breakthroughValue = stoneCount > 0 ? (refiningCost * baseSuccessRate) / stoneCount : null;
      
      return {
        ...eq,
        craftValue,
        craftItemName,
        craftMarketPrice,
        breathValue,
        breathItemName,
        breathMarketPrice,
        breakthroughValue,
        targetLevel,
      };
    });
  }, [sortedEquipment, weaponStages, armorStages, adjustedMarketInfo, refreshKey]);

  // 요약 정보 계산
  const summaryValues = useMemo(() => {
    if (!equipmentWithValues.length) {
      return {
        lavaBreathValue: null,
        lavaBreathMarketPrice: null,
        iceBreathValue: null,
        iceBreathMarketPrice: null,
        breakthroughValue: null,
        breakthroughBestEquipment: null,
        craftItems: [],
      };
    }

    // 용암의 숨결 실제 가치 (무기)
    const weapon = equipmentWithValues.find(eq => eq.type === '무기');
    const lavaBreathValue = weapon?.breathValue ?? null;
    const lavaBreathMarketPrice = weapon?.breathMarketPrice ?? null;

    // 빙하의 숨결 실제 가치 (5부위 방어구 중 가장 가치가 높은 수치)
    const armorItems = equipmentWithValues.filter(eq => eq.type !== '무기');
    const iceBreathValues = armorItems.map(eq => ({ value: eq.breathValue, price: eq.breathMarketPrice, type: eq.type })).filter((v): v is { value: number; price: number | null; type: string } => v.value != null);
    const maxIceBreath = iceBreathValues.length > 0 
      ? iceBreathValues.reduce((max, curr) => curr.value > max.value ? curr : max, iceBreathValues[0])
      : null;
    const iceBreathValue = maxIceBreath?.value ?? null;
    const iceBreathMarketPrice = maxIceBreath?.price ?? null;

    // 순환 돌파석 실제 가치 (6부위 중 가장 가치가 높은 수치)
    const breakthroughItems = equipmentWithValues.map(eq => ({ 
      value: eq.breakthroughValue, 
      type: eq.type,
      targetLevel: eq.targetLevel 
    })).filter((v): v is { value: number; type: string; targetLevel: number | null } => v.value != null);
    const maxBreakthrough = breakthroughItems.length > 0 
      ? breakthroughItems.reduce((max, curr) => curr.value > max.value ? curr : max, breakthroughItems[0])
      : null;
    const breakthroughValue = maxBreakthrough?.value ?? null;
    const breakthroughBestEquipment = maxBreakthrough 
      ? `${maxBreakthrough.type} +${maxBreakthrough.targetLevel ?? '?'}`
      : null;

    // 야금술/재봉술 아이템 수집 (실제 사용되는 아이템만)
    const craftItemsMap = new Map<string, { 
      name: string; 
      value: number; 
      marketPrice: number | null;
      type: string;
    }>();
    
    equipmentWithValues.forEach(eq => {
      if (eq.craftItemName && eq.craftValue != null) {
        const existing = craftItemsMap.get(eq.craftItemName);
        // 같은 아이템이 여러 장비에서 사용되는 경우, 가장 높은 가치를 유지
        if (!existing || eq.craftValue > existing.value) {
          craftItemsMap.set(eq.craftItemName, {
            name: eq.craftItemName,
            value: eq.craftValue,
            marketPrice: eq.craftMarketPrice,
            type: eq.type,
          });
        }
      }
    });
    
    const craftItems = Array.from(craftItemsMap.values());

    return {
      lavaBreathValue,
      lavaBreathMarketPrice,
      iceBreathValue,
      iceBreathMarketPrice,
      breakthroughValue,
      breakthroughBestEquipment,
      craftItems,
    };
  }, [equipmentWithValues]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-gray-300 text-sm">
          캐릭터명을 입력하여 착용 중인 장비의 재련 단계를 확인할 수 있습니다.
        </p>
      </div>

      {/* 검색 입력 */}
      <div className="bg-gray-900/70 rounded-xl border border-gray-700 p-6 space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSearch();
              }
            }}
            placeholder="캐릭터명을 입력하세요"
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>
        
        {/* 원정대 캐릭터 드롭다운 */}
        {rosterCharacters.length > 0 && (
          <div>
            <label className="block text-sm text-gray-300 mb-2">내 원정대 캐릭터</label>
            <select
              value={characterName}
              onChange={(e) => handleCharacterSelect(e.target.value)}
              disabled={loading || loadingRoster}
              className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">캐릭터 선택</option>
              {rosterCharacters.map((char, idx) => {
                const charName = char.CharacterName || '알 수 없음';
                const className = char.CharacterClassName || '알 수 없음';
                const itemLevel = char.ItemAvgLevel
                  || char.ItemLevel 
                  || char.ItemMaxLevel 
                  || char.itemAvgLevel
                  || char.itemLevel
                  || char.itemMaxLevel
                  || '?';
                return (
                  <option key={idx} value={charName}>
                    {charName} ({className}) - 아이템 레벨: {itemLevel}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {characterData && (
        <>
          {/* 3티어 장비 착용 시 메시지 */}
          {hasTier3Equipment ? (
            <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-6 text-center">
              <p className="text-yellow-300 text-lg font-semibold">
                내 캐릭터 시뮬레이션은 전 부위 4티어 장비를 착용 시에만 제공 가능합니다
              </p>
            </div>
          ) : (
            <>
              {/* 요약 정보 */}
          <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">요약 정보</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-800 text-sm">
                <thead>
                  <tr className="bg-gray-900/90 text-gray-200">
                    <th className="px-4 py-3 text-left font-medium border-b border-gray-700">아이템</th>
                    <th className="px-4 py-3 text-right font-medium border-b border-gray-700">실제 가치</th>
                    <th className="px-4 py-3 text-right font-medium border-b border-gray-700">거래소 가격</th>
                    <th className="px-4 py-3 text-center font-medium border-b border-gray-700">비교</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 야금술/재봉술 아이템들 */}
                  {summaryValues.craftItems.length > 0 && summaryValues.craftItems.map((item, idx) => {
                    const isProfitable = item.marketPrice != null && item.value > item.marketPrice;
                    const isLoss = item.marketPrice != null && item.value < item.marketPrice;
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                        <td className="px-4 py-3 text-gray-300 border-b border-gray-800">{item.name}</td>
                        <td className="px-4 py-3 text-right text-yellow-300 font-medium border-b border-gray-800">
                          {formatNumberWithSignificantDigits(item.value)} 골드
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                          {item.marketPrice != null 
                            ? `${formatNumberWithSignificantDigits(item.marketPrice)} 골드`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-center border-b border-gray-800">
                          {item.marketPrice != null ? (
                            isProfitable ? (
                              <span className="text-green-400 font-medium">사는 게 이득</span>
                            ) : isLoss ? (
                              <span className="text-red-400 font-medium">사는 게 손해</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* 용암의 숨결 */}
                  <tr className={summaryValues.craftItems.length % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                    <td className="px-4 py-3 text-gray-300 border-b border-gray-800">용암의 숨결</td>
                    <td className="px-4 py-3 text-right text-blue-300 font-medium border-b border-gray-800">
                      {summaryValues.lavaBreathValue != null 
                        ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathValue)} 골드`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                      {summaryValues.lavaBreathMarketPrice != null 
                        ? `${formatNumberWithSignificantDigits(summaryValues.lavaBreathMarketPrice)} 골드`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center border-b border-gray-800">
                      {summaryValues.lavaBreathValue != null && summaryValues.lavaBreathMarketPrice != null ? (
                        summaryValues.lavaBreathValue > summaryValues.lavaBreathMarketPrice ? (
                          <span className="text-green-400 font-medium">사는 게 이득</span>
                        ) : summaryValues.lavaBreathValue < summaryValues.lavaBreathMarketPrice ? (
                          <span className="text-red-400 font-medium">사는 게 손해</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                  {/* 빙하의 숨결 */}
                  <tr className={(summaryValues.craftItems.length + 1) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                    <td className="px-4 py-3 text-gray-300 border-b border-gray-800">빙하의 숨결</td>
                    <td className="px-4 py-3 text-right text-purple-300 font-medium border-b border-gray-800">
                      {summaryValues.iceBreathValue != null 
                        ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathValue)} 골드`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">
                      {summaryValues.iceBreathMarketPrice != null 
                        ? `${formatNumberWithSignificantDigits(summaryValues.iceBreathMarketPrice)} 골드`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center border-b border-gray-800">
                      {summaryValues.iceBreathValue != null && summaryValues.iceBreathMarketPrice != null ? (
                        summaryValues.iceBreathValue > summaryValues.iceBreathMarketPrice ? (
                          <span className="text-green-400 font-medium">사는 게 이득</span>
                        ) : summaryValues.iceBreathValue < summaryValues.iceBreathMarketPrice ? (
                          <span className="text-red-400 font-medium">사는 게 손해</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                  {/* 순환 돌파석 */}
                  <tr className={(summaryValues.craftItems.length + 2) % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                    <td className="px-4 py-3 text-gray-300 border-b border-gray-800">순환 돌파석</td>
                    <td className="px-4 py-3 text-right text-green-300 font-medium border-b border-gray-800">
                      {summaryValues.breakthroughValue != null 
                        ? `${formatNumberWithSignificantDigits(summaryValues.breakthroughValue)} 골드`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 border-b border-gray-800">-</td>
                    <td className="px-4 py-3 text-center border-b border-gray-800">
                      {summaryValues.breakthroughBestEquipment ? (
                        <span className="text-gray-300">
                          {summaryValues.breakthroughBestEquipment.replace(/\s*\+\d+.*$/, '').trim()} 부위에 우선 사용
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 장비 표 */}
          <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-800 text-sm">
                <thead>
                  <tr className="bg-gray-900/90 text-gray-200">
                    <th className="px-4 py-3 text-left font-medium border-b border-gray-700">장비 부위</th>
                    <th className="px-4 py-3 text-left font-medium border-b border-gray-700">장비명</th>
                    <th className="px-4 py-3 text-center font-medium border-b border-gray-700">목표 재련 단계</th>
                    <th className="px-4 py-3 text-right font-medium border-b border-gray-700">야금/재봉 가치</th>
                    <th className="px-4 py-3 text-right font-medium border-b border-gray-700">숨결 가치</th>
                    <th className="px-4 py-3 text-right font-medium border-b border-gray-700">순환 돌파석 가치</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentWithValues.length > 0 ? (
                    equipmentWithValues.map((eq, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                        <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                          {eq.type}
                        </td>
                        <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                          <div className="flex items-center gap-2">
                            {eq.Icon && (
                              <img src={eq.Icon} alt={eq.Name} className="w-6 h-6 object-contain" />
                            )}
                            <span>{eq.Name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-blue-300 font-medium border-b border-gray-800">
                          {eq.targetLevel != null ? `+${eq.targetLevel}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right border-b border-gray-800">
                          {eq.craftValue != null ? (
                            <div>
                              <div className="text-yellow-300 font-medium">
                                {formatNumberWithSignificantDigits(eq.craftValue)} 골드
                              </div>
                              {eq.craftItemName && (
                                <div className="text-xs text-gray-400 mt-1">
                                  {eq.craftItemName}
                                </div>
                              )}
                              {eq.craftMarketPrice != null && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  거래소: {formatNumberWithSignificantDigits(eq.craftMarketPrice)} 골드
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right border-b border-gray-800">
                          {eq.breathValue != null ? (
                            <div>
                              <div className="text-orange-300 font-medium">
                                {formatNumberWithSignificantDigits(eq.breathValue)} 골드
                              </div>
                              {eq.breathItemName && (
                                <div className="text-xs text-gray-400 mt-1">
                                  {eq.breathItemName}
                                </div>
                              )}
                              {eq.breathMarketPrice != null && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  거래소: {formatNumberWithSignificantDigits(eq.breathMarketPrice)} 골드
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-green-300 border-b border-gray-800">
                          {eq.breakthroughValue != null 
                            ? `${formatNumberWithSignificantDigits(eq.breakthroughValue)} 골드`
                            : '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        장비 정보를 불러올 수 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

type Props = {
  weaponStages: RefiningStage[];
  armorStages: RefiningStage[];
  marketInfo: Record<string, MarketItemInfo>;
  lastUpdated: string | null;
};

type ScenarioSummary = {
  label: string;
  description: string;
  cost: number | null;
  successRate: number | null;
};

type StrategySummary = {
  label: string;
  description: string;
  expectedCost: number;
  averageAttempts: number;
  simulationDetails: SimulationDetail[];
  breathAttempts: number;
  metallurgyAttempts: number;
  breathTotalCost: number;
  metallurgyTotalCost: number;
};

type SimulationDetail = {
  attempt: number;
  baseRate: number;
  currentRate: number;
  actualRate: number;
  artisanEnergy: number;
  cost: number;
  cumulativeProbability: number;
  strategy: string;
  breathUsed: boolean;
  metallurgyUsed: boolean;
};

type MaterialValueInsight = {
  name: string;
  available: boolean;
  usedCount: number;
  quantityPerUse: number;
  marketPrice: number;
  actualValuePerItem: number | null;
  diffFromMarket: number | null;
  basis: 'optimal' | 'full' | 'none';
};

type MaterialValueAnalysis = {
  breath: MaterialValueInsight;
  metallurgy: MaterialValueInsight;
};

const GOLD_ITEM = '골드';
const SILVER_ITEM = '실링';
const BREATH_ITEM = '용암의 숨결';
const FALLBACK_ICON: Record<string, string> = {
  [GOLD_ITEM]: '🪙',
  [SILVER_ITEM]: '💠',
  [BREATH_ITEM]: '🔥',
  '빙하의 숨결': '❄️',
  '운명의 파괴석': '💎',
  '운명의 수호석': '🛡️',
  '운명의 돌파석': '🔷',
  '아비도스 융화 재료': '🧪',
  '운명의 파편': '✨',
  '운명의 파편 (경험치)': '✨',
  '야금술 : 업화 [11-14]': '🛠️',
  '야금술 : 업화 [15-18]': '🛠️',
  '야금술 : 업화 [19-20]': '🛠️',
  '재봉술 : 업화 [11-14]': '🧵',
  '재봉술 : 업화 [15-18]': '🧵',
  '재봉술 : 업화 [19-20]': '🧵',
};

function clampRate(value: number | null): number | null {
  if (value == null) return null;
  return Math.min(value, 100);
}

function formatRate(value: number | null): string {
  if (value == null || value <= 0) return '-';
  return `${formatNumberWithSignificantDigits(value)}%`;
}

function formatCost(value: number | null): string {
  if (value == null || value <= 0) return '-';
  return `${formatNumberWithSignificantDigits(value)} 골드`;
}

type CostLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  icon?: string | null;
};

export function calculateOptimalStrategy(
  stage: RefiningStage,
  marketInfo: Record<string, MarketItemInfo>,
  maxAttempts: number = 500,
  maxBreathUses: number = 25,
  maxMetallurgyUses: number = 25
): {
  optimalStrategy: StrategySummary;
  baseStrategy: StrategySummary;
  fullBreathStrategy: StrategySummary | null;
  fullMetallurgyStrategy: StrategySummary | null;
  fullBothStrategy: StrategySummary | null;
  materialValueAnalysis: MaterialValueAnalysis | null;
} {
  const ARTISAN_ENERGY_FACTOR = 0.4651162791;
  const getUnitInfo = (name: string): MarketItemInfo => marketInfo[name] || { unitPrice: 0, icon: null };

  const baseMaterialsCost = stage.baseMaterials.reduce((sum, material) => {
    if (material.name === SILVER_ITEM) return sum;
    const info = getUnitInfo(material.name);
    return sum + info.unitPrice * material.quantity;
  }, 0);
  const goldCost = stage.goldCost * (getUnitInfo(GOLD_ITEM).unitPrice || 1);
  const perAttemptBaseCost = baseMaterialsCost + goldCost;

  const expInfo = stage.expMaterial ? getUnitInfo(stage.expMaterial.name) : null;
  const expMaterialCost = stage.expMaterial
    ? (expInfo?.unitPrice || 0) * stage.expMaterial.quantity
    : 0;

  const breathInfo = stage.breathMaterial ? getUnitInfo(stage.breathMaterial.name) : null;
  const breathUnitPrice = breathInfo?.unitPrice || 0;

  const metallurgyInfo = stage.metallurgyMaterial ? getUnitInfo(stage.metallurgyMaterial.name) : null;
  const metallurgyUnitPrice = metallurgyInfo?.unitPrice || 0;

  const calculateExpectedCost = (
    breathUses: number,
    metallurgyUses: number
  ): {
    expectedTotalCost: number;
    averageAttempts: number;
    simulationDetails: SimulationDetail[];
    breathAttempts: number;
    metallurgyAttempts: number;
    breathTotalCost: number;
    metallurgyTotalCost: number;
  } => {
    let expectedTotalCost = expMaterialCost;
    let totalProbability = 0;
    let totalAttempts = 0;
    let artisanEnergy = 0;
    const simulationDetails: SimulationDetail[] = [];
    let breathAttemptCount = 0;
    let metallurgyAttemptCount = 0;

    for (let n = 1; n <= maxAttempts; n++) {
      let currentBaseRate = stage.baseSuccessRate + (n - 1) * 0.1 * stage.baseSuccessRate;
      // 기본 재련 확률은 최초 확률의 2배를 초과할 수 없음
      currentBaseRate = Math.min(currentBaseRate, stage.baseSuccessRate * 2, 100);

      let actualSuccessRate = currentBaseRate;
      let currentAttemptCost = perAttemptBaseCost;
      let currentBreathCost = 0;
      let currentMetallurgyCost = 0;
      let strategyLabel = '기본';

      const useBreath = !!(n <= breathUses && stage.breathMaterial);
      const useMetallurgy = !!(n <= metallurgyUses && stage.metallurgyMaterial);

      // 최초 성공률이 0.5%인 경우 보조 재료 보너스는 +1.0% 고정
      const isLowRate = stage.baseSuccessRate === 0.5;
      const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;

      if (useBreath && useMetallurgy) {
        actualSuccessRate = Math.min(currentBaseRate + 2 * bonusRate, 100);
        currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
        currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
        strategyLabel = `${stage.breathMaterial!.name} & ${stage.metallurgyMaterial!.name}`;
      } else if (useBreath) {
        actualSuccessRate = Math.min(currentBaseRate + bonusRate, 100);
        currentBreathCost = stage.breathMaterial!.quantity * breathUnitPrice;
        strategyLabel = stage.breathMaterial!.name;
      } else if (useMetallurgy) {
        actualSuccessRate = Math.min(currentBaseRate + bonusRate, 100);
        currentMetallurgyCost = stage.metallurgyMaterial!.quantity * metallurgyUnitPrice;
        strategyLabel = stage.metallurgyMaterial!.name;
      }

      if (artisanEnergy >= 100) {
        actualSuccessRate = 100;
      }

      const currentAttemptTotalCost = currentAttemptCost + currentBreathCost + currentMetallurgyCost;
      const probOfSuccessThisAttempt = (actualSuccessRate / 100) * (1 - totalProbability);
      expectedTotalCost += currentAttemptTotalCost * (1 - totalProbability);
      totalProbability += probOfSuccessThisAttempt;
      totalAttempts += (1 - totalProbability + probOfSuccessThisAttempt) * 1;

      simulationDetails.push({
        attempt: n,
        baseRate: stage.baseSuccessRate,
        currentRate: currentBaseRate,
        actualRate: actualSuccessRate,
        artisanEnergy: artisanEnergy,
        cost: currentAttemptTotalCost,
        cumulativeProbability: totalProbability,
        strategy: strategyLabel,
        breathUsed: useBreath || false,
        metallurgyUsed: useMetallurgy || false,
      });

      if (useBreath) {
        breathAttemptCount += 1;
      }
      if (useMetallurgy) {
        metallurgyAttemptCount += 1;
      }

      if (totalProbability >= 0.999999) break;

      artisanEnergy = Math.min(100, artisanEnergy + (actualSuccessRate * ARTISAN_ENERGY_FACTOR));
    }

    const breathTotalCost = breathAttemptCount * (stage.breathMaterial?.quantity || 0) * breathUnitPrice;
    const metallurgyTotalCost = metallurgyAttemptCount * (stage.metallurgyMaterial?.quantity || 0) * metallurgyUnitPrice;

    return {
      expectedTotalCost,
      averageAttempts: totalAttempts,
      simulationDetails,
      breathAttempts: breathAttemptCount,
      metallurgyAttempts: metallurgyAttemptCount,
      breathTotalCost,
      metallurgyTotalCost,
    };
  };

  let minExpectedCost = Infinity;
  let optimalBreathUses = 0;
  let optimalMetallurgyUses = 0;
  let optimalSimulationDetails: SimulationDetail[] = [];
  let optimalAverageAttempts = 0;
  let optimalBreathAttempts = 0;
  let optimalMetallurgyAttempts = 0;
  let optimalBreathCost = 0;
  let optimalMetallurgyCost = 0;

  const baseStrategyResult = calculateExpectedCost(0, 0);
  const baseStrategy: StrategySummary = {
    label: '기본 재련 전략',
    description: '보조 재료 미사용',
    expectedCost: baseStrategyResult.expectedTotalCost,
    averageAttempts: baseStrategyResult.averageAttempts,
    simulationDetails: baseStrategyResult.simulationDetails,
    breathAttempts: baseStrategyResult.breathAttempts,
    metallurgyAttempts: baseStrategyResult.metallurgyAttempts,
    breathTotalCost: baseStrategyResult.breathTotalCost,
    metallurgyTotalCost: baseStrategyResult.metallurgyTotalCost,
  };

  minExpectedCost = baseStrategyResult.expectedTotalCost;
  optimalSimulationDetails = baseStrategyResult.simulationDetails;
  optimalAverageAttempts = baseStrategyResult.averageAttempts;
  optimalBreathAttempts = baseStrategyResult.breathAttempts;
  optimalMetallurgyAttempts = baseStrategyResult.metallurgyAttempts;
  optimalBreathCost = baseStrategyResult.breathTotalCost;
  optimalMetallurgyCost = baseStrategyResult.metallurgyTotalCost;

  for (let b = 0; b <= maxBreathUses; b++) {
    for (let m = 0; m <= maxMetallurgyUses; m++) {
      const {
        expectedTotalCost,
        averageAttempts,
        simulationDetails,
        breathAttempts,
        metallurgyAttempts,
        breathTotalCost,
        metallurgyTotalCost,
      } = calculateExpectedCost(b, m);

      if (expectedTotalCost < minExpectedCost) {
        minExpectedCost = expectedTotalCost;
        optimalBreathUses = b;
        optimalMetallurgyUses = m;
        optimalSimulationDetails = simulationDetails;
        optimalAverageAttempts = averageAttempts;
        optimalBreathAttempts = breathAttempts;
        optimalMetallurgyAttempts = metallurgyAttempts;
        optimalBreathCost = breathTotalCost;
        optimalMetallurgyCost = metallurgyTotalCost;
      }
    }
  }

  let optimalStrategyLabel = '';
  if (optimalBreathUses > 0 && optimalMetallurgyUses > 0) {
    optimalStrategyLabel = `숨결 ${optimalBreathUses}회, 야금술 ${optimalMetallurgyUses}회 투입`;
  } else if (optimalBreathUses > 0) {
    optimalStrategyLabel = `숨결 ${optimalBreathUses}회 투입`;
  } else if (optimalMetallurgyUses > 0) {
    optimalStrategyLabel = `야금술 ${optimalMetallurgyUses}회 투입`;
  } else {
    optimalStrategyLabel = '보조 재료 미사용 (기본 전략과 동일)';
  }

  const optimalStrategy: StrategySummary = {
    label: '최적 재련 전략',
    description: optimalStrategyLabel,
    expectedCost: minExpectedCost,
    averageAttempts: optimalAverageAttempts,
    simulationDetails: optimalSimulationDetails,
    breathAttempts: optimalBreathAttempts,
    metallurgyAttempts: optimalMetallurgyAttempts,
    breathTotalCost: optimalBreathCost,
    metallurgyTotalCost: optimalMetallurgyCost,
  };

  let fullBreathStrategy: StrategySummary | null = null;
  if (stage.breathMaterial) {
    const fullBreathResult = calculateExpectedCost(maxAttempts, 0);
    fullBreathStrategy = {
      label: '풀숨 전략',
      description: '모든 회차에 숨결 투입',
      expectedCost: fullBreathResult.expectedTotalCost,
      averageAttempts: fullBreathResult.averageAttempts,
      simulationDetails: fullBreathResult.simulationDetails,
      breathAttempts: fullBreathResult.breathAttempts,
      metallurgyAttempts: fullBreathResult.metallurgyAttempts,
      breathTotalCost: fullBreathResult.breathTotalCost,
      metallurgyTotalCost: fullBreathResult.metallurgyTotalCost,
    };
  }

  let fullMetallurgyStrategy: StrategySummary | null = null;
  if (stage.metallurgyMaterial) {
    const fullMetallurgyResult = calculateExpectedCost(0, maxAttempts);
    fullMetallurgyStrategy = {
      label: '풀책 전략',
      description: '모든 회차에 야금술 투입',
      expectedCost: fullMetallurgyResult.expectedTotalCost,
      averageAttempts: fullMetallurgyResult.averageAttempts,
      simulationDetails: fullMetallurgyResult.simulationDetails,
      breathAttempts: fullMetallurgyResult.breathAttempts,
      metallurgyAttempts: fullMetallurgyResult.metallurgyAttempts,
      breathTotalCost: fullMetallurgyResult.breathTotalCost,
      metallurgyTotalCost: fullMetallurgyResult.metallurgyTotalCost,
    };
  }

  let fullBothStrategy: StrategySummary | null = null;
  if (stage.breathMaterial && stage.metallurgyMaterial) {
    const fullBothResult = calculateExpectedCost(maxAttempts, maxAttempts);
    fullBothStrategy = {
      label: '풀숨 & 풀책 전략',
      description: '모든 회차에 숨결과 야금술 투입',
      expectedCost: fullBothResult.expectedTotalCost,
      averageAttempts: fullBothResult.averageAttempts,
      simulationDetails: fullBothResult.simulationDetails,
      breathAttempts: fullBothResult.breathAttempts,
      metallurgyAttempts: fullBothResult.metallurgyAttempts,
      breathTotalCost: fullBothResult.breathTotalCost,
      metallurgyTotalCost: fullBothResult.metallurgyTotalCost,
    };
  }

  const computeMaterialInsight = (
    type: 'breath' | 'metallurgy',
    strategy: StrategySummary | null,
    fallbackStrategy: StrategySummary | null,
    unitPrice: number,
    quantityPerUse: number,
    name: string
  ): MaterialValueInsight => {
    const available = quantityPerUse > 0;

    let reference: StrategySummary | null = null;
    let basis: 'optimal' | 'full' | 'none' = 'none';
    if (available) {
      if (strategy && ((type === 'breath' && strategy.breathAttempts > 0) || (type === 'metallurgy' && strategy.metallurgyAttempts > 0))) {
        reference = strategy;
        basis = 'optimal';
      } else if (fallbackStrategy) {
        const hasUsage = type === 'breath' ? fallbackStrategy.breathAttempts > 0 : fallbackStrategy.metallurgyAttempts > 0;
        if (hasUsage) {
          reference = fallbackStrategy;
          basis = 'full';
        }
      }
    }

    if (!reference) {
      return {
        name,
        available,
        usedCount: 0,
        quantityPerUse,
        marketPrice: unitPrice,
        actualValuePerItem: null,
        diffFromMarket: null,
        basis,
      };
    }

    const usedCount = type === 'breath' ? reference.breathAttempts : reference.metallurgyAttempts;
    const totalAuxCost = reference.breathTotalCost + reference.metallurgyTotalCost;
    const actualValueGain = baseStrategy.expectedCost - (reference.expectedCost - totalAuxCost);
    const totalItems = usedCount * quantityPerUse;
    const actualValuePerItem = totalItems > 0 ? actualValueGain / totalItems : null;
    const diffFromMarket = actualValuePerItem !== null ? actualValuePerItem - unitPrice : null;

    return {
      name,
      available,
      usedCount,
      quantityPerUse,
      marketPrice: unitPrice,
      actualValuePerItem,
      diffFromMarket,
      basis,
    };
  };

  const materialValueAnalysis: MaterialValueAnalysis = {
    breath: computeMaterialInsight('breath', optimalStrategy, fullBreathStrategy, breathUnitPrice, stage.breathMaterial?.quantity || 0, stage.breathMaterial?.name || BREATH_ITEM),
    metallurgy: computeMaterialInsight(
      'metallurgy',
      optimalStrategy,
      fullMetallurgyStrategy,
      stage.metallurgyMaterial ? metallurgyUnitPrice : 0,
      stage.metallurgyMaterial?.quantity || 0,
      stage.metallurgyMaterial?.name || '야금술'
    ),
  };

  return { optimalStrategy, baseStrategy, fullBreathStrategy, fullMetallurgyStrategy, fullBothStrategy, materialValueAnalysis };
}

function calculateScenarioSummaries(
  stage: RefiningStage,
  marketInfo: Record<string, MarketItemInfo>
): {
  scenarios: ScenarioSummary[];
  baseCostBreakdown: CostLine[];
  oneTimeCost: CostLine | null;
  optionalCosts: CostLine[];
} {
  const getUnitInfo = (name: string): MarketItemInfo => marketInfo[name] || { unitPrice: 0, icon: null };

  const baseCostBreakdown: CostLine[] = stage.baseMaterials.map((material) => {
    const info = getUnitInfo(material.name);
    return {
      name: material.name,
      quantity: material.quantity,
      unitPrice: info.unitPrice,
      totalPrice: info.unitPrice * material.quantity,
      icon: info.icon,
    };
  });

  const goldInfo = getUnitInfo(GOLD_ITEM);
  const goldUnitPrice = goldInfo.unitPrice || 1;
  const goldCost = stage.goldCost * goldUnitPrice;

  const perAttemptBaseCost = baseCostBreakdown.reduce((sum, item) => sum + item.totalPrice, 0) + goldCost;

  const expInfo = stage.expMaterial ? getUnitInfo(stage.expMaterial.name) : null;
  const oneTimeCost = stage.expMaterial
    ? {
        name: stage.expMaterial.name,
        quantity: stage.expMaterial.quantity,
        unitPrice: expInfo?.unitPrice || 0,
        totalPrice: (expInfo?.unitPrice || 0) * stage.expMaterial.quantity,
        icon: expInfo?.icon,
      }
    : null;

  const optionalCosts: CostLine[] = [];

  const breathInfo = stage.breathMaterial ? getUnitInfo(stage.breathMaterial.name) : null;
  const breathUnitPrice = stage.breathMaterial ? (breathInfo?.unitPrice || 0) : 0;
  const breathCost = stage.breathMaterial ? breathUnitPrice * stage.breathMaterial.quantity : 0;
  if (stage.breathMaterial) {
    optionalCosts.push({
      name: stage.breathMaterial.name,
      quantity: stage.breathMaterial.quantity,
      unitPrice: breathUnitPrice,
      totalPrice: breathCost,
      icon: breathInfo?.icon,
    });
  }

  const metallurgyInfo = stage.metallurgyMaterial ? getUnitInfo(stage.metallurgyMaterial.name) : null;
  const metallurgyUnitPrice = stage.metallurgyMaterial
    ? (metallurgyInfo?.unitPrice || 0)
    : 0;
  const metallurgyCost = stage.metallurgyMaterial ? metallurgyUnitPrice * stage.metallurgyMaterial.quantity : 0;
  if (stage.metallurgyMaterial) {
    optionalCosts.push({
      name: stage.metallurgyMaterial.name,
      quantity: stage.metallurgyMaterial.quantity,
      unitPrice: metallurgyUnitPrice,
      totalPrice: metallurgyCost,
      icon: metallurgyInfo?.icon,
    });
  }

  const baseRate = stage.baseSuccessRate;
  // 최초 성공률이 0.5%인 경우 보조 재료 보너스는 +1.0% 고정
  const isLowRate = stage.baseSuccessRate === 0.5;
  const bonusRate = isLowRate ? 1.0 : stage.baseSuccessRate;
  
  const breathRate = stage.breathMaterial ? clampRate(baseRate + bonusRate) : null;
  const metallurgyRate = stage.metallurgyMaterial ? clampRate(baseRate + bonusRate) : null;
  const bothRate = stage.breathMaterial && stage.metallurgyMaterial ? clampRate(baseRate + 2 * bonusRate) : null;

  const scenarios: ScenarioSummary[] = [
    {
      label: '기본',
      description: '보조 재료 미사용',
      cost: perAttemptBaseCost,
      successRate: clampRate(baseRate),
    },
  ];

  if (stage.breathMaterial) {
    scenarios.push({
      label: `${stage.breathMaterial.name} 사용`,
      description: '숨결만 추가',
      cost: perAttemptBaseCost + breathCost,
      successRate: breathRate,
    });
  }

  if (stage.metallurgyMaterial) {
    scenarios.push({
      label: `${stage.metallurgyMaterial.name} 사용`,
      description: '야금술만 추가',
      cost: perAttemptBaseCost + metallurgyCost,
      successRate: metallurgyRate,
    });
  }

  if (stage.breathMaterial && stage.metallurgyMaterial) {
    scenarios.push({
      label: `${stage.breathMaterial.name} & ${stage.metallurgyMaterial.name}`,
      description: '숨결과 야금술 모두 추가',
      cost: perAttemptBaseCost + breathCost + metallurgyCost,
      successRate: bothRate,
    });
  }

  return {
    scenarios,
    baseCostBreakdown,
    oneTimeCost,
    optionalCosts,
  };
}

function ItemIcon({ name, icon }: { name: string; icon?: string | null }) {
  const fallback = FALLBACK_ICON[name] || '📦';
  // icon이 없거나 빈 문자열이면 fallback 사용
  if (!icon || icon.trim() === '') {
    return <span className="w-6 h-6 flex items-center justify-center text-lg">{fallback}</span>;
  }
  return (
    <img 
      src={icon} 
      alt={name} 
      className="w-6 h-6 object-contain" 
      onError={(e) => {
        // 이미지 로드 실패 시 fallback으로 교체
        const target = e.target as HTMLImageElement;
        const parent = target.parentElement;
        if (parent) {
          target.style.display = 'none';
          if (!parent.querySelector('.fallback-icon')) {
            const fallbackSpan = document.createElement('span');
            fallbackSpan.className = 'w-6 h-6 flex items-center justify-center text-lg fallback-icon';
            fallbackSpan.textContent = fallback;
            parent.appendChild(fallbackSpan);
          }
        }
      }} 
    />
  );
}

type StageCardProps = {
  stage: RefiningStage;
  marketInfo: Record<string, MarketItemInfo>;
};

function StageCard({ stage, marketInfo }: StageCardProps) {
  const { adjustPrice } = usePriceAdjustment();
  
  // 가격 조정이 적용된 marketInfo 생성
  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    return adjusted;
  }, [marketInfo, adjustPrice]);

  const { scenarios, baseCostBreakdown, oneTimeCost, optionalCosts } = useMemo(
    () => calculateScenarioSummaries(stage, adjustedMarketInfo),
    [stage, adjustedMarketInfo]
  );

  const { optimalStrategy, baseStrategy, fullBreathStrategy, fullMetallurgyStrategy, fullBothStrategy, materialValueAnalysis } = useMemo(
    () => calculateOptimalStrategy(stage, adjustedMarketInfo),
    [stage, adjustedMarketInfo]
  );

  const [showOptimization, setShowOptimization] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);

  const goldLine: CostLine = {
    name: GOLD_ITEM,
    quantity: stage.goldCost,
    unitPrice: adjustedMarketInfo[GOLD_ITEM]?.unitPrice ?? 1,
    totalPrice: stage.goldCost * (adjustedMarketInfo[GOLD_ITEM]?.unitPrice ?? 1),
    icon: adjustedMarketInfo[GOLD_ITEM]?.icon,
  };

  const essentialLeft = baseCostBreakdown.filter(item => item.name !== GOLD_ITEM && item.name !== SILVER_ITEM);
  const essentialRight: CostLine[] = [];
  const silverLine = baseCostBreakdown.find(item => item.name === SILVER_ITEM);
  if (silverLine) {
    essentialRight.push(silverLine);
  }
  essentialRight.push(goldLine);

  return (
    <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h3 className="text-xl font-semibold text-white">{stage.level - 1} → {stage.level} 재련</h3>
            <p className="text-xs text-gray-300">기본 성공률: {formatRate(stage.baseSuccessRate)}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {oneTimeCost && (
          <div>
            <h4 className="text-xs font-semibold text-purple-200 mb-2">경험치 재료 (첫 시도 1회)</h4>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-3">
              <MaterialLine data={oneTimeCost} />
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-purple-200 mb-2">필수 재료 (시도당)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {essentialLeft.map(item => (
                <MaterialLine key={item.name} data={item} />
              ))}
              {essentialLeft.length === 0 && (
                <div className="px-4 py-3 text-xs text-gray-400">표시할 재료가 없습니다.</div>
              )}
            </div>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {essentialRight.map(item => (
                <MaterialLine key={item.name} data={item} />
              ))}
            </div>
          </div>
        </div>

        {optionalCosts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-purple-200 mb-2">보조 재료 (선택)</h4>
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {optionalCosts.map(item => (
                <MaterialLine key={item.name} data={item} />
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-purple-200 mb-2">1회 시도 비용 요약 (경험치 제외)</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-800 text-xs">
              <thead>
                <tr className="bg-gray-900/90 text-gray-200">
                  <th className="px-3 py-2 text-left font-medium">구분</th>
                  <th className="px-3 py-2 text-left font-medium">설명</th>
                  <th className="px-3 py-2 text-center font-medium">성공률</th>
                  <th className="px-3 py-2 text-right font-medium">총 비용</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr key={scenario.label} className="border-t border-gray-800">
                    <td className="px-3 py-2 text-white font-medium">{scenario.label}</td>
                    <td className="px-3 py-2 text-gray-300">{scenario.description}</td>
                    <td className="px-3 py-2 text-center text-blue-300">{formatRate(scenario.successRate)}</td>
                    <td className="px-3 py-2 text-right text-green-300">{formatCost(scenario.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-purple-200">재료 사용 최적화</h4>
            <button
              onClick={() => setShowOptimization(!showOptimization)}
              className="px-3 py-1 bg-purple-700/40 hover:bg-purple-700/60 text-white text-xs rounded-lg"
            >
              {showOptimization ? '숨기기' : '자세히 보기'}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-900/80 rounded-lg border border-gray-800 p-4 space-y-2">
              <h5 className="text-sm font-semibold text-white">{baseStrategy.label}</h5>
              <p className="text-xs text-gray-400">{baseStrategy.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">예상 비용:</span>
                  <span className="text-green-300 font-medium">{formatCost(baseStrategy.expectedCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">평균 시도 횟수:</span>
                  <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(baseStrategy.averageAttempts)}회</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/80 rounded-lg border border-purple-600 p-4 space-y-2">
              <h5 className="text-sm font-semibold text-purple-300">{optimalStrategy.label}</h5>
              <p className="text-xs text-gray-400">{optimalStrategy.description}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300">예상 비용:</span>
                  <span className="text-green-300 font-medium">{formatCost(optimalStrategy.expectedCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">평균 시도 횟수:</span>
                  <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(optimalStrategy.averageAttempts)}회</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-gray-300">기본 대비:</span>
                  {(() => {
                    const diff = optimalStrategy.expectedCost - baseStrategy.expectedCost;
                    if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                    const sign = diff > 0 ? '+' : '-';
                    const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                    return (
                      <span className={`${color} font-medium`}>
                        {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {(fullBreathStrategy || fullMetallurgyStrategy || fullBothStrategy) && (
            <div className="mt-3">
              <h5 className="text-xs font-semibold text-purple-200 mb-2">기타 전략</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {fullBreathStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-orange-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-orange-200">{fullBreathStrategy.label}</div>
                    <div className="text-gray-400">{fullBreathStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullBreathStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullBreathStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullBreathStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {fullMetallurgyStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-cyan-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-cyan-200">{fullMetallurgyStrategy.label}</div>
                    <div className="text-gray-400">{fullMetallurgyStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullMetallurgyStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullMetallurgyStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullMetallurgyStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {fullBothStrategy && (
                  <div className="bg-gray-900/80 rounded-lg border border-indigo-500/70 p-3 space-y-1 text-xs">
                    <div className="text-sm font-semibold text-indigo-200">{fullBothStrategy.label}</div>
                    <div className="text-gray-400">{fullBothStrategy.description}</div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">예상 비용</span>
                      <span className="text-green-300 font-medium">{formatCost(fullBothStrategy.expectedCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">평균 시도</span>
                      <span className="text-blue-300 font-medium">{formatNumberWithSignificantDigits(fullBothStrategy.averageAttempts)}회</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-700">
                      <span className="text-gray-300">기본 대비</span>
                      {(() => {
                        const diff = fullBothStrategy.expectedCost - baseStrategy.expectedCost;
                        if (Math.abs(diff) < 1e-6) return <span className="text-gray-400">동일</span>;
                        const sign = diff > 0 ? '+' : '-';
                        const color = diff > 0 ? 'text-red-300' : 'text-green-300';
                        return (
                          <span className={`${color} font-medium`}>
                            {sign}{formatNumberWithSignificantDigits(Math.abs(diff))} 골드
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {materialValueAnalysis && (
            <div className="mt-3 bg-gray-900/80 rounded-lg border border-gray-800 p-4">
              <h5 className="text-xs font-semibold text-purple-200 mb-3">보조 재료 가치 분석</h5>
              <div className="space-y-3 text-xs">
                {[materialValueAnalysis.breath, materialValueAnalysis.metallurgy].map((insight) => {
                  const totalAmount = insight.usedCount * insight.quantityPerUse;
                  const usageText = !insight.available
                    ? '사용 불가'
                    : insight.usedCount > 0
                      ? `사용 횟수: ${formatNumberWithSignificantDigits(insight.usedCount)}회${insight.quantityPerUse > 0 ? ` (총 ${formatNumberWithSignificantDigits(totalAmount)}개)` : ''}`
                      : '사용하지 않음';

                  const basisLabel = !insight.available || insight.basis === 'none'
                    ? ''
                    : insight.basis === 'optimal'
                      ? '기준: 최적 전략'
                      : '기준: 풀 전략';

                  const marketText = insight.marketPrice > 0
                    ? `${formatNumberWithSignificantDigits(insight.marketPrice)} 골드`
                    : '-';

                  const actualText = insight.actualValuePerItem !== null
                    ? `${formatNumberWithSignificantDigits(insight.actualValuePerItem)} 골드`
                    : '-';

                  const diff = insight.diffFromMarket;
                  const diffClass = diff === null
                    ? 'text-gray-400'
                    : diff >= 0
                      ? 'text-green-400'
                      : 'text-red-400';
                  const diffText = diff === null
                    ? '-'
                    : `${diff >= 0 ? '+' : '-'}${formatNumberWithSignificantDigits(Math.abs(diff))} 골드`;

                  return (
                    <div key={insight.name} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                      <div>
                        <div className="text-white font-medium">{insight.name}</div>
                        <div className="text-gray-400 text-xs">{usageText}</div>
                        {basisLabel && <div className="text-gray-500 text-xs">{basisLabel}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-gray-300">시장 단가: {marketText}</div>
                        <div className="text-blue-300">체감 가치: {actualText}</div>
                        <div className={diffClass}>차이: {diffText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showOptimization && (
            <div className="mt-3 bg-gray-900/80 rounded-lg border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-xs font-semibold text-purple-200">
                  시도별 시뮬레이션 상세 (총 {optimalStrategy.simulationDetails.length}회)
                </h5>
                {optimalStrategy.simulationDetails.length > 50 && (
                  <button
                    onClick={() => setShowAllDetails(!showAllDetails)}
                    className="px-2 py-1 bg-indigo-700/40 hover:bg-indigo-700/60 text-white text-xs rounded"
                  >
                    {showAllDetails ? '처음 50개만 보기' : '전체 보기'}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full text-xs border border-gray-700">
                  <thead className="bg-gray-900/90 text-gray-200 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-center">회차</th>
                      <th className="px-2 py-1 text-center">전략</th>
                      <th className="px-2 py-1 text-center">성공률</th>
                      <th className="px-2 py-1 text-center">장인의 기운</th>
                      <th className="px-2 py-1 text-right">비용</th>
                      <th className="px-2 py-1 text-center">누적 확률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllDetails 
                      ? optimalStrategy.simulationDetails 
                      : optimalStrategy.simulationDetails.slice(0, 50)
                    ).map((detail) => (
                      <tr key={detail.attempt} className="border-t border-gray-800">
                        <td className="px-2 py-1 text-center text-white">{detail.attempt}</td>
                        <td className="px-2 py-1 text-center text-gray-300">{detail.strategy}</td>
                        <td className="px-2 py-1 text-center text-blue-300">{formatRate(detail.actualRate)}</td>
                        <td className="px-2 py-1 text-center text-purple-300">{detail.artisanEnergy.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-green-300">{formatCost(detail.cost)}</td>
                        <td className="px-2 py-1 text-center text-yellow-300">{formatNumberWithSignificantDigits(detail.cumulativeProbability * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialLine({
  data,
}: {
  data: CostLine;
}) {
  const quantityText = formatNumberWithSignificantDigits(data.quantity);
  const isSilver = data.name === SILVER_ITEM;
  const isGold = data.name === GOLD_ITEM;
  const unitText = !isGold && !isSilver && data.unitPrice > 0
    ? `${formatNumberWithSignificantDigits(data.unitPrice)} 골드`
    : '-';
  const totalText = !isGold && !isSilver && data.totalPrice > 0
    ? `${formatNumberWithSignificantDigits(data.totalPrice)} 골드`
    : '-';
  const iconUrl = data.icon;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-white">
        {isGold || isSilver ? null : <ItemIcon name={data.name} icon={iconUrl} />}
        <span className="font-medium">{data.name}</span>
      </div>
      <div className="flex flex-col text-right text-xs text-gray-300">
        <span>
          수량: {quantityText}
          {isGold ? ' 골드' : ''}
          {isSilver ? ' 실링' : ''}
        </span>
        {!isGold && !isSilver && (
          <>
            <span>단가: {unitText}</span>
            <span>합계: {totalText}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function RefiningSimulationClient({ weaponStages, armorStages, marketInfo, lastUpdated }: Props) {
  const { adjustPrice } = usePriceAdjustment();
  
  // 가격 조정이 적용된 marketInfo 생성 (요약표와 특수재련효율에서 사용)
  const adjustedMarketInfo = useMemo(() => {
    const adjusted: Record<string, MarketItemInfo> = {};
    for (const [name, info] of Object.entries(marketInfo)) {
      adjusted[name] = {
        ...info,
        unitPrice: adjustPrice(name, info.unitPrice) ?? info.unitPrice,
      };
    }
    return adjusted;
  }, [marketInfo, adjustPrice]);

  const [activeSubTab, setActiveSubTab] = useState<'simulation' | 'special' | 'character'>('simulation');
  const [activeSimulationTab, setActiveSimulationTab] = useState<'weapon' | 'armor' | 'summary'>('weapon');
  const [selectedTier, setSelectedTier] = useState<'basic' | 'upper'>('basic');
  
  const currentStages = activeSimulationTab === 'weapon' ? weaponStages : activeSimulationTab === 'armor' ? armorStages : [];
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>(currentStages[0]?.level ?? 'all');
  
  // 탭 변경 시 selectedLevel 업데이트
  useEffect(() => {
    if (currentStages.length > 0 && activeSimulationTab !== 'summary') {
      setSelectedLevel(currentStages[0]?.level ?? 'all');
    }
  }, [activeSimulationTab, currentStages]);
  
  const options = useMemo(() => currentStages.map(stage => stage.level), [currentStages]);
  const filteredStages = useMemo(() => {
    if (selectedLevel === 'all') return currentStages;
    return currentStages.filter(stage => stage.level === selectedLevel);
  }, [selectedLevel, currentStages]);

  // 탭 변경 시 selectedLevel 초기화
  const handleSimulationTabChange = (tab: 'weapon' | 'armor' | 'summary') => {
    setActiveSimulationTab(tab);
  };

  // 요약표 데이터 계산
  const summaryData = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStages.map(s => s.level), ...armorStages.map(s => s.level)])).sort((a, b) => a - b);
    
    return allLevels.map(level => {
      const weaponStage = weaponStages.find(s => s.level === level);
      const armorStage = armorStages.find(s => s.level === level);
      
      let weaponCost: number | null = null;
      let weaponStrategy: string = '-';
      let armorCost: number | null = null;
      let armorStrategy: string = '-';
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        weaponCost = optimalStrategy.expectedCost;
        weaponStrategy = getDetailedStrategyLabel(optimalStrategy, weaponStage, 'weapon');
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        armorCost = optimalStrategy.expectedCost;
        armorStrategy = getDetailedStrategyLabel(optimalStrategy, armorStage, 'armor');
      }
      
      const totalCost = weaponCost != null && armorCost != null 
        ? weaponCost + (armorCost * 5)
        : null;
      
      return {
        level,
        weaponCost,
        weaponStrategy,
        armorCost,
        armorStrategy,
        totalCost,
      };
    });
  }, [weaponStages, armorStages, adjustedMarketInfo]);

  // 특수재련효율 데이터 계산
  const specialRefiningData = useMemo(() => {
    const allLevels = Array.from(new Set([...weaponStages.map(s => s.level), ...armorStages.map(s => s.level)])).sort((a, b) => a - b);
    
    // 순환 돌파석 소모 개수 계산
    const getBreakthroughStoneCount = (level: number, type: 'weapon' | 'armor'): number => {
      if (type === 'weapon') {
        if (level >= 10 && level <= 12) return 30;
        if (level >= 13 && level <= 16) return 40;
        if (level >= 17 && level <= 25) return 50;
      } else {
        if (level >= 10 && level <= 12) return 12;
        if (level >= 13 && level <= 16) return 16;
        if (level >= 17 && level <= 25) return 20;
      }
      return 0;
    };
    
    return allLevels.map((level, idx) => {
      const weaponStage = weaponStages.find(s => s.level === level);
      const armorStage = armorStages.find(s => s.level === level);
      
      let weaponValue: number | null = null;
      let armorValue: number | null = null;
      
      if (weaponStage) {
        const { optimalStrategy } = calculateOptimalStrategy(weaponStage, adjustedMarketInfo);
        const expInfo = weaponStage.expMaterial ? (adjustedMarketInfo[weaponStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = weaponStage.expMaterial && expInfo
          ? expInfo.unitPrice * weaponStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = weaponStage.baseSuccessRate / 100; // 퍼센트를 소수로 변환
        const stoneCount = getBreakthroughStoneCount(level, 'weapon');
        
        if (stoneCount > 0) {
          weaponValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      if (armorStage) {
        const { optimalStrategy } = calculateOptimalStrategy(armorStage, adjustedMarketInfo);
        const expInfo = armorStage.expMaterial ? (adjustedMarketInfo[armorStage.expMaterial.name] || { unitPrice: 0 }) : null;
        const expMaterialCost = armorStage.expMaterial && expInfo
          ? expInfo.unitPrice * armorStage.expMaterial.quantity
          : 0;
        
        const refiningCost = optimalStrategy.expectedCost - expMaterialCost;
        const baseSuccessRate = armorStage.baseSuccessRate / 100; // 퍼센트를 소수로 변환
        const stoneCount = getBreakthroughStoneCount(level, 'armor');
        
        if (stoneCount > 0) {
          armorValue = (refiningCost * baseSuccessRate) / stoneCount;
        }
      }
      
      return {
        level,
        idx,
        weaponValue,
        armorValue,
      };
    });
  }, [weaponStages, armorStages, adjustedMarketInfo]);

  // 전략 라벨을 간단한 형태로 변환
  function getStrategyLabel(description: string, stage: RefiningStage): string {
    if (description.includes('보조 재료 미사용') || description.includes('기본 전략과 동일')) {
      return '기본';
    }
    
    // 풀숨&풀책 전략 확인 (모든 회차에 둘 다 사용)
    if (description.includes('모든 회차에 숨결과 야금술')) {
      return '풀숨&풀책';
    }
    
    // 풀숨 전략 확인 (모든 회차에 숨결만 사용)
    if (description.includes('모든 회차에 숨결')) {
      return '풀숨';
    }
    
    // 풀책 전략 확인 (모든 회차에 야금술만 사용)
    if (description.includes('모든 회차에 야금술')) {
      return '풀책';
    }
    
    // 숨결과 야금술 모두 사용 (일부 회차)
    if (description.includes('숨결') && description.includes('야금술')) {
      // 숫자 추출
      const breathMatch = description.match(/숨결\s*(\d+)/);
      const metallurgyMatch = description.match(/야금술\s*(\d+)/);
      if (breathMatch && metallurgyMatch) {
        const breathCount = parseInt(breathMatch[1]);
        const metallurgyCount = parseInt(metallurgyMatch[1]);
        const maxAttempts = 500; // calculateOptimalStrategy에서 사용하는 maxAttempts
        if (breathCount >= maxAttempts && metallurgyCount >= maxAttempts) {
          return '풀숨&풀책';
        }
      }
      return '숨결&야금술';
    }
    
    // 숨결만 사용
    if (description.includes('숨결')) {
      const breathMatch = description.match(/숨결\s*(\d+)/);
      if (breathMatch) {
        const breathCount = parseInt(breathMatch[1]);
        const maxAttempts = 500;
        if (breathCount >= maxAttempts) {
          return '풀숨';
        }
      }
      return '숨결';
    }
    
    // 야금술만 사용
    if (description.includes('야금술')) {
      const metallurgyMatch = description.match(/야금술\s*(\d+)/);
      if (metallurgyMatch) {
        const metallurgyCount = parseInt(metallurgyMatch[1]);
        const maxAttempts = 500;
        if (metallurgyCount >= maxAttempts) {
          return '풀책';
        }
      }
      return '야금술';
    }
    
    return '기본';
  }

  // 상세한 전략 라벨 생성 (요약표용)
  function getDetailedStrategyLabel(strategy: StrategySummary, stage: RefiningStage, type: 'weapon' | 'armor'): string {
    if (strategy.breathAttempts === 0 && strategy.metallurgyAttempts === 0) {
      return '기본';
    }

    const maxAttempts = 500;
    const breathName = type === 'weapon' ? '숨결' : (stage.breathMaterial?.name.includes('빙하') ? '숨결' : '숨결');
    const craftName = type === 'weapon' ? '야금술' : '재봉술';

    const parts: string[] = [];

    if (strategy.breathAttempts > 0) {
      if (strategy.breathAttempts >= maxAttempts) {
        parts.push(`${breathName} Full 투입`);
      } else {
        parts.push(`${breathName} ${strategy.breathAttempts}회 투입`);
      }
    }

    if (strategy.metallurgyAttempts > 0) {
      if (strategy.metallurgyAttempts >= maxAttempts) {
        parts.push(`${craftName} Full 투입`);
      } else {
        parts.push(`${craftName} ${strategy.metallurgyAttempts}회 투입`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : '기본';
  }

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="space-y-8">
        <header className="space-y-3 mb-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">재련 효율</h1>
            {lastUpdated && (
              <p className="text-xs text-gray-500">시세 기준 시각: {new Date(lastUpdated).toLocaleString('ko-KR')}</p>
            )}
          </div>
        </header>

        {/* 서브탭 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setActiveSubTab('simulation')}
            className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
              activeSubTab === 'simulation'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
            }`}
          >
            재련 시뮬레이션
          </button>
          <button
            onClick={() => setActiveSubTab('special')}
            className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
              activeSubTab === 'special'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
            }`}
          >
            특수 재련 효율
          </button>
          <button
            onClick={() => setActiveSubTab('character')}
            className={`px-6 py-2 rounded-lg font-semibold border transition-colors ${
              activeSubTab === 'character'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-500'
            }`}
          >
            내 캐릭터 시뮬레이션
          </button>
        </div>

        {/* 서브탭 콘텐츠 */}
        {activeSubTab === 'simulation' && (
          <div className="space-y-8">
            {/* 재련 시뮬레이션 서브서브탭 */}
            <div className="flex gap-2 border-b border-gray-700">
              <button
                onClick={() => handleSimulationTabChange('weapon')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'weapon'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                무기
              </button>
              <button
                onClick={() => handleSimulationTabChange('armor')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'armor'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                방어구
              </button>
              <button
                onClick={() => handleSimulationTabChange('summary')}
                className={`px-6 py-2 rounded-t-lg font-semibold text-sm ${
                  activeSimulationTab === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                요약표
              </button>
            </div>

            {/* 무기 탭 콘텐츠 */}
            {activeSimulationTab === 'weapon' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    목표 재련 수치별 필요 재료와 1회 시도 비용을 계산합니다. 보조 재료 사용 시 성공률 증가 효과와 비용 변화를 함께 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="tier-select" className="text-sm text-gray-300">등급 선택</label>
                    <select
                      id="tier-select"
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTier(e.target.value as 'basic' | 'upper');
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="basic">티어4 기본</option>
                      <option value="upper">티어4 상위 (세르카 장비)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="refine-level" className="text-sm text-gray-300">재련 단계 선택</label>
                    <select
                      id="refine-level"
                      value={selectedLevel === 'all' ? 'all' : String(selectedLevel)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedLevel(value === 'all' ? 'all' : Number(value));
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="all">전체 보기</option>
                      {options.map(level => (
                        <option key={level} value={level}>{level - 1} → {level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {filteredStages.map(stage => (
                    <StageCard key={stage.level} stage={stage} marketInfo={marketInfo} />
                  ))}
                </div>
              </div>
            )}

            {/* 방어구 탭 콘텐츠 */}
            {activeSimulationTab === 'armor' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    목표 재련 수치별 필요 재료와 1회 시도 비용을 계산합니다. 보조 재료 사용 시 성공률 증가 효과와 비용 변화를 함께 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label htmlFor="tier-select-armor" className="text-sm text-gray-300">등급 선택</label>
                    <select
                      id="tier-select-armor"
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTier(e.target.value as 'basic' | 'upper');
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="basic">티어4 기본</option>
                      <option value="upper">티어4 상위 (세르카 장비)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="refine-level-armor" className="text-sm text-gray-300">재련 단계 선택</label>
                    <select
                      id="refine-level-armor"
                      value={selectedLevel === 'all' ? 'all' : String(selectedLevel)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedLevel(value === 'all' ? 'all' : Number(value));
                      }}
                      className="px-3 py-2 bg-gray-900 text-white text-sm border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                    >
                      <option value="all">전체 보기</option>
                      {options.map(level => (
                        <option key={level} value={level}>{level - 1} → {level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {filteredStages.map(stage => (
                    <StageCard key={stage.level} stage={stage} marketInfo={marketInfo} />
                  ))}
                </div>
              </div>
            )}

            {/* 요약표 탭 콘텐츠 */}
            {activeSimulationTab === 'summary' && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    무기와 방어구의 재련 비용을 한눈에 비교할 수 있는 요약표입니다. 6부위 합계는 [무기 재련 비용 + 방어구 재련 비용 × 5]로 계산됩니다.
                  </p>
                </div>

                {/* 요약표 */}
                <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-800 text-sm">
                      <thead>
                        <tr className="bg-gray-900/90 text-gray-200">
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">목표 재련 단계</th>
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">재련 비용(무기)</th>
                          <th className="px-4 py-3 text-left font-medium border-b border-gray-700">재련 비용(방어구)</th>
                          <th className="px-4 py-3 text-right font-medium border-b border-gray-700">6부위 합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.map((row, idx) => (
                          <tr key={row.level} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                            <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                              {row.level - 1} → {row.level}강
                            </td>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                              {row.weaponCost != null ? (
                                <div>
                                  <div>{formatCost(row.weaponCost)}</div>
                                  <div className="text-xs text-gray-400">(최적 전략: {row.weaponStrategy})</div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-300 border-b border-gray-800">
                              {row.armorCost != null ? (
                                <div>
                                  <div>{formatCost(row.armorCost)}</div>
                                  <div className="text-xs text-gray-400">(최적 전략: {row.armorStrategy})</div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-green-300 font-medium border-b border-gray-800">
                              {row.totalCost != null ? formatCost(row.totalCost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'character' && (
          <CharacterSimulation weaponStages={weaponStages} armorStages={armorStages} marketInfo={marketInfo} />
        )}

        {activeSubTab === 'special' && (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="text-gray-300 text-sm">
                순환 돌파석을 사용한 특수 재련의 효율을 계산합니다. 순환 돌파석 1개당 기대 가치를 확인할 수 있습니다.
              </p>
            </div>

            {/* 특수 재련 효율 표 */}
            <div className="bg-gray-900/70 rounded-lg border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-800 text-sm">
                  <thead>
                    <tr className="bg-gray-900/90 text-gray-200">
                      <th className="px-4 py-3 text-left font-medium border-b border-gray-700">목표 재련 단계</th>
                      <th className="px-4 py-3 text-right font-medium border-b border-gray-700">순환 돌파석 1개당 (무기)</th>
                      <th className="px-4 py-3 text-right font-medium border-b border-gray-700">순환 돌파석 1개당 (방어구)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialRefiningData.map(({ level, idx, weaponValue, armorValue }) => (
                      <tr key={level} className={idx % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/50'}>
                        <td className="px-4 py-3 text-white font-medium border-b border-gray-800">
                          {level - 1} → {level}강
                        </td>
                        <td className="px-4 py-3 text-right text-blue-300 border-b border-gray-800">
                          {weaponValue != null ? formatCost(weaponValue) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-purple-300 border-b border-gray-800">
                          {armorValue != null ? formatCost(armorValue) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
