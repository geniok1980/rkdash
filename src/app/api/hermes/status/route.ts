import { hermesDashboardFetch } from '@/lib/hermes-dashboard';
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await hermesDashboardFetch('/api/status', { timeoutMs: 2500 });
    const text = await res.text();
    if (res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
      });
    }

    return NextResponse.json(
      {
        version: 'filesystem',
        gateway: { running: true },
        warning: `Hermes Dashboard ответил ${res.status}. UI работает в режиме filesystem.`,
        detail: text.slice(0, 500)
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const skillsDir =
      process.env.HERMES_SKILLS_DIR?.trim() ||
      (process.env.HERMES_HOME?.trim()
        ? path.join(path.resolve(process.env.HERMES_HOME.trim()), 'skills')
        : null);
    const agentsDir =
      process.env.HERMES_TELEGRAM_AGENTS_DIR?.trim() ||
      (process.env.HERMES_HOME?.trim()
        ? path.join(path.resolve(process.env.HERMES_HOME.trim()), 'telegram-agents')
        : null);

    const exists = async (p: string | null) => {
      if (!p) return false;
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    };

    return NextResponse.json(
      {
        version: 'filesystem',
        gateway: { running: true },
        warning: 'Hermes Dashboard недоступен. UI работает в режиме filesystem.',
        detail: msg,
        paths: {
          skillsDir,
          skillsDirExists: await exists(skillsDir),
          telegramAgentsDir: agentsDir,
          telegramAgentsDirExists: await exists(agentsDir)
        }
      },
      { status: 200 }
    );
  }
}
