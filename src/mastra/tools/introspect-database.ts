import { createTool } from '@mastra/core/tools';
import { createClient } from '@libsql/client';
import { z } from 'zod';
import path from 'path';

const defaultDbPath = path.resolve(process.cwd(), 'rkeeper_etl/rkeeper_data.db');
const dbPath = process.env.RKEEPER_DB_PATH || defaultDbPath;
const DB_URL = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;

const db = createClient({ url: DB_URL });

export const introspectDatabase = createTool({
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
      } catch (e) {
        console.error(`Error counting rows for ${tableName}`, e);
      }

      lines.push(`## ${tableName} (${rowCount} rows)`);
      lines.push('');
      lines.push('| Column | Type | Nullable | PK |');
      lines.push('|--------|------|----------|----|');

      for (const col of columns.rows) {
        const nullable = col.notnull ? 'NO' : 'YES';
        const pk = col.pk ? 'YES' : '';
        lines.push(`| ${col.name} | ${col.type || 'ANY'} | ${nullable} | ${pk} |`);
      }

      if (foreignKeys.rows.length > 0) {
        lines.push('');
        lines.push('**Foreign Keys:**');
        for (const fk of foreignKeys.rows) {
          lines.push(`- ${fk.from} → ${fk.table}.${fk.to}`);
        }
      }

      lines.push('');
    }

    return { schema: lines.join('\n') };
  }
});
