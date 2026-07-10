import { hermesDashboardFetch } from '@/lib/hermes-dashboard';
import { getTelegramAgentProfileDir } from '@/lib/hermes-telegram-agents';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';

function getAgentProfileName(profileDir: string): string {
  return path.basename(profileDir);
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
      message?: string;
    };
    return data.detail || data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const name = req.nextUrl.searchParams.get('name')?.trim() || '';
    if (!name) {
      return NextResponse.json({ error: 'Передай query-параметр name.' }, { status: 400 });
    }

    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const res = await hermesDashboardFetch(
      `/api/skills/content?name=${encodeURIComponent(name)}&profile=${encodeURIComponent(profile)}`
    );

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { name?: string; content?: string };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';

    if (!name) {
      return NextResponse.json({ error: 'Передай имя skill.' }, { status: 400 });
    }
    if (!content.trim()) {
      return NextResponse.json({ error: 'Передай содержимое SKILL.md.' }, { status: 400 });
    }

    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const res = await hermesDashboardFetch('/api/skills/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        content,
        profile
      })
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await readErrorMessage(res, 'Не удалось сохранить SKILL.md.') },
        { status: res.status }
      );
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
