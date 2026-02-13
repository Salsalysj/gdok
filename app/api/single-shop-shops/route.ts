import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { randomUUID } from 'crypto';
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

// GET: 저장된 싱글 상점 교환 목록 조회 (JSON 파일에서 읽기)
export async function GET() {
  try {
    const raw = await fs.readFile(SINGLE_SHOP_EXCHANGES_JSON, 'utf-8');
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
    console.error('싱글 상점 교환 조회 실패:', e);
    return NextResponse.json({ error: '싱글 상점 교환 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 싱글 상점 교환 저장 (production이 아닐 때만 JSON 파일에 쓰기)
export async function POST(request: NextRequest) {
  if (!isCraftMaterialSaveAllowed()) {
    return NextResponse.json(
      { error: '싱글 상점 교환 저장은 production 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }
  try {
    const body = await request.json();
    const shop_name = typeof body.shop_name === 'string' ? body.shop_name.trim() : '';
    const shop_data = body.shop_data;
    if (!shop_name) {
      return NextResponse.json({ error: '상점명을 입력해주세요.' }, { status: 400 });
    }
    const list = await readJsonList();
    const now = new Date().toISOString();
    const id = randomUUID();
    list.push({
      id,
      shop_name,
      shop_data: shop_data ?? null,
      created_at: now,
      updated_at: now,
    });
    await writeJsonList(list);
    const shop = {
      id,
      shop_name,
      shop_data: shop_data ?? null,
      created_at: now,
      updated_at: now,
    };
    return NextResponse.json({ shop });
  } catch (e) {
    console.error('싱글 상점 교환 저장 실패:', e);
    return NextResponse.json(
      { error: '싱글 상점 교환 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}
