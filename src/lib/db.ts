import { Pool } from 'pg';

// Для бизнес-данных Rkeeper (PostgreSQL)
const pgPool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/rkeeper'
});

export const queryPg = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pgPool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
};

export default pgPool;
