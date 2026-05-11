import { hermesDashboardFetch } from '@/lib/hermes-dashboard';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await hermesDashboardFetch('/api/status');
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Hermes Dashboard недоступен',
        detail: msg,
        hint: 'Запустите локально: hermes dashboard (нужен pip install "hermes-agent[web]")'
      },
      { status: 502 }
    );
  }
}
