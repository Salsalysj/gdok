# 배포 환경 vs 로컬 환경 차이점

이 문서는 배포 버전과 로컬 환경에서 다르게 동작하는 기능들과 조건문을 정리합니다.

## 1. 서버 URL 설정

### `scripts/cron-update-crystal-exchange.js`
- **로컬**: `http://localhost:3000` (기본값)
- **배포**: `process.env.NEXT_PUBLIC_SERVER_URL` 또는 기본값
- **조건문**:
```javascript
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
```

### `scripts/cron-update-cache.js`
- **로컬**: `http://localhost:3000` (기본값)
- **배포**: `process.env.NEXT_PUBLIC_SERVER_URL` 또는 기본값
- **조건문**:
```javascript
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
```

### `scripts/revalidate-value-db.js`
- **로컬**: `http://localhost:3000` (기본값)
- **배포**: `process.env.NEXT_PUBLIC_BASE_URL` 또는 기본값
- **조건문**:
```javascript
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
```

### `app/sitemap.xml/route.ts`
- **로컬**: Request headers에서 host 추출 또는 기본값
- **배포**: `process.env.NEXT_PUBLIC_BASE_URL` 또는 request headers에서 추출
- **조건문**:
```typescript
const host = request.headers.get('host') || '';
const protocol = request.headers.get('x-forwarded-proto') || 'https';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
```

### `app/robots.txt/route.ts`
- **로컬**: Request headers에서 host 추출 또는 기본값
- **배포**: `process.env.NEXT_PUBLIC_BASE_URL` 또는 request headers에서 추출
- **조건문**:
```typescript
const host = request.headers.get('host') || '';
const protocol = request.headers.get('x-forwarded-proto') || 'https';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
```

## 2. 패키지 저장 기능 활성화

### `app/package-efficiency/client.tsx`
- **로컬**: 항상 활성화 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true'`일 때만 활성화
- **조건문**:
```typescript
const allowPackageSave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
```

### `app/event-efficiency/client.tsx`
- **로컬**: 항상 활성화 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true'`일 때만 활성화
- **조건문**:
```typescript
const allowEventEfficiencySave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
```

### `app/event-efficiency/arkpass/client.tsx`
- **로컬**: 항상 활성화 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true'`일 때만 활성화
- **조건문**:
```typescript
const allowSave = process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true' || process.env.NODE_ENV === 'development';
```

### `app/event-efficiency/bloodstone-shop/client.tsx`
- **로컬**: 항상 활성화 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_BLOODSTONE_SHOP_SAVE === 'true'`일 때만 활성화
- **조건문**:
```typescript
const allowShopSave = process.env.NEXT_PUBLIC_ALLOW_BLOODSTONE_SHOP_SAVE === 'true' || process.env.NODE_ENV === 'development';
```

## 3. API 라우트에서 저장 기능 제어

### `app/api/packages/route.ts`
- **로컬**: 항상 저장 허용 (`NODE_ENV === 'development'`)
- **배포**: `ALLOW_PACKAGE_SAVE === 'true'`일 때만 저장 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_PACKAGE_SAVE === 'true';
```

### `app/api/packages/[id]/route.ts`
- **로컬**: 항상 삭제/업데이트 허용 (`NODE_ENV === 'development'`)
- **배포**: `ALLOW_PACKAGE_SAVE === 'true'`일 때만 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_PACKAGE_SAVE === 'true';
```

### `app/api/event-efficiency/route.ts`
- **로컬**: 항상 저장 허용 (`NODE_ENV === 'development'`)
- **배포**: `ALLOW_PACKAGE_SAVE === 'true'`일 때만 저장 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_PACKAGE_SAVE === 'true';
```

### `app/api/event-efficiency/[id]/route.ts`
- **로컬**: 항상 삭제/업데이트 허용 (`NODE_ENV === 'development'`)
- **배포**: `ALLOW_PACKAGE_SAVE === 'true'`일 때만 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.ALLOW_PACKAGE_SAVE === 'true';
```

### `app/api/arkpass-guides/route.ts`
- **로컬**: 항상 저장 허용 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true'`일 때만 저장 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true';
```

### `app/api/arkpass-guides/[id]/route.ts`
- **로컬**: 항상 삭제/업데이트 허용 (`NODE_ENV === 'development'`)
- **배포**: `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true'`일 때만 허용
- **조건문**:
```typescript
const isLocal = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true';
```

## 4. 이벤트 종료일 체크

### `app/event-efficiency/client.tsx`
- **로컬**: 종료일이 지나도 항상 표시 (`NODE_ENV === 'development'`)
- **배포**: 종료일이 지난 이벤트는 경고 메시지 표시 및 기본정보 카드 숨김
- **조건문**:
```typescript
const isEventExpired = useMemo(() => {
  if (process.env.NODE_ENV === 'development') {
    return false; // 개발 환경에서는 항상 표시
  }
  if (!endDate) {
    return false; // 종료일이 설정되지 않았으면 표시
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return today > end;
}, [endDate]);
```

## 5. Supabase 연결 확인

### `app/utils/supabase.ts`
- **로컬/배포 공통**: 환경 변수가 없으면 null 반환 및 경고
- **조건문**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseInstance = null;

if (supabaseUrl && supabaseAnonKey) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase 환경 변수가 설정되지 않았습니다. 패키지 저장 기능이 작동하지 않을 수 있습니다.');
}
```

### `lib/marketCache.ts`
- **로컬/배포 공통**: 환경 변수가 없으면 null 반환 및 경고
- **조건문**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}
```

## 6. 요약

### 로컬 환경에서만 작동하는 기능:
1. ✅ 패키지 저장/업데이트/삭제 (자동 활성화)
2. ✅ 이벤트 효율 저장/업데이트/삭제 (자동 활성화)
3. ✅ 혈석 상점 저장/업데이트/삭제 (자동 활성화)
4. ✅ 아크패스 가이드 저장/업데이트/삭제 (자동 활성화)
5. ✅ 종료일이 지난 이벤트도 항상 표시

### 배포 환경에서 작동하려면 필요한 환경 변수:
- `NEXT_PUBLIC_ALLOW_PACKAGE_SAVE=true` - 패키지/이벤트 효율/아크패스 저장 기능 활성화
- `NEXT_PUBLIC_ALLOW_BLOODSTONE_SHOP_SAVE=true` - 혈석 상점 저장 기능 활성화
- `NEXT_PUBLIC_SERVER_URL` - 크리스탈 환율/캐시 갱신 스크립트용 서버 URL
- `NEXT_PUBLIC_BASE_URL` - sitemap.xml, robots.txt 생성용 기본 URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 연결
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase 클라이언트 키
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase 서버 사이드 키 (서버 전용)

### 항상 환경 변수에 따라 다른 동작:
1. 서버 URL (스크립트 실행)
2. Base URL (sitemap/robots 생성)
3. Supabase 연결 (없으면 해당 기능 비활성화)
