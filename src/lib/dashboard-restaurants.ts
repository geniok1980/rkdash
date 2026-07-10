import 'server-only';

import type {
  DashboardRestaurantOption,
  DashboardRestaurantSource
} from '@/features/overview/lib/restaurant-filter-types';
import { createSqliteExecutor } from '@/lib/libsql-client';
import { withSqliteBusyRetry } from '@/lib/libsql-retry';

const executeSqlite = createSqliteExecutor({
  envVarNames: ['RKEEPER_DB_PATH'],
  defaultRelativePath: 'rkeeper_etl/rkeeper_data.db',
  additionalPaths: ['/data/rkeeper_data.db']
});

function encodeRestaurantValue(source: DashboardRestaurantSource, key: string): string {
  return `${source}:${Buffer.from(key, 'utf8').toString('base64url')}`;
}

function decodeRestaurantValue(value: string): { source: DashboardRestaurantSource; key: string } | null {
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex <= 0) return null;

  const source = trimmed.slice(0, separatorIndex);
  if (source !== 'rkeeper' && source !== 'iiko') return null;

  const encodedKey = trimmed.slice(separatorIndex + 1);
  if (!encodedKey) return null;

  try {
    const key = Buffer.from(encodedKey, 'base64url').toString('utf8').trim();
    if (!key) return null;
    return { source, key };
  } catch {
    return null;
  }
}

function normalizeRestaurantSelections(values: string[]): string[] {
  const result = new Set<string>();

  for (const rawValue of values) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;

    for (const part of trimmed.split(',')) {
      const value = part.trim();
      if (value) result.add(value);
    }
  }

  return Array.from(result);
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
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('no such table:')) {
      return { rows: [] as Record<string, unknown>[] };
    }
    throw error;
  }
}

export function parseRestaurantSearchParamValues(values: string[]) {
  const normalized = normalizeRestaurantSelections(values);
  const rkeeperRestaurantNames = new Set<string>();
  const iikoDepartmentIds = new Set<string>();

  for (const value of normalized) {
    const decoded = decodeRestaurantValue(value);
    if (!decoded) continue;

    if (decoded.source === 'rkeeper') {
      rkeeperRestaurantNames.add(decoded.key);
      continue;
    }

    if (decoded.source === 'iiko') {
      iikoDepartmentIds.add(decoded.key);
    }
  }

  return {
    selectedValues: normalized,
    hasSelection: normalized.length > 0,
    rkeeperRestaurantNames: Array.from(rkeeperRestaurantNames),
    iikoDepartmentIds: Array.from(iikoDepartmentIds)
  };
}

export async function getDashboardRestaurantOptions(): Promise<DashboardRestaurantOption[]> {
  const options: DashboardRestaurantOption[] = [];

  const rkeeperResult = await safeExecute(`
    SELECT
      TRIM(RESTAURANTNAME) as label,
      COUNT(*) as count
    FROM rkeeper_sales
    WHERE RESTAURANTNAME IS NOT NULL
      AND TRIM(RESTAURANTNAME) <> ''
    GROUP BY TRIM(RESTAURANTNAME)
    ORDER BY COUNT(*) DESC, label ASC
    LIMIT 500
  `);

  for (const row of rkeeperResult.rows as Record<string, unknown>[]) {
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label) continue;

    options.push({
      value: encodeRestaurantValue('rkeeper', label),
      label,
      source: 'rkeeper',
      count: Number(row.count ?? 0)
    });
  }

  const iikoResult = await safeExecute(`
    SELECT DISTINCT
      TRIM(id) as id,
      TRIM(name) as label
    FROM iiko_departments
    WHERE id IS NOT NULL
      AND TRIM(id) <> ''
      AND name IS NOT NULL
      AND TRIM(name) <> ''
      AND (type = 'DEPARTMENT' OR type IS NULL OR TRIM(type) = '')
    ORDER BY label ASC
    LIMIT 500
  `);

  for (const row of iikoResult.rows as Record<string, unknown>[]) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!id || !label) continue;

    options.push({
      value: encodeRestaurantValue('iiko', id),
      label,
      source: 'iiko'
    });
  }

  return options;
}
