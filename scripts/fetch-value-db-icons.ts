/**
 * valueDb.ts 라이브러리 항목들을 로스트아크 거래소 API로 검색해
 * 아이콘 이미지를 public/value-db-icons 폴더에 저장하고
 * lib/valueDbIcons.ts 매핑 파일을 생성합니다.
 *
 * 실행: npx ts-node scripts/fetch-value-db-icons.ts (또는 cd gdok && npx tsx scripts/fetch-value-db-icons.ts)
 * 필요: .env.local에 LOSTARK_API_KEY 설정
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const GDOK_ROOT = path.resolve(__dirname, '..');
const P_LISTS_FILE = path.join(GDOK_ROOT, 'p_lists.csv');
const P_LIST_FILE_ALT = path.join(GDOK_ROOT, 'p_list.csv');
const ETC_LIST_FILE = path.join(GDOK_ROOT, 'etc_list.csv');
const OUTPUT_DIR = path.join(GDOK_ROOT, 'public', 'value-db-icons');
const VALUE_DB_ICONS_MODULE = path.join(GDOK_ROOT, 'lib', 'valueDbIcons.ts');

// valueDb.ts의 additionalItems + manual overrides에 등장하는 항목명
const HARDCODED_ITEMS: string[] = [
  '정련된 혼돈의 돌(무기)',
  '정련된 혼돈의 돌(방어구)',
  '전설 카드팩 (확률)',
  '고결한 혼돈의 돌(무기) (품질 90기준)',
  '고결한 혼돈의 돌(무기) (품질 95기준)',
  '고결한 혼돈의 돌(방어구) (품질 90기준)',
  '고결한 혼돈의 돌(방어구) (품질 95기준)',
  '크리스탈',
  '어빌리티 스톤 키트 (지옥)',
  '순환 돌파석',
  '전이 돌파석',
  '고대 팔찌 (지옥)',
  '유물 각인서 선택',
  '유물 각인서 랜덤',
  '유물 각인서 선택 주머니',
  '유물 각인서 랜덤 주머니',
  '젬 가공 초기화권',
  '정련된 운명의 돌',
  '카드경험치 1당',
  '운명의 파편 1개당',
  '운명의 파편',
  '장인의 야금술 : 3단계',
  '장인의 재봉술 : 3단계',
  '장인의 야금술 : 4단계',
  '장인의 재봉술 : 4단계',
  '질서의 젬 : 불변 (고급)',
  '질서의 젬 : 불변 (희귀)',
  '질서의 젬 : 불변 (영웅)',
  '질서의 젬 : 견고 (고급)',
  '질서의 젬 : 견고 (희귀)',
  '질서의 젬 : 견고 (영웅)',
  '질서의 젬 : 안정 (고급)',
  '질서의 젬 : 안정 (희귀)',
  '질서의 젬 : 안정 (영웅)',
  '혼돈의 젬 : 침식 (고급)',
  '혼돈의 젬 : 침식 (희귀)',
  '혼돈의 젬 : 침식 (영웅)',
  '혼돈의 젬 : 왜곡 (고급)',
  '혼돈의 젬 : 왜곡 (희귀)',
  '혼돈의 젬 : 왜곡 (영웅)',
  '혼돈의 젬 : 붕괴 (고급)',
  '혼돈의 젬 : 붕괴 (희귀)',
  '혼돈의 젬 : 붕괴 (영웅)',
];

function getApiKey(): string {
  const envPath = path.join(GDOK_ROOT, '.env.local');
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/LOSTARK_API_KEY\s*=\s*(.+)/);
    if (match && match[1]) {
      return match[1].trim().replace(/\uFEFF/g, '').replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env.local 없을 수 있음
  }
  const envKey = process.env.LOSTARK_API_KEY;
  if (envKey) return envKey.trim().replace(/\uFEFF/g, '');
  throw new Error('LOSTARK_API_KEY를 .env.local 또는 환경변수에 설정해 주세요.');
}

function collectItemNames(): string[] {
  const set = new Set<string>();

  // p_lists.csv
  try {
    const content = fs.readFileSync(P_LISTS_FILE, 'utf-8');
    content.split('\n').forEach((line) => {
      const name = line.trim();
      if (name) set.add(name);
    });
  } catch {}

  // p_list.csv
  try {
    const content = fs.readFileSync(P_LIST_FILE_ALT, 'utf-8');
    content.split('\n').forEach((line) => {
      const name = line.trim();
      if (name) set.add(name);
    });
  } catch {}

  // etc_list.csv (첫 번째 컬럼 = 아이템명, 헤더 제외)
  try {
    const content = fs.readFileSync(ETC_LIST_FILE, 'utf-8');
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols[0]) set.add(cols[0]);
    }
  } catch {}

  HARDCODED_ITEMS.forEach((name) => set.add(name));

  return Array.from(set);
}

async function fetchItemIcon(itemName: string, apiKey: string): Promise<string | null> {
  const baseUrl = 'https://developer-lostark.game.onstove.com';
  const cleanName = itemName.trim();

  for (const categoryCode of [50000, 0]) {
    try {
      const res = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: categoryCode,
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: cleanName,
          PageNo: 1,
          SortCondition: 'ASC',
        }),
        cache: 'no-store',
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0 && data.Items[0].Icon) {
        return data.Items[0].Icon;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function downloadImage(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const loc = response.headers.location;
        if (loc) return downloadImage(loc, filePath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        try { fs.unlinkSync(filePath); } catch {}
        reject(err);
      });
    }).on('error', reject);
  });
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[()[\]]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim() || 'item';
}

async function main() {
  console.log('🚀 valueDb 아이콘 수집 시작...\n');

  const apiKey = getApiKey();
  const itemNames = collectItemNames();
  console.log(`📋 아이템 수: ${itemNames.length}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 폴더 생성: ${OUTPUT_DIR}\n`);
  }

  const map: Record<string, string> = {};
  let success = 0;
  let fail = 0;

  for (let i = 0; i < itemNames.length; i++) {
    const itemName = itemNames[i];
    process.stdout.write(`[${i + 1}/${itemNames.length}] ${itemName} ... `);

    try {
      const iconPath = await fetchItemIcon(itemName, apiKey);
      if (!iconPath) {
        console.log('검색 결과 없음');
        fail++;
        continue;
      }

      const iconUrl = iconPath.startsWith('http')
        ? iconPath
        : `https://cdn-lostark.game.onstove.com${iconPath}`;
      const ext = path.extname(iconPath) || '.png';
      const safeName = sanitizeFileName(itemName);
      const fileName = `${safeName}${ext}`;
      const filePath = path.join(OUTPUT_DIR, fileName);

      await downloadImage(iconUrl, filePath);
      map[itemName] = fileName;
      console.log(`저장: ${fileName}`);
      success++;
    } catch (e) {
      console.log(`실패: ${e instanceof Error ? e.message : e}`);
      fail++;
    }

    if (i < itemNames.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // lib/valueDbIcons.ts 생성
  const lines = [
    '/**',
    ' * valueDb 항목명 -> 아이콘 파일명 매핑 (public/value-db-icons 폴더 기준)',
    ' * scripts/fetch-value-db-icons.ts 로 생성됨.',
    ' */',
    '',
    'export const ITEM_ICON_MAP: Record<string, string> = {',
    ...Object.entries(map).map(([name, file]) => `  ${JSON.stringify(name)}: ${JSON.stringify(file)},`),
    '};',
    '',
  ];
  fs.writeFileSync(VALUE_DB_ICONS_MODULE, lines.join('\n'), 'utf-8');
  console.log(`\n📄 매핑 파일 생성: ${VALUE_DB_ICONS_MODULE}`);
  console.log(`\n✅ 성공: ${success} / ❌ 실패: ${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
