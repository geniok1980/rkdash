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

async function deleteWithFallback(pathCandidates: string[]) {
  let lastRes: Response | null = null;

  for (const path of pathCandidates) {
    const res = await fetch(`${getOpenNotebookUrl()}${path}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
      cache: 'no-store'
    });
    lastRes = res;
    if (res.status !== 404) return res;
  }

  return lastRes!;
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ sourceId: string }> }) {
  try {
    const { sourceId } = await ctx.params;
    const id = sourceId.trim();
    if (!id) return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });

    const notebookId = req.nextUrl.searchParams.get('notebookId')?.trim() || '';
    const encId = encodeURIComponent(id);

    const qs = new URLSearchParams();
    qs.set('id', id);
    if (notebookId) qs.set('notebook_id', notebookId);

    const suffix = notebookId ? `?notebook_id=${encodeURIComponent(notebookId)}` : '';

    const res = await deleteWithFallback([
      `/api/sources/${encId}${suffix}`,
      `/sources/${encId}${suffix}`,
      `/api/sources?${qs.toString()}`,
      `/sources?${qs.toString()}`
    ]);

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
