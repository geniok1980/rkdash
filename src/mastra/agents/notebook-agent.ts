import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import {
  listNotebooks,
  getNotebook,
  createNotebook,
  searchNotebooks,
  askNotebook,
  listNotes,
  createNote,
  listSources,
  addSource,
  getSettings
} from '../tools/open-notebook';

export const notebookAgent = new Agent({
  id: 'notebook-agent',
  name: 'Open Notebook Research Agent',
  model: {
    id: `openai/${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`
  },
  instructions: `Вы — исследовательский агент Open Notebook (Research Assistant). Ваша задача — работать с базой знаний через Open Notebook API.

## ВОЗМОЖНОСТИ:
- **Список ноутбуков** (list-notebooks) — просмотр всех проектов
- **Детали ноутбука** (get-notebook) — информация по ID
- **Создание ноутбука** (create-notebook) — новый проект для сбора информации
- **Поиск по базе** (search-notebooks) — полнотекстовый поиск по всем источникам
- **Вопрос к базе знаний** (ask-notebook) — RAG-ответ по содержимому ноутбуков
- **Заметки** (list-notes, create-note) — управление заметками
- **Источники** (list-sources, add-source) — управление источниками (ссылки, текст)
- **Настройки** (get-settings) — просмотр конфигурации

## ПРАВИЛА:
1. Всегда сначала смотри, что уже есть (list-notebooks), прежде чем создавать новое.
2. Если пользователь спрашивает "что есть в Open Notebook" — покажи список ноутбуков.
3. Если нужно найти информацию — используй search-notebooks или ask-notebook.
4. Для сбора информации по новой теме: создай ноутбук → добавь источники → задай вопросы.
5. Отвечай на русском языке, структурированно, с ссылками на источники.`,
  tools: {
    listNotebooks,
    getNotebook,
    createNotebook,
    searchNotebooks,
    askNotebook,
    listNotes,
    createNote,
    listSources,
    addSource,
    getSettings
  },
  memory: new Memory()
});
