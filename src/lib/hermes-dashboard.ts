const DEFAULT_BASE = 'http://127.0.0.1:9119';

export function getHermesDashboardBaseUrl(): string {
  const raw = process.env.HERMES_DASHBOARD_URL?.trim() || DEFAULT_BASE;
  return raw.replace(/\/$/, '');
}

export async function hermesDashboardFetch(
  apiPath: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init ?? {};
  const url = `${getHermesDashboardBaseUrl()}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(rest.headers as Record<string, string> | undefined)
      }
    });
  } finally {
    clearTimeout(t);
  }
}
