import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// GET: 저장된 이벤트 상점 목록 조회
export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('saved_event_shops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shops: data || [] });
  } catch (error: any) {
    console.error('이벤트 상점 조회 실패:', error);
    return NextResponse.json({ error: '이벤트 상점 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 이벤트 상점 저장
export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { shop_name, shop_data, start_date, end_date } = body;

    if (!shop_name || !shop_data) {
      return NextResponse.json(
        { error: '상점명과 상점 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_event_shops')
      .insert([
        {
          shop_name,
          shop_data,
          start_date: start_date || null,
          end_date: end_date || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shop: data });
  } catch (error: any) {
    console.error('이벤트 상점 저장 실패:', error);
    return NextResponse.json({ error: '이벤트 상점 저장에 실패했습니다.' }, { status: 500 });
  }
}

