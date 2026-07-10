import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getRkeeperEtlConfig } from '@/lib/dashboard-settings';
import { resolveReachableServiceBaseUrl } from '@/lib/service-url';

export const dynamic = 'force-dynamic';
const SYNC_REQUEST_TIMEOUT_MS = 30_000;

type EtlStatusPayload = {
  is_running?: boolean;
  last_dict_status?: string;
  last_sales_status?: string;
  last_storehouse_status?: string;
};

const schema = z.object({
  kind: z.enum(['all', 'dicts', 'sales', 'payments', 'operations', 'storehouse']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

function previousDayIso(): string {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

function currentDayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDays(isoDate: string, deltaDays: number): string {
  const value = new Date(`${isoDate}T00:00:00`);
  value.setDate(value.getDate() + deltaDays);
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

  const config = await getRkeeperEtlConfig();
  const baseUrl = resolveReachableServiceBaseUrl(config.etlServiceUrl);
  const needsDates = parsed.data.kind !== 'dicts';
  const storehouseUsesConfiguredPeriod =
    parsed.data.kind === 'storehouse' && !parsed.data.dateFrom && !parsed.data.dateTo;
  const storehouseDateTo = currentDayIso();
  const storehouseDateFrom = shiftIsoDays(
    storehouseDateTo,
    -(Math.max(1, config.storehouseRptSalePeriodDays) - 1)
  );
  const dateFrom = storehouseUsesConfiguredPeriod
    ? storehouseDateFrom
    : parsed.data.dateFrom || previousDayIso();
  const dateTo = storehouseUsesConfiguredPeriod
    ? storehouseDateTo
    : parsed.data.dateTo || dateFrom;

  const targetUrl =
    parsed.data.kind === 'dicts'
      ? `${baseUrl}/sync`
      : parsed.data.kind === 'sales'
        ? `${baseUrl}/sync/sales`
        : parsed.data.kind === 'payments'
          ? `${baseUrl}/sync/payments`
          : parsed.data.kind === 'operations'
            ? `${baseUrl}/sync/operations`
          : parsed.data.kind === 'storehouse'
            ? `${baseUrl}/sync/storehouse`
            : `${baseUrl}/sync/all`;

  const bodyPayload = needsDates ? JSON.stringify({ date_from: dateFrom, date_to: dateTo }) : undefined;

  async function tryReadStatus(): Promise<EtlStatusPayload | null> {
    try {
      const response = await fetch(`${baseUrl}/status`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as EtlStatusPayload | null;
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: bodyPayload,
      signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS)
    });

    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; message?: string }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.detail ||
            payload?.message ||
            `ETL service returned ${response.status}`
        },
        { status: response.status }
      );
    }
  } catch (error) {
    const statusPayload = await tryReadStatus();
    if (statusPayload?.is_running) {
      const kindLabel =
        parsed.data.kind === 'all'
          ? 'Полная синхронизация'
          : parsed.data.kind === 'dicts'
            ? 'Справочники'
            : parsed.data.kind === 'sales'
              ? 'Продажи'
              : parsed.data.kind === 'payments'
                ? 'Оплаты'
                : parsed.data.kind === 'operations'
                  ? 'Операции'
                  : 'StoreHouse';

      return NextResponse.json({
        status: 'accepted',
        message: needsDates
          ? `${kindLabel}: запуск подтвержден по статусу (${dateFrom} - ${dateTo})`
          : `${kindLabel}: запуск подтвержден по статусу`
      });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Не удалось связаться с ETL сервисом'
      },
      { status: 502 }
    );
  }

  const kindLabel =
    parsed.data.kind === 'all'
      ? 'Полная синхронизация'
      : parsed.data.kind === 'dicts'
        ? 'Справочники'
        : parsed.data.kind === 'sales'
          ? 'Продажи'
          : parsed.data.kind === 'payments'
            ? 'Оплаты'
            : parsed.data.kind === 'operations'
              ? 'Операции'
              : 'StoreHouse';

  return NextResponse.json({
    status: 'accepted',
    message: needsDates
      ? `${kindLabel}: запущено в фоне (${dateFrom} - ${dateTo})`
      : `${kindLabel}: запущено в фоне`
  });
}
