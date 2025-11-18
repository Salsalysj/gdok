import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rawKey = process.env.LOSTARK_API_KEY;
    const apiKey = typeof rawKey === 'string' ? rawKey.replace(/\uFEFF/g, '').trim() : '';
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const baseUrl = 'https://developer-lostark.game.onstove.com';
    
    // 로스트아크 API에서 크리스탈 골드 환율은 보통 /exchange/best 엔드포인트 사용
    // 또는 POST 방식으로 /exchange 엔드포인트를 사용할 수 있음
    let response;
    let data;

    // 방법 1: GET /exchange/best 시도
    try {
      response = await fetch(`${baseUrl}/exchange/best`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
        },
      });

      if (response.ok) {
        data = await response.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // GET 실패 시 POST 시도
    }

    // 방법 2: POST /exchange 또는 /markets/exchange 시도
    try {
      response = await fetch(`${baseUrl}/exchange`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        data = await response.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // POST /exchange 실패
    }

    // 방법 3: 크리스탈을 거래소 아이템으로 검색
    try {
      response = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: 60000, // 화폐 카테고리 (일반적으로 60000대)
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: '크리스탈',
          PageNo: 1,
          SortCondition: 'ASC',
        }),
      });

      if (response.ok) {
        data = await response.json();
        // 크리스탈 100개 묶음 정보 찾기
        if (data?.Items) {
          const crystal100 = data.Items.find((item: any) => 
            item.Name?.includes('크리스탈') && item.BundleCount === 100
          );
          if (crystal100) {
            return NextResponse.json({
              crystal100Bundle: crystal100,
              exchangeRate: crystal100.RecentPrice || crystal100.CurrentMinPrice,
              unitPrice: (crystal100.RecentPrice || crystal100.CurrentMinPrice) / 100, // 크리스탈 1개당 골드
            });
          }
          return NextResponse.json(data);
        }
      }
    } catch (e) {
      // 거래소 검색 실패
    }

    return NextResponse.json(
      { error: '크리스탈 골드 환율 정보를 가져올 수 없습니다. API 엔드포인트를 확인해주세요.' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Crystal Gold API Error:', error);
    return NextResponse.json(
      { error: '크리스탈 골드 시세 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

