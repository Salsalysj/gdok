/**
 * 크리스탈 환율 자동 갱신 스크립트
 * 서버 시작 시 즉시 한 번 실행 후, 매일 오전 12시 / 오후 12시에 자동으로 갱신합니다.
 *
 * 사용 방법:
 * 1. 개발 환경: npm run dev 실행 시 자동으로 함께 실행됨
 * 2. 프로덕션: npm start 실행 시 자동으로 함께 실행됨
 */

const https = require('https');
const http = require('http');

// 서버 URL (환경변수 또는 기본값)
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
const UPDATE_ENDPOINT = '/api/admin/crystal-gold/update-exchange';

// 서버가 준비될 때까지 대기하는 함수
async function waitForServer(maxRetries = 60, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const url = new URL('/', SERVER_URL);
      const client = url.protocol === 'https:' ? https : http;
      let serverReady = false;
      
      await new Promise((resolve) => {
        const req = client.request({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          timeout: 3000,
        }, (res) => {
          serverReady = true;
          res.on('data', () => {});
          res.on('end', () => {
            resolve(null);
          });
        });

        req.on('error', () => {
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      });

      if (serverReady) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
    } catch (error) {
      // 계속 재시도
    }
    
    if (i < maxRetries - 1) {
      if (i === 0 || i % 5 === 0) {
        process.stdout.write('.');
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return false;
}

function updateExchange() {
  const url = new URL(UPDATE_ENDPOINT, SERVER_URL);
  const client = url.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const json = JSON.parse(data);
            console.log(`[${new Date().toLocaleString('ko-KR')}] 크리스탈 환율 갱신 성공:`, json);
          } catch (e) {
            console.log(`[${new Date().toLocaleString('ko-KR')}] 크리스탈 환율 갱신 성공`);
          }
          resolve(true);
        } else {
          console.error(`[${new Date().toLocaleString('ko-KR')}] 크리스탈 환율 갱신 실패:`, res.statusCode, data);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[${new Date().toLocaleString('ko-KR')}] 크리스탈 환율 갱신 요청 실패:`, error.message);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('요청 시간 초과'));
    });

    req.end();
  });
}

// 다음 갱신 시간 계산 (오전 12시 또는 오후 12시)
function getNextRefreshDelay() {
  const now = new Date();
  const currentHour = now.getHours();

  const next = new Date(now);

  if (currentHour < 12) {
    // 오전 12시 이전이면 오후 12시까지 대기
    next.setHours(12, 0, 0, 0);
  } else if (currentHour < 24) {
    // 오후 12시 이후면 다음 날 오전 12시까지 대기
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }

  return next.getTime() - now.getTime();
}

function scheduleNextRefresh() {
  const delay = getNextRefreshDelay();
  const nextDate = new Date(Date.now() + delay);
  console.log(`[${new Date().toLocaleString('ko-KR')}] 다음 크리스탈 환율 갱신 예정: ${nextDate.toLocaleString('ko-KR')}`);

  setTimeout(async () => {
    try {
      await updateExchange();
    } catch (error) {
      console.error('크리스탈 환율 갱신 중 오류:', error);
    }
    scheduleNextRefresh();
  }, delay);
}

// 메인 실행
async function main() {
  console.log('[크리스탈 환율 갱신 스케줄러] 시작...');
  
  // 서버가 준비될 때까지 대기
  console.log('서버 준비 대기 중...');
  const serverReady = await waitForServer();
  
  if (!serverReady) {
    console.error('서버가 준비되지 않았습니다. 스케줄러를 종료합니다.');
    process.exit(1);
  }
  
  console.log('서버 준비 완료!');
  
  // 즉시 한 번 실행
  try {
    await updateExchange();
  } catch (error) {
    console.error('초기 크리스탈 환율 갱신 실패:', error);
  }
  
  // 이후 스케줄링 (오전/오후 12시)
  scheduleNextRefresh();
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  console.error('처리되지 않은 오류:', error);
});

main().catch((error) => {
  console.error('스케줄러 시작 실패:', error);
  process.exit(1);
});

