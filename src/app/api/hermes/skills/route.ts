import {
  installSkillFromZip,
  listInstalledSkillsFromFs,
  parseSkillFrontmatterName,
  sanitizeSkillFolder,
  writeUploadedSkill
} from '@/lib/hermes-skills-fs';
import { hermesDashboardFetch } from '@/lib/hermes-dashboard';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fsSkills = await listInstalledSkillsFromFs();
  try {
    const res = await hermesDashboardFetch('/api/skills');
    if (!res.ok) {
      return NextResponse.json({ skills: fsSkills, source: 'filesystem' }, { status: 200 });
    }
    const data = (await res.json().catch(() => ({}))) as {
      skills?: Array<{ name?: string; description?: string }>;
    };
    const apiSkills = Array.isArray(data.skills) ? data.skills : [];

    const merged = new Map<string, { name: string; description?: string }>();
    for (const skill of apiSkills) {
      const name = typeof skill?.name === 'string' ? skill.name : '';
      if (!name) continue;
      merged.set(name, {
        name,
        description: typeof skill.description === 'string' ? skill.description : undefined
      });
    }
    for (const skill of fsSkills) {
      if (!merged.has(skill.name)) {
        merged.set(skill.name, skill);
      }
    }

    return NextResponse.json({ skills: Array.from(merged.values()), source: 'api+filesystem' });
  } catch (e: unknown) {
    if (fsSkills.length > 0) {
      return NextResponse.json({ skills: fsSkills, source: 'filesystem' }, { status: 200 });
    }
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** Загрузка SKILL.md на диск Hermes (каталог skills). REST install в Hermes может отсутствовать — это совместимый путь. */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
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
      const installed = await installSkillFromZip(bytes, folderName);
      return NextResponse.json({
        ok: true,
        folder: installed.folder,
        path: installed.path,
        note: 'Skill установлен из ZIP.'
      });
    }

    const body = await req.json();
    const markdown = typeof body.markdown === 'string' ? body.markdown : '';
    if (!markdown.trim()) {
      return NextResponse.json({ error: 'Передайте markdown (тело SKILL.md)' }, { status: 400 });
    }

    const fromFm = parseSkillFrontmatterName(markdown);
    const explicit =
      typeof body.folderName === 'string' && body.folderName.trim()
        ? body.folderName.trim()
        : typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : null;

    const folder = sanitizeSkillFolder(explicit || fromFm || 'uploaded-skill');
    const filePath = await writeUploadedSkill(markdown, folder);
    return NextResponse.json({
      ok: true,
      folder,
      path: filePath,
      note: 'Перезапусти сессию агента или gateway, если skill не появился сразу.'
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
