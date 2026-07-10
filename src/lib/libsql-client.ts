import { createClient } from '@libsql/client';
import path from 'path';

const clientCache = new Map<string, ReturnType<typeof createClient>>();

function toDbUrl(value: string): string {
  return value.startsWith('file:') ? value : `file:${value}`;
}

function normalizeDbPaths(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
        .map((value) => toDbUrl(value))
    )
  );
}

function getClient(url: string) {
  const cached = clientCache.get(url);
  if (cached) return cached;

  const client = createClient({ url });
  clientCache.set(url, client);
  return client;
}

function isCantOpenError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'SQLITE_CANTOPEN' || message.includes('SQLITE_CANTOPEN');
}

export function createSqliteExecutor(options?: {
  envVarNames?: string[];
  defaultRelativePath?: string;
  additionalPaths?: string[];
}) {
  const envVarNames = options?.envVarNames ?? ['RKEEPER_DB_PATH'];
  const defaultRelativePath = options?.defaultRelativePath ?? 'rkeeper_etl/rkeeper_data.db';
  const defaultDbPath = path.resolve(process.cwd(), defaultRelativePath);
  const dbUrls = normalizeDbPaths([
    ...envVarNames.map((name) => process.env[name]),
    ...(options?.additionalPaths ?? []),
    defaultDbPath
  ]);

  return async function executeSqlite(
    query: string,
    args?: Record<string, unknown>
  ) {
    let lastCantOpenError: unknown = null;

    for (const url of dbUrls) {
      try {
        const client = getClient(url);
        if (args) {
          return await client.execute({ sql: query, args } as never);
        }
        return await client.execute(query);
      } catch (error) {
        if (!isCantOpenError(error)) {
          throw error;
        }
        lastCantOpenError = error;
      }
    }

    throw lastCantOpenError ?? new Error('SQLite database file is not available.');
  };
}
