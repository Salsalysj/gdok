/**
 * ValueDB 캐시 무효화 스크립트
 * etc_list.csv 업데이트 후 실행하여 ValueDB에 반영
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function revalidateValueDb() {
  try {
    console.log('ValueDB 캐시 무효화 중...');
    
    const response = await fetch(`${BASE_URL}/api/value-db/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ ValueDB 캐시 무효화 완료!');
      console.log('다음 페이지들이 갱신되었습니다:');
      result.revalidatedPaths.forEach(path => {
        console.log(`  - ${path}`);
      });
      console.log('\n이제 etc_list.csv의 변경사항이 ValueDB에 반영되었습니다.');
    } else {
      console.error('❌ 캐시 무효화 실패:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error('\n개발 서버가 실행 중인지 확인하세요:');
    console.error('  npm run dev');
    process.exit(1);
  }
}

revalidateValueDb();

