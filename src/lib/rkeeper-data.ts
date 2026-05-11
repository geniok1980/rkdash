import { createClient } from '@libsql/client';
import path from 'path';
import { cache } from 'react';

const defaultDbPath = path.resolve(process.cwd(), 'rkeeper_etl/rkeeper_data.db');
const dbPath = process.env.RKEEPER_DB_PATH || defaultDbPath;
const DB_URL = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;

const db = createClient({ url: DB_URL });

export interface SalesDateFilter {
  from?: string;
  to?: string;
}

const CACHE_TTL_MS = 15_000;
const memoryCache = new Map<string, { ts: number; value: unknown }>();

type RedisCacheClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { PX?: number }) => Promise<unknown>;
  quit?: () => Promise<void>;
  disconnect?: () => void;
};

declare global {
  // eslint-disable-next-line no-var -- global singleton
  var __rkeeperRedisClient: RedisCacheClient | undefined;
  // eslint-disable-next-line no-var -- global singleton
  var __rkeeperRedisClientPromise: Promise<RedisCacheClient | null> | undefined;
}

const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 800);
const REDIS_OP_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 400);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 400;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function getRedisClient(): Promise<RedisCacheClient | null> {
  if (!process.env.REDIS_URL) return null;
  if (globalThis.__rkeeperRedisClient) return globalThis.__rkeeperRedisClient;
  if (globalThis.__rkeeperRedisClientPromise) return globalThis.__rkeeperRedisClientPromise;

  globalThis.__rkeeperRedisClientPromise = (async () => {
    try {
      const mod = await (new Function("return import('re' + 'dis')")() as Promise<any>);
      const createRedisClient = mod?.createClient;
      if (typeof createRedisClient !== 'function') return null;

      const client = createRedisClient({ url: process.env.REDIS_URL }) as RedisCacheClient;
      try {
        await withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS);
      } catch {
        try {
          await client.quit?.();
        } catch {}
        try {
          client.disconnect?.();
        } catch {}
        return null;
      }
      globalThis.__rkeeperRedisClient = client;
      return client;
    } catch {
      return null;
    }
  })();

  return globalThis.__rkeeperRedisClientPromise;
}

async function getRedisJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;
  let raw: string | null = null;
  try {
    raw = await withTimeout(client.get(key), REDIS_OP_TIMEOUT_MS);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setRedisJson(key: string, value: unknown): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await withTimeout(
      client.set(key, JSON.stringify(value), { PX: CACHE_TTL_MS }),
      REDIS_OP_TIMEOUT_MS
    );
  } catch {}
}

async function withMemoryCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cached = memoryCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.value as T;
  }
  const value = await fn();
  memoryCache.set(key, { ts: now, value });
  return value;
}

function normalizeDate(value?: string): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

function filterKey(filter?: SalesDateFilter) {
  const from = normalizeDate(filter?.from) ?? '';
  const to = normalizeDate(filter?.to) ?? '';
  return `${from}|${to}`;
}

export const getLatestSalesDate = cache(async (): Promise<string | undefined> => {
  return withMemoryCache('latestSalesDate', async () => {
    const cached = await getRedisJson<string | undefined>('rkeeper:latestSalesDate');
    if (cached !== null) return cached;

    const result = await safeExecute(`
      SELECT MAX(date(SHIFTDATE)) as latest_date
      FROM rkeeper_sales_gold
    `);

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const latestDate = row.latest_date;
    const value = typeof latestDate === 'string' && latestDate.length > 0 ? latestDate : undefined;
    await setRedisJson('rkeeper:latestSalesDate', value);
    return value;
  });
});

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table:');
}

async function safeExecute(query: string, args?: Record<string, unknown>) {
  try {
    if (args) {
      return await db.execute({ sql: query, args: args as any } as any);
    }
    return await db.execute(query);
  } catch (error) {
    if (isMissingTableError(error)) {
      // В docker/local окружениях БД может быть не инициализирована.
      return { rows: [] as Record<string, unknown>[] };
    }
    throw error;
  }
}

async function strictExecute(query: string, args?: Record<string, unknown>) {
  if (args) {
    return await db.execute({ sql: query, args: args as any } as any);
  }
  return await db.execute(query);
}

function buildDateFilterWhere(filter?: SalesDateFilter) {
  const clauses: string[] = [];
  const args: Record<string, unknown> = {};

  const from = normalizeDate(filter?.from);
  const to = normalizeDate(filter?.to);

  if (from) {
    clauses.push(`date(SHIFTDATE) >= date(:fromDate)`);
    args.fromDate = from;
  }
  if (to) {
    clauses.push(`date(SHIFTDATE) <= date(:toDate)`);
    args.toDate = to;
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  };
}

const getSalesSummaryCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`salesSummary:${key}`, async () => {
    const cached = await getRedisJson<{
      totalRevenue: number;
      totalChecks: number;
      totalItems: number;
    }>(`rkeeper:salesSummary:${key}`);
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        SUM(PAYSUM) as total_revenue,
        SUM(CHECKS_COUNT) as total_checks,
        SUM(QUANTITY) as total_items
      FROM rkeeper_sales_gold
      ${whereClause}
    `,
      args
    );

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const value = {
      totalRevenue: Number(row.total_revenue ?? 0),
      totalChecks: Number(row.total_checks ?? 0),
      totalItems: Number(row.total_items ?? 0)
    };
    await setRedisJson(`rkeeper:salesSummary:${key}`, value);
    return value;
  });
});

export async function getSalesSummary(filter?: SalesDateFilter) {
  return getSalesSummaryCached(filterKey(filter), filter);
}

const getDailySalesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`dailySales:${key}`, async () => {
    const cached = await getRedisJson<Array<{ date: string; revenue: number; checks: number }>>(
      `rkeeper:dailySales:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        strftime('%Y-%m-%d', SHIFTDATE) as date,
        SUM(PAYSUM) as revenue,
        SUM(CHECKS_COUNT) as checks
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 365
    `,
      args
    );

    const value = result.rows
      .map((row) => ({
        date: row.date as string,
        revenue: Number(row.revenue || 0),
        checks: Number(row.checks || 0)
      }))
      .toReversed();
    await setRedisJson(`rkeeper:dailySales:${key}`, value);
    return value;
  });
});

export async function getDailySales(filter?: SalesDateFilter) {
  return getDailySalesCached(filterKey(filter), filter);
}

const getDailyRevenueCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`dailyRevenue:v1:${key}`, async () => {
    const cached = await getRedisJson<Array<{ date: string; revenue: number }>>(
      `rkeeper:dailyRevenue:v1:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        strftime('%Y-%m-%d', SHIFTDATE) as date,
        SUM(PAYSUM) as revenue
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `,
      args
    );

    const value = result.rows.map((row) => ({
      date: row.date as string,
      revenue: Number(row.revenue || 0)
    }));
    await setRedisJson(`rkeeper:dailyRevenue:v1:${key}`, value);
    return value;
  });
});

export async function getDailyRevenue(filter?: SalesDateFilter) {
  return getDailyRevenueCached(filterKey(filter), filter);
}

const getMonthlyRevenueCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`monthlyRevenue:v1:${key}`, async () => {
    const cached = await getRedisJson<Array<{ month: string; revenue: number }>>(
      `rkeeper:monthlyRevenue:v1:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        strftime('%Y-%m', SHIFTDATE) as month,
        SUM(PAYSUM) as revenue
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY month
      ORDER BY month ASC
    `,
      args
    );

    const value = result.rows.map((row) => ({
      month: row.month as string,
      revenue: Number(row.revenue || 0)
    }));
    await setRedisJson(`rkeeper:monthlyRevenue:v1:${key}`, value);
    return value;
  });
});

export async function getMonthlyRevenue(filter?: SalesDateFilter) {
  return getMonthlyRevenueCached(filterKey(filter), filter);
}

const getCategorySalesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`categorySales:${key}`, async () => {
    const cached = await getRedisJson<Array<{ category: string; revenue: number }>>(
      `rkeeper:categorySales:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        CATEGPATH as category,
        SUM(PAYSUM) as revenue
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT 5
    `,
      args
    );

    const value = result.rows.map((row) => ({
      category: ((row.category as string) || 'Unknown').split('/').pop(),
      revenue: Number(row.revenue || 0)
    }));
    await setRedisJson(`rkeeper:categorySales:${key}`, value);
    return value;
  });
});

export async function getCategorySales(filter?: SalesDateFilter) {
  return getCategorySalesCached(filterKey(filter), filter);
}

const getTopDishesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`topDishes:${key}`, async () => {
    const cached = await getRedisJson<Array<{ name: string; quantity: number; revenue: number }>>(
      `rkeeper:topDishes:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        DISH as name,
        SUM(QUANTITY) as quantity,
        SUM(PAYSUM) as revenue
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    `,
      args
    );

    const value = result.rows.map((row) => ({
      name: row.name as string,
      quantity: Number(row.quantity || 0),
      revenue: Number(row.revenue || 0)
    }));
    await setRedisJson(`rkeeper:topDishes:${key}`, value);
    return value;
  });
});

export async function getTopDishes(filter?: SalesDateFilter) {
  return getTopDishesCached(filterKey(filter), filter);
}

const getPaymentTypeSalesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`paymentTypeSales:v2:${key}`, async () => {
    const cached = await getRedisJson<Array<{ paymentType: string; revenue: number }>>(
      `rkeeper:paymentTypeSales:v2:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        PAYLINETYPE as payment_type,
        SUM(BASICSUM) as revenue
      FROM rkeeper_payments
      ${whereClause}
      GROUP BY payment_type
      ORDER BY revenue DESC
    `,
      args
    );

    const value = result.rows.map((row) => ({
      paymentType: (row.payment_type as string) || 'Unknown',
      revenue: Number(row.revenue || 0)
    }));
    await setRedisJson(`rkeeper:paymentTypeSales:v2:${key}`, value);
    return value;
  });
});

export async function getPaymentTypeSales(filter?: SalesDateFilter) {
  return getPaymentTypeSalesCached(filterKey(filter), filter);
}

const getWaitersRevenueCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`waitersRevenue:v2:${key}`, async () => {
    const cached = await getRedisJson<Array<{ waiter: string; revenue: number }>>(
      `rkeeper:waitersRevenue:v2:${key}`
    );
    if (cached !== null) return cached;

    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT 
        WAITER as waiter,
        SUM(BASICSUM) as revenue
      FROM rkeeper_payments
      ${whereClause}
      GROUP BY waiter
      ORDER BY revenue DESC
    `,
      args
    );

    const value = result.rows
      .map((row) => ({
        waiter: (row.waiter as string) || 'Unknown',
        revenue: Number(row.revenue || 0)
      }))
      .filter((row) => row.waiter !== 'Unknown' && row.waiter.trim().length > 0);

    await setRedisJson(`rkeeper:waitersRevenue:v2:${key}`, value);
    return value;
  });
});

export async function getWaitersRevenue(filter?: SalesDateFilter) {
  return getWaitersRevenueCached(filterKey(filter), filter);
}

const ensureDashboardSettingsTable = cache(async () => {
  await safeExecute(`
    CREATE TABLE IF NOT EXISTS dashboard_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

export async function getWaiterRewardPercent(): Promise<number | null> {
  await ensureDashboardSettingsTable();
  const result = await safeExecute(
    `
    SELECT value
    FROM dashboard_settings
    WHERE key = :key
    LIMIT 1
  `,
    { key: 'waiter_reward_percent' }
  );

  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const value = row.value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function setWaiterRewardPercent(percent: number): Promise<number> {
  await ensureDashboardSettingsTable();
  const normalized = Math.max(0, Math.min(100, percent));

  await safeExecute(
    `
    INSERT INTO dashboard_settings (key, value, updated_at)
    VALUES (:key, :value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `,
    { key: 'waiter_reward_percent', value: String(normalized) }
  );

  return normalized;
}

export async function getRevenueGrowthYoYPercent(): Promise<number | null> {
  await ensureDashboardSettingsTable();
  const result = await safeExecute(
    `
    SELECT value
    FROM dashboard_settings
    WHERE key = :key
    LIMIT 1
  `,
    { key: 'revenue_growth_yoy_percent' }
  );

  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const value = row.value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function setRevenueGrowthYoYPercent(percent: number): Promise<number> {
  await ensureDashboardSettingsTable();
  const normalized = Math.max(0, Math.min(1000, percent));

  await safeExecute(
    `
    INSERT INTO dashboard_settings (key, value, updated_at)
    VALUES (:key, :value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `,
    { key: 'revenue_growth_yoy_percent', value: String(normalized) }
  );

  return normalized;
}

export interface SuspiciousOperationSumDecreaseItem {
  datetime: string;
  operation: string;
  orderName: string | null;
  tableName: string | null;
  waiter: string | null;
  operator: string | null;
  manager: string | null;
  sumBefore: number;
  sumAfter: number;
  delta: number;
}

export interface SuspiciousOperationTransferItem {
  datetime: string;
  operation: string;
  dish: string | null;
  quantity: number | null;
  orderName: string | null;
  tableName: string | null;
  sourceOrder: string | null;
  sourceTable: string | null;
  waiter: string | null;
  operator: string | null;
  manager: string | null;
}

export interface SuspiciousOperationPrecheckCancelItem {
  datetime: string;
  operation: string;
  orderName: string | null;
  tableName: string | null;
  waiter: string | null;
  operator: string | null;
  manager: string | null;
  reason: string | null;
  parameter: string | null;
}

export interface SuspiciousOperationDeleteAfterShiftCloseItem {
  datetime: string;
  operation: string;
  dish: string | null;
  quantity: number | null;
  orderName: string | null;
  tableName: string | null;
  waiter: string | null;
  operator: string | null;
  manager: string | null;
}

export interface SuspiciousOperationsResult {
  sumDecreases: SuspiciousOperationSumDecreaseItem[];
  transfers: SuspiciousOperationTransferItem[];
  deletesAfterShiftClose: SuspiciousOperationDeleteAfterShiftCloseItem[];
  precheckCancels: SuspiciousOperationPrecheckCancelItem[];
  missing: string[];
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function columnsToSet(rows: Record<string, unknown>[]) {
  const set = new Set<string>();
  for (const row of rows) {
    const name = row.name;
    if (typeof name === 'string' && name.trim().length > 0) set.add(name);
  }
  return set;
}

function pickFirstColumn(columns: Set<string>, candidates: string[]) {
  for (const name of candidates) {
    if (columns.has(name)) return name;
  }
  return null;
}

const getSuspiciousOperationsCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withMemoryCache(`suspiciousOperations:v1:${key}`, async () => {
    const cached = await getRedisJson<SuspiciousOperationsResult>(
      `rkeeper:suspiciousOperations:v1:${key}`
    );
    if (cached !== null) return cached;

    try {
      await strictExecute('SELECT 1 FROM rkeeper_operations LIMIT 1');
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error(
          'В базе отсутствует таблица rkeeper_operations. Запустите Operations ETL и заполните операции.'
        );
      }
      throw error;
    }

    const missing: string[] = [];
    const { whereClause, args } = buildDateFilterWhere(filter);

    const columnsResult = await strictExecute(`PRAGMA table_info('rkeeper_operations')`);
    const columns = columnsToSet(columnsResult.rows as unknown as Record<string, unknown>[]);

    const datetimeCol =
      pickFirstColumn(columns, ['DATETIME___3', 'DATETIME', 'DATETIME_12']) ?? 'DATETIME___3';

    const shiftCloseCol = pickFirstColumn(columns, [
      'SHIFTCLOSEDDATETIME',
      'SHIFT_CLOSED_AT',
      'SHIFT_CLOSE_AT',
      'SHIFT_CLOSEDAT',
      'CLOSEDATETIME',
      'CLOSEDDATETIME'
    ]);

    if (!columns.has('OPERATION')) {
      missing.push('В таблице rkeeper_operations нет колонки OPERATION.');
    }
    if (!columns.has('SHIFTDATE')) {
      missing.push('В таблице rkeeper_operations нет колонки SHIFTDATE.');
    }

    const sumDecreases: SuspiciousOperationSumDecreaseItem[] = [];
    if (columns.has('ORDERSUMBEFORE') && columns.has('ORDERSUMAFTER') && columns.has(datetimeCol)) {
      const result = await strictExecute(
        `
        SELECT
          ${datetimeCol} as datetime,
          OPERATION as operation,
          ORDERNAME as order_name,
          TABLENAME as table_name,
          WAITER as waiter,
          ACCESS as operator,
          MANAGER as manager,
          CAST(ORDERSUMBEFORE as REAL) as sum_before,
          CAST(ORDERSUMAFTER as REAL) as sum_after,
          (CAST(ORDERSUMBEFORE as REAL) - CAST(ORDERSUMAFTER as REAL)) as delta
        FROM rkeeper_operations
        ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} ORDERSUMBEFORE IS NOT NULL
          AND ORDERSUMAFTER IS NOT NULL
          AND CAST(ORDERSUMAFTER as REAL) < CAST(ORDERSUMBEFORE as REAL)
        ORDER BY datetime DESC
        LIMIT 500
      `,
        args
      );

      for (const row of result.rows as unknown as Record<string, unknown>[]) {
        sumDecreases.push({
          datetime: String(row.datetime ?? ''),
          operation: String(row.operation ?? ''),
          orderName: normalizeNullableString(row.order_name),
          tableName: normalizeNullableString(row.table_name),
          waiter: normalizeNullableString(row.waiter),
          operator: normalizeNullableString(row.operator),
          manager: normalizeNullableString(row.manager),
          sumBefore: Number(row.sum_before ?? 0),
          sumAfter: Number(row.sum_after ?? 0),
          delta: Number(row.delta ?? 0)
        });
      }
    } else {
      missing.push(
        'Нельзя вычислить уменьшение суммы чека: нужны колонки ORDERSUMBEFORE, ORDERSUMAFTER и DATETIME.'
      );
    }

    const transfers: SuspiciousOperationTransferItem[] = [];
    if (columns.has(datetimeCol) && (columns.has('SOURCEORDER') || columns.has('SOURCETABLE'))) {
      const result = await strictExecute(
        `
        SELECT
          ${datetimeCol} as datetime,
          OPERATION as operation,
          DISH as dish,
          QNT as quantity,
          ORDERNAME as order_name,
          TABLENAME as table_name,
          SOURCEORDER as source_order,
          SOURCETABLE as source_table,
          WAITER as waiter,
          ACCESS as operator,
          MANAGER as manager
        FROM rkeeper_operations
        ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} (
            (SOURCEORDER IS NOT NULL AND TRIM(SOURCEORDER) <> '')
            OR (SOURCETABLE IS NOT NULL AND TRIM(SOURCETABLE) <> '')
            OR LOWER(OPERATION) LIKE '%перенос%'
          )
        ORDER BY datetime DESC
        LIMIT 500
      `,
        args
      );

      for (const row of result.rows as unknown as Record<string, unknown>[]) {
        transfers.push({
          datetime: String(row.datetime ?? ''),
          operation: String(row.operation ?? ''),
          dish: normalizeNullableString(row.dish),
          quantity: row.quantity == null ? null : Number(row.quantity),
          orderName: normalizeNullableString(row.order_name),
          tableName: normalizeNullableString(row.table_name),
          sourceOrder: normalizeNullableString(row.source_order),
          sourceTable: normalizeNullableString(row.source_table),
          waiter: normalizeNullableString(row.waiter),
          operator: normalizeNullableString(row.operator),
          manager: normalizeNullableString(row.manager)
        });
      }
    } else {
      missing.push(
        'Нельзя вычислить перенос блюд между заказами: нужны колонки SOURCEORDER/SOURCETABLE и DATETIME.'
      );
    }

    const precheckCancels: SuspiciousOperationPrecheckCancelItem[] = [];
    if (columns.has(datetimeCol) && columns.has('OPERATION')) {
      const result = await strictExecute(
        `
        SELECT
          ${datetimeCol} as datetime,
          OPERATION as operation,
          ORDERNAME as order_name,
          TABLENAME as table_name,
          WAITER as waiter,
          ACCESS as operator,
          MANAGER as manager,
          REASON as reason,
          PARAMETER as parameter
        FROM rkeeper_operations
        ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} LOWER(OPERATION) LIKE '%пречек%'
        ORDER BY datetime DESC
        LIMIT 500
      `,
        args
      );

      for (const row of result.rows as unknown as Record<string, unknown>[]) {
        precheckCancels.push({
          datetime: String(row.datetime ?? ''),
          operation: String(row.operation ?? ''),
          orderName: normalizeNullableString(row.order_name),
          tableName: normalizeNullableString(row.table_name),
          waiter: normalizeNullableString(row.waiter),
          operator: normalizeNullableString(row.operator),
          manager: normalizeNullableString(row.manager),
          reason: normalizeNullableString(row.reason),
          parameter: normalizeNullableString(row.parameter)
        });
      }
    } else {
      missing.push('Нельзя вычислить отмену пречека: нужны колонки OPERATION и DATETIME.');
    }

    const deletesAfterShiftClose: SuspiciousOperationDeleteAfterShiftCloseItem[] = [];
    if (shiftCloseCol && columns.has(datetimeCol)) {
      const result = await strictExecute(
        `
        SELECT
          ${datetimeCol} as datetime,
          OPERATION as operation,
          DISH as dish,
          QNT as quantity,
          ORDERNAME as order_name,
          TABLENAME as table_name,
          WAITER as waiter,
          ACCESS as operator,
          MANAGER as manager
        FROM rkeeper_operations
        ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} LOWER(OPERATION) LIKE '%удал%'
          AND datetime(${datetimeCol}) > datetime(${shiftCloseCol})
        ORDER BY datetime DESC
        LIMIT 500
      `,
        args
      );

      for (const row of result.rows as unknown as Record<string, unknown>[]) {
        deletesAfterShiftClose.push({
          datetime: String(row.datetime ?? ''),
          operation: String(row.operation ?? ''),
          dish: normalizeNullableString(row.dish),
          quantity: row.quantity == null ? null : Number(row.quantity),
          orderName: normalizeNullableString(row.order_name),
          tableName: normalizeNullableString(row.table_name),
          waiter: normalizeNullableString(row.waiter),
          operator: normalizeNullableString(row.operator),
          manager: normalizeNullableString(row.manager)
        });
      }
    } else {
      missing.push(
        'Нельзя вычислить удаление позиций после закрытия смены: в таблице rkeeper_operations нет времени закрытия смены (например SHIFTCLOSEDDATETIME/CLOSEDATETIME).'
      );
    }

    const value: SuspiciousOperationsResult = {
      sumDecreases,
      transfers,
      deletesAfterShiftClose,
      precheckCancels,
      missing
    };

    await setRedisJson(`rkeeper:suspiciousOperations:v1:${key}`, value);
    return value;
  });
});

export async function getSuspiciousOperations(filter?: SalesDateFilter) {
  return getSuspiciousOperationsCached(filterKey(filter), filter);
}
