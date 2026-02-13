import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const CRAFT_MATERIAL_EXCHANGES_JSON = path.join(process.cwd(), 'data', 'craft-material-exchanges.json');

// GET: 특정 제작 재료 교환 조회 (JSON 파일에서 id 또는 인덱스로 찾기)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const raw = await fs.readFile(CRAFT_MATERIAL_EXCHANGES_JSON, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: '제작 재료 교환을 찾을 수 없습니다.' }, { status: 404 });
    }
    const { id } = params;
    const index = parseInt(id, 10);
    const byIndex = !Number.isNaN(index) && index >= 0 && list[index];
    const byId = list.find((row: any, i: number) => (row.id ?? String(i)) === id);
    const shop = byIndex ?? byId;
    if (!shop) {
      return NextResponse.json({ error: '제작 재료 교환을 찾을 수 없습니다.' }, { status: 404 });
    }
    const resolved = {
      id: shop.id ?? String(list.indexOf(shop)),
      shop_name: shop.shop_name ?? '',
      created_at: shop.created_at ?? '',
      updated_at: shop.updated_at ?? '',
      shop_data: shop.shop_data,
    };
    return NextResponse.json({ shop: resolved });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: '제작 재료 교환을 찾을 수 없습니다.' }, { status: 404 });
    }
    console.error('제작 재료 교환 조회 실패:', e);
    return NextResponse.json({ error: '제작 재료 교환 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 비활성화
export async function PUT(_request: NextRequest, _context: { params: { id: string } }) {
  return NextResponse.json(
    { error: '제작 재료 교환은 JSON 파일로 관리됩니다. 수정 기능은 사용할 수 없습니다.' },
    { status: 410 }
  );
}

// DELETE: 비활성화
export async function DELETE(_request: NextRequest, _context: { params: { id: string } }) {
  return NextResponse.json(
    { error: '제작 재료 교환은 JSON 파일로 관리됩니다. 삭제 기능은 사용할 수 없습니다.' },
    { status: 410 }
  );
}
