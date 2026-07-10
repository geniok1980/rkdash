import { NextResponse } from 'next/server';

import { getRkeeperEtlConfig } from '@/lib/dashboard-settings';
import { resolveReachableServiceBaseUrl } from '@/lib/service-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = await getRkeeperEtlConfig();
  const baseUrl = resolveReachableServiceBaseUrl(config.etlServiceUrl);

  try {
    const response = await fetch(`${baseUrl}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `RKeeper ETL service returned ${response.status}`,
          payload
        },
        { status: 502 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'RKeeper ETL service is unavailable' },
      { status: 502 }
    );
  }
}
