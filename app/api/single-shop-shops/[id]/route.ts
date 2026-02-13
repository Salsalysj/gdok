import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { isCraftMaterialSaveAllowed } from '@/lib/environment';

const SINGLE_SHOP_EXCHANGES_JSON = path.join(process.cwd(), 'data', 'single-shop-exchanges.json');

async function readJsonList(): Promise<any[]> {
  try {
    const raw = await fs.readFile(SINGLE_SHOP_EXCHANGES_JSON, 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

async function writeJsonList(list: any[]): Promise<void> {
  const dir = path.dirname(SINGLE_SHOP_EXCHANGES_JSON);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SINGLE_SHOP_EXCHANGES_JSON, JSON.stringify(list, null, 2), 'utf-8');
}

// GET: 특정 싱글 상점 교환 조회 (JSON 파일에서 id 또는 인덱스로 찾기)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const raw = await fs.readFile(SINGLE_SHOP_EXCHANGES_JSON, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: '싱글 상점 교환을 찾을 수 없습니다.' }, { status: 404 });
    }
    const index = parseInt(id, 10);
    const byIndex = !Number.isNaN(index) && index >= 0 && list[index];
    const byId = list.find((row: any, i: number) => (row.id ?? String(i)) === id);
    const shop = byIndex ?? byId;
    if (!shop) {
      return NextResponse.json({ error: '싱글 상점 교환을 찾을 수 없습니다.' }, { status: 404 });
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
      return NextResponse.json({ error: '싱글 상점 교환을 찾을 수 없습니다.' }, { status: 404 });
    }
    console.error('싱글 상점 교환 조회 실패:', e);
    return NextResponse.json({ error: '싱글 상점 교환 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 싱글 상점 교환 수정 (production이 아닐 때만 JSON 파일에 반영)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isCraftMaterialSaveAllowed()) {
    return NextResponse.json(
      { error: '싱글 상점 교환 수정은 production 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }
  try {
    const { id } = await context.params;
    const list = await readJsonList();
    const index = list.findIndex((row: any, i: number) => (row.id ?? String(i)) === id);
    if (index === -1) {
      return NextResponse.json(
        { error: '싱글 상점 교환을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    const body = await request.json();
    const shop_name = typeof body.shop_name === 'string' ? body.shop_name.trim() : list[index].shop_name;
    const shop_data = body.shop_data !== undefined ? body.shop_data : list[index].shop_data;
    const now = new Date().toISOString();
    const updated = {
      ...list[index],
      shop_name: shop_name || list[index].shop_name,
      shop_data,
      updated_at: now,
    };
    list[index] = updated;
    await writeJsonList(list);
    return NextResponse.json({
      shop: {
        id: updated.id ?? id,
        shop_name: updated.shop_name,
        shop_data: updated.shop_data,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (e) {
    console.error('싱글 상점 교환 수정 실패:', e);
    return NextResponse.json(
      { error: '싱글 상점 교환 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 싱글 상점 교환 삭제 (production이 아닐 때만 JSON 파일에서 제거)
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isCraftMaterialSaveAllowed()) {
    return NextResponse.json(
      { error: '싱글 상점 교환 삭제는 production 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }
  try {
    const { id } = await context.params;
    const list = await readJsonList();
    const index = list.findIndex((row: any, i: number) => (row.id ?? String(i)) === id);
    if (index === -1) {
      return NextResponse.json(
        { error: '싱글 상점 교환을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    list.splice(index, 1);
    await writeJsonList(list);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('싱글 상점 교환 삭제 실패:', e);
    return NextResponse.json(
      { error: '싱글 상점 교환 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
