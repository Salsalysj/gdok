-- 혈석 상점 교환 데이터 저장 테이블 생성
CREATE TABLE IF NOT EXISTS saved_bloodstone_shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name TEXT NOT NULL,
  shop_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_saved_bloodstone_shops_created_at ON saved_bloodstone_shops(created_at DESC);

-- updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_saved_bloodstone_shops_updated_at
  BEFORE UPDATE ON saved_bloodstone_shops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) 정책 설정 (선택사항)
-- 필요에 따라 인증된 사용자만 접근하도록 설정할 수 있습니다
-- ALTER TABLE saved_bloodstone_shops ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations for authenticated users" ON saved_bloodstone_shops FOR ALL USING (auth.role() = 'authenticated');

