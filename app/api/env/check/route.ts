import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rawKey = process.env.LOSTARK_API_KEY;
  const hasKey = typeof rawKey === 'string' && rawKey.trim().length > 0;
  const relatedEnvKeys = Object.keys(process.env).filter((key) =>
    key.includes('LOSTARK') ||
    key.includes('SUPABASE') ||
    key.includes('CRON')
  );
  return NextResponse.json({
    hasKey,
    // 길이만 노출하여 키 자체는 노출하지 않음
    length: hasKey ? rawKey!.trim().length : 0,
    rawKeyType: typeof rawKey,
    rawKeyIsUndefined: rawKey === undefined,
    rawKeyIsNull: rawKey === null,
    rawKeyIsEmptyString: rawKey === '',
    relatedEnvKeys,
    totalEnvCount: Object.keys(process.env).length,
  });
}


