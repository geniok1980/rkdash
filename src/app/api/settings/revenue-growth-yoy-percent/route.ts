import { NextRequest, NextResponse } from 'next/server';
import { getRevenueGrowthYoYPercent, setRevenueGrowthYoYPercent } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const percent = await getRevenueGrowthYoYPercent();
  return NextResponse.json({ percent });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown;
  const value =
    typeof body === 'object' && body !== null && 'percent' in body
      ? (body as { percent?: unknown }).percent
      : undefined;

  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    return NextResponse.json({ error: 'percent must be a number' }, { status: 400 });
  }

  const saved = await setRevenueGrowthYoYPercent(num);
  return NextResponse.json({ percent: saved });
}
