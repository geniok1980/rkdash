import {
  installSkillFromZip,
  listInstalledSkillsFromFs,
  uninstallSkillFromFs
} from '@/lib/hermes-skills-fs';
import { hermesDashboardFetch } from '@/lib/hermes-dashboard';
import { getTelegramAgentProfileDir } from '@/lib/hermes-telegram-agents';
import { NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';

function getAgentSkillsRoot(profileDir: string): string {
  return `${profileDir}/skills`;
}

function getAgentProfileName(profileDir: string): string {
  return path.basename(profileDir);
}

function normalizeSkillsPayload(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }
  if (data && typeof data === 'object' && Array.isArray((data as { skills?: unknown[] }).skills)) {
    return ((data as { skills: unknown[] }).skills || []).filter(
      (item) => item && typeof item === 'object'
    ) as Array<Record<string, unknown>>;
  }
  return [];
}

async function listProfileSkillsViaHermes(profile: string) {
  const res = await hermesDashboardFetch(`/api/skills?profile=${encodeURIComponent(profile)}`);
  if (!res.ok) {
    throw new Error(`Hermes skills API ответил ${res.status}`);
  }
  return normalizeSkillsPayload(await res.json().catch(() => []));
}

async function restartProfileGatewayIfRunning(profile: string): Promise<void> {
  try {
    const profilesRes = await hermesDashboardFetch('/api/profiles');
    if (!profilesRes.ok) {
      return;
    }

    const data = (await profilesRes.json().catch(() => ({}))) as {
      profiles?: Array<{ name?: string; gateway_running?: boolean }>;
    };
    const current = (data.profiles || []).find((item) => item?.name === profile);
    if (!current?.gateway_running) {
      return;
    }

    await hermesDashboardFetch(`/api/gateway/restart?profile=${encodeURIComponent(profile)}`, {
      method: 'POST'
    });
  } catch {
    // Best-effort only: skill writes already happened on disk/profile.
  }
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

export async function GET(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const fsSkills = await listInstalledSkillsFromFs({ skillsRoot: getAgentSkillsRoot(profileDir) });

    try {
      const apiSkills = await listProfileSkillsViaHermes(profile);
      const merged = new Map<string, Record<string, unknown>>();

      for (const skill of apiSkills) {
        const name = typeof skill.name === 'string' ? skill.name : '';
        if (!name) continue;
        merged.set(name, skill);
      }

      for (const skill of fsSkills) {
        const current = merged.get(skill.name) || { name: skill.name };
        merged.set(skill.name, {
          ...current,
          description:
            typeof current.description === 'string' ? current.description : skill.description,
          category: typeof current.category === 'string' ? current.category : skill.category,
          folder: skill.folder
        });
      }

      return NextResponse.json({
        skills: Array.from(merged.values()),
        source: 'agent-profile-api+filesystem'
      });
    } catch {
      return NextResponse.json({ skills: fsSkills, source: 'agent-filesystem' });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const form = await req.formData();
    const file = form.get('zip');
    const folderNameRaw = form.get('folderName');
    const folderName = typeof folderNameRaw === 'string' ? folderNameRaw : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Передайте zip-файл в поле "zip".' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'Нужен файл .zip' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const installed = await installSkillFromZip(bytes, folderName, {
      skillsRoot: getAgentSkillsRoot(profileDir)
    });
    await restartProfileGatewayIfRunning(profile);
    return NextResponse.json({
      ok: true,
      folder: installed.folder,
      path: installed.path,
      note: 'Skill установлен для этого Hermes profile.'
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const body = (await req.json().catch(() => ({}))) as { folder?: string; folderName?: string };
    const folderName = typeof body.folderName === 'string' ? body.folderName : body.folder;
    if (!folderName) {
      return NextResponse.json({ error: 'Передай folderName для удаления.' }, { status: 400 });
    }

    await uninstallSkillFromFs(folderName, { skillsRoot: getAgentSkillsRoot(profileDir) });
    await restartProfileGatewayIfRunning(profile);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
    const profile = getAgentProfileName(profileDir);
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      enabled?: boolean;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Передай имя skill для переключения.' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Передай enabled=true/false.' }, { status: 400 });
    }

    const res = await hermesDashboardFetch('/api/skills/toggle', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        enabled: body.enabled,
        profile
      })
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await readErrorMessage(res, 'Не удалось переключить skill.') },
        { status: res.status }
      );
    }

    await restartProfileGatewayIfRunning(profile);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
