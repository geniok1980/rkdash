import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

export function getHermesSkillsRoot(): string {
  if (process.env.HERMES_SKILLS_DIR?.trim()) {
    return path.resolve(process.env.HERMES_SKILLS_DIR.trim());
  }
  if (process.env.HERMES_HOME?.trim()) {
    return path.join(path.resolve(process.env.HERMES_HOME.trim()), 'skills');
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'hermes', 'skills');
  }
  return path.join(os.homedir(), '.hermes', 'skills');
}

function resolveSkillsRoot(skillsRoot?: string): string {
  return skillsRoot?.trim() ? path.resolve(skillsRoot) : getHermesSkillsRoot();
}

export function parseSkillFrontmatterName(content: string): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!m) return null;
  const nameLine = m[1].match(/^\s*name:\s*(.+)\s*$/m);
  if (!nameLine) return null;
  return nameLine[1].trim().replace(/^["']|["']$/g, '');
}

export function sanitizeSkillFolder(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s || s.length > 64) {
    throw new Error('Некорректное имя skill (латиница, цифры, - и _)');
  }
  return s.slice(0, 64);
}

/** Пишет SKILL.md в ~/.hermes/skills/dashboard-uploads/<folder>/ — Hermes подхватит при следующей сессии. */
export async function writeUploadedSkill(
  markdown: string,
  folderName: string,
  options?: { skillsRoot?: string }
): Promise<string> {
  const root = resolveSkillsRoot(options?.skillsRoot);
  const dir = path.join(root, 'dashboard-uploads', folderName);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'SKILL.md');
  await fs.writeFile(file, markdown, 'utf8');
  return file;
}

export async function installSkillFromZip(
  zipBuffer: Buffer,
  explicitName?: string,
  options?: { skillsRoot?: string }
): Promise<{ folder: string; path: string }> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (!entries.length) {
    throw new Error('ZIP архив пуст.');
  }

  const tempRoot = path.join(os.tmpdir(), `hermes-skill-${crypto.randomUUID()}`);
  await fs.mkdir(tempRoot, { recursive: true });

  try {
    for (const entry of entries) {
      const rawName = entry.entryName.replace(/\\/g, '/');
      if (rawName.startsWith('/') || rawName.includes('..')) {
        throw new Error('ZIP содержит небезопасные пути.');
      }

      const outPath = path.join(tempRoot, rawName);
      const normalized = path.normalize(outPath);
      if (!normalized.startsWith(path.normalize(tempRoot + path.sep))) {
        throw new Error('ZIP содержит выход за целевую директорию.');
      }

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      const data = entry.getData();
      await fs.writeFile(outPath, data);
    }

    const skillMdCandidates: string[] = [];
    const stack: string[] = [tempRoot];
    while (stack.length) {
      const dir = stack.pop()!;
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const abs = path.join(dir, item.name);
        if (item.isDirectory()) {
          stack.push(abs);
        } else if (item.isFile() && item.name === 'SKILL.md') {
          skillMdCandidates.push(abs);
        }
      }
    }

    if (!skillMdCandidates.length) {
      throw new Error('В архиве не найден файл SKILL.md.');
    }
    if (skillMdCandidates.length > 1) {
      throw new Error('В архиве найдено несколько SKILL.md. Оставьте один skill на архив.');
    }

    const skillMdPath = skillMdCandidates[0];
    const skillDir = path.dirname(skillMdPath);
    const skillMdContent = await fs.readFile(skillMdPath, 'utf8');
    const fmName = parseSkillFrontmatterName(skillMdContent);
    const folder = sanitizeSkillFolder(explicitName?.trim() || fmName || path.basename(skillDir));

    const root = resolveSkillsRoot(options?.skillsRoot);
    const targetDir = path.join(root, 'dashboard-uploads', folder);
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.cp(skillDir, targetDir, { recursive: true });

    return { folder, path: path.join(targetDir, 'SKILL.md') };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export interface LocalSkillItem {
  name: string;
  description?: string;
  folder?: string;
  category?: string;
}

function parseSkillDescription(content: string): string | undefined {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!m) return undefined;
  const line = m[1].match(/^\s*description:\s*(.+)\s*$/m);
  if (!line) return undefined;
  return line[1].trim().replace(/^["']|["']$/g, '');
}

export async function listInstalledSkillsFromFs(options?: {
  skillsRoot?: string;
}): Promise<LocalSkillItem[]> {
  const root = resolveSkillsRoot(options?.skillsRoot);
  try {
    const result: LocalSkillItem[] = [];
    const categories = await fs.readdir(root, { withFileTypes: true });

    for (const category of categories) {
      if (!category.isDirectory()) continue;
      if (category.name.startsWith('.')) continue;

      const categoryPath = path.join(root, category.name);
      const entries = await fs.readdir(categoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(categoryPath, entry.name);
        const skillFile = path.join(skillDir, 'SKILL.md');
        try {
          const content = await fs.readFile(skillFile, 'utf8');
          const frontmatterName = parseSkillFrontmatterName(content);
          result.push({
            name: frontmatterName || entry.name,
            description: parseSkillDescription(content),
            folder: entry.name,
            category: category.name
          });
        } catch {
          // Не skill-директория, пропускаем.
        }
      }
    }

    return result.toSorted((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function uninstallSkillFromFs(
  folderName: string,
  options?: { skillsRoot?: string }
): Promise<void> {
  const folder = sanitizeSkillFolder(folderName);
  const root = resolveSkillsRoot(options?.skillsRoot);
  const target = path.join(root, 'dashboard-uploads', folder);
  await fs.rm(target, { recursive: true, force: true });
}
