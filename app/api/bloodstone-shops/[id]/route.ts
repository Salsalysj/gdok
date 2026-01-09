import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// GET: 특정 혈석 상점 조회
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
    const { id } = params;

    const { data, error } = await supabase
      .from('saved_bloodstone_shops')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '혈석 상점을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ shop: data });
  } catch (error: any) {
    console.error('혈석 상점 조회 실패:', error);
    return NextResponse.json({ error: '혈석 상점 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 혈석 상점 업데이트
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
    const { shop_name, shop_data } = body;
    const { id } = params;

    if (!shop_name || !shop_data) {
      return NextResponse.json(
        { error: '상점명과 상점 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_bloodstone_shops')
      .update({
        shop_name,
        shop_data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '혈석 상점을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ shop: data });
  } catch (error: any) {
    console.error('혈석 상점 업데이트 실패:', error);
    return NextResponse.json({ error: '혈석 상점 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 혈석 상점 삭제
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
    const { id } = params;

    const { error } = await supabase
      .from('saved_bloodstone_shops')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('혈석 상점 삭제 실패:', error);
    return NextResponse.json({ error: '혈석 상점 삭제에 실패했습니다.' }, { status: 500 });
  }
}
