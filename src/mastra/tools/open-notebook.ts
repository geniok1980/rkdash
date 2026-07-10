import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const API_BASE = process.env.OPEN_NOTEBOOK_API_URL || 'http://open-notebook:5055';

async function apiCall(method: string, path: string, body?: unknown) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Open Notebook API error ${resp.status} ${resp.statusText}: ${text}`);
  }
  return resp.json();
}

// ─── Notebook list ────────────────────────────────────────────────────────

export const listNotebooks = createTool({
  id: 'list-notebooks',
  description:
    'Получает список всех ноутбуков (notebooks) из Open Notebook. Каждый ноутбук — это проект или тема с собранной информацией. Возвращает id, название, описание, дату создания.',
  inputSchema: z.object({
    archived: z
      .union([z.boolean(), z.null()])
      .optional()
      .describe('Фильтр: true — только архивные, false — только активные, null/пусто — все'),
    orderBy: z
      .string()
      .default('updated desc')
      .describe('Сортировка: "updated desc", "created desc", "name asc"')
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
    const data = await apiCall('GET', `/api/notebooks${qs ? `?${qs}` : ''}`);
    return {
      notebooks: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0
    };
  }
});

// ─── Notebook get ─────────────────────────────────────────────────────────

export const getNotebook = createTool({
  id: 'get-notebook',
  description:
    'Получает детальную информацию о конкретном ноутбуке (notebook) в Open Notebook по его ID, включая прикреплённые источники.',
  inputSchema: z.object({
    notebookId: z.string().describe('ID ноутбука')
  }),
  outputSchema: z.object({
    notebook: z.record(z.string(), z.unknown())
  }),
  execute: async ({ notebookId }) => {
    const data = await apiCall('GET', `/api/notebooks/${encodeURIComponent(notebookId)}`);
    return { notebook: data as Record<string, unknown> };
  }
});

// ─── Notebook create ──────────────────────────────────────────────────────

export const createNotebook = createTool({
  id: 'create-notebook',
  description:
    'Создаёт новый ноутбук (notebook) в Open Notebook. Ноутбук — это контейнер для сбора информации по теме: в него добавляются источники (ссылки, файлы), заметки, и можно задавать вопросы по собранному материалу.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Название ноутбука'),
    description: z.string().optional().describe('Описание ноутбука'),
    context: z
      .string()
      .optional()
      .describe('Начальный контекст — инструкция или описание темы для AI')
  }),
  outputSchema: z.object({
    notebook: z.record(z.string(), z.unknown())
  }),
  execute: async ({ name, description, context }) => {
    const data = await apiCall('POST', '/api/notebooks', {
      name,
      description: description || '',
      context: context || ''
    });
    return { notebook: data as Record<string, unknown> };
  }
});

// ─── Search knowledge base ────────────────────────────────────────────────

export const searchNotebooks = createTool({
  id: 'search-notebooks',
  description:
    'Ищет информацию по всем ноутбукам в Open Notebook (полнотекстовый поиск). Возвращает релевантные фрагменты из источников.',
  inputSchema: z.object({
    query: z.string().min(1).describe('Поисковый запрос'),
    limit: z.number().min(1).max(50).default(10).describe('Максимум результатов')
  }),
  outputSchema: z.object({
    results: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ query, limit }) => {
    const data = await apiCall('POST', '/api/search', {
      query,
      limit
    });
    return {
      results: Array.isArray(data) ? data : data?.results || [],
      count: Array.isArray(data) ? data.length : data?.count || 0
    };
  }
});

// ─── Ask (RAG) ────────────────────────────────────────────────────────────

export const askNotebook = createTool({
  id: 'ask-notebook',
  description:
    'Задаёт вопрос Open Notebook по всем ноутбукам (RAG — Retrieval Augmented Generation). Ответ формируется на основе содержимого всех источников в ноутбуках. Использовать когда нужно получить ответ с опорой на загруженные материалы.',
  inputSchema: z.object({
    question: z.string().min(1).describe('Вопрос к базе знаний Open Notebook'),
    notebookId: z
      .string()
      .optional()
      .describe('ID ноутбука для контекстного поиска (если нужен поиск только по одному ноутбуку)')
  }),
  outputSchema: z.object({
    answer: z.string(),
    sources: z.array(z.record(z.string(), z.unknown())).optional()
  }),
  execute: async ({ question, notebookId }) => {
    const body: Record<string, unknown> = { query: question };
    if (notebookId) body.notebook_id = notebookId;
    const data = await apiCall('POST', '/api/search/ask/simple', body);
    return {
      answer: (data as any)?.answer || (data as any)?.response || JSON.stringify(data),
      sources: (data as any)?.sources
    };
  }
});

// ─── List notes ───────────────────────────────────────────────────────────

export const listNotes = createTool({
  id: 'list-notes',
  description:
    'Получает список всех заметок (notes) из Open Notebook. Заметки — это пользовательские текстовые записи.',
  inputSchema: z.object({
    notebookId: z.string().optional().describe('ID ноутбука для фильтрации заметок'),
    limit: z.number().min(1).max(100).default(20).describe('Максимум заметок')
  }),
  outputSchema: z.object({
    notes: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ notebookId, limit }) => {
    const params = new URLSearchParams();
    if (notebookId) params.set('notebook_id', notebookId);
    params.set('limit', String(limit));
    const qs = params.toString();
    const data = await apiCall('GET', `/api/notes${qs ? `?${qs}` : ''}`);
    return {
      notes: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0
    };
  }
});

// ─── Create note ──────────────────────────────────────────────────────────

export const createNote = createTool({
  id: 'create-note',
  description:
    'Создаёт новую заметку (note) в Open Notebook. Заметка привязывается к ноутбуку и может содержать текст, выводы, идеи.',
  inputSchema: z.object({
    notebookId: z.string().describe('ID ноутбука, в который добавить заметку'),
    title: z.string().min(1).describe('Заголовок заметки'),
    content: z.string().min(1).describe('Текст заметки')
  }),
  outputSchema: z.object({
    note: z.record(z.string(), z.unknown())
  }),
  execute: async ({ notebookId, title, content }) => {
    const data = await apiCall('POST', '/api/notes', {
      notebook_id: notebookId,
      title,
      content
    });
    return { note: data as Record<string, unknown> };
  }
});

// ─── List sources ─────────────────────────────────────────────────────────

export const listSources = createTool({
  id: 'list-sources',
  description:
    'Получает список всех источников (sources) в Open Notebook. Источники — это загруженные файлы, ссылки или текст, добавленные в ноутбуки.',
  inputSchema: z.object({
    notebookId: z.string().optional().describe('ID ноутбука для фильтрации источников'),
    limit: z.number().min(1).max(100).default(20).describe('Максимум источников')
  }),
  outputSchema: z.object({
    sources: z.array(z.record(z.string(), z.unknown())),
    count: z.number()
  }),
  execute: async ({ notebookId, limit }) => {
    const params = new URLSearchParams();
    if (notebookId) params.set('notebook_id', notebookId);
    params.set('limit', String(limit));
    const qs = params.toString();
    const data = await apiCall('GET', `/api/sources${qs ? `?${qs}` : ''}`);
    return {
      sources: Array.isArray(data) ? data : data?.sources || [],
      count: Array.isArray(data) ? data.length : data?.count || 0
    };
  }
});

// ─── Add source to notebook ───────────────────────────────────────────────

export const addSource = createTool({
  id: 'add-source',
  description:
    'Добавляет источник (ссылку, URL или текст) в указанный ноутбук Open Notebook. После добавления источник будет проиндексирован и по нему можно будет задавать вопросы.',
  inputSchema: z.object({
    notebookId: z.string().describe('ID ноутбука'),
    url: z.string().optional().describe('URL источника (если добавляем по ссылке)'),
    content: z.string().optional().describe('Текстовое содержимое (если добавляем текст)'),
    title: z.string().optional().describe('Название источника')
  }),
  outputSchema: z.object({
    source: z.record(z.string(), z.unknown())
  }),
  execute: async ({ notebookId, url, content, title }) => {
    if (!url && !content) throw new Error('Необходимо указать url или content');
    const body: Record<string, unknown> = {};
    if (url) body.url = url;
    if (content) body.content = content;
    if (title) body.title = title;

    if (url) {
      // Создаём источник, потом прикрепляем к ноутбуку
      const source = await apiCall('POST', '/api/sources', body);
      const sourceId = (source as any)?.id;
      if (!sourceId) throw new Error('Не удалось создать источник');
      const updated = await apiCall(
        'POST',
        `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`
      );
      return { source: updated as Record<string, unknown> };
    }

    if (content) {
      // Текст можно сразу вставить
      const source = await apiCall('POST', '/api/sources', {
        ...body,
        type: 'text'
      });
      const sourceId = (source as any)?.id;
      if (sourceId) {
        await apiCall(
          'POST',
          `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`
        );
      }
      return { source: source as Record<string, unknown> };
    }

    throw new Error('Не удалось добавить источник');
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────

export const getSettings = createTool({
  id: 'get-settings',
  description:
    'Получает текущие настройки Open Notebook: список подключённых AI-провайдеров, моделей и системные параметры.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    settings: z.record(z.string(), z.unknown())
  }),
  execute: async () => {
    const data = await apiCall('GET', '/api/settings');
    return { settings: data as Record<string, unknown> };
  }
});
