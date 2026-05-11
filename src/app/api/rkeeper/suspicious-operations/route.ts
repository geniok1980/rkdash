import { NextRequest, NextResponse } from 'next/server';
import { getSuspiciousOperations } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;

  try {
    const data = await getSuspiciousOperations({ from, to });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message }, { status: 501 });
  }
}
