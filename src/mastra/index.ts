import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter
} from '@mastra/observability';
import { sqlAgent } from './agents/sql-agent';
import { notebookAgent } from './agents/notebook-agent';
import path from 'path';

const defaultMastraDbPath = path.resolve(process.cwd(), 'mastra.db');
const mastraDbPath = process.env.MASTRA_DB_PATH || defaultMastraDbPath;
const MASTRA_DB_URL = mastraDbPath.startsWith('file:') ? mastraDbPath : `file:${mastraDbPath}`;

export const mastra = new Mastra({
  agents: { sqlAgent, notebookAgent },
  server: {
    port: Number(process.env.MASTRA_SERVER_PORT || 4111),
    host: process.env.MASTRA_SERVER_HOST || '0.0.0.0'
  },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: MASTRA_DB_URL
  }),
  logger: new PinoLogger({
    name: 'Mastra Text-to-SQL',
    level: 'info'
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'text-to-sql',
        exporters: [new DefaultExporter(), new CloudExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()]
      }
    }
  })
});
