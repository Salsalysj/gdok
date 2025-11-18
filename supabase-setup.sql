

-- Supabase에 저장된 패키지 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS saved_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name TEXT NOT NULL,
  package_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- updated_at 자동 업데이트를 위한 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 트리거 생성
DROP TRIGGER IF EXISTS update_saved_packages_updated_at ON saved_packages;
CREATE TRIGGER update_saved_packages_updated_at
BEFORE UPDATE ON saved_packages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_saved_packages_created_at ON saved_packages(created_at DESC);

-- RLS (Row Level Security) 정책 설정 (선택사항)
-- 모든 사용자가 읽고 쓸 수 있도록 설정 (인증 추가 시 수정 필요)
ALTER TABLE saved_packages ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 읽기 허용" ON saved_packages;
CREATE POLICY "모든 사용자 읽기 허용" ON saved_packages
  FOR SELECT
  USING (true);

-- 모든 사용자가 삽입할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 삽입 허용" ON saved_packages;
CREATE POLICY "모든 사용자 삽입 허용" ON saved_packages
  FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 업데이트할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 업데이트 허용" ON saved_packages;
CREATE POLICY "모든 사용자 업데이트 허용" ON saved_packages
  FOR UPDATE
  USING (true);

-- 모든 사용자가 삭제할 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 삭제 허용" ON saved_packages;
CREATE POLICY "모든 사용자 삭제 허용" ON saved_packages
  FOR DELETE
  USING (true);

-- 크리스탈 환율 캐시 테이블 생성
CREATE TABLE IF NOT EXISTS crystal_exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
  exchange NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- timestamp 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_crystal_exchange_rates_timestamp ON crystal_exchange_rates(timestamp DESC);

-- updated_at 자동 업데이트를 위한 트리거 함수 (이미 존재할 수 있음)
CREATE OR REPLACE FUNCTION update_crystal_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 트리거 생성
DROP TRIGGER IF EXISTS update_crystal_exchange_rates_updated_at ON crystal_exchange_rates;
CREATE TRIGGER update_crystal_exchange_rates_updated_at
BEFORE UPDATE ON crystal_exchange_rates
FOR EACH ROW
EXECUTE FUNCTION update_crystal_exchange_rates_updated_at();

-- RLS 정책 설정
ALTER TABLE crystal_exchange_rates ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 정책 설정
DROP POLICY IF EXISTS "모든 사용자 읽기 허용" ON crystal_exchange_rates;
CREATE POLICY "모든 사용자 읽기 허용" ON crystal_exchange_rates
  FOR SELECT
  USING (true);

-- 서버에서만 삽입할 수 있도록 정책 설정 (anon key로는 삽입 불가, 서비스 키 필요)
-- 실제로는 API Route에서 서비스 키를 사용하므로 이 정책은 필요 없을 수 있음
-- 하지만 안전을 위해 읽기만 허용

