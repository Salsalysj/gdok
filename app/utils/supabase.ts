import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase 환경 변수가 설정되지 않았습니다. 패키지 저장 기능이 작동하지 않을 수 있습니다.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 저장된 패키지 타입
export type SavedPackage = {
  id: string;
  package_name: string;
  package_data: any; // PackageData JSON
  created_at: string;
  updated_at: string;
};

