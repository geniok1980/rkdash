import { NextRequest, NextResponse } from 'next/server';
import { getCategorySales } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const data = await getCategorySales({ from, to });
  return NextResponse.json(data);
}
