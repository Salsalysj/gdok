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

// CSV 이스케이프 처리
function escapeCsvField(field: any): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  // 쉼표, 따옴표, 줄바꿈이 포함된 경우 따옴표로 감싸고 내부 따옴표는 두 개로
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 배열을 문자열로 변환
function arrayToString(arr: any[] | null): string {
  if (!arr || arr.length === 0) {
    return '';
  }
  return arr.join('; ');
}

async function exportCalendarToCSV() {
  console.log('🚀 주간 컨텐츠 캘린더 데이터 CSV 추출 시작...\n');

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
    
    if (!Array.isArray(data)) {
      console.error('❌ 예상한 배열 형태의 데이터가 아닙니다.');
      return;
    }

    console.log(`📋 총 ${data.length}개의 컨텐츠를 찾았습니다.\n`);

    // CSV 헤더 정의
    const headers = [
      '카테고리',
      '컨텐츠명',
      '컨텐츠아이콘',
      '최소아이템레벨',
      '위치',
      '시작시간',
      '보상아이템레벨',
      '보상아이템명',
      '보상아이템아이콘',
      '보상아이템등급',
    ];

    // CSV 행 데이터 생성
    const rows: string[][] = [];
    
    for (const content of data) {
      const categoryName = content.CategoryName || '';
      const contentsName = content.ContentsName || '';
      const contentsIcon = content.ContentsIcon || '';
      const minItemLevel = content.MinItemLevel || 0;
      const location = content.Location || '';
      const startTimes = arrayToString(content.StartTimes);

      // 보상 아이템이 없는 경우
      if (!content.RewardItems || content.RewardItems.length === 0) {
        rows.push([
          categoryName,
          contentsName,
          contentsIcon,
          String(minItemLevel),
          location,
          startTimes,
          '',
          '',
          '',
          '',
        ]);
        continue;
      }

      // 각 보상 레벨별로 처리
      for (const rewardLevel of content.RewardItems) {
        const itemLevel = rewardLevel.ItemLevel || 0;

        // 보상 아이템이 없는 경우
        if (!rewardLevel.Items || rewardLevel.Items.length === 0) {
          rows.push([
            categoryName,
            contentsName,
            contentsIcon,
            String(minItemLevel),
            location,
            startTimes,
            String(itemLevel),
            '',
            '',
            '',
          ]);
          continue;
        }

        // 각 보상 아이템별로 행 생성
        for (const item of rewardLevel.Items) {
          rows.push([
            categoryName,
            contentsName,
            contentsIcon,
            String(minItemLevel),
            location,
            startTimes,
            String(itemLevel),
            item.Name || '',
            item.Icon || '',
            item.Grade || '',
          ]);
        }
      }
    }

    // CSV 내용 생성
    const csvLines: string[] = [];
    
    // 헤더 추가
    csvLines.push(headers.map(escapeCsvField).join(','));

    // 데이터 행 추가
    for (const row of rows) {
      csvLines.push(row.map(escapeCsvField).join(','));
    }

    const csvContent = csvLines.join('\n');

    // 파일 저장
    const outputPath = path.join(process.cwd(), 'calendar-contents.csv');
    fs.writeFileSync(outputPath, '\uFEFF' + csvContent, 'utf-8'); // BOM 추가 (Excel 호환성)

    console.log('='.repeat(60));
    console.log('📊 CSV 추출 완료');
    console.log('='.repeat(60));
    console.log(`✅ 총 ${rows.length}개의 행이 생성되었습니다.`);
    console.log(`📁 저장 위치: ${outputPath}`);
    console.log('\n📋 CSV 구조:');
    console.log(`  - 헤더: ${headers.length}개 컬럼`);
    console.log(`  - 데이터 행: ${rows.length}개`);
    console.log('\n✨ 완료!');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
}

exportCalendarToCSV();
