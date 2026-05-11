import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_MASTRA_URL = 'http://localhost:4111';

function getMastraUrl(): string {
  const raw = process.env.MASTRA_SERVER_URL?.trim() || DEFAULT_MASTRA_URL;
  return raw.replace(/\/$/, '');
}

type MastraAgent = {
  id?: string;
  name?: string;
  description?: string;
};

export async function GET() {
  try {
    const res = await fetch(`${getMastraUrl()}/api/agents`, { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Mastra server error: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`
        },
        { status: 502 }
      );
    }

    const json = (await res.json()) as unknown;
    const record = (
      json && typeof json === 'object' ? (json as Record<string, MastraAgent>) : {}
    ) as Record<string, MastraAgent>;

    const agents = Object.entries(record)
      .map(([key, value]) => ({
        id: String(value?.id ?? key),
        name: String(value?.name ?? key),
        description: value?.description ? String(value.description) : null
      }))
      .filter((a) => a.id.trim().length > 0)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'ru-RU'));

    const defaultAgentId = agents.some((a) => a.id === 'sql-agent')
      ? 'sql-agent'
      : (agents[0]?.id ?? null);

    return NextResponse.json({ agents, defaultAgentId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
