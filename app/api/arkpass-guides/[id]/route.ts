import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';
import { isPackageSaveAllowed } from '@/lib/environment';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // main 브랜치 production 환경이 아닐 때 허용
  if (!isPackageSaveAllowed()) {
    return NextResponse.json({ error: '아크패스 가이드 업데이트 기능은 main 브랜치 production 환경에서 사용할 수 없습니다.' }, { status: 403 });
  }
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }
  try {
    const { id } = params;
    const body = await request.json();
    const { name, pass_name, start_date, end_date, levels } = body;
    if (!name || !pass_name || !levels) {
      return NextResponse.json({ error: '이름, 패스 이름, 레벨 데이터가 필요합니다.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('saved_arkpass_guides')
      .update({ name, pass_name, start_date: start_date || '', end_date: end_date || '', levels })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (error: any) {
    console.error('아크패스 가이드 업데이트 실패:', error);
    return NextResponse.json({ error: '아크패스 가이드 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // main 브랜치 production 환경이 아닐 때 허용
  if (!isPackageSaveAllowed()) {
    return NextResponse.json({ error: '아크패스 가이드 삭제 기능은 main 브랜치 production 환경에서 사용할 수 없습니다.' }, { status: 403 });
  }
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }
  try {
    const { id } = params;
    const { error } = await supabase
      .from('saved_arkpass_guides')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('아크패스 가이드 삭제 실패:', error);
    return NextResponse.json({ error: '아크패스 가이드 삭제에 실패했습니다.' }, { status: 500 });
  }
}

