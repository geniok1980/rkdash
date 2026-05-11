import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_OPEN_NOTEBOOK_URL = 'http://open-notebook:5055';

function getOpenNotebookUrl(): string {
  const raw = process.env.OPEN_NOTEBOOK_API_URL?.trim() || DEFAULT_OPEN_NOTEBOOK_URL;
  return raw.replace(/\/$/, '');
}

function getAuthHeaders(): HeadersInit {
  const password = process.env.OPEN_NOTEBOOK_PASSWORD?.trim();
  if (!password) return {};
  return { Authorization: `Bearer ${password}` };
}

async function fetchJsonWithFallback(pathCandidates: string[], init?: RequestInit) {
  let lastRes: Response | null = null;
  for (const path of pathCandidates) {
    const res = await fetch(`${getOpenNotebookUrl()}${path}`, {
      ...init,
      headers: { ...(init?.headers || {}), ...getAuthHeaders() },
      cache: 'no-store'
    });
    lastRes = res;
    if (res.status !== 404) return res;
  }
  return lastRes!;
}

type Notebook = { id: string; name: string; description?: string | null };

export async function GET() {
  try {
    const res = await fetchJsonWithFallback(['/api/notebooks', '/notebooks']);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Open Notebook error: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`
        },
        { status: 502 }
      );
    }

    const json = (await res.json()) as unknown;
    const notebooks = Array.isArray(json) ? (json as Notebook[]) : [];

    const normalized = notebooks
      .map((n) => ({
        id: String((n as any).id ?? ''),
        name: String((n as any).name ?? ''),
        description: (n as any).description ? String((n as any).description) : null
      }))
      .filter((n) => n.id.trim().length > 0 && n.name.trim().length > 0)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'ru-RU'));

    const defaultNotebookId = normalized[0]?.id ?? null;

    return NextResponse.json({ notebooks: normalized, defaultNotebookId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: unknown; description?: unknown };
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const res = await fetchJsonWithFallback(['/api/notebooks', '/notebooks'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Open Notebook error: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
        },
        { status: 502 }
      );
    }

    const json = (await res.json()) as any;
    const notebook = {
      id: String(json?.id ?? ''),
      name: String(json?.name ?? ''),
      description: json?.description ? String(json.description) : null
    };
    if (!notebook.id || !notebook.name) {
      return NextResponse.json({ error: 'Unexpected Open Notebook response' }, { status: 502 });
    }

    return NextResponse.json({ notebook });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
