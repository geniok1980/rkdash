import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

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

interface HermesTelegramRuntimeStored {
  agentId: string;
  pid: number;
  startedAt: string;
}

function getAgentsBaseDir(): string {
  if (process.env.HERMES_TELEGRAM_AGENTS_DIR?.trim()) {
    return path.resolve(process.env.HERMES_TELEGRAM_AGENTS_DIR.trim());
  }
  if (process.env.HERMES_HOME?.trim()) {
    return path.join(path.resolve(process.env.HERMES_HOME.trim()), 'telegram-agents');
  }
  return path.resolve(process.cwd(), 'hermes_data', 'telegram-agents');
}

function getRegistryPath(): string {
  return path.join(getAgentsBaseDir(), 'agents.json');
}

function getRuntimePath(): string {
  return path.join(getAgentsBaseDir(), 'runtime.json');
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

function toPublic(
  item: HermesTelegramAgentStored,
  runtime?: HermesTelegramRuntimeStored
): HermesTelegramAgent {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    telegramBotTokenMasked: maskToken(item.telegramBotToken),
    chatId: item.chatId,
    createdAt: item.createdAt,
    runtime: runtime
      ? {
          status: 'running',
          pid: runtime.pid,
          startedAt: runtime.startedAt
        }
      : { status: 'stopped' }
  };
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readRuntimeItems(): Promise<HermesTelegramRuntimeStored[]> {
  try {
    const raw = await fs.readFile(getRuntimePath(), 'utf8');
    const parsed = JSON.parse(raw) as HermesTelegramRuntimeStored[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => Number.isFinite(r.pid) && typeof r.agentId === 'string');
  } catch {
    return [];
  }
}

async function writeRuntimeItems(items: HermesTelegramRuntimeStored[]): Promise<void> {
  await fs.mkdir(getAgentsBaseDir(), { recursive: true });
  await fs.writeFile(getRuntimePath(), JSON.stringify(items, null, 2), 'utf8');
}

async function getCleanRuntimeMap(): Promise<Map<string, HermesTelegramRuntimeStored>> {
  const items = await readRuntimeItems();
  const alive = items.filter((r) => isPidRunning(r.pid));
  if (alive.length !== items.length) {
    await writeRuntimeItems(alive);
  }
  return new Map(alive.map((r) => [r.agentId, r]));
}

async function writeAgentProfileEnv(item: HermesTelegramAgentStored): Promise<void> {
  const profileDir = path.join(getAgentsBaseDir(), 'profiles', item.slug);
  await fs.mkdir(profileDir, { recursive: true });

  const lines = [
    `TELEGRAM_BOT_TOKEN=${item.telegramBotToken}`,
    `TELEGRAM_HOME_CHANNEL=${item.chatId}`,
    `GATEWAY_ALLOW_ALL_USERS=false`,
    `# При необходимости заполни TELEGRAM_ALLOWED_USERS вручную`
  ];
  await fs.writeFile(path.join(profileDir, '.env'), `${lines.join('\n')}\n`, 'utf8');
}

export async function listTelegramAgents(): Promise<HermesTelegramAgent[]> {
  const items = await readStoredAgents();
  const runtimeMap = await getCleanRuntimeMap();
  return items
    .map((item) => toPublic(item, runtimeMap.get(item.id)))
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
  await writeAgentProfileEnv(stored);
  return toPublic(stored);
}

export async function deleteTelegramAgent(id: string): Promise<void> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }
  const next = items.filter((a) => a.id !== id);
  await writeStoredAgents(next);
  const profileDir = path.join(getAgentsBaseDir(), 'profiles', found.slug);
  await fs.rm(profileDir, { recursive: true, force: true });

  const runtimeItems = await readRuntimeItems();
  const running = runtimeItems.find((r) => r.agentId === id);
  if (running) {
    try {
      process.kill(running.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  await writeRuntimeItems(runtimeItems.filter((r) => r.agentId !== id));
}

export async function startTelegramAgent(id: string): Promise<HermesTelegramAgent> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  const runtimeItems = await readRuntimeItems();
  const existing = runtimeItems.find((r) => r.agentId === id);
  if (existing && isPidRunning(existing.pid)) {
    return toPublic(found, existing);
  }

  const profileDir = path.join(getAgentsBaseDir(), 'profiles', found.slug);
  const command = process.env.HERMES_AGENT_START_CMD?.trim() || 'hermes gateway run';
  const child = spawn(command, {
    shell: true,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      HERMES_HOME: profileDir
    }
  });
  child.unref();

  const runtime: HermesTelegramRuntimeStored = {
    agentId: id,
    pid: child.pid ?? -1,
    startedAt: new Date().toISOString()
  };

  if (!runtime.pid || runtime.pid <= 0) {
    throw new Error(
      'Не удалось запустить процесс Hermes. Проверь HERMES_AGENT_START_CMD/HERMES_CLI_PATH.'
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 700));
  if (!isPidRunning(runtime.pid)) {
    throw new Error(
      'Процесс Hermes завершился сразу после запуска. Проверь команду HERMES_AGENT_START_CMD и переменные профиля.'
    );
  }

  const nextRuntime = runtimeItems.filter((r) => r.agentId !== id).concat(runtime);
  await writeRuntimeItems(nextRuntime);
  return toPublic(found, runtime);
}

export async function stopTelegramAgent(id: string): Promise<HermesTelegramAgent> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }

  const runtimeItems = await readRuntimeItems();
  const running = runtimeItems.find((r) => r.agentId === id);
  if (running) {
    try {
      process.kill(running.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  await writeRuntimeItems(runtimeItems.filter((r) => r.agentId !== id));
  return toPublic(found);
}

export async function getTelegramAgentProfileDir(id: string): Promise<string> {
  const items = await readStoredAgents();
  const found = items.find((a) => a.id === id);
  if (!found) {
    throw new Error('Агент не найден.');
  }
  return path.join(getAgentsBaseDir(), 'profiles', found.slug);
}
