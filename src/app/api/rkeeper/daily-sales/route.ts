import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { getIikoDailyRevenue } from '@/lib/iiko-data';
import { getDailySales } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));
  const includeRkeeper = !restaurants.hasSelection || restaurants.rkeeperRestaurantNames.length > 0;
  const includeIiko = restaurants.iikoDepartmentIds.length > 0;

  const [rkeeperData, iikoData] = await Promise.all([
    includeRkeeper
      ? getDailySales({
          from,
          to,
          restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
        })
      : [],
    includeIiko
      ? getIikoDailyRevenue({
          from,
          to,
          departmentIds: restaurants.iikoDepartmentIds
        })
      : []
  ]);

  const merged = new Map<string, { date: string; revenue: number; checks: number | null }>();
  for (const item of rkeeperData) {
    merged.set(item.date, { ...item });
  }

  for (const item of iikoData) {
    const current = merged.get(item.date);
    if (current) {
      current.revenue += item.revenue;
      current.checks = null;
      continue;
    }

    merged.set(item.date, {
      date: item.date,
      revenue: item.revenue,
      checks: null
    });
  }

  const data = Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date));
  return NextResponse.json(data);
}
