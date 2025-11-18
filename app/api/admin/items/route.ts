import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'featured-items.json');

type FeaturedItem = {
  id: number;
  name: string;
  type?: string;
};

async function readItems(): Promise<FeaturedItem[]> {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 파일이 없으면 빈 배열 반환
    return [];
  }
}

async function writeItems(items: FeaturedItem[]): Promise<void> {
  // data 디렉토리가 없으면 생성
  const dataDir = path.dirname(DATA_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// GET: 리스트 조회
export async function GET() {
  try {
    const items = await readItems();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: '리스트 조회 실패' },
      { status: 500 }
    );
  }
}

// POST: 아이템 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, type } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name이 필요합니다.' },
        { status: 400 }
      );
    }

    const items = await readItems();
    
    // 중복 확인 (이름으로만)
    if (items.some(item => item.name === name)) {
      return NextResponse.json(
        { error: '이미 존재하는 아이템입니다.' },
        { status: 400 }
      );
    }

    items.push({ 
      id: id ? Number(id) : 0, 
      name: String(name).trim(),
      type: type || 'market'
    });
    await writeItems(items);

    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json(
      { error: '아이템 추가 실패' },
      { status: 500 }
    );
  }
}

// DELETE: 아이템 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const items = await readItems();
    const filtered = items.filter(item => item.id !== Number(id));
    
    if (items.length === filtered.length) {
      return NextResponse.json(
        { error: '아이템을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    await writeItems(filtered);
    return NextResponse.json({ success: true, items: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: '아이템 삭제 실패' },
      { status: 500 }
    );
  }
}

