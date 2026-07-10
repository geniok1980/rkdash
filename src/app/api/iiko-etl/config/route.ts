import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIikoEtlConfig, setIikoEtlConfig } from '@/lib/dashboard-settings';

export const dynamic = 'force-dynamic';

const schema = z.object({
  etlServiceUrl: z.string().min(1, 'Укажите URL ETL сервиса'),
  serverUrl: z.string().min(1, 'Укажите URL сервера iiko'),
  login: z.string().min(1, 'Укажите логин'),
  password: z.string().min(1, 'Укажите пароль'),
  intervalSeconds: z.coerce.number().int().min(60, 'Минимум 60 секунд'),
  requestTimeoutSeconds: z.coerce.number().int().min(5, 'Минимум 5 секунд'),
  verifySsl: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value.trim().toLowerCase() === 'true'
    )
});

export async function GET() {
  const config = await getIikoEtlConfig();
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

  const saved = await setIikoEtlConfig(parsed.data);
  return NextResponse.json(saved);
}
