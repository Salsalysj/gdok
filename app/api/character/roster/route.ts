import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const characterName = searchParams.get('characterName');

    if (!characterName || characterName.trim().length === 0) {
      return NextResponse.json(
        { error: '캐릭터명을 입력해주세요.' },
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

    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const encodedName = encodeURIComponent(characterName.trim());

    // 원정대 캐릭터 목록 조회
    // Lost Ark API의 siblings 엔드포인트 사용
    const response = await fetch(
      `${baseUrl}/characters/${encodedName}/siblings`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: '캐릭터를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      const errorText = await response.text().catch(() => '알 수 없는 오류');
      console.error(`Lost Ark API 오류 (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `API 요청 실패: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Roster API Error:', error);
    return NextResponse.json(
      { error: '원정대 정보 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}


