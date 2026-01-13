import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const CALENDAR_CSV_FILE = path.join(process.cwd(), 'calendar-contents.csv');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'item-icons');

// CSV 파일 읽기 및 파싱
function parseCSV(filePath: string): Array<{ name: string; icon: string }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 2) {
      throw new Error('CSV 파일에 헤더만 있거나 데이터가 없습니다.');
    }

    // 헤더 찾기
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim());
    
    const nameIndex = headers.indexOf('보상아이템명');
    const iconIndex = headers.indexOf('보상아이템아이콘');
    
    if (nameIndex === -1 || iconIndex === -1) {
      throw new Error('CSV 파일에 필요한 컬럼(보상아이템명, 보상아이템아이콘)을 찾을 수 없습니다.');
    }

    const items = new Map<string, string>(); // name -> icon (중복 제거)

    // 데이터 행 파싱
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const columns = parseCSVLine(line);
      
      if (columns.length <= Math.max(nameIndex, iconIndex)) {
        continue;
      }

      const name = columns[nameIndex]?.trim();
      const icon = columns[iconIndex]?.trim();

      if (name && icon && name !== '' && icon !== '') {
        // 중복 제거: 같은 이름이면 첫 번째 아이콘 사용
        if (!items.has(name)) {
          items.set(name, icon);
        }
      }
    }

    return Array.from(items.entries()).map(([name, icon]) => ({ name, icon }));
  } catch (error) {
    console.error('❌ CSV 파일 파싱 실패:', error);
    throw error;
  }
}

// CSV 라인 파싱 (쉼표와 따옴표 처리)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // 이스케이프된 따옴표
        current += '"';
        i++; // 다음 문자 건너뛰기
      } else {
        // 따옴표 시작/끝
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 필드 구분자
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // 마지막 필드 추가
  result.push(current);
  
  return result;
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

// URL에서 파일 확장자 추출
function getFileExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = path.extname(pathname);
    return ext || '.png'; // 확장자가 없으면 기본값 .png
  } catch {
    return '.png';
  }
}

// 메인 함수
async function main() {
  console.log('🚀 캘린더 보상 아이템 아이콘 다운로드 시작...\n');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 출력 디렉토리 생성: ${OUTPUT_DIR}\n`);
  }

  // CSV 파일 읽기
  console.log('📋 CSV 파일 읽는 중...');
  const items = parseCSV(CALENDAR_CSV_FILE);
  console.log(`✅ 총 ${items.length}개의 고유 아이템을 찾았습니다.\n`);

  let successCount = 0;
  let failCount = 0;
  const failedItems: string[] = [];

  // 각 아이템 처리
  for (let i = 0; i < items.length; i++) {
    const { name, icon } = items[i];
    console.log(`[${i + 1}/${items.length}] ${name} 처리 중...`);

    try {
      // 아이콘 URL이 없으면 스킵
      if (!icon || icon.trim() === '') {
        console.log(`  ⚠️ 아이콘 URL이 없습니다.`);
        failCount++;
        failedItems.push(name);
        continue;
      }

      // 파일명 생성
      const safeFileName = sanitizeFileName(name);
      const fileExtension = getFileExtension(icon);
      const filePath = path.join(OUTPUT_DIR, `${safeFileName}${fileExtension}`);

      // 이미 파일이 존재하면 스킵
      if (fs.existsSync(filePath)) {
        console.log(`  ⏭️ 이미 존재하는 파일입니다. 스킵합니다.`);
        successCount++;
        continue;
      }

      // 이미지 다운로드
      await downloadImage(icon, filePath);
      console.log(`  ✅ 다운로드 완료: ${safeFileName}${fileExtension}`);
      successCount++;

      // API 호출 제한을 고려한 딜레이 (초당 1회 요청)
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`  ❌ 오류 발생:`, error);
      failCount++;
      failedItems.push(name);
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
