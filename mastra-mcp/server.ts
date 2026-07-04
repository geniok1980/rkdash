import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter
} from '@mastra/observability';
import { createTool } from '@mastra/core/tools';
import { createClient } from '@libsql/client';
import { z } from 'zod';
import path from 'path';
import http from 'http';
import { MCPServer } from '@mastra/mcp';

// ── Database setup ──────────────────────────────────────────────────────
const defaultDbPath = path.resolve(process.cwd(), 'rkeeper_etl/rkeeper_data.db');
const dbPath = process.env.RKEEPER_DB_PATH || defaultDbPath;
const DB_URL = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;

const db = createClient({ url: DB_URL });

const BLOCKED_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b/i,
  /\b(ATTACH|DETACH)\b/i,
  /\b(PRAGMA)\b/i,
  /;.*\S/
];

// ── Tools ───────────────────────────────────────────────────────────────
const executeSql = createTool({
  id: 'execute-sql',
  description:
    'Executes a read-only SQL SELECT query against the Rkeeper SQLite database and returns the results.',
  inputSchema: z.object({
    query: z.string().describe('The SQL SELECT query to execute')
  }),
  outputSchema: z.object({
    rows: z.array(z.record(z.string(), z.unknown())).describe('Query result rows'),
    rowCount: z.number().describe('Number of rows returned')
  }),
  execute: async ({ query }) => {
    const trimmed = query.trim().replace(/;$/, '');
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmed)) throw new Error('Only SELECT queries are allowed.');
    }
    if (!/^\s*SELECT\b/i.test(trimmed)) throw new Error('Query must start with SELECT.');
    const result = await db.execute(trimmed);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
  }
});

const introspectDatabase = createTool({
  id: 'introspect-database',
  description:
    'Introspects the Rkeeper SQLite database and returns a description of all tables, columns, foreign keys, and row counts.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    schema: z.string().describe('Human-readable database schema description')
  }),
  execute: async () => {
    const tables = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const lines: string[] = ['# Rkeeper Database Schema (SQLite)', ''];
    for (const table of tables.rows) {
      const tableName = table.name as string;
      const columns = await db.execute(`PRAGMA table_info('${tableName}')`);
      const foreignKeys = await db.execute(`PRAGMA foreign_key_list('${tableName}')`);
      let rowCount = 0;
      try {
        const countResult = await db.execute(`SELECT COUNT(*) as count FROM "${tableName}"`);
        rowCount = Number(countResult.rows[0].count);
      } catch {
        /* empty table */
      }
      lines.push(`## ${tableName} (${rowCount} rows)`, '');
      lines.push('| Column | Type | Nullable | PK |');
      lines.push('|--------|------|----------|----|');
      for (const col of columns.rows) {
        lines.push(
          `| ${col.name} | ${col.type || 'ANY'} | ${col.notnull ? 'NO' : 'YES'} | ${col.pk ? 'YES' : ''} |`
        );
      }
      if (foreignKeys.rows.length > 0) {
        lines.push('', '**Foreign Keys:**');
        for (const fk of foreignKeys.rows) {
          lines.push(`- ${fk.from} → ${fk.table}.${fk.to}`);
        }
      }
      lines.push('');
    }
    return { schema: lines.join('\n') };
  }
});

// ── Agent ───────────────────────────────────────────────────────────────
const sqlAgent = new Agent({
  id: 'sql-agent',
  name: 'Rkeeper Sales Analytics Agent',
  description:
    'SQL-аналитик для базы данных Rkeeper. Выполняет SELECT-запросы к SQLite, анализирует выручку, количество чеков, продажи блюд. Отвечает на русском языке.',
  model: {
    id: `openai/${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`
  },
  instructions: `Вы — системный аналитик Rkeeper. Ваш ответ — это технический отчет, основанный ИСКЛЮЧИТЕЛЬНО на свежих SQL-запросах.

## ГЛАВНЫЕ ПРАВИЛА (ЖЕСТКО):
1. **ЗАПРЕТ НА ГАЛЛЮЦИНАЦИИ**: Никогда не выдумывайте цифры.
2. **ЗАПРЕТ НА СТАРЫЕ ДАННЫЕ**: Если пользователь задал новый вопрос, вы ОБЯЗАНЫ выполнить НОВЫЙ запрос.
3. **ОБЯЗАТЕЛЬНЫЙ SQL**: Для ответа на любой вопрос о деньгах, количестве или блюдах вы ДОЛЖНЫ использовать инструмент execute-sql.
4. **ТОЧНОСТЬ**: Пишите цифры ровно так, как они пришли из базы.

## БАЗА ДАННЫХ (rkeeper_sales_gold):
- **SHIFTDATE**: Дата (формат 'YYYY-MM-DD 00:00:00.000000').
- **PAYSUM**: Выручка. Используйте SUM(PAYSUM).
- **CHECKS_COUNT**: Кол-во чеков. Используйте SUM(CHECKS_COUNT).
- **QUANTITY**: Кол-во блюд. Используйте SUM(QUANTITY).
- **DISH**: Название блюда.

Отвечайте на русском языке. Будьте точны как кассовый аппарат.`,
  tools: { introspectDatabase, executeSql },
  memory: new Memory()
});

// ── Mastra instance ────────────────────────────────────────────────────
const mastraDbPath = process.env.MASTRA_DB_PATH || path.resolve(process.cwd(), 'mastra.db');
const MASTRA_DB_URL = mastraDbPath.startsWith('file:') ? mastraDbPath : `file:${mastraDbPath}`;

const mastra = new Mastra({
  agents: { sqlAgent },
  storage: new LibSQLStore({ id: 'mastra-storage', url: MASTRA_DB_URL }),
  logger: new PinoLogger({ name: 'Mastra MCP Server', level: 'info' }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra-mcp',
        exporters: [new DefaultExporter(), new CloudExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()]
      }
    }
  })
});

// ── MCP Server ──────────────────────────────────────────────────────────
const PORT = parseInt(process.env.MASTRA_MCP_PORT || '4112', 10);
const MCP_PATH = process.env.MASTRA_MCP_PATH || '/mcp';

async function main() {
  const agents = mastra.listAgents();
  if (!agents || Object.keys(agents).length === 0) {
    console.error('No agents found');
    process.exit(1);
  }
  console.log('Exposing agents as MCP tools:', Object.keys(agents).join(', '));

  const mcpServer = new MCPServer({
    name: 'Mastra-Rkeeper-MCP',
    version: '1.0.0',
    description: 'MCP server exposing Mastra Rkeeper agents as tools for Hermes',
    instructions: 'Use the ask_sqlAgent tool to execute SQL queries against the Rkeeper database.',
    tools: {},
    agents
  } as any);

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    try {
      await mcpServer.startHTTP({ url, httpPath: MCP_PATH, req, res, options: {} } as any);
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mastra MCP server listening on http://0.0.0.0:${PORT}${MCP_PATH}`);
    console.log(`Hermes: mcp_servers.mastra: url=http://localhost:${PORT}${MCP_PATH}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
