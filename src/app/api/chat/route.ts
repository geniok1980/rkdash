import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_MASTRA_URL = 'http://localhost:4111';

function getMastraUrl(): string {
  const raw = process.env.MASTRA_SERVER_URL?.trim() || DEFAULT_MASTRA_URL;
  return raw.replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const {
      message,
      threadId = 'default-session',
      agentId
    } = (await req.json()) as {
      message?: unknown;
      threadId?: unknown;
      agentId?: unknown;
    };
    const resolvedMessage = typeof message === 'string' ? message : '';
    const resolvedThreadId =
      typeof threadId === 'string' && threadId.trim().length > 0 ? threadId : 'default-session';
    const rawAgentId = typeof agentId === 'string' ? agentId.trim() : '';
    const safeAgentId = /^[a-z0-9][a-z0-9-_]*$/i.test(rawAgentId) ? rawAgentId : 'sql-agent';

    console.warn(`[${requestId}] Agent: ${safeAgentId}`);
    console.warn(`[${requestId}] User message: ${resolvedMessage}`);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Время ожидания от AI истекло (290 сек)')), 290000)
    );

    console.warn(`[${requestId}] Calling Mastra API generate...`);

    const mastraUrl = `${getMastraUrl()}/api/agents/${encodeURIComponent(safeAgentId)}/generate`;
    const response = (await Promise.race([
      fetch(mastraUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: resolvedMessage,
          threadId: resolvedThreadId
        }),
        cache: 'no-store'
      }),
      timeoutPromise
    ])) as Response;

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Mastra server error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`
      );
    }

    const result = (await response.json()) as { text?: string };

    console.warn(`[${requestId}] Agent generation success`);

    return NextResponse.json({ text: result.text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] Chat API Error:`, message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
