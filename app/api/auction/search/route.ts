import { NextRequest, NextResponse } from 'next/server';

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

    const rawKey = process.env.LOSTARK_API_KEY;
    const apiKey = typeof rawKey === 'string' ? rawKey.replace(/\uFEFF/g, '').trim() : '';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 로스트아크 경매장 API 호출
    const response = await fetch(
      'https://developer-lostark.game.onstove.com/auctions/items',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'BUY_PRICE',
          CategoryCode: 210000, // 보석 카테고리
          CharacterClass: '',
          ItemLevelMin: 0,
          ItemLevelMax: 0,
          ItemGradeQuality: 0,
          ItemTier: 4, // 보석은 Tier 4
          ItemGrade: '',
          ItemName: itemName,
          PageNo: 0, // 경매장은 PageNo 0부터
          SortCondition: 'ASC',
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Auction API Error:', error);
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

