# 순환 돌파석 가치 계산 가이드

## 개요
순환 돌파석의 가치는 **재련 효율 - 특수 재련 효율** 탭의 데이터를 기반으로 계산됩니다.
각 강화 단계별로 무기/방어구의 순환 돌파석 1개당 가치를 계산하고, 상위 5개의 평균값을 사용합니다.

## 구조

### 1. Supabase 테이블
```sql
CREATE TABLE circular_breakthrough_values (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  weapon_value NUMERIC,
  armor_value NUMERIC,
  last_updated TIMESTAMP DEFAULT NOW()
);
```

### 2. 데이터 계산 및 저장

#### 자동 갱신 (market_cache 갱신 시 함께 갱신)
- **스케줄**: 10분마다 (`*/10 * * * *`) - market_cache 갱신 주기와 동일
- **엔드포인트**: `/api/market/cache/update`
- **동작**:
  1. 시장 데이터 (market_cache) 갱신
  2. 갱신 성공 시 자동으로 `/api/refining/circular-breakthrough/calculate-and-save` 호출
  3. Supabase에서 최신 시장 데이터 조회
  4. `upgrade1.csv` (무기), `upgrade2.csv` (방어구) 읽기
  5. 각 강화 단계별 순환 돌파석 가치 계산
  6. Supabase에 저장
- **장점**: 시장 데이터와 순환 돌파석 가치가 항상 동기화됨

### 3. 데이터 조회 및 사용

#### lib/circularBreakthrough.ts
```typescript
export async function getCircularBreakthroughValue(): Promise<{
  weaponValue: number;
  armorValue: number;
}>;
```

- **기능**: Supabase에서 순환 돌파석 가치 조회 (상위 5개 평균)
- **캐싱**: 메모리 캐시 6시간
- **반환값**:
  - `weaponValue`: 무기 상위 5개 평균
  - `armorValue`: 방어구 상위 5개 평균

#### lib/contentRewards.ts
```typescript
async function calculateCircularBreakthroughStoneValue(marketData: any): Promise<number | null>;
```

- **사용처**: 지옥3 (hell3.csv) 보상 처리 시
- **계산 방식**: `(weaponValue + armorValue) / 2`
- **적용 대상**: `reward.itemName === '순환 돌파석'`

### 4. 순환 돌파석 가치 계산 공식

```
순환 돌파석 1개당 가치 = (재련 비용 * 기본 성공률) / 돌파석 개수
```

**재련 비용**:
- 재료 비용 (파괴석/수호석/돌파석 등)
- 골드 비용
- ❌ 경험치 재료 제외 (파편 등)

**돌파석 개수**:
- 무기:
  - +10~12강: 30개
  - +13~16강: 40개
  - +17~25강: 50개
- 방어구:
  - +10~12강: 12개
  - +13~16강: 16개
  - +17~25강: 20개

## 설정 방법

### 1. Supabase 테이블 생성
```bash
# Supabase Dashboard > SQL Editor에서 실행
# 파일: supabase-setup.sql
```

### 2. 환경 변수 설정 (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
CRON_SECRET=your_random_secret
```

### 3. Vercel 환경 변수 설정
Vercel Dashboard > Project > Settings > Environment Variables에서 위 환경 변수 모두 추가

### 4. Vercel Cron Job 설정
`vercel.json` 파일에 이미 설정되어 있음:
```json
{
  "path": "/api/market/cache/update",
  "schedule": "*/10 * * *"
}
```
- **참고**: 순환 돌파석 효율표는 별도의 cron job 없이 `market_cache` 갱신 시 자동으로 함께 갱신됨

## 사용 예시

### 컨텐츠 보상 페이지
1. **지옥** 탭 선택
2. **지옥3** 선택
3. 단계 선택 (0단계~10단계)
4. 보상 목록에서 **순환 돌파석** 확인
5. 단가가 Supabase에서 조회한 값으로 표시됨

## 트러블슈팅

### 순환 돌파석 가치가 0으로 표시되는 경우
1. **Supabase 데이터 확인**:
   ```sql
   SELECT * FROM circular_breakthrough_values ORDER BY level;
   ```
2. **수동 갱신**: `/api/market/cache/update` GET 요청으로 즉시 갱신
   ```bash
   curl -X GET https://your-domain.vercel.app/api/market/cache/update \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
3. **환경 변수 확인**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 확인

### Cron Job이 실행되지 않는 경우
1. **Vercel Logs 확인**: Vercel Dashboard > Deployments > Functions
2. **CRON_SECRET 확인**: 환경 변수에 올바르게 설정되었는지 확인
3. **수동 호출 테스트**:
   ```bash
   # market_cache 갱신 (순환 돌파석도 자동으로 갱신됨)
   curl -X GET https://your-domain.vercel.app/api/market/cache/update \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

## 캐싱 전략

1. **메모리 캐시** (6시간):
   - `lib/circularBreakthrough.ts`의 `cachedCircularBreakthrough`
   - 동일한 요청에 대해 Supabase 호출 최소화

2. **Supabase 저장**:
   - 모든 서버 인스턴스가 공유하는 영구 저장소
   - 10분마다 market_cache 갱신 시 자동으로 함께 갱신

3. **자동 동기화**:
   - 시장 데이터와 순환 돌파석 가치가 항상 최신 상태로 유지됨
   - 별도의 수동 갱신 불필요

## 주의사항

- 순환 돌파석 가치는 시장 가격에 따라 변동됨
- market_cache 갱신 시 자동으로 순환 돌파석 가치도 갱신되므로, 시장 데이터와 항상 동기화됨
- 순환 돌파석 계산은 Supabase의 시장 캐시 데이터를 사용하므로, 시장 캐시가 최신 상태여야 함
- 재련 효율 페이지에 수동 저장 버튼은 제거되었으며, 모든 갱신은 자동으로 이루어짐

