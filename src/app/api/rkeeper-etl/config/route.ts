import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getRkeeperEtlConfig, setRkeeperEtlConfig } from '@/lib/dashboard-settings';

export const dynamic = 'force-dynamic';

const numberField = (fallback: number, minimum: number, message: string) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? fallback : value),
    z.coerce.number().int().min(minimum, message)
  );

const schema = z.object({
  etlServiceUrl: z.string().min(1, 'Укажите URL ETL сервиса'),
  rkServerIp: z.string().default(''),
  rkHttpPort: numberField(16058, 1, 'Укажите RK HTTP port'),
  rkUsername: z.string().default(''),
  rkPassword: z.string().default(''),
  mssqlServer: z.string().default(''),
  mssqlDatabase: z.string().default(''),
  mssqlUser: z.string().default(''),
  mssqlPassword: z.string().default(''),
  mssqlPort: numberField(1433, 1, 'Укажите MSSQL port'),
  storehouseApiUrl: z.string().default(''),
  storehouseUsername: z.string().default(''),
  storehousePassword: z.string().default(''),
  storehouseRequestTimeoutSeconds: numberField(30, 5, 'Минимум 5 секунд'),
  storehouseRptSalePeriodDays: numberField(1, 1, 'Минимум 1 день'),
  intervalSeconds: numberField(3600, 60, 'Минимум 60 секунд'),
  writeMode: z.enum(['append', 'overwrite'])
});

export async function GET() {
  const config = await getRkeeperEtlConfig();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Некорректная конфигурация' },
      { status: 400 }
    );
  }

  const saved = await setRkeeperEtlConfig(parsed.data);
  return NextResponse.json(saved);
}
