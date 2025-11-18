/**
 * 주요 아이템 시세 캐시 자동 갱신 스크립트
 * 서버 시작 시 즉시 한 번 실행 후, 10분마다 자동으로 캐시를 업데이트합니다.
 * 
 * 사용 방법:
 * 1. 개발 환경: npm run dev 실행 시 자동으로 함께 실행됨
 * 2. 프로덕션: npm start 실행 시 자동으로 함께 실행됨
 */

const https = require('https');
const http = require('http');

// 서버 URL (환경변수 또는 기본값)
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
const CACHE_UPDATE_ENDPOINT = '/api/market/cache/update';

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
          // 응답이 오면 서버가 준비된 것
          serverReady = true;
          res.on('data', () => {});
          res.on('end', () => {
            resolve(null);
          });
        });

        req.on('error', (error) => {
          // ECONNREFUSED 등은 아직 서버가 준비되지 않은 것
          if (i === 0 || i % 5 === 0) {
            // 5회마다 진행 상황 출력
          }
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      });

      if (serverReady) {
        // 추가로 API 엔드포인트가 준비되었는지 확인
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 더 대기
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

function updateCache() {
  const url = new URL(CACHE_UPDATE_ENDPOINT, SERVER_URL);
  const client = url.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 300000, // 5분 타임아웃 (대량 데이터 처리 시간 고려)
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.log(`✅ 캐시 업데이트 완료: ${new Date().toLocaleString('ko-KR')}`);
            console.log(`   마지막 갱신: ${jsonData.lastUpdated}`);
            resolve(jsonData);
          } catch (error) {
            console.error('❌ 응답 파싱 오류:', error);
            reject(error);
          }
        } else {
          console.error(`❌ 캐시 업데이트 실패: HTTP ${res.statusCode}`);
          console.error(`   응답: ${data.substring(0, 200)}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      const errorMsg = error.code === 'ECONNREFUSED' 
        ? '서버 연결 거부 (서버가 아직 준비되지 않았을 수 있습니다)'
        : error.message || error.toString();
      console.error(`❌ 요청 오류: ${errorMsg}`);
      console.error(`   코드: ${error.code || 'N/A'}`);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('요청 타임아웃'));
    });

    req.end();
  });
}

// 10분(600,000ms)마다 실행
const INTERVAL_MS = 10 * 60 * 1000;

async function start() {
  console.log('🚀 주요 아이템 시세 캐시 자동 갱신 시작');
  console.log(`   서버 URL: ${SERVER_URL}`);
  console.log(`   갱신 주기: 10분`);
  
  // 서버가 준비될 때까지 대기
  console.log('\n⏳ 서버 준비 대기 중');
  const serverReady = await waitForServer();
  console.log(''); // 줄바꿈
  
  if (!serverReady) {
    console.warn('⚠️  서버가 준비되지 않았습니다. 10초 후 재시도합니다...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  } else {
    console.log('✅ 서버 준비 완료');
    // 서버가 응답할 수 있도록 추가 대기
    console.log('⏳ API 엔드포인트 준비 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ 준비 완료\n');
  }
  
  // 즉시 한 번 실행
  console.log('📦 초기 캐시 업데이트 시작...');
  try {
    await updateCache();
    console.log('✅ 초기 캐시 업데이트 완료\n');
  } catch (error) {
    console.error('❌ 초기 캐시 업데이트 실패:', error.message);
    console.log('   다음 주기 갱신에서 재시도합니다...\n');
  }
  
  // 다음 갱신 시간 계산
  const nextUpdate = new Date(Date.now() + INTERVAL_MS);
  console.log(`⏰ 다음 자동 갱신: ${nextUpdate.toLocaleString('ko-KR')}\n`);
  
  // 이후 10분마다 실행
  setInterval(async () => {
    try {
      await updateCache();
      const nextUpdate = new Date(Date.now() + INTERVAL_MS);
      console.log(`⏰ 다음 자동 갱신: ${nextUpdate.toLocaleString('ko-KR')}\n`);
    } catch (error) {
      console.error('❌ 주기 갱신 실패:', error.message);
      console.log('   다음 주기에서 재시도합니다...\n');
    }
  }, INTERVAL_MS);
}

// 스크립트 시작
start().catch(console.error);

