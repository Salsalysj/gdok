import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'featured-items.json');

type FeaturedItem = {
  id: number;
  name: string;
};

async function readItems(): Promise<FeaturedItem[]> {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeItems(items: FeaturedItem[]): Promise<void> {
  const dataDir = path.dirname(DATA_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// PATCH: 순서 변경
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, direction } = body;

    if (!id || !direction || !['up', 'down'].includes(direction)) {
      return NextResponse.json(
        { error: 'id와 direction(up/down)이 필요합니다.' },
        { status: 400 }
      );
    }

    const items = await readItems();
    const index = items.findIndex(item => item.id === Number(id));

    if (index === -1) {
      return NextResponse.json(
        { error: '아이템을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 순서 변경
    if (direction === 'up' && index > 0) {
      [items[index], items[index - 1]] = [items[index - 1], items[index]];
    } else if (direction === 'down' && index < items.length - 1) {
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
    } else {
      return NextResponse.json(
        { error: '순서를 변경할 수 없습니다.' },
        { status: 400 }
      );
    }

    await writeItems(items);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json(
      { error: '순서 변경 실패' },
      { status: 500 }
    );
  }
}

