import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabase';

// Supabase 연결 테스트용 엔드포인트
export async function GET() {
  try {
    // 간단한 쿼리로 연결 테스트
    const { data, error } = await supabase
      .from('saved_packages')
      .select('count')
      .limit(1);

    if (error) {
      // 테이블이 없으면 에러가 발생할 수 있음 (정상)
      if (error.code === '42P01') {
        return NextResponse.json({
          success: false,
          message: '테이블이 존재하지 않습니다. supabase-setup.sql을 실행해주세요.',
          error: error.message,
        });
      }
      return NextResponse.json({
        success: false,
        message: 'Supabase 연결 실패',
        error: error.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase 연결 성공!',
      data: data,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: '연결 테스트 중 오류 발생',
      error: error.message,
    });
  }
}

