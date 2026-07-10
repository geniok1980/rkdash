const DEFAULT_BASE = 'http://127.0.0.1:9119';
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessionCookieCache = new Map<string, { cookie: string; expiresAt: number }>();

function getCachedSessionCookie(baseUrl: string): string | null {
  const cached = sessionCookieCache.get(baseUrl);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    sessionCookieCache.delete(baseUrl);
    return null;
  }
  return cached.cookie;
}

function setCachedSessionCookie(baseUrl: string, cookie: string): void {
  sessionCookieCache.set(baseUrl, {
    cookie,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
}

function clearCachedSessionCookie(baseUrl: string): void {
  sessionCookieCache.delete(baseUrl);
}

function extractCookieHeader(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const rawCookies = headers.getSetCookie?.();
  const setCookieValues =
    rawCookies && rawCookies.length > 0
      ? rawCookies
      : (headers
          .get('set-cookie')
          ?.split(/,(?=\s*[^;,\s]+=)/)
          .map((item) => item.trim())
          .filter(Boolean) ?? []);

  if (setCookieValues.length === 0) {
    return null;
  }

  const cookieHeader = setCookieValues
    .map((item) => item.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ');

  return cookieHeader || null;
}

function getHermesDashboardPasswordAuth() {
  const username = process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME?.trim() || '';
  const password = process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD?.trim() || '';
  return username && password ? { username, password } : null;
}

export function getHermesDashboardBaseUrl(): string {
  const raw = process.env.HERMES_DASHBOARD_URL?.trim() || DEFAULT_BASE;
  return raw.replace(/\/$/, '');
}

async function loginToHermesDashboard(
  baseUrl: string,
  timeoutMs: number,
  force = false
): Promise<string | null> {
  const auth = getHermesDashboardPasswordAuth();
  if (!auth) {
    return null;
  }

  if (!force) {
    const cached = getCachedSessionCookie(baseUrl);
    if (cached) {
      return cached;
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/auth/password-login`, {
      method: 'POST',
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        provider: 'basic',
        username: auth.username,
        password: auth.password,
        next: '/'
      })
    });

    if (!response.ok) {
      return null;
    }

    const cookie = extractCookieHeader(response);
    if (cookie) {
      setCachedSessionCookie(baseUrl, cookie);
    }
    return cookie;
  } finally {
    clearTimeout(t);
  }
}

export async function hermesDashboardFetch(
  apiPath: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init ?? {};
  const method = (rest.method || 'GET').toUpperCase();
  const baseUrl = getHermesDashboardBaseUrl();
  const url = `${baseUrl}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
  const headers = {
    Accept: 'application/json',
    ...(rest.headers as Record<string, string> | undefined)
  };

  const requestOnce = async (cookie?: string): Promise<Response> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...rest,
        signal: ctrl.signal,
        cache: 'no-store',
        headers: {
          ...headers,
          ...(cookie ? { Cookie: cookie } : {})
        }
      });
    } finally {
      clearTimeout(t);
    }
  };

  // Write endpoints behind Hermes Dashboard auth are more reliable when they
  // receive a valid session cookie on the first attempt instead of after a 401
  // replay. This also avoids retry edge cases with request bodies.
  if (method !== 'GET' && method !== 'HEAD') {
    const cookie = await loginToHermesDashboard(baseUrl, timeoutMs);
    if (cookie) {
      const response = await requestOnce(cookie);
      if (response.status !== 401) {
        return response;
      }
      clearCachedSessionCookie(baseUrl);
    }
  }

  const response = await requestOnce(getCachedSessionCookie(baseUrl) ?? undefined);
  if (response.status !== 401) {
    return response;
  }

  clearCachedSessionCookie(baseUrl);
  const cookie = await loginToHermesDashboard(baseUrl, timeoutMs, true);
  if (!cookie) {
    return response;
  }

  return requestOnce(cookie);
}
