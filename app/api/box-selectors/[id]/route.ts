import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// GET: 특정 상자 선택 도우미 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: '상자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('상자 선택 도우미 조회 실패:', error);
    return NextResponse.json({ error: '상자 선택 도우미 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 상자 선택 도우미 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .update({
        box_name,
        item_name: item_name || null,
        acquisition_source: acquisition_source || null,
        box_data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('상자 선택 도우미 업데이트 실패:', error);
    return NextResponse.json({ error: '상자 선택 도우미 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 상자 선택 도우미 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { error } = await supabase
      .from('saved_box_selectors')
      .delete()
      .eq('id', params.id);

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('상자 선택 도우미 삭제 실패:', error);
    return NextResponse.json({ error: '상자 선택 도우미 삭제에 실패했습니다.' }, { status: 500 });
  }
}
