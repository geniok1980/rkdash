export interface SqliteBusyRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSqliteBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SQLITE_BUSY') || message.includes('database is locked');
}

export async function withSqliteBusyRetry<T>(
  operation: () => Promise<T>,
  options?: SqliteBusyRetryOptions
): Promise<T> {
  const retries = Math.max(0, options?.retries ?? 12);
  const baseDelayMs = Math.max(25, options?.baseDelayMs ?? 200);
  const maxDelayMs = Math.max(baseDelayMs, options?.maxDelayMs ?? 2_000);

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= retries) {
        throw error;
      }

      const delayMs = Math.min(maxDelayMs, baseDelayMs * (attempt + 1));
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
