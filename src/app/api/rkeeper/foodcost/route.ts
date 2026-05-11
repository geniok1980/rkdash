import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import path from 'path';

export const dynamic = 'force-dynamic';

const defaultDbPath = path.resolve(process.cwd(), 'rkeeper_etl/rkeeper_data.db');
const dbPath = process.env.RKEEPER_DB_PATH || defaultDbPath;
const DB_URL = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
const db = createClient({ url: DB_URL });

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table:');
}

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name = :name LIMIT 1",
    args: { name }
  } as any);
  return result.rows.length > 0;
}

async function getColumns(table: string): Promise<Set<string>> {
  const res = await db.execute(`PRAGMA table_info('${table}')`);
  const set = new Set<string>();
  for (const row of res.rows as any[]) {
    const name = row.name;
    if (typeof name === 'string') set.add(name);
  }
  return set;
}

function buildDateFilterWhere(from?: string, to?: string) {
  const clauses: string[] = [];
  const args: Record<string, unknown> = {};
  if (from) {
    clauses.push(`date(SHIFTDATE) >= date(:fromDate)`);
    args.fromDate = from;
  }
  if (to) {
    clauses.push(`date(SHIFTDATE) <= date(:toDate)`);
    args.toDate = to;
  }
  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  };
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const dishLimit = Number.isFinite(limit) ? Math.max(10, Math.min(500, limit)) : 100;

  const missing: string[] = [];

  const hasSalesGold = await tableExists('rkeeper_sales_gold');
  if (!hasSalesGold) {
    return NextResponse.json(
      {
        message:
          'В базе нет таблицы rkeeper_sales_gold. Без нее нельзя посчитать выручку по блюдам/категориям.',
        missing: ['rkeeper_sales_gold']
      },
      { status: 501 }
    );
  }

  const hasSales = await tableExists('rkeeper_sales');
  const hasPayments = await tableExists('rkeeper_payments');

  const salesGoldCols = await getColumns('rkeeper_sales_gold');
  if (!salesGoldCols.has('DISH')) missing.push('rkeeper_sales_gold.DISH');
  if (!salesGoldCols.has('CATEGPATH')) missing.push('rkeeper_sales_gold.CATEGPATH');
  if (!salesGoldCols.has('PAYSUM')) missing.push('rkeeper_sales_gold.PAYSUM');
  if (!salesGoldCols.has('QUANTITY')) missing.push('rkeeper_sales_gold.QUANTITY');

  let salesCols: Set<string> | null = null;
  if (hasSales) {
    salesCols = await getColumns('rkeeper_sales');
  } else {
    missing.push('rkeeper_sales (для детализации по ресторанам и скидкам)');
  }

  const hasRestaurantInSales =
    salesCols?.has('RESTAURANTNAME') || salesCols?.has('RESTAURANTID') || false;
  if (!hasRestaurantInSales) {
    missing.push(
      'Данные ресторана в продажах (нужны поля RESTAURANTID/RESTAURANTNAME или таблица маппинга касса→ресторан)'
    );
  }

  const hasDiscountComponents = (salesCols?.has('PRLISTSUM') && salesCols?.has('PAYSUM')) || false;
  if (!hasDiscountComponents) {
    missing.push('Скидки по позициям (нужны PRLISTSUM и PAYSUM в одной таблице продаж)');
  }

  const hasFoodcostTable =
    (await tableExists('menu_item_cost')) ||
    (await tableExists('rkeeper_menu_item_cost')) ||
    (await tableExists('foodcost_menu_item_cost'));
  if (!hasFoodcostTable) {
    missing.push(
      'Себестоимость блюд (нужна таблица себестоимости по блюдам, например menu_item_cost с CODE и cost_per_unit)'
    );
  }

  const { whereClause, args } = buildDateFilterWhere(from, to);

  const byCategoryResult = await db.execute({
    sql: `
      SELECT
        CATEGPATH as category,
        SUM(PAYSUM) as revenue,
        SUM(QUANTITY) as quantity
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT 200
    `,
    args
  } as any);

  const revenueByCategory = (byCategoryResult.rows as any[]).map((r) => ({
    category: String(r.category ?? 'Unknown')
      .split('/')
      .filter(Boolean)
      .pop(),
    revenue: Number(r.revenue ?? 0),
    quantity: Number(r.quantity ?? 0)
  }));

  const byDishResult = await db.execute({
    sql: `
      SELECT
        DISH as dish,
        SUM(PAYSUM) as revenue,
        SUM(QUANTITY) as quantity
      FROM rkeeper_sales_gold
      ${whereClause}
      GROUP BY dish
      ORDER BY revenue DESC
      LIMIT ${dishLimit}
    `,
    args
  } as any);

  const revenueByDish = (byDishResult.rows as any[]).map((r) => ({
    dish: String(r.dish ?? 'Unknown'),
    revenue: Number(r.revenue ?? 0),
    quantity: Number(r.quantity ?? 0)
  }));

  let revenueByRestaurant: Array<{ restaurant: string; revenue: number; quantity: number }> = [];
  let discountByRestaurant: Array<{
    restaurant: string;
    discount: number;
    gross: number;
    net: number;
  }> | null = null;

  if (hasSales && salesCols && (salesCols.has('RESTAURANTNAME') || salesCols.has('NETNAME'))) {
    const restaurantCol = salesCols.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : 'NETNAME';
    const { whereClause: w2, args: a2 } = buildDateFilterWhere(from, to);

    const res = await db.execute({
      sql: `
        SELECT
          ${restaurantCol} as restaurant,
          SUM(PAYSUM) as revenue,
          SUM(QUANTITY) as quantity
        FROM rkeeper_sales
        ${w2}
        GROUP BY restaurant
        ORDER BY revenue DESC
        LIMIT 200
      `,
      args: a2
    } as any);

    revenueByRestaurant = (res.rows as any[]).map((r) => ({
      restaurant: String(r.restaurant ?? 'Unknown'),
      revenue: Number(r.revenue ?? 0),
      quantity: Number(r.quantity ?? 0)
    }));

    if (salesCols.has('PRLISTSUM') && salesCols.has('PAYSUM')) {
      const resDisc = await db.execute({
        sql: `
          SELECT
            ${restaurantCol} as restaurant,
            SUM(PRLISTSUM) as gross,
            SUM(PAYSUM) as net,
            (SUM(PRLISTSUM) - SUM(PAYSUM)) as discount
          FROM rkeeper_sales
          ${w2}
          GROUP BY restaurant
          ORDER BY discount DESC
          LIMIT 200
        `,
        args: a2
      } as any);

      discountByRestaurant = (resDisc.rows as any[]).map((r) => ({
        restaurant: String(r.restaurant ?? 'Unknown'),
        gross: Number(r.gross ?? 0),
        net: Number(r.net ?? 0),
        discount: Number(r.discount ?? 0)
      }));
    }
  }

  const readyForGrossProfit =
    hasFoodcostTable &&
    hasDiscountComponents &&
    (hasRestaurantInSales || salesGoldCols.has('CLOSESTATION'));

  const response = {
    period: { from: from ?? null, to: to ?? null },
    available: {
      hasSalesGold,
      hasSales,
      hasPayments,
      hasRestaurantInSales,
      hasDiscountComponents,
      hasFoodcostTable
    },
    missing,
    revenue: {
      basis: 'PAYSUM',
      revenueByRestaurant,
      discountByRestaurant,
      revenueByCategory,
      revenueByDish,
      dishLimit
    },
    grossProfit: {
      available: readyForGrossProfit,
      message: readyForGrossProfit
        ? 'Расчет валовой прибыли можно включить после согласования схемы себестоимости.'
        : 'Для валовой прибыли не хватает данных себестоимости блюд.'
    }
  };

  if (missing.length > 0) {
    return NextResponse.json(response, { status: 501 });
  }

  return NextResponse.json(response);
}
