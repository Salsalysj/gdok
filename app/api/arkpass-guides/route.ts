import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }
  try {
    const { data, error } = await supabase
      .from('saved_arkpass_guides')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    console.error('아크패스 가이드 조회 실패:', error);
    return NextResponse.json({ error: '아크패스 가이드 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true';
  if (!isLocal) {
    return NextResponse.json({ error: '아크패스 가이드 저장 기능은 로컬 환경에서만 사용할 수 있습니다.' }, { status: 403 });
  }
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const { name, pass_name, start_date, end_date, levels } = body;
    if (!name || !pass_name || !levels) {
      return NextResponse.json({ error: '이름, 패스 이름, 레벨 데이터가 필요합니다.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('saved_arkpass_guides')
      .insert([{ name, pass_name, start_date: start_date || '', end_date: end_date || '', levels }])
      .select()
      .single();
    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (error: any) {
    console.error('아크패스 가이드 저장 실패:', error);
    return NextResponse.json({ error: '아크패스 가이드 저장에 실패했습니다.' }, { status: 500 });
  }
}

