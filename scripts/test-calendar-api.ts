import fs from 'fs';
import path from 'path';

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

async function testCalendarAPI() {
  console.log('🚀 /gamecontents/calendar API 테스트 시작...\n');

  try {
    const apiKey = getApiKey();
    console.log('✅ API 키 로드 완료\n');

    const baseUrl = 'https://developer-lostark.game.onstove.com';
    const response = await fetch(`${baseUrl}/gamecontents/calendar`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ API 호출 실패: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('응답 내용:', errorText);
      return;
    }

    const data = await response.json();
    
    console.log('='.repeat(60));
    console.log('📊 API 응답 데이터 구조');
    console.log('='.repeat(60));
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 데이터 분석');
    console.log('='.repeat(60));
    
    if (Array.isArray(data)) {
      console.log(`✅ 배열 형태의 데이터: ${data.length}개의 항목`);
      if (data.length > 0) {
        console.log('\n첫 번째 항목 구조:');
        console.log(JSON.stringify(data[0], null, 2));
        
        // 주요 필드 추출
        const firstItem = data[0];
        console.log('\n📌 주요 필드:');
        Object.keys(firstItem).forEach(key => {
          const value = firstItem[key];
          const type = Array.isArray(value) ? 'array' : typeof value;
          console.log(`  - ${key}: ${type}${Array.isArray(value) ? ` (${value.length} items)` : ''}`);
          if (type === 'object' && value !== null && !Array.isArray(value)) {
            console.log(`    하위 필드: ${Object.keys(value).join(', ')}`);
          }
        });
      }
    } else if (typeof data === 'object') {
      console.log('✅ 객체 형태의 데이터');
      console.log('\n📌 주요 필드:');
      Object.keys(data).forEach(key => {
        const value = data[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.log(`  - ${key}: ${type}${Array.isArray(value) ? ` (${value.length} items)` : ''}`);
      });
    }

    // 파일로 저장
    const outputPath = path.join(process.cwd(), 'data', 'calendar-api-response.json');
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`\n💾 응답 데이터가 저장되었습니다: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
}

testCalendarAPI();
