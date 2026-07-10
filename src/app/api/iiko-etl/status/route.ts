import { NextResponse } from 'next/server';
import { getIikoEtlConfig } from '@/lib/dashboard-settings';
import { resolveReachableServiceBaseUrl } from '@/lib/service-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = await getIikoEtlConfig();
  const baseUrl = resolveReachableServiceBaseUrl(config.etlServiceUrl);

  try {
    const response = await fetch(`${baseUrl}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `IIKO ETL service returned ${response.status}`,
          payload
        },
        { status: 502 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'IIKO ETL service is unavailable'
      },
      { status: 502 }
    );
  }
}
