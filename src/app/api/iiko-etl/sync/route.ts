import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIikoEtlConfig } from '@/lib/dashboard-settings';
import { resolveReachableServiceBaseUrl } from '@/lib/service-url';

export const dynamic = 'force-dynamic';

const schema = z.object({
  kind: z.enum(['all', 'dicts', 'products', 'sales']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

function previousDayIso(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Некорректный запрос' },
      { status: 400 }
    );
  }

  const config = await getIikoEtlConfig();
  const baseUrl = resolveReachableServiceBaseUrl(config.etlServiceUrl);
  const needsDates = parsed.data.kind === 'all' || parsed.data.kind === 'sales';
  const dateFrom = parsed.data.dateFrom || previousDayIso();
  const dateTo = parsed.data.dateTo || dateFrom;

  const targetUrl =
    parsed.data.kind === 'dicts'
      ? `${baseUrl}/sync`
      : parsed.data.kind === 'products'
        ? `${baseUrl}/sync/products`
        : parsed.data.kind === 'sales'
          ? `${baseUrl}/sync/sales`
          : `${baseUrl}/sync/all`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: needsDates ? JSON.stringify({ date_from: dateFrom, date_to: dateTo }) : undefined,
      signal: AbortSignal.timeout(20_000)
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `IIKO ETL sync failed with ${response.status}`,
          payload
        },
        { status: 502 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'IIKO ETL service is unavailable' },
      { status: 502 }
    );
  }
}
