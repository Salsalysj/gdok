import { NextRequest, NextResponse } from 'next/server';

// 명시적으로 Node.js 런타임 사용 및 동적 렌더링으로 캐시 회피
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemName } = body;

    if (!itemName) {
      return NextResponse.json(
        { error: '아이템 이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 환경변수 정규화 (BOM/공백 제거 방지, 안전하게 확인)
    const rawKey = process.env.LOSTARK_API_KEY;
    const apiKey = typeof rawKey === 'string' ? rawKey.replace(/\uFEFF/g, '').trim() : '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 로스트아크 거래소 API 호출
    // 먼저 기본 카테고리(CategoryCode: 50000)로 검색 시도
    let response = await fetch(
      'https://developer-lostark.game.onstove.com/markets/items',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: 50000, // 먼저 기본 카테고리로 검색
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: itemName.trim(),
          PageNo: 1,
          SortCondition: 'ASC',
        }),
      }
    );

    let data: any = { Items: [] };

    if (response.ok) {
      data = await response.json();
    } else {
      // 기본 카테고리 검색 실패 시 CategoryCode 0으로 재시도
      response = await fetch(
        'https://developer-lostark.game.onstove.com/markets/items',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Sort: 'GRADE',
            CategoryCode: 0, // 모든 카테고리 검색
            CharacterClass: '',
            ItemTier: 0,
            ItemGrade: '',
            ItemName: itemName.trim(),
            PageNo: 1,
            SortCondition: 'ASC',
          }),
        }
      );

      if (response.ok) {
        data = await response.json();
      } else {
        const errorText = await response.text().catch(() => '알 수 없는 오류');
        console.error(`Lost Ark API 오류 (${response.status}):`, errorText);
        throw new Error(`API 요청 실패: ${response.status} - ${errorText.substring(0, 200)}`);
      }
    }
    
    // 응답 구조 확인
    if (!data || typeof data !== 'object') {
      console.error('예상하지 못한 응답 형식:', data);
      return NextResponse.json(
        { error: '서버 응답 형식 오류', Items: [] },
        { status: 500 }
      );
    }
    
    // 빈 결과도 정상 응답으로 반환
    return NextResponse.json(data || { Items: [] });
  } catch (error) {
    console.error('Market API Error:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: `검색 중 오류가 발생했습니다: ${errorMessage}` },
      { status: 500 }
    );
  }
}

