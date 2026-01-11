export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: '커스텀 계산기 - 껨산기',
  description: '상자 선택 도우미, 교환 상점 계산기',
};

import { redirect } from 'next/navigation';

export default function CustomCalculatorPage() {
  redirect('/custom-calculator/box-selector');
}
