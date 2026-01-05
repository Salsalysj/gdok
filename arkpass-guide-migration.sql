-- 아크패스 가이드 테이블 마이그레이션 SQL
-- pass_period 컬럼을 start_date, end_date로 변경
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- 1. 기존 테이블이 pass_period를 사용하는 경우 마이그레이션
-- 먼저 컬럼이 존재하는지 확인하고 마이그레이션

-- start_date 컬럼 추가 (없는 경우)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saved_arkpass_guides' 
    AND column_name = 'start_date'
  ) THEN
    ALTER TABLE saved_arkpass_guides ADD COLUMN start_date TEXT;
  END IF;
END $$;

-- end_date 컬럼 추가 (없는 경우)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saved_arkpass_guides' 
    AND column_name = 'end_date'
  ) THEN
    ALTER TABLE saved_arkpass_guides ADD COLUMN end_date TEXT;
  END IF;
END $$;

-- pass_period가 존재하는 경우 데이터 마이그레이션
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saved_arkpass_guides' 
    AND column_name = 'pass_period'
  ) THEN
    -- pass_period에서 날짜 추출 (형식: "2025.02.05 ~ 2025.04.02")
    UPDATE saved_arkpass_guides
    SET 
      start_date = CASE 
        WHEN pass_period ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}' THEN
          REPLACE(SUBSTRING(pass_period FROM '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}'), '.', '-')
        ELSE ''
      END,
      end_date = CASE 
        WHEN pass_period ~ '[0-9]{4}\.[0-9]{2}\.[0-9]{2}$' THEN
          REPLACE(SUBSTRING(pass_period FROM '[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'), '.', '-')
        ELSE ''
      END
    WHERE start_date IS NULL OR end_date IS NULL;
    
    -- pass_period 컬럼 삭제
    ALTER TABLE saved_arkpass_guides DROP COLUMN pass_period;
  END IF;
END $$;

-- start_date와 end_date를 NOT NULL로 설정 (기본값이 있는 경우)
DO $$ 
BEGIN
  -- NULL 값이 있으면 빈 문자열로 설정
  UPDATE saved_arkpass_guides SET start_date = '' WHERE start_date IS NULL;
  UPDATE saved_arkpass_guides SET end_date = '' WHERE end_date IS NULL;
  
  -- NOT NULL 제약 조건 추가
  ALTER TABLE saved_arkpass_guides 
    ALTER COLUMN start_date SET NOT NULL,
    ALTER COLUMN end_date SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- 이미 NOT NULL이거나 다른 오류가 발생한 경우 무시
    NULL;
END $$;

