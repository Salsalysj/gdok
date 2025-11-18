import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

// GET: 환율 기록 조회
export async function GET() {
  try {
    // Supabase에서 최신 환율 가져오기
    const cachedExchange = await getLatestExchangeFromSupabase();

    // 디스코드 환율은 기존 데이터에서 가져오기 (관리자 입력)
    const data = await readRates();
    const latestDiscordRate = data.exchangeRates.length > 0
      ? data.exchangeRates[data.exchangeRates.length - 1]?.discord ?? null
      : null;

    return NextResponse.json({
      exchange: cachedExchange?.exchange ?? null,
      exchangeTimestamp: cachedExchange?.sourceTimestamp ?? cachedExchange?.timestamp ?? null,
      updatedAt: cachedExchange?.updatedAt ?? null, // 실제 갱신 시간
      discord: latestDiscordRate,
      // 하위 호환성을 위해 exchangeRates 유지 (디스코드만 사용)
      exchangeRates: data.exchangeRates,
    });
  } catch (error) {
    console.error('환율 기록 조회 실패:', error);
    return NextResponse.json(
      { error: '환율 기록을 불러올 수 없습니다.' },
      { status: 500 }
    );
  }
}

// POST: 디스코드 환율 기록 추가 (관리자 입력용, 화폐거래소 환율은 더 이상 사용하지 않음)
export async function POST(request: NextRequest) {
  try {
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

    const data = await readRates();
    
    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0];
    
    // 오늘 날짜의 기존 기록이 있으면 업데이트, 없으면 추가
    const existingIndex = data.exchangeRates.findIndex(entry => entry.date === today);
    
    if (existingIndex >= 0) {
      // 기존 기록 업데이트 (디스코드만 업데이트)
      data.exchangeRates[existingIndex] = {
        date: today,
        exchange: 0, // 더 이상 사용하지 않음
        discord: discordValue,
      };
    } else {
      // 새 기록 추가
      data.exchangeRates.push({
        date: today,
        exchange: 0, // 더 이상 사용하지 않음
        discord: discordValue,
      });
    }

    // 날짜순으로 정렬 (오래된 것부터)
    data.exchangeRates.sort((a, b) => a.date.localeCompare(b.date));

    await writeRates(data);

    return NextResponse.json({ 
      success: true,
      data: data.exchangeRates[data.exchangeRates.length - 1]
    });
  } catch (error) {
    console.error('환율 기록 저장 실패:', error);
    return NextResponse.json(
      { error: '환율 기록을 저장할 수 없습니다.' },
      { status: 500 }
    );
  }
}

