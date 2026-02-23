import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';


// POST: ValueDB 캐시 무효화 (etc_list.csv 업데이트 후 사용)
export async function POST(request: Request) {
  try {
    // ValueDB가 사용되는 모든 페이지의 캐시 무효화
    revalidatePath('/value-db');
    revalidatePath('/package-efficiency');
    revalidatePath('/hell');
    revalidatePath('/content-rewards');
    revalidatePath('/event-efficiency');
    revalidatePath('/advanced-refining');
    revalidatePath('/refining-simulation');
    revalidatePath('/'); // layout.tsx에서 ValueDBSidebar를 사용하므로 루트도 무효화

    console.log('ValueDB 관련 페이지 캐시 무효화 완료');

    return NextResponse.json({
      success: true,
      message: 'ValueDB 캐시가 성공적으로 무효화되었습니다.',
      revalidatedPaths: [
        '/value-db',
        '/package-efficiency',
        '/hell',
        '/content-rewards',
        '/event-efficiency',
        '/advanced-refining',
        '/refining-simulation',
        '/',
      ],
    });
  } catch (error) {
    console.error('캐시 무효화 중 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: '캐시 무효화 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET: ValueDB 캐시 무효화 (간편 접근용)
export async function GET(request: Request) {
  return POST(request);
}

