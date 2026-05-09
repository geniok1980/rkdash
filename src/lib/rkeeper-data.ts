import { createClient } from '@libsql/client';
import path from 'path';

const defaultDbPath = path.resolve(process.cwd(), 'rkeeper_etl/rkeeper_data.db');
const dbPath = process.env.RKEEPER_DB_PATH || defaultDbPath;
const DB_URL = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;

const db = createClient({ url: DB_URL });

export async function getSalesSummary() {
  const result = await db.execute(`
    SELECT 
      SUM(PAYSUM) as total_revenue,
      SUM(CHECKS_COUNT) as total_checks,
      SUM(QUANTITY) as total_items
    FROM rkeeper_sales_gold
  `);

  const row = result.rows[0];
  return {
    totalRevenue: Number(row.total_revenue || 0),
    totalChecks: Number(row.total_checks || 0),
    totalItems: Number(row.total_items || 0)
  };
}

export async function getDailySales() {
  const result = await db.execute(`
    SELECT 
      strftime('%Y-%m-%d', SHIFTDATE) as date,
      SUM(PAYSUM) as revenue,
      SUM(CHECKS_COUNT) as checks
    FROM rkeeper_sales_gold
    GROUP BY date
    ORDER BY date DESC
    LIMIT 7
  `);

  return result.rows
    .map((row) => ({
      date: row.date as string,
      revenue: Number(row.revenue || 0),
      checks: Number(row.checks || 0)
    }))
    .reverse();
}

export async function getCategorySales() {
  const result = await db.execute(`
    SELECT 
      CATEGPATH as category,
      SUM(PAYSUM) as revenue
    FROM rkeeper_sales_gold
    GROUP BY category
    ORDER BY revenue DESC
    LIMIT 5
  `);

  return result.rows.map((row) => ({
    category: ((row.category as string) || 'Unknown').split('/').pop(),
    revenue: Number(row.revenue || 0)
  }));
}

export async function getTopDishes() {
  const result = await db.execute(`
    SELECT 
      DISH as name,
      SUM(QUANTITY) as quantity,
      SUM(PAYSUM) as revenue
    FROM rkeeper_sales_gold
    GROUP BY name
    ORDER BY revenue DESC
    LIMIT 5
  `);

  return result.rows.map((row) => ({
    name: row.name as string,
    quantity: Number(row.quantity || 0),
    revenue: Number(row.revenue || 0)
  }));
}
