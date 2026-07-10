import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { hermesDashboardFetch } from '@/lib/hermes-dashboard';

export interface HermesTelegramAgent {
  id: string;
  name: string;
  slug: string;
  telegramBotTokenMasked: string;
  chatId: string;
  createdAt: string;
  runtime?: {
    status: 'running' | 'stopped';
    pid?: number;
    startedAt?: string;
  };
}

interface HermesTelegramAgentStored {
  id: string;
  name: string;
  slug: string;
  telegramBotToken: string;
  chatId: string;
  createdAt: string;
}

interface HermesDashboardProfile {
  name: string;
  path?: string;
  gateway_running?: boolean;
}

function resolveRuntimeDir(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (path.isAbsolute(trimmed)) {
    return path.normalize(/* turbopackIgnore: true */ trimmed);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'hermes_data', trimmed);
}

function getAgentsBaseDir(): string {
  if (process.env.HERMES_TELEGRAM_AGENTS_DIR?.trim()) {
    return resolveRuntimeDir(process.env.HERMES_TELEGRAM_AGENTS_DIR);
  }
  if (process.env.HERMES_HOME?.trim()) {
    return path.join(
      /* turbopackIgnore: true */ resolveRuntimeDir(process.env.HERMES_HOME),
      'telegram-agents'
    );
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'hermes_data', 'telegram-agents');
}

function getRegistryPath(): string {
  return path.join(/* turbopackIgnore: true */ getAgentsBaseDir(), 'agents.json');
}

function getProfilesBaseDir(): string {
  if (process.env.HERMES_HOME?.trim()) {
    return path.join(
      /* turbopackIgnore: true */ resolveRuntimeDir(process.env.HERMES_HOME),
      'profiles'
    );
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'hermes_data', 'profiles');
}

function getLegacyAgentProfileDir(slug: string): string {
  return path.join(/* turbopackIgnore: true */ getAgentsBaseDir(), 'profiles', slug);
}

function getHermesProfileDir(slug: string): string {
  return path.join(/* turbopackIgnore: true */ getProfilesBaseDir(), slug);
}

function toSlug(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) {
    throw new Error('Некорректное имя агента.');
  }
  return s.slice(0, 64);
}

function maskToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function validateTelegramToken(token: string): void {
  const normalized = token.trim();
  const ok = /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(normalized);
  if (!ok) {
    throw new Error('Некорректный Telegram Bot Token.');
  }
}

function validateChatId(chatId: string): void {
  const normalized = chatId.trim();
  if (!/^-?\d{5,}$/.test(normalized)) {
    throw new Error('Некорректный chat_id (ожидается число, например -1001234567890).');
  }
}

async function readStoredAgents(): Promise<HermesTelegramAgentStored[]> {
  const file = getRegistryPath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as HermesTelegramAgentStored[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredAgents(items: HermesTelegramAgentStored[]): Promise<void> {
  const base = getAgentsBaseDir();
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(getRegistryPath(), JSON.stringify(items, null, 2), 'utf8');
}

function toPublic(item: HermesTelegramAgentStored, profile?: HermesDashboardProfile): HermesTelegramAgent {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    telegramBotTokenMasked: maskToken(item.telegramBotToken),
    chatId: item.chatId,
    createdAt: item.createdAt,
    runtime: profile?.gateway_running
      ? {
          status: 'running'
        }
      : { status: 'stopped' }
  };
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; error?: string; message?: string }
      | null;
    return payload?.detail || payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

async function listHermesProfiles(): Promise<HermesDashboardProfile[]> {
  const res = await hermesDashboardFetch('/api/profiles');
  if (!res.ok) {
    throw new Error(await readResponseError(res, 'Не удалось получить список Hermes profiles.'));
  }

  const data = (await res.json().catch(() => ({}))) as { profiles?: HermesDashboardProfile[] };
  return Array.isArray(data.profiles) ? data.profiles : [];
}

async function getHermesProfileBySlug(slug: string): Promise<HermesDashboardProfile | null> {
  const profiles = await listHermesProfiles();
  return profiles.find((profile) => profile.name === slug) || null;
}

async function ensureHermesProfile(item: HermesTelegramAgentStored): Promise<HermesDashboardProfile> {
  const existing = await getHermesProfileBySlug(item.slug);
  if (existing) {
    return existing;
  }

  const res = await hermesDashboardFetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: item.slug,
      description: item.name
    })
  });

  if (!res.ok) {
    throw new Error(await readResponseError(res, 'Не удалось создать Hermes profile для агента.'));
  }

  return {
    name: item.slug,
    path: getHermesProfileDir(item.slug),
    gateway_running: false
  };
}

async function setHermesEnvValue(profile: string, key: string, value: string): Promise<void> {
  const res = await hermesDashboardFetch('/api/env', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, profile })
  });

  if (!res.ok) {
    throw new Error(await readResponseError(res, `Не удалось сохранить ${key} для профиля ${profile}.`));
  }
}

async function configureTelegramProfile(item: HermesTelegramAgentStored): Promise<void> {
  const telegramRes = await hermesDashboardFetch('/api/messaging/platforms/telegram', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: item.slug,
      enabled: true,
      env: {
        TELEGRAM_BOT_TOKEN: item.telegramBotToken
      }
    })
  });

  if (!telegramRes.ok) {
    throw new Error(
      await readResponseError(telegramRes, `Не удалось настроить Telegram для профиля ${item.slug}.`)
    );
  }

  await setHermesEnvValue(item.slug, 'TELEGRAM_HOME_CHANNEL', item.chatId);
  await setHermesEnvValue(item.slug, 'GATEWAY_ALLOW_ALL_USERS', 'false');
}

async function migrateLegacyAgentProfile(slug: string): Promise<void> {
  const legacyDir = getLegacyAgentProfileDir(slug);
  const targetDir = getHermesProfileDir(slug);

  try {
    const legacyStat = await fs.stat(legacyDir);
    if (!legacyStat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const legacySkillsDir = path.join(/* turbopackIgnore: true */ legacyDir, 'skills');
  const targetSkillsDir = path.join(/* turbopackIgnore: true */ targetDir, 'skills');

  try {
    const skillsStat = await fs.stat(legacySkillsDir);
    if (!skillsStat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  await fs.mkdir(targetSkillsDir, { recursive: true });
  const entries = await fs.readdir(legacySkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fromDir = path.join(/* turbopackIgnore: true */ legacySkillsDir, entry.name);
    const toDir = path.join(/* turbopackIgnore: true */ targetSkillsDir, entry.name);
    try {
      await fs.access(toDir);
    } catch {
      await fs.cp(fromDir, toDir, { recursive: true });
    }
  }
}

async function runGatewayAction(
  action: 'start' | 'stop',
  profile: string
): Promise<HermesDashboardProfile | null> {
  const res = await hermesDashboardFetch(`/api/gateway/${action}?profile=${encodeURIComponent(profile)}`, {
    method: 'POST'
  });

  if (!res.ok) {
    throw new Error(
      await readResponseError(
        res,
        action === 'start'
          ? `Не удалось запустить Hermes gateway для профиля ${profile}.`
          : `Не удалось остановить Hermes gateway для профиля ${profile}.`
      )
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));
  return getHermesProfileBySlug(profile);
}

async function deleteHermesProfile(slug: string): Promise<void> {
  const res = await hermesDashboardFetch(`/api/profiles/${encodeURIComponent(slug)}`, {
    method: 'DELETE'
  });

  if (res.status === 404) {
    return;
  }
  if (!res.ok) {
    throw new Error(await readResponseError(res, `Не удалось удалить Hermes profile ${slug}.`));
  }
}

export async function listTelegramAgents(): Promise<HermesTelegramAgent[]> {
  const items = await readStoredAgents();
  let profilesMap = new Map<string, HermesDashboardProfile>();
  try {
    const profiles = await listHermesProfiles();
    profilesMap = new Map(profiles.map((profile) => [profile.name, profile]));
  } catch {
    profilesMap = new Map();
  }

  return items
    .map((item) => toPublic(item, profilesMap.get(item.slug)))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTelegramAgent(input: {
  name: string;
  telegramBotToken: string;
  chatId: string;
}): Promise<HermesTelegramAgent> {
  const name = input.name.trim();
  const token = input.telegramBotToken.trim();
  const chatId = input.chatId.trim();
  if (!name) throw new Error('Укажи имя агента.');
  validateTelegramToken(token);
  validateChatId(chatId);

  const slug = toSlug(name);
  const items = await readStoredAgents();
  if (items.some((a) => a.slug === slug || a.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Агент с таким именем уже существует.');
  }

  const stored: HermesTelegramAgentStored = {
    id: crypto.randomUUID(),
    name,
    slug,
    telegramBotToken: token,
    chatId,
    createdAt: new Date().toISOString()
  };
  items.push(stored);
  await writeStoredAgents(items);
  await ensureHermesProfile(stored);
  await configureTelegramProfile(stored);
  await migrateLegacyAgentProfile(stored.slug);
  return toPublic(stored, await getHermesProfileBySlug(stored.slug) || undefined);
}

export async function deleteTelegramAgent(id: string): Promise<void> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  await runGatewayAction('stop', found.slug).catch(() => null);
  await deleteHermesProfile(found.slug);

  const next = items.filter((a) => a.id !== id);
  await writeStoredAgents(next);
  await fs.rm(getLegacyAgentProfileDir(found.slug), { recursive: true, force: true });
}

export async function startTelegramAgent(id: string): Promise<HermesTelegramAgent> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  await ensureHermesProfile(found);
  await configureTelegramProfile(found);
  await migrateLegacyAgentProfile(found.slug);
  const profile = await runGatewayAction('start', found.slug);
  return toPublic(found, profile || undefined);
}

export async function stopTelegramAgent(id: string): Promise<HermesTelegramAgent> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  const profile = await runGatewayAction('stop', found.slug);
  return toPublic(found, profile || undefined);
}

export async function getTelegramAgentProfileDir(id: string): Promise<string> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  await ensureHermesProfile(found);
  await migrateLegacyAgentProfile(found.slug);
  return getHermesProfileDir(found.slug);
}
