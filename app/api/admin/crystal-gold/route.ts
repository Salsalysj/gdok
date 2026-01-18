import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { isPackageSaveAllowed } from '@/lib/environment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'crystal-gold-rates.json');

// Supabase 클라이언트 생성 (서버 사이드에서는 서비스 키 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

type ExchangeRateEntry = {
  date: string;
  exchange: number; // 화폐거래소 100크리당 골드
  discord: number;  // 디스코드 100:n에서 n 값
};

type CrystalGoldRatesData = {
  exchangeRates: ExchangeRateEntry[];
};

async function readRates(): Promise<CrystalGoldRatesData> {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 파일이 없으면 빈 배열 반환
    return { exchangeRates: [] };
  }
}

async function writeRates(data: CrystalGoldRatesData): Promise<void> {
  const dataDir = path.dirname(DATA_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function getLatestExchangeFromSupabase(): Promise<{
  exchange: number;
  timestamp: string;
  updatedAt: string | null;
  sourceTimestamp: string | null;
} | null> {
  if (!supabase) {
    console.error('Supabase 클라이언트가 초기화되지 않았습니다.');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('crystal_exchange_rates')
      .select('timestamp, exchange, updated_at, source_timestamp, created_at')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 데이터가 없음
        return null;
      }
      console.error('Supabase 조회 실패:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      exchange: Number(data.exchange),
      timestamp: data.timestamp,
      updatedAt: data.updated_at || data.created_at || null,
      sourceTimestamp: data.source_timestamp || data.timestamp || null,
    };
  } catch (err) {
    console.error('Supabase 조회 중 오류:', err);
    return null;
  }
}

async function getLatestDiscordFromSupabase(): Promise<{
  discord: number;
  timestamp: string;
  updatedAt: string | null;
} | null> {
  if (!supabase) {
    console.error('Supabase 클라이언트가 초기화되지 않았습니다.');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('discord_exchange_rates')
      .select('timestamp, discord, updated_at, created_at')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 데이터가 없음
        return null;
      }
      console.error('Supabase 디스코드 환율 조회 실패:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      discord: Number(data.discord),
      timestamp: data.timestamp,
      updatedAt: data.updated_at || data.created_at || null,
    };
  } catch (err) {
    console.error('Supabase 디스코드 환율 조회 중 오류:', err);
    return null;
  }
}

async function saveDiscordToSupabase(discord: number): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase 클라이언트가 초기화되지 않았습니다.');
    return false;
  }

  try {
    // 오늘 날짜를 시작 시간으로 정규화 (같은 날짜의 중복 방지)
    const today = new Date();
    const normalizedTimestamp = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0
    ).toISOString();

    const now = new Date().toISOString();

    const upsertData = {
      timestamp: normalizedTimestamp,
      discord: discord,
      updated_at: now,
    };

    const { error } = await supabase
      .from('discord_exchange_rates')
      .upsert(upsertData, {
        onConflict: 'timestamp',
      });

    if (error) {
      console.error('Supabase 디스코드 환율 저장 실패:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Supabase 디스코드 환율 저장 중 오류:', err);
    return false;
  }
}

// GET: 환율 기록 조회
export async function GET() {
  try {
    // Supabase에서 최신 환율 가져오기
    const cachedExchange = await getLatestExchangeFromSupabase();
    const cachedDiscord = await getLatestDiscordFromSupabase();

    return NextResponse.json({
      exchange: cachedExchange?.exchange ?? null,
      exchangeTimestamp: cachedExchange?.sourceTimestamp ?? cachedExchange?.timestamp ?? null,
      updatedAt: cachedExchange?.updatedAt ?? null, // 실제 갱신 시간
      discord: cachedDiscord?.discord ?? null,
      discordTimestamp: cachedDiscord?.timestamp ?? null,
      discordUpdatedAt: cachedDiscord?.updatedAt ?? null,
      // 하위 호환성을 위해 exchangeRates 유지 (빈 배열)
      exchangeRates: [],
    });
  } catch (error) {
    console.error('환율 기록 조회 실패:', error);
    return NextResponse.json(
      { error: '환율 기록을 불러올 수 없습니다.' },
      { status: 500 }
    );
  }
}

// POST: 디스코드 환율 기록 추가 (관리자 입력용, Supabase에 저장)
export async function POST(request: NextRequest) {
  try {
    // 환경 변수 체크: main 브랜치 production에서는 차단
    if (!isPackageSaveAllowed()) {
      return NextResponse.json(
        { error: '프로덕션 환경에서는 디스코드 환율을 수정할 수 없습니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { discord } = body;

    if (typeof discord !== 'number') {
      return NextResponse.json(
        { error: '디스코드 값을 숫자로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (discord <= 0) {
      return NextResponse.json(
        { error: '값은 0보다 커야 합니다.' },
        { status: 400 }
      );
    }

    // 디스코드 값은 정수로 변환
    const discordValue = Math.round(discord);

    // Supabase에 저장
    const success = await saveDiscordToSupabase(discordValue);
    
    if (!success) {
      return NextResponse.json(
        { error: '디스코드 환율을 Supabase에 저장할 수 없습니다.' },
        { status: 500 }
      );
    }

    // 저장된 데이터 반환
    const savedData = await getLatestDiscordFromSupabase();

    return NextResponse.json({ 
      success: true,
      data: savedData ? {
        date: savedData.timestamp.split('T')[0],
        discord: savedData.discord,
      } : null
    });
  } catch (error) {
    console.error('환율 기록 저장 실패:', error);
    return NextResponse.json(
      { error: '환율 기록을 저장할 수 없습니다.' },
      { status: 500 }
    );
  }
}

