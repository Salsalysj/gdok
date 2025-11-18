# Supabase 설정 가이드

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 접속하여 회원가입/로그인
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - Project Name: 원하는 이름 (예: `lostark-calc`)
   - Database Password: 안전한 비밀번호 입력 (기억해두세요)
   - Region: 가장 가까운 지역 선택
4. 프로젝트 생성 완료 대기 (약 2분)

## 2. Supabase 환경 변수 가져오기

1. 프로젝트 대시보드에서 "Settings" > "API" 메뉴로 이동
2. 다음 값들을 복사:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** 키 → `SUPABASE_SERVICE_ROLE_KEY` (서버 사이드 전용, 절대 공개하지 마세요!)

## 3. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일 생성 (이미 있다면 추가):

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**주의**: 
- `.env.local` 파일은 Git에 커밋하지 마세요! (이미 `.gitignore`에 포함되어 있을 것입니다)
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 사이드에서만 사용되며, 클라이언트에 노출되면 안 됩니다.

## 4. 데이터베이스 테이블 생성

1. Supabase 대시보드에서 "SQL Editor" 메뉴로 이동
2. `supabase-setup.sql` 파일 내용을 복사하여 SQL Editor에 붙여넣기
3. "Run" 버튼 클릭하여 실행
4. 성공 메시지 확인

## 5. 테이블 구조 확인

1. Supabase 대시보드에서 "Table Editor" 메뉴로 이동
2. 다음 테이블들이 생성되었는지 확인:
   - `saved_packages` (패키지 저장용)
   - `crystal_exchange_rates` (크리스탈 환율 캐시용)

### saved_packages 테이블 구조:
   - `id` (UUID, Primary Key)
   - `package_name` (TEXT)
   - `package_data` (JSONB)
   - `created_at` (Timestamp)
   - `updated_at` (Timestamp)

### crystal_exchange_rates 테이블 구조:
   - `id` (UUID, Primary Key)
   - `timestamp` (TIMESTAMP WITH TIME ZONE, UNIQUE) - 시간 단위로 정규화된 타임스탬프
   - `exchange` (NUMERIC) - 100크리당 골드 가격
   - `created_at` (Timestamp)
   - `updated_at` (Timestamp, 자동 갱신)
   - `source_timestamp` (Timestamp, 외부 API에서 제공한 원본 시간)

## 6. 크리스탈 환율 자동 갱신 스케줄러

크리스탈 환율은 매일 **오전 12시**와 **오후 12시**에 자동으로 갱신됩니다.

- 스케줄러는 `scripts/cron-update-crystal-exchange.js` 파일로 구현되어 있습니다.
- `npm run dev` 또는 `npm start` 실행 시 자동으로 함께 실행됩니다.
- 스케줄러는 `/api/admin/crystal-gold/update-exchange` 엔드포인트를 호출하여 Supabase에 환율을 저장합니다.
- 필요 시 관리자 페이지(`/admin`)에서 **즉시 갱신** 버튼을 눌러 수동으로 갱신할 수 있습니다.

## 7. 애플리케이션 실행

```bash
npm run dev
```

브라우저에서 다음 페이지들을 확인하세요:
- 패키지 효율 계산기: 저장 기능이 정상 작동하는지 확인
- 골드 환율: Supabase에서 크리스탈 환율이 정상적으로 표시되는지 확인

## 문제 해결

### 환경 변수가 인식되지 않을 때
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- Next.js 개발 서버 재시작 (`npm run dev`)
- 환경 변수 이름이 정확한지 확인 (`NEXT_PUBLIC_` 접두사 필수)

### Supabase 연결 실패
- Supabase 프로젝트가 활성 상태인지 확인
- 환경 변수 값이 정확한지 확인
- Supabase 대시보드에서 API 연결 상태 확인

### 테이블 생성 실패
- SQL 스크립트를 다시 확인하고 순서대로 실행
- Supabase SQL Editor의 에러 메시지 확인

## 향후 개선사항 (선택)

### 인증 추가
현재는 모든 사용자가 모든 패키지를 볼 수 있습니다. 사용자별로 패키지를 분리하려면:

1. Supabase Auth 활성화
2. `saved_packages` 테이블에 `user_id` 컬럼 추가
3. RLS 정책 수정하여 자신의 패키지만 볼 수 있도록 설정

### 백업
Supabase는 자동으로 백업을 제공하지만, 중요한 데이터라면:
- 주기적으로 데이터베이스 덤프 다운로드
- 또는 Supabase 대시보드에서 백업 설정 확인

