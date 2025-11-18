import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterName } = body;

    if (!characterName || typeof characterName !== 'string' || characterName.trim().length === 0) {
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

    // 캐릭터 아머리 정보 조회 (장비 정보 포함)
    const response = await fetch(
      `${baseUrl}/armories/characters/${encodedName}`,
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
    console.error('Character API Error:', error);
    return NextResponse.json(
      { error: '캐릭터 검색 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

