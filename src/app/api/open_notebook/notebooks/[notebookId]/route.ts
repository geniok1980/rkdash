import { NextResponse } from 'next/server';

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

export async function DELETE(_req: Request, ctx: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await ctx.params;
    const id = notebookId.trim();
    if (!id) return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });

    const res = await fetch(`${getOpenNotebookUrl()}/api/notebooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
      cache: 'no-store'
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Open Notebook error: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`
        },
        { status: 502 }
      );
    }

    const json = await res.json().catch(() => null);
    return NextResponse.json({ ok: true, result: json });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
