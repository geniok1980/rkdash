import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

async function postUpload(form: FormData): Promise<Response> {
  const candidates = ['/sources', '/api/sources'];
  let lastRes: Response | null = null;

  for (const path of candidates) {
    const res = await fetch(`${getOpenNotebookUrl()}${path}`, {
      method: 'POST',
      body: form,
      headers: { ...getAuthHeaders() },
      cache: 'no-store'
    });
    lastRes = res;
    if (res.status !== 404) return res;
  }

  return lastRes!;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const notebookId = String(form.get('notebookId') ?? '').trim();
    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId is required' }, { status: 400 });
    }

    const files = form.getAll('files').filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'files is required' }, { status: 400 });
    }

    const results: Array<{
      fileName: string;
      ok: boolean;
      status: number;
      result?: unknown;
      error?: string;
    }> = [];

    for (const file of files) {
      const outbound = new FormData();
      outbound.set('type', 'upload');
      outbound.set('notebook_id', notebookId);
      outbound.set('embed', 'true');
      outbound.set('async_processing', 'true');
      outbound.set('file', file, file.name);

      const res = await postUpload(outbound);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        results.push({
          fileName: file.name,
          ok: false,
          status: res.status,
          error: `Open Notebook error: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`
        });
        continue;
      }

      const json = await res.json().catch(() => null);
      results.push({
        fileName: file.name,
        ok: true,
        status: res.status,
        result: json
      });
    }

    return NextResponse.json({ results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
