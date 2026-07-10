import { createSqliteExecutor } from '@/lib/libsql-client';
import { withSqliteBusyRetry } from '@/lib/libsql-retry';

const executeSqlite = createSqliteExecutor({
  envVarNames: ['RKEEPER_DB_PATH', 'IIKO_DB_PATH'],
  defaultRelativePath: 'rkeeper_etl/rkeeper_data.db',
  additionalPaths: ['/data/rkeeper_data.db']
});

function normalizeUrlValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^[`'"\s]+|[`'"\s]+$/g, '')
    .replace(/\/+$/, '');
}

export interface IikoEtlConfig {
  etlServiceUrl: string;
  serverUrl: string;
  login: string;
  password: string;
  intervalSeconds: number;
  requestTimeoutSeconds: number;
  verifySsl: boolean;
}

export const DEFAULT_IIKO_ETL_CONFIG: IikoEtlConfig = {
  etlServiceUrl: process.env.IIKO_ETL_SERVICE_URL || 'http://127.0.0.1:8791',
  serverUrl: process.env.IIKO_SERVER_URL || 'https://403-115-825.iiko.it',
  login: process.env.IIKO_LOGIN || 'geniok',
  password: process.env.IIKO_PASSWORD || '20Upiter17',
  intervalSeconds: Number(process.env.IIKO_ETL_INTERVAL_SECONDS || 3600),
  requestTimeoutSeconds: Number(process.env.IIKO_REQUEST_TIMEOUT_SECONDS || 60),
  verifySsl: (process.env.IIKO_VERIFY_SSL || '').toLowerCase() === 'true'
};

export interface RkeeperEtlConfig {
  etlServiceUrl: string;
  rkServerIp: string;
  rkHttpPort: number;
  rkUsername: string;
  rkPassword: string;
  mssqlServer: string;
  mssqlDatabase: string;
  mssqlUser: string;
  mssqlPassword: string;
  mssqlPort: number;
  storehouseApiUrl: string;
  storehouseUsername: string;
  storehousePassword: string;
  storehouseRequestTimeoutSeconds: number;
  storehouseRptSalePeriodDays: number;
  intervalSeconds: number;
  writeMode: 'append' | 'overwrite';
}

export const DEFAULT_RKEEPER_ETL_CONFIG: RkeeperEtlConfig = {
  etlServiceUrl: process.env.RKEEPER_ETL_SERVICE_URL || 'http://rkeeper-etl:8690',
  rkServerIp: process.env.RK_SERVER_IP || '',
  rkHttpPort: Number(process.env.RK_HTTP_PORT || 16058),
  rkUsername: process.env.RK_USERNAME || '',
  rkPassword: process.env.RK_PASSWORD || '',
  mssqlServer: process.env.MSSQL_SERVER || '',
  mssqlDatabase: process.env.MSSQL_DATABASE || '',
  mssqlUser: process.env.MSSQL_USER || '',
  mssqlPassword: process.env.MSSQL_PASSWORD || '',
  mssqlPort: Number(process.env.MSSQL_PORT || 1433),
  storehouseApiUrl: process.env.STOREHOUSE_API_URL || '',
  storehouseUsername: process.env.STOREHOUSE_USERNAME || '',
  storehousePassword: process.env.STOREHOUSE_PASSWORD || '',
  storehouseRequestTimeoutSeconds: Number(process.env.STOREHOUSE_REQUEST_TIMEOUT_SECONDS || 30),
  storehouseRptSalePeriodDays: Number(process.env.STOREHOUSE_RPTSALE_PERIOD_DAYS || 1),
  intervalSeconds: Number(process.env.ETL_INTERVAL_SECONDS || 3600),
  writeMode: ((process.env.RKEEPER_ETL_WRITE_MODE || 'overwrite').toLowerCase() === 'append'
    ? 'append'
    : 'overwrite') as 'append' | 'overwrite'
};

async function safeExecute(query: string, args?: Record<string, unknown>) {
  return withSqliteBusyRetry(() => {
    if (args) {
      return executeSqlite(query, args);
    }
    return executeSqlite(query);
  });
}

export async function ensureDashboardSettingsTable(): Promise<void> {
  await safeExecute(`
    CREATE TABLE IF NOT EXISTS dashboard_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getDashboardSettingJson<T>(key: string): Promise<T | null> {
  await ensureDashboardSettingsTable();
  const result = await safeExecute(
    `
      SELECT value
      FROM dashboard_settings
      WHERE key = :key
      LIMIT 1
    `,
    { key }
  );

  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const value = row.value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setDashboardSettingJson<T>(key: string, value: T): Promise<void> {
  await ensureDashboardSettingsTable();
  await safeExecute(
    `
      INSERT INTO dashboard_settings (key, value, updated_at)
      VALUES (:key, :value, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      key,
      value: JSON.stringify(value)
    }
  );
}

export async function getIikoEtlConfig(): Promise<IikoEtlConfig> {
  const saved = await getDashboardSettingJson<Partial<IikoEtlConfig>>('iiko_etl_config');
  return {
    ...DEFAULT_IIKO_ETL_CONFIG,
    ...saved,
    etlServiceUrl: normalizeUrlValue(
      saved?.etlServiceUrl ?? DEFAULT_IIKO_ETL_CONFIG.etlServiceUrl
    ),
    serverUrl: normalizeUrlValue(saved?.serverUrl ?? DEFAULT_IIKO_ETL_CONFIG.serverUrl),
    intervalSeconds: Math.max(60, Number(saved?.intervalSeconds ?? DEFAULT_IIKO_ETL_CONFIG.intervalSeconds)),
    requestTimeoutSeconds: Math.max(
      5,
      Number(saved?.requestTimeoutSeconds ?? DEFAULT_IIKO_ETL_CONFIG.requestTimeoutSeconds)
    ),
    verifySsl:
      typeof saved?.verifySsl === 'boolean' ? saved.verifySsl : DEFAULT_IIKO_ETL_CONFIG.verifySsl
  };
}

export async function setIikoEtlConfig(config: IikoEtlConfig): Promise<IikoEtlConfig> {
  const normalized: IikoEtlConfig = {
    etlServiceUrl: normalizeUrlValue(config.etlServiceUrl),
    serverUrl: normalizeUrlValue(config.serverUrl),
    login: config.login.trim(),
    password: config.password,
    intervalSeconds: Math.max(60, Number(config.intervalSeconds || 3600)),
    requestTimeoutSeconds: Math.max(5, Number(config.requestTimeoutSeconds || 60)),
    verifySsl: Boolean(config.verifySsl)
  };

  await setDashboardSettingJson('iiko_etl_config', normalized);
  return normalized;
}

export async function getRkeeperEtlConfig(): Promise<RkeeperEtlConfig> {
  const saved = await getDashboardSettingJson<Partial<RkeeperEtlConfig>>('rkeeper_etl_config');
  return {
    ...DEFAULT_RKEEPER_ETL_CONFIG,
    ...saved,
    etlServiceUrl: normalizeUrlValue(
      saved?.etlServiceUrl ?? DEFAULT_RKEEPER_ETL_CONFIG.etlServiceUrl
    ),
    rkServerIp: String(saved?.rkServerIp ?? DEFAULT_RKEEPER_ETL_CONFIG.rkServerIp).trim(),
    rkHttpPort: Math.max(1, Number(saved?.rkHttpPort ?? DEFAULT_RKEEPER_ETL_CONFIG.rkHttpPort)),
    rkUsername: String(saved?.rkUsername ?? DEFAULT_RKEEPER_ETL_CONFIG.rkUsername).trim(),
    rkPassword: String(saved?.rkPassword ?? DEFAULT_RKEEPER_ETL_CONFIG.rkPassword),
    mssqlServer: String(saved?.mssqlServer ?? DEFAULT_RKEEPER_ETL_CONFIG.mssqlServer).trim(),
    mssqlDatabase: String(saved?.mssqlDatabase ?? DEFAULT_RKEEPER_ETL_CONFIG.mssqlDatabase).trim(),
    mssqlUser: String(saved?.mssqlUser ?? DEFAULT_RKEEPER_ETL_CONFIG.mssqlUser).trim(),
    mssqlPassword: String(saved?.mssqlPassword ?? DEFAULT_RKEEPER_ETL_CONFIG.mssqlPassword),
    mssqlPort: Math.max(1, Number(saved?.mssqlPort ?? DEFAULT_RKEEPER_ETL_CONFIG.mssqlPort)),
    storehouseApiUrl: normalizeUrlValue(
      saved?.storehouseApiUrl ?? DEFAULT_RKEEPER_ETL_CONFIG.storehouseApiUrl
    ),
    storehouseUsername: String(
      saved?.storehouseUsername ?? DEFAULT_RKEEPER_ETL_CONFIG.storehouseUsername
    ).trim(),
    storehousePassword: String(
      saved?.storehousePassword ?? DEFAULT_RKEEPER_ETL_CONFIG.storehousePassword
    ),
    storehouseRequestTimeoutSeconds: Math.max(
      5,
      Number(
        saved?.storehouseRequestTimeoutSeconds ??
          DEFAULT_RKEEPER_ETL_CONFIG.storehouseRequestTimeoutSeconds
      )
    ),
    storehouseRptSalePeriodDays: Math.max(
      1,
      Number(
        saved?.storehouseRptSalePeriodDays ?? DEFAULT_RKEEPER_ETL_CONFIG.storehouseRptSalePeriodDays
      )
    ),
    intervalSeconds: Math.max(
      60,
      Number(saved?.intervalSeconds ?? DEFAULT_RKEEPER_ETL_CONFIG.intervalSeconds)
    ),
    writeMode: saved?.writeMode === 'append' ? 'append' : DEFAULT_RKEEPER_ETL_CONFIG.writeMode
  };
}

export async function setRkeeperEtlConfig(config: RkeeperEtlConfig): Promise<RkeeperEtlConfig> {
  const normalized: RkeeperEtlConfig = {
    etlServiceUrl: normalizeUrlValue(config.etlServiceUrl),
    rkServerIp: config.rkServerIp.trim(),
    rkHttpPort: Math.max(1, Number(config.rkHttpPort || 16058)),
    rkUsername: config.rkUsername.trim(),
    rkPassword: config.rkPassword,
    mssqlServer: config.mssqlServer.trim(),
    mssqlDatabase: config.mssqlDatabase.trim(),
    mssqlUser: config.mssqlUser.trim(),
    mssqlPassword: config.mssqlPassword,
    mssqlPort: Math.max(1, Number(config.mssqlPort || 1433)),
    storehouseApiUrl: normalizeUrlValue(config.storehouseApiUrl),
    storehouseUsername: config.storehouseUsername.trim(),
    storehousePassword: config.storehousePassword,
    storehouseRequestTimeoutSeconds: Math.max(
      5,
      Number(config.storehouseRequestTimeoutSeconds || 30)
    ),
    storehouseRptSalePeriodDays: Math.max(1, Number(config.storehouseRptSalePeriodDays || 1)),
    intervalSeconds: Math.max(60, Number(config.intervalSeconds || 3600)),
    writeMode: config.writeMode === 'append' ? 'append' : 'overwrite'
  };

  await setDashboardSettingJson('rkeeper_etl_config', normalized);
  return normalized;
}
