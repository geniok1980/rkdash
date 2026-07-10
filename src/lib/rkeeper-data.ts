import { cache } from 'react';
import { createSqliteExecutor } from '@/lib/libsql-client';
import { isSqliteBusyError, withSqliteBusyRetry } from '@/lib/libsql-retry';

const executeSqlite = createSqliteExecutor({
  envVarNames: ['RKEEPER_DB_PATH'],
  defaultRelativePath: 'rkeeper_etl/rkeeper_data.db',
  additionalPaths: ['/data/rkeeper_data.db']
});

export interface SalesDateFilter {
  from?: string;
  to?: string;
  restaurantNames?: string[] | null;
}

export type ComparisonDimension =
  | 'restaurant'
  | 'dish'
  | 'category'
  | 'paymentType'
  | 'waiter';

export interface ComparisonSalesFilter {
  dimension: ComparisonDimension;
  periodAFrom: string;
  periodATo: string;
  periodBFrom: string;
  periodBTo: string;
  restaurantNames?: string[] | null;
}

export interface ComparisonSalesRow {
  label: string;
  periodA: number;
  periodB: number;
  delta: number;
  deltaPercent: number | null;
}

export interface ComparisonSalesResult {
  dimension: ComparisonDimension;
  periodA: {
    from: string;
    to: string;
    total: number;
  };
  periodB: {
    from: string;
    to: string;
    total: number;
  };
  totals: {
    periodA: number;
    periodB: number;
    delta: number;
    deltaPercent: number | null;
  };
  rows: ComparisonSalesRow[];
}

export type AbcBucket = 'A' | 'B' | 'C';
export type AbcGoListAction = 'focus' | 'support' | 'review' | 'stop';

export interface AbcAnalysisDishRow {
  dish: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number | null;
  quantity: number;
  revenueShare: number;
  cumulativeRevenueShare: number;
  revenueClass: AbcBucket;
  grossProfitShare: number;
  cumulativeGrossProfitShare: number;
  grossProfitClass: AbcBucket;
  cell: `${AbcBucket}${AbcBucket}`;
  cellTitle: string;
  recommendation: string;
  goListAction: AbcGoListAction;
}

export interface AbcAnalysisMatrixCell {
  key: `${AbcBucket}${AbcBucket}`;
  revenueClass: AbcBucket;
  grossProfitClass: AbcBucket;
  title: string;
  recommendation: string;
  dishesCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  quantity: number;
  marginPct: number | null;
  topDishes: string[];
}

export interface AbcAnalysisGoListGroup {
  action: AbcGoListAction;
  title: string;
  description: string;
  items: AbcAnalysisDishRow[];
}

export interface AbcAnalysisResult {
  period: {
    from: string;
    to: string;
  };
  totals: {
    revenue: number;
    cost: number;
    grossProfit: number;
    quantity: number;
    dishesCount: number;
    marginPct: number | null;
  };
  matrix: AbcAnalysisMatrixCell[];
  goList: AbcAnalysisGoListGroup[];
  dishes: AbcAnalysisDishRow[];
}

export interface MenuPortfolioCategoryRow {
  category: string;
  categoryPath: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number | null;
  quantity: number;
  dishesCount: number;
  revenueShare: number;
  quantityShare: number;
  topDishes: string[];
}

export interface MenuPortfolioAnalysisResult {
  period: {
    from: string;
    to: string;
  };
  totals: {
    revenue: number;
    cost: number;
    grossProfit: number;
    quantity: number;
    categoriesCount: number;
    dishesCount: number;
    marginPct: number | null;
  };
  categories: MenuPortfolioCategoryRow[];
}

interface CostedDishSalesRow {
  businessDate: string;
  dish: string;
  categoryPath: string;
  revenue: number;
  quantity: number;
  cost: number;
  grossProfit: number;
  missingCostRows: number;
  fallbackCostRows: number;
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

type DynamicRedisModule = {
  createClient?: (options: { url: string }) => RedisCacheClient;
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
      const mod = await (new Function("return import('re' + 'dis')")() as Promise<DynamicRedisModule>);
      const createRedisClient = mod?.createClient;
      if (typeof createRedisClient !== 'function') return null;

      const client = createRedisClient({ url: process.env.REDIS_URL! }) as RedisCacheClient;
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

function getCachedMemoryValue<T>(key: string): T | null {
  const cached = memoryCache.get(key);
  return cached ? (cached.value as T) : null;
}

async function withCachedBusyFallback<T>(
  memoryKey: string,
  redisKey: string,
  fallbackValue: T,
  loader: () => Promise<T>
): Promise<T> {
  const memoryValue = getCachedMemoryValue<T>(memoryKey);
  if (memoryValue !== null) {
    return memoryValue;
  }

  const redisValue = await getRedisJson<T>(redisKey);
  if (redisValue !== null) {
    memoryCache.set(memoryKey, { ts: Date.now(), value: redisValue });
    return redisValue;
  }

  try {
    return await withMemoryCache(memoryKey, async () => {
      const value = await loader();
      await setRedisJson(redisKey, value);
      return value;
    });
  } catch (error) {
    if (!isSqliteBusyError(error)) {
      throw error;
    }

    const staleMemoryValue = getCachedMemoryValue<T>(memoryKey);
    if (staleMemoryValue !== null) {
      return staleMemoryValue;
    }

    const staleRedisValue = await getRedisJson<T>(redisKey);
    if (staleRedisValue !== null) {
      memoryCache.set(memoryKey, { ts: Date.now(), value: staleRedisValue });
      return staleRedisValue;
    }

    return fallbackValue;
  }
}

function normalizeDate(value?: string): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

function normalizeRestaurantNames(values?: string[] | null): string[] {
  if (!values) return [];

  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function filterKey(filter?: SalesDateFilter) {
  const from = normalizeDate(filter?.from) ?? '';
  const to = normalizeDate(filter?.to) ?? '';
  const restaurants = normalizeRestaurantNames(filter?.restaurantNames).join('|');
  return `${from}|${to}|${restaurants}`;
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
    return await withSqliteBusyRetry(() => {
      if (args) {
        return executeSqlite(query, args);
      }
      return executeSqlite(query);
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      // В docker/local окружениях БД может быть не инициализирована.
      return { rows: [] as Record<string, unknown>[] };
    }
    throw error;
  }
}

async function strictExecute(query: string, args?: Record<string, unknown>) {
  return withSqliteBusyRetry(() => {
    if (args) {
      return executeSqlite(query, args);
    }
    return executeSqlite(query);
  });
}

const tableColumnsCache = new Map<string, Set<string>>();

async function getTableColumns(table: string): Promise<Set<string>> {
  const cached = tableColumnsCache.get(table);
  if (cached) return cached;

  const result = await safeExecute(`PRAGMA table_info('${table}')`);
  const columns = new Set<string>();

  for (const row of result.rows as Record<string, unknown>[]) {
    const name = row.name;
    if (typeof name === 'string' && name.trim().length > 0) {
      columns.add(name);
    }
  }

  tableColumnsCache.set(table, columns);
  return columns;
}

function buildDateFilterWhere(
  filter?: SalesDateFilter,
  options?: {
    dateColumn?: string;
    restaurantColumn?: string;
  }
) {
  const clauses: string[] = [];
  const args: Record<string, unknown> = {};
  const dateColumn = options?.dateColumn ?? 'SHIFTDATE';
  const restaurantColumn = options?.restaurantColumn;

  const from = normalizeDate(filter?.from);
  const to = normalizeDate(filter?.to);
  const hasRestaurantFilter = Array.isArray(filter?.restaurantNames);
  const restaurantNames = normalizeRestaurantNames(filter?.restaurantNames);

  if (from) {
    clauses.push(`date(${dateColumn}) >= date(:fromDate)`);
    args.fromDate = from;
  }
  if (to) {
    clauses.push(`date(${dateColumn}) <= date(:toDate)`);
    args.toDate = to;
  }
  if (hasRestaurantFilter) {
    if (!restaurantColumn || restaurantNames.length === 0) {
      clauses.push('1 = 0');
    } else {
      const placeholders: string[] = [];
      for (const [index, restaurantName] of restaurantNames.entries()) {
        const key = `restaurant${index}`;
        placeholders.push(`:${key}`);
        args[key] = restaurantName;
      }
      clauses.push(`${restaurantColumn} IN (${placeholders.join(', ')})`);
    }
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  };
}

type SalesAggregationSource =
  | {
      table: 'rkeeper_sales_gold';
      restaurantColumn?: 'RESTAURANTNAME';
    }
  | {
      table: 'rkeeper_sales';
      restaurantColumn?: 'RESTAURANTNAME';
    };

function buildDistinctCheckExpr(table: 'rkeeper_sales_gold' | 'rkeeper_sales'): string {
  if (table === 'rkeeper_sales_gold') {
    return 'SUM(CHECKS_COUNT)';
  }

  return [
    "COUNT(DISTINCT (",
    "COALESCE(CAST(CHECKNUM AS TEXT), '')",
    " || '|' || date(SHIFTDATE)",
    " || '|' || COALESCE(CLOSESTATION, '')",
    '))'
  ].join('');
}

async function resolveSalesAggregationSource(filter?: SalesDateFilter): Promise<SalesAggregationSource> {
  const hasRestaurantFilter = Array.isArray(filter?.restaurantNames);
  const salesGoldColumns = await getTableColumns('rkeeper_sales_gold');

  if (!hasRestaurantFilter || salesGoldColumns.has('RESTAURANTNAME')) {
    return {
      table: 'rkeeper_sales_gold',
      restaurantColumn: salesGoldColumns.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : undefined
    };
  }

  const salesColumns = await getTableColumns('rkeeper_sales');
  return {
    table: 'rkeeper_sales',
    restaurantColumn: salesColumns.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : undefined
  };
}

function getSqliteNormalizedCodeExpression(column: string): string {
  const casted = `CAST(${column} AS TEXT)`;
  const stripped = `REPLACE(REPLACE(${casted}, ' ', ''), '.0', '')`;
  const trimmed = `LTRIM(${stripped}, '0')`;
  return `CASE WHEN ${trimmed} = '' THEN '0' ELSE ${trimmed} END`;
}

async function resolvePreferredCostTableName(): Promise<string | null> {
  const candidates = [
    'rkeeper_menu_item_cost',
    'menu_item_cost',
    'foodcost_menu_item_cost'
  ] as const;

  for (const table of candidates) {
    const columns = await getTableColumns(table);
    if (columns.size > 0) return table;
  }

  return null;
}

async function getCostedDishSalesRows(filter: SalesDateFilter): Promise<CostedDishSalesRow[]> {
  const salesColumns = await getTableColumns('rkeeper_sales');
  const selectedCostTable = await resolvePreferredCostTableName();
  const hasSalesCode = salesColumns.has('RKID') || salesColumns.has('CODE');
  const hasCostTable = selectedCostTable !== null;

  if (!hasSalesCode || !hasCostTable) {
    const { whereClause, args } = buildDateFilterWhere(filter, {
      restaurantColumn: 'RESTAURANTNAME'
    });

    const result = await safeExecute(
      `
      SELECT
        date(SHIFTDATE) as business_date,
        COALESCE(NULLIF(TRIM(DISH), ''), 'Неизвестно') as dish,
        COALESCE(NULLIF(TRIM(CATEGPATH), ''), 'Без категории') as category_path,
        SUM(CAST(COALESCE(PAYSUM, 0) as REAL)) as revenue,
        SUM(CAST(COALESCE(PRLISTSUM, 0) as REAL)) as cost,
        SUM(CAST(COALESCE(QUANTITY, 0) as REAL)) as quantity
      FROM rkeeper_sales
      ${whereClause}
      GROUP BY business_date, dish, category_path
      HAVING ABS(SUM(CAST(COALESCE(PAYSUM, 0) as REAL))) > 0.0001
         OR ABS(SUM(CAST(COALESCE(QUANTITY, 0) as REAL))) > 0.0001
    `,
      args
    );

    return (result.rows as Record<string, unknown>[]).map((row) => {
      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);
      return {
        businessDate: String(row.business_date ?? ''),
        dish: String(row.dish ?? 'Неизвестно').trim() || 'Неизвестно',
        categoryPath: String(row.category_path ?? 'Без категории').trim() || 'Без категории',
        revenue,
        quantity: Number(row.quantity ?? 0),
        cost,
        grossProfit: revenue - cost,
        missingCostRows: 0,
        fallbackCostRows: 0
      };
    });
  }

  const salesCodeExpr = getSqliteNormalizedCodeExpression(salesColumns.has('RKID') ? 'RKID' : 'CODE');
  const costCodeExpr = getSqliteNormalizedCodeExpression('CODE');
  const costCols = await getTableColumns(selectedCostTable);
  const hasCostSum = costCols.has('COST_SUM');
  const hasCostQty = costCols.has('QUANTITY');
  const hasCostPerUnit = costCols.has('cost_per_unit');

  const costPerUnitExpr =
    hasCostSum && hasCostQty
      ? `CASE WHEN SUM(QUANTITY) != 0 THEN SUM(COST_SUM) / SUM(QUANTITY) ELSE ${
          hasCostPerUnit ? 'AVG(cost_per_unit)' : 'NULL'
        } END`
      : hasCostPerUnit
        ? 'AVG(cost_per_unit)'
        : 'NULL';

  const { whereClause, args } = buildDateFilterWhere(filter, {
    restaurantColumn: 'RESTAURANTNAME'
  });
  const costFilter = buildDateFilterWhere({ to: filter.to });

  const result = await safeExecute(
    `
      WITH sales AS (
        SELECT
          date(SHIFTDATE) as business_date,
          ${salesCodeExpr} as code_norm,
          COALESCE(NULLIF(TRIM(DISH), ''), 'Неизвестно') as dish,
          COALESCE(NULLIF(TRIM(CATEGPATH), ''), 'Без категории') as category_path,
          SUM(CAST(COALESCE(PAYSUM, 0) as REAL)) as revenue,
          SUM(CAST(COALESCE(QUANTITY, 0) as REAL)) as quantity
        FROM rkeeper_sales
        ${whereClause}
        GROUP BY business_date, code_norm, dish, category_path
      ),
      costs AS (
        SELECT
          date(SHIFTDATE) as business_date,
          ${costCodeExpr} as code_norm,
          ${costPerUnitExpr} as cost_per_unit
        FROM ${selectedCostTable}
        ${costFilter.whereClause}
        GROUP BY business_date, code_norm
      ),
      matched_sales AS (
        SELECT
          s.business_date,
          s.dish,
          s.category_path,
          s.revenue,
          s.quantity,
          (
            SELECT c.cost_per_unit
            FROM costs c
            WHERE c.business_date = s.business_date
              AND c.code_norm = s.code_norm
              AND c.cost_per_unit IS NOT NULL
              AND c.cost_per_unit != 0
            LIMIT 1
          ) as exact_cost_per_unit,
          (
            SELECT c.cost_per_unit
            FROM costs c
            WHERE c.business_date <= s.business_date
              AND c.code_norm = s.code_norm
              AND c.cost_per_unit IS NOT NULL
              AND c.cost_per_unit != 0
            ORDER BY c.business_date DESC
            LIMIT 1
          ) as fallback_cost_per_unit
        FROM sales s
      )
      SELECT
        business_date,
        dish,
        category_path,
        revenue,
        quantity,
        quantity * COALESCE(exact_cost_per_unit, fallback_cost_per_unit, 0) as cost,
        revenue - (quantity * COALESCE(exact_cost_per_unit, fallback_cost_per_unit, 0)) as gross_profit,
        CASE
          WHEN COALESCE(exact_cost_per_unit, fallback_cost_per_unit) IS NULL THEN 1
          ELSE 0
        END as missing_cost_rows,
        CASE
          WHEN exact_cost_per_unit IS NULL AND fallback_cost_per_unit IS NOT NULL THEN 1
          ELSE 0
        END as fallback_cost_rows
      FROM matched_sales
      WHERE ABS(revenue) > 0.0001 OR ABS(quantity) > 0.0001
    `,
    { ...args, ...costFilter.args }
  );

  return (result.rows as Record<string, unknown>[]).map((row) => {
    const revenue = Number(row.revenue ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      businessDate: String(row.business_date ?? ''),
      dish: String(row.dish ?? 'Неизвестно').trim() || 'Неизвестно',
      categoryPath: String(row.category_path ?? 'Без категории').trim() || 'Без категории',
      revenue,
      quantity: Number(row.quantity ?? 0),
      cost,
      grossProfit: Number(row.gross_profit ?? revenue - cost),
      missingCostRows: Number(row.missing_cost_rows ?? 0),
      fallbackCostRows: Number(row.fallback_cost_rows ?? 0)
    };
  });
}

const getSalesSummaryCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withCachedBusyFallback(
    `salesSummary:${key}`,
    `rkeeper:salesSummary:${key}`,
    {
      totalRevenue: 0,
      totalChecks: 0,
      totalItems: 0
    },
    async () => {
      const source = await resolveSalesAggregationSource(filter);
      const { whereClause, args } = buildDateFilterWhere(filter, {
        restaurantColumn: source.restaurantColumn
      });
      const checksExpr = buildDistinctCheckExpr(source.table);
      const result = await safeExecute(
        `
        SELECT 
          SUM(PAYSUM) as total_revenue,
          ${checksExpr} as total_checks,
          SUM(QUANTITY) as total_items
        FROM ${source.table}
        ${whereClause}
      `,
        args
      );

      const row = (result.rows[0] ?? {}) as Record<string, unknown>;
      return {
        totalRevenue: Number(row.total_revenue ?? 0),
        totalChecks: Number(row.total_checks ?? 0),
        totalItems: Number(row.total_items ?? 0)
      };
    }
  );
});

export async function getSalesSummary(filter?: SalesDateFilter) {
  return getSalesSummaryCached(filterKey(filter), filter);
}

const getDailySalesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withCachedBusyFallback(
    `dailySales:${key}`,
    `rkeeper:dailySales:${key}`,
    [],
    async () => {
      const source = await resolveSalesAggregationSource(filter);
      const { whereClause, args } = buildDateFilterWhere(filter, {
        restaurantColumn: source.restaurantColumn
      });
      const checksExpr = buildDistinctCheckExpr(source.table);
      const result = await safeExecute(
        `
        SELECT 
          strftime('%Y-%m-%d', SHIFTDATE) as date,
          SUM(PAYSUM) as revenue,
          ${checksExpr} as checks
        FROM ${source.table}
        ${whereClause}
        GROUP BY date
        ORDER BY date DESC
        LIMIT 365
      `,
        args
      );

      return result.rows
        .map((row) => ({
          date: row.date as string,
          revenue: Number(row.revenue || 0),
          checks: Number(row.checks || 0)
        }))
        .toReversed();
    }
  );
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

    const source = await resolveSalesAggregationSource(filter);
    const { whereClause, args } = buildDateFilterWhere(filter, {
      restaurantColumn: source.restaurantColumn
    });
    const result = await safeExecute(
      `
      SELECT 
        strftime('%Y-%m-%d', SHIFTDATE) as date,
        SUM(PAYSUM) as revenue
      FROM ${source.table}
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

    const source = await resolveSalesAggregationSource(filter);
    const { whereClause, args } = buildDateFilterWhere(filter, {
      restaurantColumn: source.restaurantColumn
    });
    const result = await safeExecute(
      `
      SELECT 
        strftime('%Y-%m', SHIFTDATE) as month,
        SUM(PAYSUM) as revenue
      FROM ${source.table}
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

    const source = await resolveSalesAggregationSource(filter);
    const { whereClause, args } = buildDateFilterWhere(filter, {
      restaurantColumn: source.restaurantColumn
    });
    const result = await safeExecute(
      `
      SELECT 
        CATEGPATH as category,
        SUM(PAYSUM) as revenue
      FROM ${source.table}
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
  return withCachedBusyFallback(
    `topDishes:${key}`,
    `rkeeper:topDishes:${key}`,
    [],
    async () => {
      const source = await resolveSalesAggregationSource(filter);
      const { whereClause, args } = buildDateFilterWhere(filter, {
        restaurantColumn: source.restaurantColumn
      });
      const result = await safeExecute(
        `
        SELECT 
          DISH as name,
          SUM(QUANTITY) as quantity,
          SUM(PAYSUM) as revenue
        FROM ${source.table}
        ${whereClause}
        GROUP BY name
        ORDER BY revenue DESC
        LIMIT 5
      `,
        args
      );

      return result.rows.map((row) => ({
        name: row.name as string,
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0)
      }));
    }
  );
});

export async function getTopDishes(filter?: SalesDateFilter) {
  return getTopDishesCached(filterKey(filter), filter);
}

const getPaymentTypeSalesCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withCachedBusyFallback(
    `paymentTypeSales:v2:${key}`,
    `rkeeper:paymentTypeSales:v2:${key}`,
    [],
    async () => {
      const { whereClause, args } = buildDateFilterWhere(filter, {
        restaurantColumn: 'RESTAURANTNAME'
      });
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

      return result.rows.map((row) => ({
        paymentType: (row.payment_type as string) || 'Unknown',
        revenue: Number(row.revenue || 0)
      }));
    }
  );
});

export async function getPaymentTypeSales(filter?: SalesDateFilter) {
  return getPaymentTypeSalesCached(filterKey(filter), filter);
}

const getWaitersRevenueCached = cache(async (key: string, filter?: SalesDateFilter) => {
  return withCachedBusyFallback(
    `waitersRevenue:v2:${key}`,
    `rkeeper:waitersRevenue:v2:${key}`,
    [],
    async () => {
      const { whereClause, args } = buildDateFilterWhere(filter, {
        restaurantColumn: 'RESTAURANTNAME'
      });
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

      return result.rows
        .map((row) => ({
          waiter: (row.waiter as string) || 'Unknown',
          revenue: Number(row.revenue || 0)
        }))
        .filter((row) => row.waiter !== 'Unknown' && row.waiter.trim().length > 0);
    }
  );
});

export async function getWaitersRevenue(filter?: SalesDateFilter) {
  return getWaitersRevenueCached(filterKey(filter), filter);
}

function comparisonFilterKey(filter: ComparisonSalesFilter): string {
  const restaurants = normalizeRestaurantNames(filter.restaurantNames).join('|');
  return [
    filter.dimension,
    normalizeDate(filter.periodAFrom) ?? '',
    normalizeDate(filter.periodATo) ?? '',
    normalizeDate(filter.periodBFrom) ?? '',
    normalizeDate(filter.periodBTo) ?? '',
    restaurants
  ].join('|');
}

function extractCategoryLabel(value: string): string {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.at(-1) ?? value;
}

function extractTopCategoryLabel(value: string): string {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts[0] ?? value;
}

const getComparisonSalesCached = cache(async (key: string, filter: ComparisonSalesFilter) => {
  return withMemoryCache(`comparisonSales:v1:${key}`, async () => {
    const cached = await getRedisJson<ComparisonSalesResult>(`rkeeper:comparisonSales:v1:${key}`);
    if (cached !== null) return cached;

    const combinedFrom = filter.periodAFrom <= filter.periodBFrom ? filter.periodAFrom : filter.periodBFrom;
    const combinedTo = filter.periodATo >= filter.periodBTo ? filter.periodATo : filter.periodBTo;

    let table = 'rkeeper_sales_gold';
    let restaurantColumn: 'RESTAURANTNAME' | undefined;
    let labelExpr = "COALESCE(NULLIF(TRIM(DISH), ''), 'Неизвестно')";
    let metricExpr = 'PAYSUM';

    if (filter.dimension === 'paymentType') {
      table = 'rkeeper_payments';
      restaurantColumn = 'RESTAURANTNAME';
      labelExpr = "COALESCE(NULLIF(TRIM(PAYLINETYPE), ''), 'Неизвестно')";
      metricExpr = 'BASICSUM';
    } else {
      const source = await resolveSalesAggregationSource({
        restaurantNames: filter.restaurantNames
      });

      table = source.table;
      restaurantColumn = source.restaurantColumn;

      if (filter.dimension === 'restaurant' && !restaurantColumn) {
        const salesColumns = await getTableColumns('rkeeper_sales');
        table = 'rkeeper_sales';
        restaurantColumn = salesColumns.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : undefined;
      }

      if (filter.dimension === 'restaurant') {
        if (!restaurantColumn) {
          const emptyResult: ComparisonSalesResult = {
            dimension: filter.dimension,
            periodA: { from: filter.periodAFrom, to: filter.periodATo, total: 0 },
            periodB: { from: filter.periodBFrom, to: filter.periodBTo, total: 0 },
            totals: { periodA: 0, periodB: 0, delta: 0, deltaPercent: null },
            rows: []
          };
          await setRedisJson(`rkeeper:comparisonSales:v1:${key}`, emptyResult);
          return emptyResult;
        }

        labelExpr = "COALESCE(NULLIF(TRIM(RESTAURANTNAME), ''), 'Неизвестно')";
      }

      if (filter.dimension === 'category') {
        labelExpr = "COALESCE(NULLIF(TRIM(CATEGPATH), ''), 'Неизвестно')";
      }

      if (filter.dimension === 'dish') {
        labelExpr = "COALESCE(NULLIF(TRIM(DISH), ''), 'Неизвестно')";
      }

      if (filter.dimension === 'waiter') {
        labelExpr = "COALESCE(NULLIF(TRIM(WAITER), ''), 'Неизвестно')";
      }
    }

    const { whereClause, args } = buildDateFilterWhere(
      {
        from: combinedFrom,
        to: combinedTo,
        restaurantNames: filter.restaurantNames
      },
      {
        restaurantColumn
      }
    );

    const periodAExpr =
      `SUM(CASE WHEN date(SHIFTDATE) BETWEEN date(:periodAFrom) AND date(:periodATo) ` +
      `THEN ${metricExpr} ELSE 0 END)`;
    const periodBExpr =
      `SUM(CASE WHEN date(SHIFTDATE) BETWEEN date(:periodBFrom) AND date(:periodBTo) ` +
      `THEN ${metricExpr} ELSE 0 END)`;

    const result = await safeExecute(
      `
      SELECT
        ${labelExpr} as label,
        ${periodAExpr} as period_a,
        ${periodBExpr} as period_b
      FROM ${table}
      ${whereClause}
      GROUP BY label
      HAVING ${periodAExpr} <> 0 OR ${periodBExpr} <> 0
      ORDER BY ABS(${periodBExpr} - ${periodAExpr}) DESC, ${periodBExpr} DESC, ${periodAExpr} DESC
      LIMIT 200
    `,
      {
        ...args,
        periodAFrom: filter.periodAFrom,
        periodATo: filter.periodATo,
        periodBFrom: filter.periodBFrom,
        periodBTo: filter.periodBTo
      }
    );

    const rows = result.rows.map((row) => {
      const rawLabel = String(row.label ?? 'Неизвестно').trim() || 'Неизвестно';
      const label = filter.dimension === 'category' ? extractCategoryLabel(rawLabel) : rawLabel;
      const periodA = Number(row.period_a ?? 0);
      const periodB = Number(row.period_b ?? 0);
      const delta = periodB - periodA;

      return {
        label,
        periodA,
        periodB,
        delta,
        deltaPercent: periodA !== 0 ? (delta / periodA) * 100 : null
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.periodA += row.periodA;
        acc.periodB += row.periodB;
        return acc;
      },
      { periodA: 0, periodB: 0 }
    );
    const delta = totals.periodB - totals.periodA;

    const value: ComparisonSalesResult = {
      dimension: filter.dimension,
      periodA: {
        from: filter.periodAFrom,
        to: filter.periodATo,
        total: totals.periodA
      },
      periodB: {
        from: filter.periodBFrom,
        to: filter.periodBTo,
        total: totals.periodB
      },
      totals: {
        periodA: totals.periodA,
        periodB: totals.periodB,
        delta,
        deltaPercent: totals.periodA !== 0 ? (delta / totals.periodA) * 100 : null
      },
      rows
    };

    await setRedisJson(`rkeeper:comparisonSales:v1:${key}`, value);
    return value;
  });
});

export async function getComparisonSales(filter: ComparisonSalesFilter) {
  return getComparisonSalesCached(comparisonFilterKey(filter), filter);
}

type AbcCellCode = `${AbcBucket}${AbcBucket}`;

const abcCellMeta: Record<
  AbcCellCode,
  {
    title: string;
    recommendation: string;
    action: AbcGoListAction;
    order: number;
  }
> = {
  AA: {
    title: 'Звезды меню',
    recommendation: 'Продвигать в первую очередь: это сильные блюда по выручке и прибыли.',
    action: 'focus',
    order: 0
  },
  AB: {
    title: 'Доходные локомотивы',
    recommendation: 'Активно продавать: хороший спрос уже есть, прибыль тоже сильная.',
    action: 'focus',
    order: 1
  },
  AC: {
    title: 'Хиты с просадкой маржи',
    recommendation: 'Спрос высокий, но маржа слабая: проверить цену, граммовку и себестоимость.',
    action: 'review',
    order: 2
  },
  BA: {
    title: 'Маржинальные ускорители',
    recommendation: 'Подсвечивать официантам: прибыль сильная, спрос еще можно разогнать.',
    action: 'focus',
    order: 3
  },
  BB: {
    title: 'Рабочее ядро',
    recommendation: 'Держать в активной ротации: стабильные блюда без провалов.',
    action: 'support',
    order: 4
  },
  BC: {
    title: 'Стабильные, но слабые по марже',
    recommendation: 'Продавать точечно и проверить экономику блюда.',
    action: 'review',
    order: 5
  },
  CA: {
    title: 'Скрытые маржинальные',
    recommendation: 'Учить команду предлагать чаще: прибыль высокая, спрос пока недоработан.',
    action: 'support',
    order: 6
  },
  CB: {
    title: 'Нишевые позиции',
    recommendation: 'Оставить в меню, но продвигать выборочно и следить за спросом.',
    action: 'review',
    order: 7
  },
  CC: {
    title: 'Кандидаты на пересмотр',
    recommendation: 'Не продвигать: сначала решить вопрос с ценой, рецептурой или выводом из меню.',
    action: 'stop',
    order: 8
  }
};

const abcGoListMeta: Record<
  AbcGoListAction,
  {
    title: string;
    description: string;
  }
> = {
  focus: {
    title: 'Go-list: продвигать в первую очередь',
    description: 'Эти блюда стоит чаще рекомендовать гостям и выносить в апсейл.'
  },
  support: {
    title: 'Держать в активной ротации',
    description: 'Хорошие позиции без критичных рисков: поддерживать видимость и продажи.'
  },
  review: {
    title: 'Нужен разбор экономики',
    description: 'Тут надо проверить цену, себестоимость, подачу или обучение официантов.'
  },
  stop: {
    title: 'Не продвигать',
    description: 'Сначала исправить продукт или роль блюда в меню, потом возвращать в рекомендации.'
  }
};

function getAbcBucket(cumulativeShare: number): AbcBucket {
  if (cumulativeShare <= 80) return 'A';
  if (cumulativeShare <= 95) return 'B';
  return 'C';
}

function getAbcDishKey(dish: string, category: string): string {
  return `${dish}__${category}`;
}

function compareDishRowsByPriority(a: AbcAnalysisDishRow, b: AbcAnalysisDishRow): number {
  const orderDelta = abcCellMeta[a.cell].order - abcCellMeta[b.cell].order;
  if (orderDelta !== 0) return orderDelta;
  if (b.grossProfit !== a.grossProfit) return b.grossProfit - a.grossProfit;
  if (b.revenue !== a.revenue) return b.revenue - a.revenue;
  return a.dish.localeCompare(b.dish, 'ru');
}

const getAbcAnalysisCached = cache(async (key: string, filter: SalesDateFilter): Promise<AbcAnalysisResult> => {
  return withCachedBusyFallback(
    `abcAnalysis:v1:${key}`,
    `rkeeper:abcAnalysis:v1:${key}`,
    {
      period: {
        from: normalizeDate(filter.from) ?? '',
        to: normalizeDate(filter.to) ?? ''
      },
      totals: {
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        quantity: 0,
        dishesCount: 0,
        marginPct: null
      },
      matrix: [],
      goList: [],
      dishes: []
    },
    async () => {
      const from = normalizeDate(filter.from) ?? '';
      const to = normalizeDate(filter.to) ?? '';
      const costedDishRows = await getCostedDishSalesRows(filter);
      const groupedRows = new Map<
        string,
        { dish: string; category: string; revenue: number; cost: number; grossProfit: number; quantity: number }
      >();

      for (const row of costedDishRows) {
        const dish = row.dish;
        const category = extractCategoryLabel(row.categoryPath);
        const key = getAbcDishKey(dish, category);
        const entry = groupedRows.get(key) ?? {
          dish,
          category,
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          quantity: 0
        };

        entry.revenue += row.revenue;
        entry.cost += row.cost;
        entry.grossProfit += row.grossProfit;
        entry.quantity += row.quantity;

        groupedRows.set(key, entry);
      }

      const baseRows = Array.from(groupedRows.values()).map((row) => ({
        ...row,
        marginPct: row.revenue !== 0 ? (row.grossProfit / row.revenue) * 100 : null
      }));

      const totals = baseRows.reduce(
        (acc, row) => {
          acc.revenue += row.revenue;
          acc.cost += row.cost;
          acc.grossProfit += row.grossProfit;
          acc.quantity += row.quantity;
          return acc;
        },
        { revenue: 0, cost: 0, grossProfit: 0, quantity: 0 }
      );

      const totalRevenue = totals.revenue;
      const totalPositiveGrossProfit = baseRows.reduce(
        (acc, row) => acc + Math.max(row.grossProfit, 0),
        0
      );

      const revenueStats = new Map<
        string,
        { revenueShare: number; cumulativeRevenueShare: number; revenueClass: AbcBucket }
      >();
      let revenueRunning = 0;
      for (const row of baseRows.toSorted((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return a.dish.localeCompare(b.dish, 'ru');
      })) {
        const safeRevenue = Math.max(row.revenue, 0);
        revenueRunning += safeRevenue;
        const revenueShare = totalRevenue > 0 ? (safeRevenue / totalRevenue) * 100 : 0;
        const cumulativeRevenueShare = totalRevenue > 0 ? (revenueRunning / totalRevenue) * 100 : 0;
        revenueStats.set(getAbcDishKey(row.dish, row.category), {
          revenueShare,
          cumulativeRevenueShare,
          revenueClass: getAbcBucket(cumulativeRevenueShare)
        });
      }

      const grossProfitStats = new Map<
        string,
        {
          grossProfitShare: number;
          cumulativeGrossProfitShare: number;
          grossProfitClass: AbcBucket;
        }
      >();
      let grossProfitRunning = 0;
      for (const row of baseRows.toSorted((a, b) => {
        if (b.grossProfit !== a.grossProfit) return b.grossProfit - a.grossProfit;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return a.dish.localeCompare(b.dish, 'ru');
      })) {
        const positiveGrossProfit = Math.max(row.grossProfit, 0);
        if (positiveGrossProfit > 0 && totalPositiveGrossProfit > 0) {
          grossProfitRunning += positiveGrossProfit;
          const grossProfitShare = (positiveGrossProfit / totalPositiveGrossProfit) * 100;
          const cumulativeGrossProfitShare = (grossProfitRunning / totalPositiveGrossProfit) * 100;
          grossProfitStats.set(getAbcDishKey(row.dish, row.category), {
            grossProfitShare,
            cumulativeGrossProfitShare,
            grossProfitClass: getAbcBucket(cumulativeGrossProfitShare)
          });
          continue;
        }

        grossProfitStats.set(getAbcDishKey(row.dish, row.category), {
          grossProfitShare: 0,
          cumulativeGrossProfitShare: totalPositiveGrossProfit > 0 ? 100 : 0,
          grossProfitClass: 'C'
        });
      }

      const dishes: AbcAnalysisDishRow[] = baseRows
        .map((row) => {
          const revenueStat = revenueStats.get(getAbcDishKey(row.dish, row.category));
          const grossProfitStat = grossProfitStats.get(getAbcDishKey(row.dish, row.category));

          const revenueClass = revenueStat?.revenueClass ?? 'C';
          const grossProfitClass = grossProfitStat?.grossProfitClass ?? 'C';
          const cell = `${revenueClass}${grossProfitClass}` as AbcCellCode;
          const meta = abcCellMeta[cell];

          return {
            dish: row.dish,
            category: row.category,
            revenue: row.revenue,
            cost: row.cost,
            grossProfit: row.grossProfit,
            marginPct: row.marginPct,
            quantity: row.quantity,
            revenueShare: revenueStat?.revenueShare ?? 0,
            cumulativeRevenueShare: revenueStat?.cumulativeRevenueShare ?? 0,
            revenueClass,
            grossProfitShare: grossProfitStat?.grossProfitShare ?? 0,
            cumulativeGrossProfitShare: grossProfitStat?.cumulativeGrossProfitShare ?? 0,
            grossProfitClass,
            cell,
            cellTitle: meta.title,
            recommendation: meta.recommendation,
            goListAction: meta.action
          };
        })
        .toSorted(compareDishRowsByPriority);

      const matrix: AbcAnalysisMatrixCell[] = (
        ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'CB', 'CC'] as AbcCellCode[]
      ).map((cellKey) => {
        const rows = dishes
          .filter((row) => row.cell === cellKey)
          .toSorted((a, b) => {
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            if (b.grossProfit !== a.grossProfit) return b.grossProfit - a.grossProfit;
            return a.dish.localeCompare(b.dish, 'ru');
          });
        const aggregate = rows.reduce(
          (acc, row) => {
            acc.revenue += row.revenue;
            acc.cost += row.cost;
            acc.grossProfit += row.grossProfit;
            acc.quantity += row.quantity;
            return acc;
          },
          { revenue: 0, cost: 0, grossProfit: 0, quantity: 0 }
        );

        return {
          key: cellKey,
          revenueClass: cellKey[0] as AbcBucket,
          grossProfitClass: cellKey[1] as AbcBucket,
          title: abcCellMeta[cellKey].title,
          recommendation: abcCellMeta[cellKey].recommendation,
          dishesCount: rows.length,
          revenue: aggregate.revenue,
          cost: aggregate.cost,
          grossProfit: aggregate.grossProfit,
          quantity: aggregate.quantity,
          marginPct: aggregate.revenue !== 0 ? (aggregate.grossProfit / aggregate.revenue) * 100 : null,
          topDishes: rows.slice(0, 3).map((row) => row.dish)
        };
      });

      const goList: AbcAnalysisGoListGroup[] = (
        ['focus', 'support', 'review', 'stop'] as AbcGoListAction[]
      ).map((action) => {
        const items = dishes
          .filter((row) => row.goListAction === action)
          .toSorted((a, b) => {
            if (action === 'stop') {
              if (a.marginPct !== b.marginPct) return (a.marginPct ?? Number.POSITIVE_INFINITY) - (b.marginPct ?? Number.POSITIVE_INFINITY);
              return a.revenue - b.revenue;
            }
            if (b.grossProfit !== a.grossProfit) return b.grossProfit - a.grossProfit;
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            return a.dish.localeCompare(b.dish, 'ru');
          })
          .slice(0, 8);

        return {
          action,
          title: abcGoListMeta[action].title,
          description: abcGoListMeta[action].description,
          items
        };
      });

      return {
        period: {
          from,
          to
        },
        totals: {
          revenue: totals.revenue,
          cost: totals.cost,
          grossProfit: totals.grossProfit,
          quantity: totals.quantity,
          dishesCount: dishes.length,
          marginPct: totals.revenue !== 0 ? (totals.grossProfit / totals.revenue) * 100 : null
        },
        matrix,
        goList,
        dishes
      };
    }
  );
});

export async function getAbcAnalysis(filter: SalesDateFilter): Promise<AbcAnalysisResult> {
  return getAbcAnalysisCached(filterKey(filter), filter);
}

const getMenuPortfolioAnalysisCached = cache(
  async (key: string, filter: SalesDateFilter): Promise<MenuPortfolioAnalysisResult> => {
    return withCachedBusyFallback(
      `menuPortfolio:v1:${key}`,
      `rkeeper:menuPortfolio:v1:${key}`,
      {
        period: {
          from: normalizeDate(filter.from) ?? '',
          to: normalizeDate(filter.to) ?? ''
        },
        totals: {
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          quantity: 0,
          categoriesCount: 0,
          dishesCount: 0,
          marginPct: null
        },
        categories: []
      },
      async () => {
        const from = normalizeDate(filter.from) ?? '';
        const to = normalizeDate(filter.to) ?? '';
        const groupedDishRows = new Map<
          string,
          {
            dish: string;
            categoryPath: string;
            category: string;
            revenue: number;
            cost: number;
            quantity: number;
            grossProfit: number;
          }
        >();

        for (const row of await getCostedDishSalesRows(filter)) {
          const key = `${row.dish}__${row.categoryPath}`;
          const entry = groupedDishRows.get(key) ?? {
            dish: row.dish,
            categoryPath: row.categoryPath,
            category: extractTopCategoryLabel(row.categoryPath),
            revenue: 0,
            cost: 0,
            quantity: 0,
            grossProfit: 0
          };

          entry.revenue += row.revenue;
          entry.cost += row.cost;
          entry.quantity += row.quantity;
          entry.grossProfit += row.grossProfit;

          groupedDishRows.set(key, entry);
        }

        const dishRows = Array.from(groupedDishRows.values());

        const totals = dishRows.reduce(
          (acc, row) => {
            acc.revenue += row.revenue;
            acc.cost += row.cost;
            acc.grossProfit += row.grossProfit;
            acc.quantity += row.quantity;
            return acc;
          },
          { revenue: 0, cost: 0, grossProfit: 0, quantity: 0 }
        );

        const categoryMap = new Map<
          string,
          {
            category: string;
            revenue: number;
            cost: number;
            grossProfit: number;
            quantity: number;
            dishes: Array<{ dish: string; revenue: number }>;
            categoryPaths: Set<string>;
          }
        >();

        for (const row of dishRows) {
          const entry = categoryMap.get(row.category) ?? {
            category: row.category,
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            quantity: 0,
            dishes: [],
            categoryPaths: new Set<string>()
          };

          entry.revenue += row.revenue;
          entry.cost += row.cost;
          entry.grossProfit += row.grossProfit;
          entry.quantity += row.quantity;
          entry.dishes.push({ dish: row.dish, revenue: row.revenue });
          entry.categoryPaths.add(row.categoryPath);

          categoryMap.set(row.category, entry);
        }

        const categories: MenuPortfolioCategoryRow[] = Array.from(categoryMap.values())
          .map((row) => ({
            category: row.category,
            categoryPath: Array.from(row.categoryPaths)
              .toSorted((a, b) => a.localeCompare(b, 'ru'))
              .join(' | '),
            revenue: row.revenue,
            cost: row.cost,
            grossProfit: row.grossProfit,
            marginPct: row.revenue !== 0 ? (row.grossProfit / row.revenue) * 100 : null,
            quantity: row.quantity,
            dishesCount: row.dishes.length,
            revenueShare: totals.revenue !== 0 ? (row.revenue / totals.revenue) * 100 : 0,
            quantityShare: totals.quantity !== 0 ? (row.quantity / totals.quantity) * 100 : 0,
            topDishes: row.dishes
              .toSorted((a, b) => b.revenue - a.revenue)
              .slice(0, 3)
              .map((dish) => dish.dish)
          }))
          .toSorted((a, b) => {
            if (b.revenueShare !== a.revenueShare) return b.revenueShare - a.revenueShare;
            if (b.marginPct !== a.marginPct) {
              return (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY);
            }
            return a.category.localeCompare(b.category, 'ru');
          });

        return {
          period: {
            from,
            to
          },
          totals: {
            revenue: totals.revenue,
            cost: totals.cost,
            grossProfit: totals.grossProfit,
            quantity: totals.quantity,
            categoriesCount: categories.length,
            dishesCount: dishRows.length,
            marginPct: totals.revenue !== 0 ? (totals.grossProfit / totals.revenue) * 100 : null
          },
          categories
        };
      }
    );
  }
);

export async function getMenuPortfolioAnalysis(
  filter: SalesDateFilter
): Promise<MenuPortfolioAnalysisResult> {
  return getMenuPortfolioAnalysisCached(filterKey(filter), filter);
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
          'В базе отсутствует таблица rkeeper_operations. Запустите Operations ETL и заполните операции.',
          { cause: error }
        );
      }
      throw error;
    }

    const missing: string[] = [];
    const { whereClause, args } = buildDateFilterWhere(filter, {
      restaurantColumn: 'RESTAURANTNAME'
    });

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
