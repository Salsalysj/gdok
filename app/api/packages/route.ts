import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';
import { isPackageSaveAllowed } from '@/lib/environment';

// GET: 저장된 패키지 목록 조회
export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    // Supabase는 기본적으로 1000개까지만 반환하므로, 명시적으로 큰 limit 설정
    const { data, error, count } = await supabase
      .from('saved_packages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(10000); // 충분히 큰 값으로 설정

    if (error) {
      console.error('Supabase 에러:', error);
      console.error('에러 상세:', JSON.stringify(error, null, 2));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 실제 반환된 개수와 전체 개수 비교
    if (count != null && data && data.length < count) {
      console.warn(`⚠️ 패키지 일부만 반환됨: ${data.length}/${count}개`);
    }

    console.log(`✅ 패키지 조회 성공: ${data?.length || 0}개 (전체: ${count || 'N/A'}개)`);
    return NextResponse.json({ packages: data || [] });
  } catch (error: any) {
    console.error('패키지 조회 실패:', error);
    console.error('에러 상세:', error.message, error.stack);
    return NextResponse.json({ error: '패키지 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 패키지 저장
export async function POST(request: NextRequest) {
  // main 브랜치 production 환경이 아닐 때 허용 (로컬 개발 환경, develop 브랜치 등)
  if (!isPackageSaveAllowed()) {
    return NextResponse.json(
      { error: '패키지 저장 기능은 main 브랜치 production 환경에서 사용할 수 없습니다.' },
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

