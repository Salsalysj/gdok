import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// GET: 특정 혈석 상점 교환 조회
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
      .from('saved_bloodstone_shops')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '혈석 상점 교환을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ shop: data });
  } catch (error: any) {
    console.error('혈석 상점 교환 조회 실패:', error);
    return NextResponse.json({ error: '혈석 상점 교환 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 혈석 상점 교환 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 로컬 환경에서만 허용
  const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_BLOODSTONE_SHOP_SAVE === 'true';
  if (!isLocal) {
    return NextResponse.json(
      { error: '혈석 상점 교환 저장 기능은 로컬 환경에서만 사용할 수 있습니다.' },
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
    const { shop_name, shop_data } = body;

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
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '혈석 상점 교환을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ shop: data });
  } catch (error: any) {
    console.error('혈석 상점 교환 업데이트 실패:', error);
    return NextResponse.json({ error: '혈석 상점 교환 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 혈석 상점 교환 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 로컬 환경에서만 허용
  const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_BLOODSTONE_SHOP_SAVE === 'true';
  if (!isLocal) {
    return NextResponse.json(
      { error: '혈석 상점 교환 저장 기능은 로컬 환경에서만 사용할 수 있습니다.' },
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
    const { error } = await supabase
      .from('saved_bloodstone_shops')
      .delete()
      .eq('id', params.id);

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('혈석 상점 교환 삭제 실패:', error);
    return NextResponse.json({ error: '혈석 상점 교환 삭제에 실패했습니다.' }, { status: 500 });
  }
}

