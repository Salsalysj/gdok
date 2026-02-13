-- [폐기] 제작 재료 교환 데이터는 더 이상 Supabase를 사용하지 않습니다.
-- 데이터는 프로젝트 내 data/craft-material-exchanges.json 파일로 관리됩니다.
-- 기존 Supabase 테이블을 제거하려면: DROP TABLE IF EXISTS saved_craft_material_exchanges;
--
-- 아래는 참고용 기존 테이블 정의입니다. 새로 생성하지 마세요.
/*
CREATE TABLE IF NOT EXISTS saved_craft_material_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name TEXT NOT NULL,
  shop_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_craft_material_exchanges_created_at ON saved_craft_material_exchanges(created_at DESC);

-- updated_at 자동 업데이트 (update_updated_at_column 함수가 이미 있으면 생략 가능)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_saved_craft_material_exchanges_updated_at ON saved_craft_material_exchanges;
CREATE TRIGGER update_saved_craft_material_exchanges_updated_at
  BEFORE UPDATE ON saved_craft_material_exchanges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
*/
