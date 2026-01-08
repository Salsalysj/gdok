import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Vercel에서 자동으로 제공하는 도메인 사용
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
  
  // robots.txt 생성
  const robots = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new NextResponse(robots, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

