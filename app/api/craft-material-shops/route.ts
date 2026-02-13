import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const CRAFT_MATERIAL_EXCHANGES_JSON = path.join(process.cwd(), 'data', 'craft-material-exchanges.json');

// GET: 저장된 제작 재료 교환 목록 조회 (JSON 파일에서 읽기)
export async function GET() {
  try {
    const raw = await fs.readFile(CRAFT_MATERIAL_EXCHANGES_JSON, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      return NextResponse.json({ shops: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const shops = list.map((row: any, index: number) => ({
      id: row.id ?? String(index),
      shop_name: row.shop_name ?? '',
      created_at: row.created_at ?? '',
      updated_at: row.updated_at ?? '',
      shop_data: row.shop_data,
    }));
    return NextResponse.json(
      { shops },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ shops: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('제작 재료 교환 조회 실패:', e);
    return NextResponse.json({ error: '제작 재료 교환 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 비활성화 (데이터는 data/craft-material-exchanges.json 으로 관리)
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: '제작 재료 교환은 JSON 파일로 관리됩니다. 저장 기능은 사용할 수 없습니다.' },
    { status: 410 }
  );
}
