import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// PUT: 패키지 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { package_name, package_data } = body;
    const { id } = params;

    if (!package_name || !package_data) {
      return NextResponse.json(
        { error: '패키지명과 패키지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_packages')
      .update({
        package_name,
        package_data,
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
      return NextResponse.json({ error: '패키지를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ package: data });
  } catch (error: any) {
    console.error('패키지 업데이트 실패:', error);
    return NextResponse.json({ error: '패키지 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 패키지 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const { error } = await supabase
      .from('saved_packages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('패키지 삭제 실패:', error);
    return NextResponse.json({ error: '패키지 삭제에 실패했습니다.' }, { status: 500 });
  }
}

