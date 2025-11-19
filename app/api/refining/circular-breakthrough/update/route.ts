import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Supabase 클라이언트 초기화
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase configuration is missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 요청 본문에서 순환 돌파석 가치 데이터 받기
    const body = await request.json();
    const { values } = body; // values: { level: number, weaponValue: number, armorValue: number }[]

    if (!values || !Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Invalid data format' },
        { status: 400 }
      );
    }

    // 기존 데이터 삭제
    await supabase.from('circular_breakthrough_values').delete().neq('id', 0);

    // 새 데이터 삽입
    const { data, error } = await supabase
      .from('circular_breakthrough_values')
      .insert(
        values.map((v: any) => ({
          level: v.level,
          weapon_value: v.weaponValue,
          armor_value: v.armorValue,
        }))
      );

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: values.length });
  } catch (error) {
    console.error('Error updating circular breakthrough values:', error);
    return NextResponse.json(
      { error: 'Failed to update circular breakthrough values' },
      { status: 500 }
    );
  }
}

