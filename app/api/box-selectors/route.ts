import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// GET: 저장된 상자 선택 도우미 목록 조회
export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('saved_box_selectors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('상자 선택 도우미 조회 실패:', error);
    return NextResponse.json({ error: '상자 선택 도우미 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 상자 선택 도우미 저장
export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { box_name, item_name, acquisition_source, box_data } = body;

    if (!box_name || !box_data) {
      return NextResponse.json(
        { error: '상자명과 상자 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_box_selectors')
      .insert([
        {
          box_name,
          item_name: item_name || null,
          acquisition_source: acquisition_source || null,
          box_data,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('상자 선택 도우미 저장 실패:', error);
    return NextResponse.json({ error: '상자 선택 도우미 저장에 실패했습니다.' }, { status: 500 });
  }
}
