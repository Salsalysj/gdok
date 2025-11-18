import { redirect } from 'next/navigation';

export default function MarketPage() {
  // 주요 아이템 시세 페이지는 UI에서 숨김 (백엔드 데이터는 다른 페이지에서 사용)
  redirect('/content-rewards');
}
