import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// GET: 저장된 패키지 목록 조회
export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await supabase
      .from('saved_packages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ packages: data || [] });
  } catch (error: any) {
    console.error('패키지 조회 실패:', error);
    return NextResponse.json({ error: '패키지 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 패키지 저장
export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { package_name, package_data } = body;

    if (!package_name || !package_data) {
      return NextResponse.json(
        { error: '패키지명과 패키지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('saved_packages')
      .insert([
        {
          package_name,
          package_data,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ package: data });
  } catch (error: any) {
    console.error('패키지 저장 실패:', error);
    return NextResponse.json({ error: '패키지 저장에 실패했습니다.' }, { status: 500 });
  }
}

