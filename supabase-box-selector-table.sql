-- 상자 선택 도우미 저장 테이블 생성 SQL
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS saved_box_selectors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  box_name TEXT NOT NULL,
  item_name TEXT,
  acquisition_source TEXT,
  box_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_saved_box_selectors_created_at ON saved_box_selectors(created_at DESC);

-- RLS (Row Level Security) 정책 설정 (선택사항)
-- 모든 사용자가 읽기/쓰기 가능하도록 설정하려면:
ALTER TABLE saved_box_selectors ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Allow public read access" ON saved_box_selectors
  FOR SELECT
  USING (true);

-- 모든 사용자가 삽입 가능
CREATE POLICY "Allow public insert access" ON saved_box_selectors
  FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 업데이트 가능
CREATE POLICY "Allow public update access" ON saved_box_selectors
  FOR UPDATE
  USING (true);

-- 모든 사용자가 삭제 가능
CREATE POLICY "Allow public delete access" ON saved_box_selectors
  FOR DELETE
  USING (true);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_saved_box_selectors_updated_at
  BEFORE UPDATE ON saved_box_selectors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
