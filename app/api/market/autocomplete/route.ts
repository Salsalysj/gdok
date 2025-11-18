import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ Items: [] });
    }

    // 환경변수 정규화
    const rawKey = process.env.LOSTARK_API_KEY;
    const apiKey = typeof rawKey === 'string' ? rawKey.replace(/\uFEFF/g, '').trim() : '';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 로스트아크 거래소 API 호출 (자동완성용 - 부분 검색)
    // 먼저 기본 카테고리로 검색 시도
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
          CategoryCode: 50000,
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: query.trim(),
          PageNo: 1,
          SortCondition: 'ASC',
        }),
      }
    );

    let data: any = { Items: [] };
    
    if (response.ok) {
      data = await response.json();
    }

    // 결과가 적거나 각인서 검색인 경우 CategoryCode 0으로 재시도
    if (!data.Items || data.Items.length < 10) {
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
            ItemName: query.trim(),
            PageNo: 1,
            SortCondition: 'ASC',
          }),
        }
      );

      if (response.ok) {
        const additionalData = await response.json();
        // 기존 결과와 합치기
        const combinedItems = [...(data.Items || []), ...(additionalData.Items || [])];
        data.Items = combinedItems;
      }
    }
    
    // 최대 10개까지만 반환 (드롭다운 표시용)
    const limitedItems = data.Items ? data.Items.slice(0, 10) : [];
    
    // 중복 제거 (같은 이름이면 하나만)
    const uniqueItems: { [name: string]: any } = {};
    limitedItems.forEach((item: any) => {
      if (item.Name && !uniqueItems[item.Name]) {
        uniqueItems[item.Name] = item;
      }
    });
    
    return NextResponse.json({ 
      Items: Object.values(uniqueItems) 
    });
  } catch (error) {
    console.error('Autocomplete API Error:', error);
    return NextResponse.json({ Items: [] });
  }
}

