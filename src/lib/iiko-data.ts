import 'server-only';

import { cache } from 'react';
import { createSqliteExecutor } from '@/lib/libsql-client';
import { isSqliteBusyError, withSqliteBusyRetry } from '@/lib/libsql-retry';

const executeSqlite = createSqliteExecutor({
  envVarNames: ['RKEEPER_DB_PATH', 'IIKO_DB_PATH'],
  defaultRelativePath: 'rkeeper_etl/rkeeper_data.db',
  additionalPaths: ['/data/rkeeper_data.db']
});

export interface IikoSalesDateFilter {
  from?: string;
  to?: string;
  departmentIds?: string[] | null;
}

const CACHE_TTL_MS = 15_000;
const memoryCache = new Map<string, { ts: number; value: unknown }>();

function normalizeDate(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeDepartmentIds(values?: string[] | null): string[] {
  if (!values) return [];

  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function filterKey(filter?: IikoSalesDateFilter): string {
  const from = normalizeDate(filter?.from) ?? '';
  const to = normalizeDate(filter?.to) ?? '';
  const departments = normalizeDepartmentIds(filter?.departmentIds).join('|');
  return `${from}|${to}|${departments}`;
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
  fallbackValue: T,
  loader: () => Promise<T>
): Promise<T> {
  const memoryValue = getCachedMemoryValue<T>(memoryKey);
  if (memoryValue !== null) {
    return memoryValue;
  }

  try {
    return await withMemoryCache(memoryKey, loader);
  } catch (error) {
    if (!isSqliteBusyError(error)) {
      throw error;
    }

    const staleMemoryValue = getCachedMemoryValue<T>(memoryKey);
    if (staleMemoryValue !== null) {
      return staleMemoryValue;
    }

    return fallbackValue;
  }
}

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
      return { rows: [] as Record<string, unknown>[] };
    }
    throw error;
  }
}

function buildDateFilterWhere(filter?: IikoSalesDateFilter) {
  const clauses: string[] = [];
  const args: Record<string, unknown> = {};

  const from = normalizeDate(filter?.from);
  const to = normalizeDate(filter?.to);
  const hasDepartmentFilter = Array.isArray(filter?.departmentIds);
  const departmentIds = normalizeDepartmentIds(filter?.departmentIds);

  if (from) {
    clauses.push('date(business_date) >= date(:fromDate)');
    args.fromDate = from;
  }

  if (to) {
    clauses.push('date(business_date) <= date(:toDate)');
    args.toDate = to;
  }

  if (hasDepartmentFilter) {
    if (departmentIds.length === 0) {
      clauses.push('1 = 0');
    } else {
      const placeholders: string[] = [];
      for (const [index, departmentId] of departmentIds.entries()) {
        const key = `department${index}`;
        placeholders.push(`:${key}`);
        args[key] = departmentId;
      }
      clauses.push(`source_department_id IN (${placeholders.join(', ')})`);
    }
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  };
}

const getIikoSalesSummaryCached = cache(async (key: string, filter?: IikoSalesDateFilter) => {
  return withCachedBusyFallback(
    `iikoSalesSummary:${key}`,
    {
      totalRevenue: 0,
      totalItems: 0
    },
    async () => {
      const { whereClause, args } = buildDateFilterWhere(filter);
      const result = await safeExecute(
        `
        SELECT
          SUM(revenue) as total_revenue,
          SUM(quantity) as total_items
        FROM iiko_sales_gold
        ${whereClause}
      `,
        args
      );

      const row = (result.rows[0] ?? {}) as Record<string, unknown>;
      return {
        totalRevenue: Number(row.total_revenue ?? 0),
        totalItems: Number(row.total_items ?? 0)
      };
    }
  );
});

export async function getIikoSalesSummary(filter?: IikoSalesDateFilter) {
  return getIikoSalesSummaryCached(filterKey(filter), filter);
}

const getIikoDailyRevenueCached = cache(async (key: string, filter?: IikoSalesDateFilter) => {
  return withCachedBusyFallback(`iikoDailyRevenue:${key}`, [], async () => {
    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT
        strftime('%Y-%m-%d', business_date) as date,
        SUM(revenue) as revenue
      FROM iiko_sales_gold
      ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `,
      args
    );

    return result.rows.map((row) => ({
      date: row.date as string,
      revenue: Number(row.revenue ?? 0)
    }));
  });
});

export async function getIikoDailyRevenue(filter?: IikoSalesDateFilter) {
  return getIikoDailyRevenueCached(filterKey(filter), filter);
}

const getIikoMonthlyRevenueCached = cache(async (key: string, filter?: IikoSalesDateFilter) => {
  return withCachedBusyFallback(`iikoMonthlyRevenue:${key}`, [], async () => {
    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT
        strftime('%Y-%m', business_date) as month,
        SUM(revenue) as revenue
      FROM iiko_sales_gold
      ${whereClause}
      GROUP BY month
      ORDER BY month ASC
    `,
      args
    );

    return result.rows.map((row) => ({
      month: row.month as string,
      revenue: Number(row.revenue ?? 0)
    }));
  });
});

export async function getIikoMonthlyRevenue(filter?: IikoSalesDateFilter) {
  return getIikoMonthlyRevenueCached(filterKey(filter), filter);
}

const getIikoTopDishesCached = cache(async (key: string, filter?: IikoSalesDateFilter) => {
  return withCachedBusyFallback(`iikoTopDishes:${key}`, [], async () => {
    const { whereClause, args } = buildDateFilterWhere(filter);
    const result = await safeExecute(
      `
      SELECT
        COALESCE(NULLIF(TRIM(dish_name), ''), 'Без названия') as name,
        SUM(quantity) as quantity,
        SUM(revenue) as revenue
      FROM iiko_sales_gold
      ${whereClause}
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 20
    `,
      args
    );

    return result.rows.map((row) => ({
      name: row.name as string,
      quantity: Number(row.quantity ?? 0),
      revenue: Number(row.revenue ?? 0)
    }));
  });
});

export async function getIikoTopDishes(filter?: IikoSalesDateFilter) {
  return getIikoTopDishesCached(filterKey(filter), filter);
}
