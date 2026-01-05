# 아크패스 선택 가이드 설정 가이드

## Supabase 테이블 생성

Supabase Dashboard > SQL Editor에서 다음 SQL을 실행하세요:

```sql
-- 아크패스 선택 가이드 저장 테이블 생성
CREATE TABLE IF NOT EXISTS saved_arkpass_guides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pass_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  levels JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- updated_at 자동 업데이트를 위한 트리거 생성
DROP TRIGGER IF EXISTS update_saved_arkpass_guides_updated_at ON saved_arkpass_guides;
CREATE TRIGGER update_saved_arkpass_guides_updated_at
BEFORE UPDATE ON saved_arkpass_guides
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_saved_arkpass_guides_created_at ON saved_arkpass_guides(created_at DESC);

-- RLS (Row Level Security) 정책 설정
ALTER TABLE saved_arkpass_guides ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 읽기 허용 arkpass" ON saved_arkpass_guides;
CREATE POLICY "모든 사용자 읽기 허용 arkpass" ON saved_arkpass_guides
  FOR SELECT
  USING (true);

-- 모든 사용자가 삽입할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 삽입 허용 arkpass" ON saved_arkpass_guides;
CREATE POLICY "모든 사용자 삽입 허용 arkpass" ON saved_arkpass_guides
  FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 업데이트할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 업데이트 허용 arkpass" ON saved_arkpass_guides;
CREATE POLICY "모든 사용자 업데이트 허용 arkpass" ON saved_arkpass_guides
  FOR UPDATE
  USING (true);

-- 모든 사용자가 삭제할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 삭제 허용 arkpass" ON saved_arkpass_guides;
CREATE POLICY "모든 사용자 삭제 허용 arkpass" ON saved_arkpass_guides
  FOR DELETE
  USING (true);
```

## 기능 설명

### 1. 기본 정보 입력
- **패스 이름**: 아크패스 이름 입력 (예: 2025년 2월 아크패스)
- **시작일**: 아크패스 시작일 입력 (날짜 형식)
- **종료일**: 아크패스 종료일 입력 (날짜 형식)

### 2. 레벨별 선택 아이템 비교
- **레벨 추가**: 각 레벨마다 2개의 선택지(A, B)를 비교할 수 있습니다
- **묶음 항목**: 각 선택지에 여러 개의 묶음 항목을 추가할 수 있습니다
- **구성 요소**: 각 묶음 항목에 구성 요소를 추가하여 가치를 계산합니다
- **자동 추천**: 가치가 더 높은 선택지에 "추천" 배지와 노란색 하이라이트가 표시됩니다

### 3. 가치 계산
- 각 구성 요소의 단가 × 수량 × 묶음 수량으로 자동 계산됩니다
- 가치계산DB의 데이터를 활용하여 실시간으로 가치를 표시합니다

### 4. 저장 및 불러오기
- **로컬 환경**: 저장, 업데이트, 삭제 가능
- **배포 환경**: 저장된 가이드 불러오기만 가능

## 사용 방법

1. 기본 정보(패스 이름, 시작일, 종료일)를 입력합니다
2. "레벨 추가" 버튼을 클릭하여 레벨을 추가합니다
3. 각 선택지(A, B)에 "묶음 추가" 버튼을 클릭하여 묶음 항목을 추가합니다
4. 각 묶음 항목에 "구성 요소 추가" 버튼을 클릭하여 아이템을 추가합니다
5. 드롭다운에서 아이템을 선택하고 수량을 입력합니다
6. 자동으로 계산된 가치를 확인하고, 더 높은 선택지를 확인합니다
7. (로컬 환경) "저장" 버튼을 클릭하여 가이드를 저장합니다

## 주의사항

- `update_updated_at_column()` 함수가 이미 존재해야 합니다 (supabase-setup.sql 참조)
- 저장/업데이트/삭제 기능은 로컬 환경에서만 작동합니다
- 배포 환경에서는 저장된 가이드를 불러와서 확인만 가능합니다

