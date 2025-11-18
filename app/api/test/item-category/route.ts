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

    // 여러 카테고리에서 검색하여 category 값 확인
    const categoryCodes = [70000, 0, 50000];
    const results: any[] = [];

    for (const categoryCode of categoryCodes) {
      try {
        const response = await fetch(
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
              CategoryCode: categoryCode,
              CharacterClass: '',
              ItemTier: 0,
              ItemGrade: '',
              ItemName: itemName,
              PageNo: 1,
              SortCondition: 'ASC',
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0) {
            const matchedItem = data.Items.find((item: any) => 
              item.Name === itemName || item.Name?.includes(itemName)
            );
            
            if (matchedItem) {
              results.push({
                searchedCategoryCode: categoryCode,
                found: true,
                item: {
                  Name: matchedItem.Name,
                  CategoryCode: matchedItem.CategoryCode || 'N/A',
                  Category: matchedItem.Category || 'N/A',
                  Grade: matchedItem.Grade,
                  // 전체 응답 구조 확인용 (필요한 모든 필드 포함)
                  fullItem: matchedItem,
                }
              });
              
              // 첫 번째 결과를 찾으면 중단하지 않고 모든 카테고리 확인
            }
          }
        }
      } catch (error) {
        results.push({
          searchedCategoryCode: categoryCode,
          found: false,
          error: error instanceof Error ? error.message : '알 수 없는 오류'
        });
      }
    }

    return NextResponse.json({
      itemName,
      results,
      summary: results.length > 0 && results[0].found ? {
        categoryCode: results.find(r => r.found)?.item?.CategoryCode,
        category: results.find(r => r.found)?.item?.Category,
        grade: results.find(r => r.found)?.item?.Grade,
        fullItemKeys: results.find(r => r.found)?.item?.fullItem ? 
          Object.keys(results.find(r => r.found)!.item.fullItem) : []
      } : null
    });
  } catch (error) {
    console.error('Category 확인 오류:', error);
    return NextResponse.json(
      { error: '카테고리 확인 중 오류가 발생했습니다.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

