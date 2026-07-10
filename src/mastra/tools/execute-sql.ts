import { createTool } from '@mastra/core/tools';
import { createClient } from '@libsql/client';
import { z } from 'zod';
import path from 'path';

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

export const executeSql = createTool({
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
    console.log('--- SQL EXECUTION START ---');
    console.log('Query:', query);

    const trimmed = query.trim().replace(/;$/, '');

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmed)) {
        console.error('Blocked query pattern detected');
        throw new Error('Only SELECT queries are allowed.');
      }
    }

    if (!/^\s*SELECT\b/i.test(trimmed)) {
      console.error('Query does not start with SELECT');
      throw new Error('Query must start with SELECT.');
    }

    try {
      const result = await db.execute(trimmed);
      console.log('SQL success, rows:', result.rows.length);
      console.log('--- SQL EXECUTION END ---');

      return {
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rows.length
      };
    } catch (e: any) {
      console.error('SQL Error:', e.message);
      console.log('--- SQL EXECUTION END ---');
      throw e;
    }
  }
});
