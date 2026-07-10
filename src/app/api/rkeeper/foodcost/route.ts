import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { createSqliteExecutor } from '@/lib/libsql-client';
import { withSqliteBusyRetry } from '@/lib/libsql-retry';

export const dynamic = 'force-dynamic';

type SqlRow = Record<string, unknown>;

type DebugConfig = { url: string; sessionId: string };

const debugEnvPath = path.resolve(process.cwd(), '.dbg/foodcost-slow-dashboard.env');
let debugConfigCache: DebugConfig | null = null;
let foodcostIndexesPromise: Promise<void> | null = null;

const executeSqlite = createSqliteExecutor({
  envVarNames: ['RKEEPER_DB_PATH'],
  defaultRelativePath: 'rkeeper_etl/rkeeper_data.db',
  additionalPaths: ['/data/rkeeper_data.db']
});

function getDebugConfig(): DebugConfig {
  if (debugConfigCache) return debugConfigCache;
  let url = 'http://host.docker.internal:7777/event';
  let sessionId = 'foodcost-slow-dashboard';
  try {
    const content = fs.readFileSync(debugEnvPath, 'utf8');
    url =
      content
        .split('\n')
        .find((line) => line.startsWith('DEBUG_SERVER_URL='))
        ?.split('=', 2)?.[1]
        ?.trim() || url;
    url = url.replace('http://127.0.0.1', 'http://host.docker.internal');
    url = url.replace('http://localhost', 'http://host.docker.internal');
    sessionId =
      content
        .split('\n')
        .find((line) => line.startsWith('DEBUG_SESSION_ID='))
        ?.split('=', 2)?.[1]
        ?.trim() || sessionId;
  } catch {}
  debugConfigCache = { url, sessionId };
  return debugConfigCache;
}

function reportDebugEvent(input: {
  runId: string;
  hypothesisId: string;
  location: string;
  msg: string;
  traceId: string;
  data?: Record<string, unknown>;
}) {
  const cfg = getDebugConfig();
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: cfg.sessionId,
      runId: input.runId,
      hypothesisId: input.hypothesisId,
      location: input.location,
      msg: input.msg,
      traceId: input.traceId,
      data: input.data ?? {},
      ts: Date.now()
    })
  }).catch(() => {});
}

async function executeQuery(query: string, args?: Record<string, unknown>) {
  return withSqliteBusyRetry(() => executeSqlite(query, args));
}

async function tableExists(name: string): Promise<boolean> {
  const result = await executeQuery(
    "SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name = :name LIMIT 1",
    { name }
  );
  return result.rows.length > 0;
}

async function getColumns(table: string): Promise<Set<string>> {
  const res = await executeQuery(`PRAGMA table_info('${table}')`);
  const set = new Set<string>();
  for (const row of res.rows as SqlRow[]) {
    const name = row.name;
    if (typeof name === 'string') set.add(name);
  }
  return set;
}

function getSqliteNormalizedCodeExpression(column: string) {
  const casted = `CAST(${column} AS TEXT)`;
  const stripped = `REPLACE(REPLACE(${casted}, ' ', ''), '.0', '')`;
  const trimmed = `LTRIM(${stripped}, '0')`;
  return `CASE WHEN ${trimmed} = '' THEN '0' ELSE ${trimmed} END`;
}

function quoteSqlIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function ensureFoodcostIndexes(costTableName: string | null) {
  if (foodcostIndexesPromise) return foodcostIndexesPromise;

  const salesRkidExpr = getSqliteNormalizedCodeExpression('RKID');
  const salesCodeExpr = getSqliteNormalizedCodeExpression('CODE');

  foodcostIndexesPromise = (async () => {
    const statements = [
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_shiftdate ON rkeeper_sales(date(SHIFTDATE))`,
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_rest_shiftdate ON rkeeper_sales(RESTAURANTNAME, date(SHIFTDATE))`,
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_net_shiftdate ON rkeeper_sales(NETNAME, date(SHIFTDATE))`,
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_rkid_norm_shiftdate ON rkeeper_sales(${salesRkidExpr}, date(SHIFTDATE))`,
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_code_norm_shiftdate ON rkeeper_sales(${salesCodeExpr}, date(SHIFTDATE))`,
      `CREATE INDEX IF NOT EXISTS idx_fc_sales_gold_shiftdate ON rkeeper_sales_gold(date(SHIFTDATE))`
    ];

    if (costTableName) {
      const costCodeExpr = getSqliteNormalizedCodeExpression('CODE');
      const quotedTableName = quoteSqlIdentifier(costTableName);
      statements.push(
        `CREATE INDEX IF NOT EXISTS idx_fc_${costTableName}_shiftdate ON ${quotedTableName}(date(SHIFTDATE))`,
        `CREATE INDEX IF NOT EXISTS idx_fc_${costTableName}_code_norm_shiftdate ON ${quotedTableName}(${costCodeExpr}, date(SHIFTDATE))`
      );
    }

    for (const statement of statements) {
      await executeQuery(statement);
    }
  })().catch((error) => {
    foodcostIndexesPromise = null;
    throw error;
  });

  return foodcostIndexesPromise;
}

function getPreferredCostTableName(tables: {
  hasRkeeperMenuItemCost: boolean;
  hasMenuItemCost: boolean;
  hasFoodcostMenuItemCost: boolean;
}) {
  if (tables.hasRkeeperMenuItemCost) return 'rkeeper_menu_item_cost';
  if (tables.hasMenuItemCost) return 'menu_item_cost';
  if (tables.hasFoodcostMenuItemCost) return 'foodcost_menu_item_cost';
  return null;
}

function buildDateFilterWhere(
  from?: string,
  to?: string,
  options?: {
    restaurantColumn?: string;
    restaurantNames?: string[];
  }
) {
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
  if (Array.isArray(options?.restaurantNames)) {
    if (!options.restaurantColumn || options.restaurantNames.length === 0) {
      clauses.push('1 = 0');
    } else {
      const placeholders: string[] = [];
      for (const [index, restaurantName] of options.restaurantNames.entries()) {
        const key = `restaurant${index}`;
        placeholders.push(`:${key}`);
        args[key] = restaurantName;
      }
      clauses.push(`${options.restaurantColumn} IN (${placeholders.join(', ')})`);
    }
  }
  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    args
  };
}

export async function GET(req: NextRequest) {
  const runId = 'post';
  const traceId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const t0 = Date.now();

  const from =
    req.nextUrl.searchParams.get('from') ?? req.nextUrl.searchParams.get('dateFrom') ?? undefined;
  const to =
    req.nextUrl.searchParams.get('to') ?? req.nextUrl.searchParams.get('dateTo') ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const dishLimit = Number.isFinite(limit) ? Math.max(10, Math.min(500, limit)) : 100;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));
  const selectedRestaurantNames = restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined;

  const missing: string[] = [];

  // #region debug-point A:entry
  reportDebugEvent({
    runId,
    hypothesisId: 'A',
    location: 'foodcost/route.ts:GET',
    msg: '[DEBUG] foodcost request start',
    traceId,
    data: {
      from,
      to,
      dishLimit,
      hasRestaurantSelection: restaurants.hasSelection,
      selectedRestaurantCount: Array.isArray(selectedRestaurantNames) ? selectedRestaurantNames.length : 0,
      hasIikoSelection: restaurants.iikoDepartmentIds.length > 0
    }
  });
  // #endregion

  if (restaurants.iikoDepartmentIds.length > 0) {
    missing.push(
      'IIKO сейчас не передает в этот отчет себестоимость, скидки и полную ресторанную детализацию, поэтому фудкост считается только по данным R-Keeper.'
    );
  }

  const tSchema0 = Date.now();
  const hasSalesGold = await tableExists('rkeeper_sales_gold');
  if (!hasSalesGold) {
    // #region debug-point B:schema-missing
    reportDebugEvent({
      runId,
      hypothesisId: 'B',
      location: 'foodcost/route.ts:hasSalesGold',
      msg: '[DEBUG] schema missing: rkeeper_sales_gold',
      traceId,
      data: { ms: Date.now() - tSchema0 }
    });
    // #endregion
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

  const tColsGold0 = Date.now();
  const salesGoldCols = await getColumns('rkeeper_sales_gold');
  const tColsGoldMs = Date.now() - tColsGold0;
  if (!salesGoldCols.has('DISH')) missing.push('rkeeper_sales_gold.DISH');
  if (!salesGoldCols.has('CATEGPATH')) missing.push('rkeeper_sales_gold.CATEGPATH');
  if (!salesGoldCols.has('PAYSUM')) missing.push('rkeeper_sales_gold.PAYSUM');
  if (!salesGoldCols.has('QUANTITY')) missing.push('rkeeper_sales_gold.QUANTITY');

  let salesCols: Set<string> | null = null;
  if (hasSales) {
    const tColsSales0 = Date.now();
    salesCols = await getColumns('rkeeper_sales');
    const tColsSalesMs = Date.now() - tColsSales0;
    // #region debug-point B:pragma-sales-cols
    reportDebugEvent({
      runId,
      hypothesisId: 'B',
      location: 'foodcost/route.ts:getColumns(rkeeper_sales)',
      msg: '[DEBUG] PRAGMA table_info rkeeper_sales',
      traceId,
      data: { ms: tColsSalesMs, columnCount: salesCols.size }
    });
    // #endregion
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

  const hasRkeeperMenuItemCost = await tableExists('rkeeper_menu_item_cost');
  const hasMenuItemCost = await tableExists('menu_item_cost');
  const hasFoodcostMenuItemCost = await tableExists('foodcost_menu_item_cost');

  const hasFoodcostTable = hasRkeeperMenuItemCost || hasMenuItemCost || hasFoodcostMenuItemCost;
  if (!hasFoodcostTable) {
    missing.push(
      'Себестоимость блюд (нужна таблица себестоимости по блюдам, например menu_item_cost с CODE и cost_per_unit)'
    );
  }

  // #region debug-point B:schema-summary
  reportDebugEvent({
    runId,
    hypothesisId: 'B',
    location: 'foodcost/route.ts:schema-summary',
    msg: '[DEBUG] schema/metadata checks complete',
    traceId,
    data: {
      ms: Date.now() - tSchema0,
      colsGoldMs: tColsGoldMs,
      hasSalesGold,
      hasSales,
      hasPayments,
      hasRestaurantInSales,
      hasDiscountComponents,
      hasFoodcostTable,
      missingCount: missing.length
    }
  });
  // #endregion

  const salesGoldRestaurantColumn = salesGoldCols.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : undefined;
  const categorySourceTable =
    Array.isArray(selectedRestaurantNames) && salesGoldRestaurantColumn !== 'RESTAURANTNAME'
      ? 'rkeeper_sales'
      : 'rkeeper_sales_gold';
  const categoryRestaurantColumn =
    categorySourceTable === 'rkeeper_sales' ? 'RESTAURANTNAME' : salesGoldRestaurantColumn;
  const { whereClause, args } = buildDateFilterWhere(from, to, {
    restaurantColumn: categoryRestaurantColumn,
    restaurantNames: selectedRestaurantNames
  });

  const tByCat0 = Date.now();
  const byCategoryResult = await executeQuery(
    `
      SELECT
        CATEGPATH as category,
        SUM(PAYSUM) as revenue,
        SUM(QUANTITY) as quantity
      FROM ${categorySourceTable}
      ${whereClause}
      GROUP BY category
      ORDER BY revenue DESC
      LIMIT 200
    `,
    args
  );
  // #region debug-point A:query-by-category
  reportDebugEvent({
    runId,
    hypothesisId: 'A',
    location: 'foodcost/route.ts:byCategory',
    msg: '[DEBUG] query revenue by category',
    traceId,
    data: { ms: Date.now() - tByCat0, rowCount: byCategoryResult.rows.length, categorySourceTable }
  });
  // #endregion

  const revenueByCategory = (byCategoryResult.rows as SqlRow[]).map((r) => ({
    category: String(r.category ?? 'Unknown')
      .split('/')
      .filter(Boolean)
      .pop(),
    revenue: Number(r.revenue ?? 0),
    quantity: Number(r.quantity ?? 0)
  }));

  const tByDish0 = Date.now();
  const byDishResult = await executeQuery(
    `
      SELECT
        DISH as dish,
        SUM(PAYSUM) as revenue,
        SUM(QUANTITY) as quantity
      FROM ${categorySourceTable}
      ${whereClause}
      GROUP BY dish
      ORDER BY revenue DESC
      LIMIT ${dishLimit}
    `,
    args
  );
  // #region debug-point A:query-by-dish
  reportDebugEvent({
    runId,
    hypothesisId: 'A',
    location: 'foodcost/route.ts:byDish',
    msg: '[DEBUG] query revenue by dish',
    traceId,
    data: { ms: Date.now() - tByDish0, rowCount: byDishResult.rows.length, dishLimit, categorySourceTable }
  });
  // #endregion

  const revenueByDish = (byDishResult.rows as SqlRow[]).map((r) => ({
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
    const { whereClause: w2, args: a2 } = buildDateFilterWhere(from, to, {
      restaurantColumn: restaurantCol,
      restaurantNames: selectedRestaurantNames
    });

    const tRest0 = Date.now();
    const res = await executeQuery(
      `
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
      a2
    );
    // #region debug-point A:query-by-restaurant
    reportDebugEvent({
      runId,
      hypothesisId: 'A',
      location: 'foodcost/route.ts:byRestaurant',
      msg: '[DEBUG] query revenue by restaurant',
      traceId,
      data: { ms: Date.now() - tRest0, rowCount: res.rows.length, restaurantCol }
    });
    // #endregion

    revenueByRestaurant = (res.rows as SqlRow[]).map((r) => ({
      restaurant: String(r.restaurant ?? 'Unknown'),
      revenue: Number(r.revenue ?? 0),
      quantity: Number(r.quantity ?? 0)
    }));

    if (salesCols.has('PRLISTSUM') && salesCols.has('PAYSUM')) {
      const tDisc0 = Date.now();
      const resDisc = await executeQuery(
        `
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
        a2
      );
      // #region debug-point A:query-discount
      reportDebugEvent({
        runId,
        hypothesisId: 'A',
        location: 'foodcost/route.ts:discountByRestaurant',
        msg: '[DEBUG] query discount by restaurant',
        traceId,
        data: { ms: Date.now() - tDisc0, rowCount: resDisc.rows.length, restaurantCol }
      });
      // #endregion

      discountByRestaurant = (resDisc.rows as SqlRow[]).map((r) => ({
        restaurant: String(r.restaurant ?? 'Unknown'),
        gross: Number(r.gross ?? 0),
        net: Number(r.net ?? 0),
        discount: Number(r.discount ?? 0)
      }));
    }
  }

  const selectedCostTable = getPreferredCostTableName({
    hasRkeeperMenuItemCost,
    hasMenuItemCost,
    hasFoodcostMenuItemCost
  });

  const salesJoinColumn = salesCols?.has('RKID') ? 'RKID' : 'CODE';

  const hasSalesForGrossProfit =
    hasSales &&
    !!salesCols &&
    (salesCols.has('RKID') || salesCols.has('CODE')) &&
    salesCols.has('SHIFTDATE') &&
    salesCols.has('QUANTITY') &&
    salesCols.has('PAYSUM') &&
    (salesCols.has('RESTAURANTNAME') || salesCols.has('NETNAME')) &&
    salesCols.has('DISH') &&
    salesCols.has('CATEGPATH');

  const readyForGrossProfit = hasSalesForGrossProfit && selectedCostTable !== null;

  let grossProfit: unknown = {
    available: readyForGrossProfit,
    message: readyForGrossProfit
      ? 'Расчет валовой прибыли доступен.'
      : 'Для валовой прибыли не хватает данных себестоимости блюд.'
  };

  const tIndex0 = Date.now();
  await ensureFoodcostIndexes(selectedCostTable);
  // #region debug-point B:index-ensure
  reportDebugEvent({
    runId,
    hypothesisId: 'B',
    location: 'foodcost/route.ts:ensureFoodcostIndexes',
    msg: '[DEBUG] ensured foodcost indexes',
    traceId,
    data: {
      ms: Date.now() - tIndex0,
      selectedCostTable
    }
  });
  // #endregion

  if (readyForGrossProfit && selectedCostTable) {
    const restaurantCol = salesCols!.has('RESTAURANTNAME') ? 'RESTAURANTNAME' : 'NETNAME';
    const { whereClause: w3, args: a3 } = buildDateFilterWhere(from, to, {
      restaurantColumn: restaurantCol,
      restaurantNames: selectedRestaurantNames
    });

    const salesCodeExpr = getSqliteNormalizedCodeExpression(salesJoinColumn);
    const costCodeExpr = getSqliteNormalizedCodeExpression('CODE');

    const tCostCols0 = Date.now();
    const costCols = await getColumns(selectedCostTable);
    // #region debug-point B:pragma-cost-cols
    reportDebugEvent({
      runId,
      hypothesisId: 'B',
      location: 'foodcost/route.ts:getColumns(costTable)',
      msg: '[DEBUG] PRAGMA table_info cost table',
      traceId,
      data: { ms: Date.now() - tCostCols0, costTable: selectedCostTable, columnCount: costCols.size }
    });
    // #endregion
    const hasCostSum = costCols.has('COST_SUM');
    const hasCostQty = costCols.has('QUANTITY');
    const hasCostPerUnit = costCols.has('cost_per_unit');

    const costPerUnitExpr =
      hasCostSum && hasCostQty
        ? `CASE WHEN SUM(QUANTITY) != 0 THEN SUM(COST_SUM) / SUM(QUANTITY) ELSE ${
            hasCostPerUnit ? 'AVG(cost_per_unit)' : 'NULL'
          } END`
        : hasCostPerUnit
          ? 'AVG(cost_per_unit)'
          : 'NULL';

    const tJoin0 = Date.now();
    const salesResult = await executeQuery(
      `
        SELECT
          date(SHIFTDATE) as business_date,
          ${restaurantCol} as restaurant,
          ${salesCodeExpr} as code_norm,
          DISH as dish,
          CATEGPATH as category,
          SUM(PAYSUM) as revenue,
          SUM(QUANTITY) as quantity
        FROM rkeeper_sales
        ${w3}
        GROUP BY business_date, restaurant, code_norm, dish, category
      `,
      a3
    );

    const salesRows = salesResult.rows as SqlRow[];
    const salesCodes = [...new Set(salesRows.map((row) => String(row.code_norm ?? '')).filter(Boolean))];
    let costRows: SqlRow[] = [];

    if (salesCodes.length > 0) {
      const costPlaceholders: string[] = [];
      const costArgs: Record<string, unknown> = {};
      for (const [index, code] of salesCodes.entries()) {
        const key = `costCode${index}`;
        costPlaceholders.push(`:${key}`);
        costArgs[key] = code;
      }

      const costToClause = to ? `WHERE date(SHIFTDATE) <= date(:toDate) AND ${costCodeExpr} IN (${costPlaceholders.join(', ')})` : `WHERE ${costCodeExpr} IN (${costPlaceholders.join(', ')})`;
      costRows = (await executeQuery(
        `
          SELECT
            date(SHIFTDATE) as business_date,
            ${costCodeExpr} as code_norm,
            ${costPerUnitExpr} as cost_per_unit
          FROM ${selectedCostTable}
          ${costToClause}
          GROUP BY business_date, code_norm
          HAVING cost_per_unit IS NOT NULL AND cost_per_unit != 0
          ORDER BY code_norm ASC, business_date ASC
        `,
        to ? { ...costArgs, toDate: to } : costArgs
      )).rows as SqlRow[];
    }

    const costsByCode = new Map<string, Array<{ businessDate: string; costPerUnit: number }>>();
    for (const row of costRows) {
      const code = String(row.code_norm ?? '');
      const businessDate = String(row.business_date ?? '');
      const costPerUnit = Number(row.cost_per_unit ?? 0);
      if (!code || !businessDate || !Number.isFinite(costPerUnit) || costPerUnit === 0) continue;
      const bucket = costsByCode.get(code) ?? [];
      bucket.push({ businessDate, costPerUnit });
      costsByCode.set(code, bucket);
    }

    const joinedRows = salesRows.map((row) => {
      const businessDate = String(row.business_date ?? '');
      const codeNorm = String(row.code_norm ?? '');
      const costHistory = costsByCode.get(codeNorm) ?? [];

      let matchedCostDate: string | null = null;
      let matchedCostPerUnit: number | null = null;

      for (let index = costHistory.length - 1; index >= 0; index -= 1) {
        const candidate = costHistory[index];
        if (candidate.businessDate <= businessDate) {
          matchedCostDate = candidate.businessDate;
          matchedCostPerUnit = candidate.costPerUnit;
          break;
        }
      }

      const quantity = Number(row.quantity ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const cost = quantity * (matchedCostPerUnit ?? 0);

      return {
        restaurant: String(row.restaurant ?? 'Unknown'),
        category: String(row.category ?? 'Unknown'),
        dish: String(row.dish ?? 'Unknown'),
        revenue,
        quantity,
        cost,
        profit: revenue - cost,
        missing_cost_rows: matchedCostPerUnit === null ? 1 : 0,
        fallback_cost_rows:
          matchedCostPerUnit !== null && matchedCostDate !== null && matchedCostDate < businessDate ? 1 : 0
      } satisfies SqlRow;
    });

    // #region debug-point A:query-gross-profit
    reportDebugEvent({
      runId,
      hypothesisId: 'A',
      location: 'foodcost/route.ts:grossProfitJoin',
      msg: '[DEBUG] gross profit join query complete',
      traceId,
      data: {
        ms: Date.now() - tJoin0,
        salesRowCount: salesRows.length,
        costRowCount: costRows.length,
        rowCount: joinedRows.length,
        costTable: selectedCostTable,
        restaurantCol,
        salesJoinColumn
      }
    });
    // #endregion

    // #region debug-point E:post-process
    reportDebugEvent({
      runId,
      hypothesisId: 'E',
      location: 'foodcost/route.ts:postProcess',
      msg: '[DEBUG] post-process joined rows',
      traceId,
      data: { rowCount: joinedRows.length }
    });
    // #endregion

    const totalRevenue = joinedRows.reduce((acc, r) => acc + Number(r.revenue ?? 0), 0);
    const totalCost = joinedRows.reduce((acc, r) => acc + Number(r.cost ?? 0), 0);
    const totalProfit = joinedRows.reduce((acc, r) => acc + Number(r.profit ?? 0), 0);
    const missingCostRows = joinedRows.reduce((acc, r) => acc + Number(r.missing_cost_rows ?? 0), 0);
    const fallbackCostRows = joinedRows.reduce(
      (acc, r) => acc + Number(r.fallback_cost_rows ?? 0),
      0
    );

    const byRestaurantMap = new Map<string, { revenue: number; cost: number; profit: number }>();
    const byCategoryMap = new Map<string, { revenue: number; cost: number; profit: number; quantity: number }>();
    const byDishMap = new Map<string, { revenue: number; cost: number; profit: number; quantity: number }>();

    for (const row of joinedRows) {
      const restaurant = String(row.restaurant ?? 'Unknown');
      const categoryPath = String(row.category ?? 'Unknown');
      const category = categoryPath
        .split('/')
        .filter(Boolean)
        .pop();
      const dish = String(row.dish ?? 'Unknown');
      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);
      const profit = Number(row.profit ?? 0);
      const quantity = Number(row.quantity ?? 0);

      const rest = byRestaurantMap.get(restaurant) ?? { revenue: 0, cost: 0, profit: 0 };
      rest.revenue += revenue;
      rest.cost += cost;
      rest.profit += profit;
      byRestaurantMap.set(restaurant, rest);

      const catKey = category ?? 'Unknown';
      const cat = byCategoryMap.get(catKey) ?? { revenue: 0, cost: 0, profit: 0, quantity: 0 };
      cat.revenue += revenue;
      cat.cost += cost;
      cat.profit += profit;
      cat.quantity += quantity;
      byCategoryMap.set(catKey, cat);

      const dishAgg = byDishMap.get(dish) ?? { revenue: 0, cost: 0, profit: 0, quantity: 0 };
      dishAgg.revenue += revenue;
      dishAgg.cost += cost;
      dishAgg.profit += profit;
      dishAgg.quantity += quantity;
      byDishMap.set(dish, dishAgg);
    }

    const byRestaurant = [...byRestaurantMap.entries()]
      .map(([restaurant, v]) => ({ restaurant, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    const byCategory = [...byCategoryMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    const byDish = [...byDishMap.entries()]
      .map(([dish, v]) => ({ dish, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, dishLimit);

    grossProfit = {
      available: true,
      basis: {
        salesTable: 'rkeeper_sales',
        costTable: selectedCostTable,
        join: `normalized ${salesJoinColumn} = normalized CODE; exact same-day cost, otherwise latest previous non-zero cost`
      },
      totals: {
        revenue: totalRevenue,
        cost: totalCost,
        profit: totalProfit
      },
      missingCostRows,
      fallbackCostRows,
      byRestaurant,
      byCategory,
      byDish,
      dishLimit
    };
  }

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
    grossProfit
  };

  if (missing.length > 0) {
    // #region debug-point D:response-501
    reportDebugEvent({
      runId,
      hypothesisId: 'D',
      location: 'foodcost/route.ts:response',
      msg: '[DEBUG] response 501 (missing requirements)',
      traceId,
      data: { msTotal: Date.now() - t0, missingCount: missing.length }
    });
    // #endregion
    return NextResponse.json(response, { status: 501 });
  }

  // #region debug-point D:response-200
  reportDebugEvent({
    runId,
    hypothesisId: 'D',
    location: 'foodcost/route.ts:response',
    msg: '[DEBUG] response 200',
    traceId,
    data: { msTotal: Date.now() - t0, msSchema: Date.now() - tSchema0 }
  });
  // #endregion

  return NextResponse.json(response);
}
