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

type SourceListItem = {
  id: string;
  title: string | null;
  embedded: boolean;
  embedded_chunks: number | null;
  created: string | null;
  updated: string | null;
  status: string | null;
  command_id: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const notebookId = req.nextUrl.searchParams.get('notebookId')?.trim() || '';
    const limit = req.nextUrl.searchParams.get('limit')?.trim() || '100';
    const offset = req.nextUrl.searchParams.get('offset')?.trim() || '0';

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set('notebook_id', notebookId);
    params.set('limit', limit);
    params.set('offset', offset);

    const res = await fetch(`${getOpenNotebookUrl()}/api/sources?${params.toString()}`, {
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

    const json = (await res.json()) as unknown;
    const items = Array.isArray(json) ? (json as any[]) : [];
    const sources: SourceListItem[] = items
      .map((row) => ({
        id: String(row?.id ?? ''),
        title: row?.title == null ? null : String(row.title),
        embedded: Boolean(row?.embedded),
        embedded_chunks: row?.embedded_chunks == null ? null : Number(row.embedded_chunks),
        created: row?.created == null ? null : String(row.created),
        updated: row?.updated == null ? null : String(row.updated),
        status: row?.status == null ? null : String(row.status),
        command_id: row?.command_id == null ? null : String(row.command_id)
      }))
      .filter((s) => s.id.trim().length > 0);

    return NextResponse.json({ sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
