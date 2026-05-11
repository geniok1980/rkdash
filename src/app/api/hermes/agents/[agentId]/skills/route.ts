import {
  installSkillFromZip,
  listInstalledSkillsFromFs,
  uninstallSkillFromFs
} from '@/lib/hermes-skills-fs';
import { getTelegramAgentProfileDir } from '@/lib/hermes-telegram-agents';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getAgentSkillsRoot(profileDir: string): string {
  return `${profileDir}/skills`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
    const skills = await listInstalledSkillsFromFs({ skillsRoot: getAgentSkillsRoot(profileDir) });
    return NextResponse.json({ skills, source: 'agent-filesystem' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    const profileDir = await getTelegramAgentProfileDir(agentId);
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
    return NextResponse.json({
      ok: true,
      folder: installed.folder,
      path: installed.path,
      note: 'Skill установлен для этого агента.'
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
    const body = (await req.json().catch(() => ({}))) as { folder?: string; folderName?: string };
    const folderName = typeof body.folderName === 'string' ? body.folderName : body.folder;
    if (!folderName) {
      return NextResponse.json({ error: 'Передай folderName для удаления.' }, { status: 400 });
    }

    await uninstallSkillFromFs(folderName, { skillsRoot: getAgentSkillsRoot(profileDir) });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
