# Supabase 패키지 저장 기능 빠른 시작 가이드

## ✅ 완료된 단계
- [x] Supabase 프로젝트 생성
- [x] .env.local 파일에 환경 변수 설정

## 🔧 다음 단계

### 1. 환경 변수 확인
`.env.local` 파일에 다음 변수들이 올바르게 설정되어 있는지 확인하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**중요**: 
- `NEXT_PUBLIC_` 접두사가 있어야 합니다
- Supabase 대시보드 > Settings > API에서 값을 확인할 수 있습니다

### 2. Supabase 데이터베이스 테이블 생성

1. Supabase 대시보드로 이동: https://supabase.com/dashboard
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **"SQL Editor"** 클릭
4. `supabase-setup.sql` 파일의 모든 내용을 복사
5. SQL Editor에 붙여넣기
6. **"Run"** 버튼 클릭 (또는 Ctrl+Enter)
7. 성공 메시지 확인

### 3. 테이블 생성 확인

1. Supabase 대시보드에서 **"Table Editor"** 메뉴 클릭
2. `saved_packages` 테이블이 보이는지 확인
3. 테이블 구조 확인:
   - id (uuid)
   - package_name (text)
   - package_data (jsonb)
   - created_at (timestamptz)
   - updated_at (timestamptz)

### 4. 애플리케이션 실행 및 테스트

```bash
npm run dev
```

브라우저에서 다음 URL로 접속하여 연결 테스트:
- http://localhost:3000/api/packages/test

**성공 메시지 예시**:
```json
{
  "success": true,
  "message": "Supabase 연결 성공!"
}
```

**실패 시 확인 사항**:
- 환경 변수가 올바른지 확인
- 테이블이 생성되었는지 확인
- Supabase 프로젝트가 활성 상태인지 확인

### 5. 패키지 효율 계산기에서 테스트

1. http://localhost:3000/package-efficiency 접속
2. 패키지 정보 입력
3. **"저장"** 버튼 클릭
4. 저장 모달에서 패키지명 입력 후 저장
5. 저장된 패키지 목록에 표시되는지 확인
6. **"불러오기"** 기능 테스트

## 🐛 문제 해결

### "테이블이 존재하지 않습니다" 오류
→ `supabase-setup.sql`을 Supabase SQL Editor에서 실행하세요

### "Supabase 환경 변수가 설정되지 않았습니다" 경고
→ `.env.local` 파일을 확인하고 서버를 재시작하세요

### 연결 실패
→ Supabase 프로젝트 대시보드에서 프로젝트 상태 확인

## 📝 참고
- Supabase 무료 플랜: 월 500MB 데이터베이스, 50,000개 월간 활성 사용자
- 모든 데이터는 Supabase 클라우드에 저장됩니다
- 인증 기능 추가 시 RLS 정책 수정이 필요합니다

