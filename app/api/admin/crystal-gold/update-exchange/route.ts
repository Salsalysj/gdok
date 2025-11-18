import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Supabase 클라이언트 생성 (서버 사이드에서는 서비스 키 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function fetchLatestExchange(): Promise<{ exchange: number; timestamp: string } | null> {
  try {
    const response = await fetch('https://loatool.taeu.kr/api/crystal-history/ohlc/1h', {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.error('크리스탈 환율 API 응답 오류:', response.status, response.statusText);
      return null;
    }

    const ohlcData = await response.json();
    if (!Array.isArray(ohlcData) || ohlcData.length === 0) {
      return null;
    }

    const lastEntry = ohlcData[ohlcData.length - 1];
    const closeValue = Number(lastEntry?.close);
    const timestamp = typeof lastEntry?.dt === 'string' ? lastEntry.dt : new Date().toISOString();

    if (Number.isNaN(closeValue) || closeValue <= 0) {
      return null;
    }

    return { exchange: closeValue, timestamp };
  } catch (err) {
    console.error('크리스탈 환율 API 호출 실패:', err);
    return null;
  }
}

async function saveExchangeToSupabase(exchange: number, timestamp: string): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase 클라이언트가 초기화되지 않았습니다.');
    return false;
  }

  try {
    // timestamp를 시간 단위로 정규화 (같은 시간대의 중복 방지)
    const timestampDate = new Date(timestamp);
    const normalizedTimestamp = new Date(
      timestampDate.getFullYear(),
      timestampDate.getMonth(),
      timestampDate.getDate(),
      timestampDate.getHours(),
      0,
      0,
      0
    ).toISOString();

    // 실제 갱신 시간 (현재 시간)
    const now = new Date().toISOString();
    const sourceTimestamp = !Number.isNaN(timestampDate.getTime())
      ? timestampDate.toISOString()
      : now;

    // UPSERT: 같은 timestamp가 있으면 업데이트, 없으면 삽입
    // updated_at 컬럼이 없을 수 있으므로 먼저 시도하고, 실패하면 updated_at 없이 재시도
    let upsertData: any = {
      timestamp: normalizedTimestamp,
      exchange: exchange,
      updated_at: now,
      source_timestamp: sourceTimestamp,
    };

    const { error } = await supabase
      .from('crystal_exchange_rates')
      .upsert(upsertData, {
        onConflict: 'timestamp',
      });

    if (error) {
      // updated_at 컬럼이 없을 수 있으므로 다시 시도
      const errorMessage = error.message || JSON.stringify(error);
      if (
        errorMessage.includes('updated_at') ||
        errorMessage.includes('source_timestamp') ||
        errorMessage.includes('column') ||
        error.code === '42703'
      ) {
        if (errorMessage.includes('updated_at')) {
          console.warn('updated_at 컬럼이 없어서 제외하고 저장합니다. Supabase 테이블에 컬럼을 추가해주세요.');
          delete upsertData.updated_at;
        }
        if (errorMessage.includes('source_timestamp')) {
          console.warn('source_timestamp 컬럼이 없어서 제외하고 저장합니다. Supabase 테이블에 컬럼을 추가해주세요.');
          delete upsertData.source_timestamp;
        }

        const { error: error2 } = await supabase
          .from('crystal_exchange_rates')
          .upsert(upsertData, {
            onConflict: 'timestamp',
          });
        
        if (error2) {
          console.error('Supabase 저장 실패 (상세):', JSON.stringify(error2, null, 2));
          return false;
        }
      } else {
        console.error('Supabase 저장 실패 (상세):', JSON.stringify(error, null, 2));
        return false;
      }
    }

    // 30일 이상 된 데이터 삭제
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await supabase
      .from('crystal_exchange_rates')
      .delete()
      .lt('timestamp', thirtyDaysAgo.toISOString());

    return true;
  } catch (err) {
    console.error('Supabase 저장 중 오류:', err);
    return false;
  }
}

// POST: 크리스탈 환율 갱신 (스케줄러용)
export async function POST() {
  try {
    const fetched = await fetchLatestExchange();
    
    if (!fetched) {
      return NextResponse.json(
        { error: '크리스탈 환율을 가져올 수 없습니다.' },
        { status: 500 }
      );
    }

    const saved = await saveExchangeToSupabase(fetched.exchange, fetched.timestamp);
    
    if (!saved) {
      return NextResponse.json(
        { error: 'Supabase에 저장할 수 없습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      exchange: fetched.exchange,
      timestamp: fetched.timestamp,
    });
  } catch (error) {
    console.error('크리스탈 환율 갱신 실패:', error);
    return NextResponse.json(
      { error: '크리스탈 환율 갱신 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

