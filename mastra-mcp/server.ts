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

// ── Weather tool ─────────────────────────────────────────────────────────
const SAMARA_LAT = 53.2001;
const SAMARA_LON = 50.15;

const WMO_DESC: Record<number, string> = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Изморозь',
  51: 'Морось слабая',
  53: 'Морось умеренная',
  55: 'Морось сильная',
  61: 'Дождь слабый',
  63: 'Дождь умеренный',
  65: 'Дождь сильный',
  71: 'Снег слабый',
  73: 'Снег умеренный',
  75: 'Снег сильный',
  80: 'Ливень слабый',
  81: 'Ливень умеренный',
  82: 'Ливень сильный',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Гроза с сильным градом'
};

const getWeather = createTool({
  id: 'get-weather',
  description:
    'Fetches weather forecast for Samara (Самара) for the next days from Open-Meteo API.',
  inputSchema: z.object({
    days: z.number().min(1).max(16).default(7).describe('Number of forecast days (1-16, default 7)')
  }),
  outputSchema: z.object({
    forecast: z.string().describe('Human-readable weather forecast')
  }),
  execute: async ({ days }) => {
    const params = new URLSearchParams({
      latitude: String(SAMARA_LAT),
      longitude: String(SAMARA_LON),
      daily:
        'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code',
      timezone: 'Europe/Moscow',
      forecast_days: String(days)
    });
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) throw new Error(`Weather API error ${resp.status}`);
    const data = await resp.json();
    if (!data.daily) throw new Error('Unexpected weather API response');

    const lines: string[] = [`Прогноз погоды — Самара на ${days} дн.`];
    for (let i = 0; i < (data.daily.time || []).length; i++) {
      const desc = WMO_DESC[data.daily.weather_code?.[i] ?? -1] ?? '—';
      const t = `${data.daily.temperature_2m_max?.[i] ?? '—'}°C / ${data.daily.temperature_2m_min?.[i] ?? '—'}°C`;
      const p = `осадки: ${data.daily.precipitation_sum?.[i] ?? '—'} мм (вер. ${data.daily.precipitation_probability_max?.[i] ?? '—'}%)`;
      lines.push(`${data.daily.time[i]}: ${desc}, ${t}, ${p}`);
    }
    return { forecast: lines.join('\n') };
  }
});

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
    'SQL-аналитик для базы данных Rkeeper. Выполняет SELECT-запросы к SQLite, анализирует выручку, количество чеков, продажи блюд, прогноз погоды. Отвечает на русском языке.',
  model: {
    id: `openai/${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`
  },
  instructions: `Вы — системный аналитик Rkeeper. Ваш ответ — это технический отчет, основанный ИСКЛЮЧИТЕЛЬНО на свежих SQL-запросах и данных погоды.

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

## ИНСТРУМЕНТ ПОГОДЫ:
- Используйте \`get-weather\` чтобы получить прогноз погоды (Самара).
- При запросе прогноза продаж или плана — учитывайте погодный фактор.

Отвечайте на русском языке. Будьте точны как кассовый аппарат.`,
  tools: { introspectDatabase, executeSql, getWeather },
  memory: new Memory()
});

// ── Open Notebook tools ─────────────────────────────────────────────────
const API_BASE_NB = process.env.OPEN_NOTEBOOK_API_URL || 'http://open-notebook:5055';

async function nbApi(method: string, path: string, body?: unknown) {
  const url = `${API_BASE_NB}${path}`;
  const resp = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Open Notebook API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

const listNotebooks = createTool({
  id: 'list-notebooks',
  description:
    'Получает список всех ноутбуков из Open Notebook. Возвращает id, название, описание.',
  inputSchema: z.object({
    archived: z.union([z.boolean(), z.null()]).optional().describe('Фильтр по архиву'),
    orderBy: z.string().default('updated desc').describe('Сортировка')
  }),
  outputSchema: z.object({
    notebooks: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ archived, orderBy }) => {
    const params = new URLSearchParams();
    if (archived !== undefined) params.set('archived', String(archived));
    if (orderBy) params.set('order_by', orderBy);
    const qs = params.toString();
    const data = await nbApi('GET', `/api/notebooks${qs ? `?${qs}` : ''}`);
    return {
      notebooks: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0
    };
  }
});

const getNotebook = createTool({
  id: 'get-notebook',
  description: 'Получает детальную информацию о ноутбуке Open Notebook по ID.',
  inputSchema: z.object({ notebookId: z.string().describe('ID ноутбука') }),
  outputSchema: z.object({ notebook: z.record(z.string(), z.unknown()) }),
  execute: async ({ notebookId }) => {
    const data = await nbApi('GET', `/api/notebooks/${encodeURIComponent(notebookId)}`);
    return { notebook: data as Record<string, unknown> };
  }
});

const createNotebook = createTool({
  id: 'create-notebook',
  description: 'Создаёт новый ноутбук в Open Notebook.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Название'),
    description: z.string().optional().describe('Описание'),
    context: z.string().optional().describe('Начальный контекст для AI')
  }),
  outputSchema: z.object({ notebook: z.record(z.string(), z.unknown()) }),
  execute: async ({ name, description, context }) => {
    const data = await nbApi('POST', '/api/notebooks', {
      name,
      description: description || '',
      context: context || ''
    });
    return { notebook: data as Record<string, unknown> };
  }
});

const searchNotebooks = createTool({
  id: 'search-notebooks',
  description: 'Ищет информацию по всем ноутбукам в Open Notebook (полнотекстовый поиск).',
  inputSchema: z.object({
    query: z.string().min(1).describe('Поисковый запрос'),
    limit: z.number().min(1).max(50).default(10).describe('Максимум результатов')
  }),
  outputSchema: z.object({
    results: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ query, limit }) => {
    const data = await nbApi('POST', '/api/search', { query, limit });
    return {
      results: Array.isArray(data) ? data : data?.results || [],
      count: Array.isArray(data) ? data.length : data?.count || 0
    };
  }
});

const askNotebook = createTool({
  id: 'ask-notebook',
  description: 'Задаёт вопрос Open Notebook (RAG). Ответ на основе всех источников.',
  inputSchema: z.object({
    question: z.string().min(1).describe('Вопрос'),
    notebookId: z.string().optional().describe('ID ноутбука для контекстного поиска')
  }),
  outputSchema: z.object({
    answer: z.string(),
    sources: z.array(z.record(z.string(), z.unknown())).optional()
  }),
  execute: async ({ question, notebookId }) => {
    const body: Record<string, unknown> = { query: question };
    if (notebookId) body.notebook_id = notebookId;
    const data = await nbApi('POST', '/api/search/ask/simple', body);
    return {
      answer: (data as any)?.answer || (data as any)?.response || JSON.stringify(data),
      sources: (data as any)?.sources
    };
  }
});

const listNotes = createTool({
  id: 'list-notes',
  description: 'Получает список заметок из Open Notebook.',
  inputSchema: z.object({
    notebookId: z.string().optional().describe('Фильтр по ноутбуку'),
    limit: z.number().min(1).max(100).default(20).describe('Максимум')
  }),
  outputSchema: z.object({ notes: z.array(z.record(z.string(), z.unknown())), count: z.number() }),
  execute: async ({ notebookId, limit }) => {
    const params = new URLSearchParams();
    if (notebookId) params.set('notebook_id', notebookId);
    params.set('limit', String(limit));
    const data = await nbApi('GET', `/api/notes?${params.toString()}`);
    return { notes: Array.isArray(data) ? data : [], count: Array.isArray(data) ? data.length : 0 };
  }
});

const createNote = createTool({
  id: 'create-note',
  description: 'Создаёт заметку в Open Notebook.',
  inputSchema: z.object({
    notebookId: z.string().describe('ID ноутбука'),
    title: z.string().min(1).describe('Заголовок'),
    content: z.string().min(1).describe('Текст заметки')
  }),
  outputSchema: z.object({ note: z.record(z.string(), z.unknown()) }),
  execute: async ({ notebookId, title, content }) => {
    const data = await nbApi('POST', '/api/notes', { notebook_id: notebookId, title, content });
    return { note: data as Record<string, unknown> };
  }
});

const listSources = createTool({
  id: 'list-sources',
  description: 'Получает список источников в Open Notebook.',
  inputSchema: z.object({
    notebookId: z.string().optional().describe('Фильтр по ноутбуку'),
    limit: z.number().min(1).max(100).default(20).describe('Максимум')
  }),
  outputSchema: z.object({
    sources: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ notebookId, limit }) => {
    const params = new URLSearchParams();
    if (notebookId) params.set('notebook_id', notebookId);
    params.set('limit', String(limit));
    const data = await nbApi('GET', `/api/sources?${params.toString()}`);
    return {
      sources: Array.isArray(data) ? data : data?.sources || [],
      count: Array.isArray(data) ? data.length : data?.count || 0
    };
  }
});

const addSource = createTool({
  id: 'add-source',
  description: 'Добавляет источник (URL или текст) в ноутбук Open Notebook.',
  inputSchema: z.object({
    notebookId: z.string().describe('ID ноутбука'),
    url: z.string().optional().describe('URL источника'),
    content: z.string().optional().describe('Текстовое содержимое'),
    title: z.string().optional().describe('Название')
  }),
  outputSchema: z.object({ source: z.record(z.string(), z.unknown()) }),
  execute: async ({ notebookId, url, content, title }) => {
    if (!url && !content) throw new Error('Укажите url или content');
    const body: Record<string, unknown> = {};
    if (url) body.url = url;
    if (content) body.content = content;
    if (title) body.title = title;
    const source = await nbApi('POST', '/api/sources', body);
    const sourceId = (source as any)?.id;
    if (sourceId) {
      await nbApi(
        'POST',
        `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`
      );
    }
    return { source: source as Record<string, unknown> };
  }
});

// ── Notebook Agent ─────────────────────────────────────────────────────
const notebookAgent = new Agent({
  id: 'notebook-agent',
  name: 'Open Notebook Research Agent',
  description:
    'Исследовательский агент для работы с Open Notebook. Создаёт ноутбуки, ищет информацию, управляет заметками и источниками.',
  model: {
    id: `openai/${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`
  },
  instructions: `Вы — исследовательский агент Open Notebook. Используйте инструменты для работы с базой знаний.

Возможности:
- list-notebooks — список ноутбуков
- get-notebook — детали ноутбука
- create-notebook — создание ноутбука
- search-notebooks — поиск по базе знаний
- ask-notebook — вопрос к базе знаний (RAG)
- list-notes / create-note — управление заметками
- list-sources / add-source — управление источниками

Сначала смотрите, что уже есть (list-notebooks), прежде чем создавать новое. Отвечайте на русском языке.`,
  tools: {
    listNotebooks,
    getNotebook,
    createNotebook,
    searchNotebooks,
    askNotebook,
    listNotes,
    createNote,
    listSources,
    addSource
  },
  memory: new Memory()
});

// ── Mastra instance ────────────────────────────────────────────────────
const mastraDbPath = process.env.MASTRA_DB_PATH || path.resolve(process.cwd(), 'mastra.db');
const MASTRA_DB_URL = mastraDbPath.startsWith('file:') ? mastraDbPath : `file:${mastraDbPath}`;

const mastra = new Mastra({
  agents: { sqlAgent, notebookAgent },
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
    instructions:
      'Use the ask_sqlAgent tool to execute SQL queries against the Rkeeper database. Use the ask_notebookAgent tool for Open Notebook research and knowledge base queries.',
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
