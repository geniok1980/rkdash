import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { getIikoEtlConfig, getRkeeperEtlConfig } from '@/lib/dashboard-settings';
import { resolveReachableServiceBaseUrl } from '@/lib/service-url';

export interface RestaurantStackAgentItem {
  slug: string;
  title: string;
  imported: boolean;
  hasConfig: boolean;
  hasEnvExample: boolean;
}

export interface RestaurantStackImportResult {
  imported: RestaurantStackAgentItem[];
  total: number;
}

function resolveRuntimeDir(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (path.isAbsolute(trimmed)) {
    return path.normalize(/* turbopackIgnore: true */ trimmed);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), trimmed);
}

function getRestaurantStackSourceDir(): string {
  if (process.env.HERMES_RESTAURANT_STACK_DIR?.trim()) {
    return resolveRuntimeDir(process.env.HERMES_RESTAURANT_STACK_DIR);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'vendor', 'restaurant-stack');
}

function getHermesHomeDir(): string {
  if (process.env.HERMES_HOME?.trim()) {
    return resolveRuntimeDir(process.env.HERMES_HOME);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'hermes_data');
}

function getRestaurantStackAgentsSourceDir(): string {
  return path.join(/* turbopackIgnore: true */ getRestaurantStackSourceDir(), 'agents');
}

function getHermesProfilesDir(): string {
  return path.join(/* turbopackIgnore: true */ getHermesHomeDir(), 'profiles');
}

function getHermesMcpServersDir(): string {
  return path.join(/* turbopackIgnore: true */ getHermesHomeDir(), 'mcp-servers');
}

function getImportedProfileDir(slug: string): string {
  return path.join(/* turbopackIgnore: true */ getHermesProfilesDir(), slug);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readAgentTitle(sourceDir: string, slug: string): Promise<string> {
  const soulPath = path.join(/* turbopackIgnore: true */ sourceDir, 'SOUL.md');
  try {
    const raw = await fs.readFile(soulPath, 'utf8');
    const firstHeading = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('#'));
    return firstHeading ? firstHeading.replace(/^#+\s*/, '').trim() : slug;
  } catch {
    return slug;
  }
}

function escapeIni(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

function escapeYamlSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeDockerHost(host: string): string {
  const trimmed = host.trim();
  if (trimmed === '127.0.0.1' || trimmed.toLowerCase() === 'localhost') {
    return 'host.docker.internal';
  }
  return trimmed;
}

function replaceYamlScalar(raw: string, key: string, value: string): string {
  const escaped = escapeYamlSingleQuoted(value);
  const pattern = new RegExp(`(^\\s*${key}:\\s*).*$`, 'm');
  if (pattern.test(raw)) {
    return raw.replace(pattern, `$1'${escaped}'`);
  }
  return raw;
}

function patchAgentConfig(
  raw: string,
  options: {
    iikoServerUrl: string;
    iikoLogin: string;
    iikoPassword: string;
    iikoTimeoutSeconds: number;
    iikoApiLogin: string;
    storehouseApiUrl: string;
    storehouseUsername: string;
    storehousePassword: string;
  }
): string {
  let next = raw
    .replaceAll('/root/.hermes/mcp-servers/iiko-mcp/main.py', '/opt/hermes/mcp-servers/iiko-mcp/main.py')
    .replaceAll(
      '/root/.hermes/mcp-servers/storehouse-mcp/main.py',
      '/opt/hermes/mcp-servers/storehouse-mcp/main.py'
    )
    .replaceAll('/root/mcp_rkeeper/mcp/server.py', '/opt/hermes/mcp-servers/rkeeper-rk7/server.py')
    .replaceAll('/root/.hermes/mcp-servers/iiko-mcp/.venv/bin/python3', 'python3')
    .replaceAll('/root/.hermes/mcp-servers/storehouse-mcp/.venv/bin/python3', 'python3');

  next = replaceYamlScalar(next, 'IIKO_API_LOGIN', options.iikoApiLogin);
  next = replaceYamlScalar(next, 'IIKO_API_TIMEOUT', String(options.iikoTimeoutSeconds));
  next = replaceYamlScalar(next, 'IIKO_SERVER_URL', options.iikoServerUrl);
  next = replaceYamlScalar(next, 'IIKO_SERVER_LOGIN', options.iikoLogin);
  next = replaceYamlScalar(next, 'IIKO_SERVER_PASSWORD', options.iikoPassword);
  next = replaceYamlScalar(next, 'IIKO_SERVER_TIMEOUT', String(options.iikoTimeoutSeconds));
  next = replaceYamlScalar(next, 'SH5_API_URL', options.storehouseApiUrl);
  next = replaceYamlScalar(next, 'SH5_USERNAME', options.storehouseUsername);
  next = replaceYamlScalar(next, 'SH5_PASSWORD', options.storehousePassword);

  return next;
}

async function syncRestaurantStackMcpServers(): Promise<void> {
  const sourceRoot = getRestaurantStackSourceDir();
  const mcpServersDir = getHermesMcpServersDir();
  const rkeeperConfig = await getRkeeperEtlConfig();

  await fs.mkdir(mcpServersDir, { recursive: true });
  await fs.cp(
    path.join(/* turbopackIgnore: true */ sourceRoot, 'mcp-iiko'),
    path.join(/* turbopackIgnore: true */ mcpServersDir, 'iiko-mcp'),
    { recursive: true, force: true }
  );
  await fs.cp(
    path.join(/* turbopackIgnore: true */ sourceRoot, 'mcp-storehouse'),
    path.join(/* turbopackIgnore: true */ mcpServersDir, 'storehouse-mcp'),
    { recursive: true, force: true }
  );
  await fs.cp(
    path.join(/* turbopackIgnore: true */ sourceRoot, 'mcp-rkeeper'),
    path.join(/* turbopackIgnore: true */ mcpServersDir, 'rkeeper-rk7'),
    { recursive: true, force: true }
  );

  const rkeeperIni = [
    '[SERVER]',
    `server_ip = ${escapeIni(normalizeDockerHost(rkeeperConfig.rkServerIp))}`,
    `http_data_port = ${Number(rkeeperConfig.rkHttpPort || 16058)}`,
    `username = ${escapeIni(rkeeperConfig.rkUsername)}`,
    `password = ${escapeIni(rkeeperConfig.rkPassword)}`,
    'rkcloud = 0',
    ''
  ].join('\n');

  await fs.writeFile(
    path.join(/* turbopackIgnore: true */ mcpServersDir, 'rkeeper-rk7', 'config.ini'),
    rkeeperIni,
    'utf8'
  );
}

export async function listRestaurantStackAgents(): Promise<RestaurantStackAgentItem[]> {
  const agentsRoot = getRestaurantStackAgentsSourceDir();
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sourceDir = path.join(/* turbopackIgnore: true */ agentsRoot, entry.name);
        return {
          slug: entry.name,
          title: await readAgentTitle(sourceDir, entry.name),
          imported: await exists(getImportedProfileDir(entry.name)),
          hasConfig: await exists(path.join(/* turbopackIgnore: true */ sourceDir, 'config.yaml')),
          hasEnvExample: await exists(path.join(/* turbopackIgnore: true */ sourceDir, '.env.example'))
        } satisfies RestaurantStackAgentItem;
      })
  );

  return items.toSorted((a, b) => a.slug.localeCompare(b.slug));
}

export async function importRestaurantStackAgents(slugs?: string[]): Promise<RestaurantStackImportResult> {
  const allAgents = await listRestaurantStackAgents();
  const allowed = new Set(allAgents.map((item) => item.slug));
  const targetSlugs = (slugs && slugs.length > 0 ? slugs : allAgents.map((item) => item.slug)).filter((slug) =>
    allowed.has(slug)
  );

  if (targetSlugs.length === 0) {
    return { imported: [], total: 0 };
  }

  await syncRestaurantStackMcpServers();
  const iikoConfig = await getIikoEtlConfig();
  await fs.mkdir(getHermesProfilesDir(), { recursive: true });

  for (const slug of targetSlugs) {
    const sourceDir = path.join(/* turbopackIgnore: true */ getRestaurantStackAgentsSourceDir(), slug);
    const targetDir = getImportedProfileDir(slug);
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.cp(sourceDir, targetDir, { recursive: true, force: true });

    const configPath = path.join(/* turbopackIgnore: true */ targetDir, 'config.yaml');
    if (await exists(configPath)) {
      const raw = await fs.readFile(configPath, 'utf8');
      const patched = patchAgentConfig(raw, {
        iikoServerUrl: resolveReachableServiceBaseUrl(iikoConfig.serverUrl),
        iikoLogin: iikoConfig.login,
        iikoPassword: iikoConfig.password,
        iikoTimeoutSeconds: iikoConfig.requestTimeoutSeconds,
        iikoApiLogin: process.env.IIKO_API_LOGIN?.trim() || '',
        storehouseApiUrl: resolveReachableServiceBaseUrl(
          process.env.SH5_API_URL?.trim() || 'http://127.0.0.1:9797'
        ),
        storehouseUsername: process.env.SH5_USERNAME?.trim() || 'Admin',
        storehousePassword: process.env.SH5_PASSWORD || ''
      });
      await fs.writeFile(configPath, patched, 'utf8');
    }
  }

  const imported = await listRestaurantStackAgents();
  return {
    imported: imported.filter((item) => targetSlugs.includes(item.slug)),
    total: targetSlugs.length
  };
}
