import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const ITEM_SAMPLE_FILE = path.join(process.cwd(), 'value-db-export.csv');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'item-icons');

// .env.local 파일에서 API 키 읽기
function getApiKey(): string {
  const envPath = path.join(process.cwd(), '.env.local');
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/LOSTARK_API_KEY\s*=\s*(.+)/);
    if (match && match[1]) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch (error) {
    console.error('❌ .env.local 파일을 읽을 수 없습니다:', error);
  }
  throw new Error('LOSTARK_API_KEY를 .env.local 파일에서 찾을 수 없습니다.');
}

// CSV 파일에서 아이템 목록 읽기
function readItemList(): string[] {
  try {
    const content = fs.readFileSync(ITEM_SAMPLE_FILE, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const items: string[] = [];
    for (const line of lines) {
      const columns = line.split(',').map(col => col.trim());
      if (columns.length >= 1 && columns[0]) {
        items.push(columns[0]);
      }
    }
    
    return items;
  } catch (error) {
    console.error('❌ item sample.csv 파일을 읽을 수 없습니다:', error);
    throw error;
  }
}

// 로스트아크 API에서 아이템 정보 가져오기
async function fetchItemDetail(itemName: string, apiKey: string): Promise<{ Icon?: string } | null> {
  const baseUrl = 'https://developer-lostark.game.onstove.com';
  
  try {
    // 먼저 CategoryCode: 50000으로 시도
    let response = await fetch(`${baseUrl}/markets/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Sort: 'GRADE',
        CategoryCode: 50000,
        CharacterClass: '',
        ItemTier: 0,
        ItemGrade: '',
        ItemName: itemName.trim(),
        PageNo: 1,
        SortCondition: 'ASC',
      }),
    });

    let data: any = null;

    if (response.ok) {
      data = await response.json();
    }

    // 결과가 없거나 실패하면 CategoryCode: 0으로 재시도
    if (!data?.Items || !Array.isArray(data.Items) || data.Items.length === 0) {
      response = await fetch(`${baseUrl}/markets/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Sort: 'GRADE',
          CategoryCode: 0,
          CharacterClass: '',
          ItemTier: 0,
          ItemGrade: '',
          ItemName: itemName.trim(),
          PageNo: 1,
          SortCondition: 'ASC',
        }),
      });

      if (response.ok) {
        data = await response.json();
      }
    }

    if (data?.Items && Array.isArray(data.Items) && data.Items.length > 0) {
      // 첫 번째 결과의 Icon 반환
      return { Icon: data.Items[0].Icon };
    }

    return null;
  } catch (error) {
    console.error(`  ⚠️ ${itemName} API 호출 실패:`, error);
    return null;
  }
}

// 이미지 다운로드
function downloadImage(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 리다이렉트 처리
        return downloadImage(response.headers.location!, filePath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filePath, () => {}); // 실패 시 파일 삭제
        reject(err);
      });
    }).on('error', reject);
  });
}

// 파일명에서 특수문자 제거 및 안전한 파일명 생성
function sanitizeFileName(fileName: string): string {
  // Windows에서 사용할 수 없는 문자 제거: < > : " / \ | ? *
  return fileName
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
    .trim();
}

// 메인 함수
async function main() {
  console.log('🚀 아이템 아이콘 다운로드 시작...\n');

  // API 키 확인
  const apiKey = getApiKey();
  console.log('✅ API 키 로드 완료\n');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 출력 디렉토리 생성: ${OUTPUT_DIR}\n`);
  }

  // 아이템 목록 읽기
  const items = readItemList();
  console.log(`📋 총 ${items.length}개의 아이템을 찾았습니다.\n`);

  let successCount = 0;
  let failCount = 0;
  const failedItems: string[] = [];

  // 각 아이템 처리
  for (let i = 0; i < items.length; i++) {
    const itemName = items[i];
    console.log(`[${i + 1}/${items.length}] ${itemName} 처리 중...`);

    try {
      // API에서 아이템 정보 가져오기
      const itemDetail = await fetchItemDetail(itemName, apiKey);
      
      if (!itemDetail || !itemDetail.Icon) {
        console.log(`  ⚠️ 아이콘 정보를 찾을 수 없습니다.`);
        failCount++;
        failedItems.push(itemName);
        continue;
      }

      // 아이콘 URL 생성
      const iconPath = itemDetail.Icon;
      const iconUrl = iconPath.startsWith('http')
        ? iconPath
        : `https://cdn-lostark.game.onstove.com${iconPath}`;

      // 파일명 생성 (아이템 이름 사용)
      const safeFileName = sanitizeFileName(itemName);
      const fileExtension = path.extname(iconPath) || '.png';
      const filePath = path.join(OUTPUT_DIR, `${safeFileName}${fileExtension}`);

      // 이미지 다운로드
      await downloadImage(iconUrl, filePath);
      console.log(`  ✅ 다운로드 완료: ${safeFileName}${fileExtension}`);
      successCount++;

      // API 호출 제한을 고려한 딜레이 (초당 1회 요청)
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`  ❌ 오류 발생:`, error);
      failCount++;
      failedItems.push(itemName);
    }
  }

  // 결과 요약
  console.log('\n' + '='.repeat(50));
  console.log('📊 다운로드 결과 요약');
  console.log('='.repeat(50));
  console.log(`✅ 성공: ${successCount}개`);
  console.log(`❌ 실패: ${failCount}개`);
  
  if (failedItems.length > 0) {
    console.log('\n실패한 아이템 목록:');
    failedItems.forEach(item => console.log(`  - ${item}`));
  }
  
  console.log(`\n📁 저장 위치: ${OUTPUT_DIR}`);
  console.log('\n✨ 완료!');
}

// 스크립트 실행
main().catch(error => {
  console.error('❌ 스크립트 실행 중 오류 발생:', error);
  process.exit(1);
});
