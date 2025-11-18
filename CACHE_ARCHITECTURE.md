# 캐시 아키텍처 설명

## 개요
본 애플리케이션은 3단계 캐싱 전략을 사용하여 성능을 최적화합니다.

## 캐싱 레벨

### 1. 인메모리 캐시 (In-Memory Cache)
- **위치**: `lib/marketCache.ts`, `lib/contentRewards.ts`
- **유효 기간**: 6시간
- **속도**: 밀리초 단위 (~1-5ms)
- **설명**: 서버 프로세스 메모리에 캐시를 저장하여 가장 빠른 응답 제공
- **적용 대상**:
  - 시장 데이터 (`getMarketCache()`)
  - 컨텐츠 보상 데이터 (`getContentRewardsData()`)

```typescript
// 예시: lib/marketCache.ts
let inMemoryCache: { data: CachedMarketData; timestamp: number } | null = null;
const MEMORY_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6시간

export async function getMarketCache(): Promise<CachedMarketData | null> {
  // 1. 인메모리 캐시 확인 (가장 빠름)
  if (inMemoryCache && Date.now() - inMemoryCache.timestamp < MEMORY_CACHE_DURATION) {
    return inMemoryCache.data;
  }
  
  // 2. Supabase에서 가져오기...
}
```

### 2. Supabase 캐시 (Database Cache)
- **위치**: Supabase `market_cache` 테이블
- **유효 기간**: 10분 (Cron Job으로 업데이트)
- **속도**: 수백 밀리초 단위 (~100-500ms)
- **설명**: 
  - 인메모리 캐시가 만료되었을 때 Supabase에서 데이터를 가져옴
  - Vercel의 여러 서버리스 인스턴스 간 캐시를 공유
  - Cron Job (`/api/market/cache/update`)이 10분마다 최신 데이터로 업데이트

```sql
-- market_cache 테이블 구조
CREATE TABLE market_cache (
  id UUID PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. Lost Ark API (원본 데이터)
- **유효 기간**: 실시간
- **속도**: 수 초 단위 (~2-10초)
- **설명**: 
  - Cron Job이 10분마다 Lost Ark API를 호출하여 최신 시장 데이터를 가져옴
  - 사용자는 직접 API를 호출하지 않음 (API 키 절약)

## 데이터 흐름

```
사용자 요청
  ↓
인메모리 캐시 확인 (1-5ms)
  ↓ (만료 시)
Supabase 캐시 조회 (100-500ms)
  ↓ (10분마다 Cron Job이 업데이트)
Lost Ark API 호출 (2-10초)
```

## 페이지별 캐싱 전략

### `/market` (주요 아이템 시세)
1. **첫 번째 방문**: Supabase 캐시 조회 (~100-500ms)
2. **6시간 내 재방문**: 인메모리 캐시 사용 (~1-5ms)
3. **6시간 후 방문**: Supabase 캐시 재조회 → 인메모리 캐시 갱신

### `/content-rewards` (컨텐츠 보상)
1. **첫 번째 방문**: 
   - 시장 데이터: Supabase 캐시 조회
   - 보상 계산: 수행 후 인메모리 캐시에 저장
2. **6시간 내 재방문**: 인메모리 캐시 사용 (~1-5ms)

### `/event-efficiency` (이벤트 효율)
- `/content-rewards`와 동일한 캐싱 전략 사용

### `/package-efficiency` (패키지 효율)
- 시장 데이터만 캐시 사용 (인메모리 + Supabase)

### `/refining-simulation` (재련 시뮬레이션)
- 시장 데이터만 캐시 사용 (인메모리 + Supabase)

## 캐시 업데이트 주기

### 자동 업데이트 (Cron Jobs)
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/market/cache/update",
      "schedule": "*/10 * * * *"  // 10분마다
    },
    {
      "path": "/api/admin/crystal-gold/update-exchange",
      "schedule": "*/10 * * * *"  // 10분마다
    }
  ]
}
```

### 수동 업데이트
- `/api/market/cache/update`를 직접 호출하여 즉시 캐시 업데이트 가능
- `Authorization: Bearer YOUR_CRON_SECRET` 헤더 필요

## 성능 향상

### Before (캐싱 없음)
- 모든 요청마다 Lost Ark API 호출
- 응답 시간: ~2-10초
- API 호출 횟수: 사용자 수 × 페이지 로드 수

### After (3단계 캐싱)
- 첫 방문: ~100-500ms (Supabase 캐시)
- 재방문: ~1-5ms (인메모리 캐시)
- API 호출 횟수: 10분당 1회 (Cron Job)

**성능 향상**: 최대 **2000배** (10초 → 5ms)

## Vercel 환경에서의 동작

### 서버리스 특성
- Vercel의 각 서버리스 함수 인스턴스는 독립적인 메모리 공간을 가짐
- 인메모리 캐시는 각 인스턴스별로 독립적으로 관리됨
- Supabase 캐시가 인스턴스 간 데이터를 공유하는 역할

### Cold Start 처리
- 새로운 서버리스 인스턴스가 시작될 때 (Cold Start):
  1. 인메모리 캐시는 비어있음
  2. Supabase에서 캐시를 가져와 인메모리에 저장
  3. 이후 요청은 인메모리 캐시 사용

### Warm Instance
- 이미 실행 중인 인스턴스 (Warm):
  1. 10분 내 재요청은 인메모리 캐시 사용 (초고속)
  2. 10분 초과 시 Supabase 재조회

## 모니터링

### 로그 확인
```typescript
// lib/marketCache.ts
if (inMemoryCache && Date.now() - inMemoryCache.timestamp < MEMORY_CACHE_DURATION) {
  console.log('✓ Using in-memory cache'); // 인메모리 캐시 히트
  return inMemoryCache.data;
}
console.log('→ Fetching from Supabase'); // Supabase 조회
```

### 캐시 상태 확인
- Supabase Dashboard에서 `market_cache` 테이블의 `last_updated` 컬럼 확인
- `/api/market/cache/update` 호출 시 응답에서 `updated` 필드 확인

## 주의사항

1. **환경변수 필수**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`

2. **Supabase 테이블 생성**:
   - 배포 전 `supabase-setup.sql` 실행 필수

3. **Cron Job 설정**:
   - Vercel Pro 플랜 이상에서만 Cron Jobs 사용 가능
   - Hobby 플랜에서는 수동으로 `/api/market/cache/update` 호출 필요

4. **인메모리 캐시 제한**:
   - 서버리스 환경에서는 인스턴스가 종료되면 인메모리 캐시도 사라짐
   - Supabase 캐시가 백업 역할을 수행

