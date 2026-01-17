import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';
import { isPackageSaveAllowed } from '@/lib/environment';

// GET: 저장된 이벤트 효율 목록 조회
export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('saved_event_efficiency')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    console.error('이벤트 효율 조회 실패:', error);
    return NextResponse.json({ error: '이벤트 효율 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 이벤트 효율 저장
export async function POST(request: NextRequest) {
  // main 브랜치 production 환경이 아닐 때 허용
  if (!isPackageSaveAllowed()) {
    return NextResponse.json(
      { error: '이벤트 효율 저장 기능은 main 브랜치 production 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { name, weekly_rewards, cumulative_rewards, end_date, total_weeks, total_hours } = body;

    if (!name || !weekly_rewards || !cumulative_rewards) {
      return NextResponse.json(
        { error: '이름, 주간 보상, 누적 보상 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_event_efficiency')
      .insert([
        {
          name,
          weekly_rewards,
          cumulative_rewards,
          end_date: end_date || null,
          total_weeks: total_weeks != null ? total_weeks : null,
          total_hours: total_hours != null ? total_hours : null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error: any) {
    console.error('이벤트 효율 저장 실패:', error);
    return NextResponse.json({ error: '이벤트 효율 저장에 실패했습니다.' }, { status: 500 });
  }
}

