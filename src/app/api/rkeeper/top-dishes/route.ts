import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { getIikoTopDishes } from '@/lib/iiko-data';
import { getTopDishes } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));
  const includeRkeeper = !restaurants.hasSelection || restaurants.rkeeperRestaurantNames.length > 0;
  const includeIiko = restaurants.iikoDepartmentIds.length > 0;

  const [rkeeperData, iikoData] = await Promise.all([
    includeRkeeper
      ? getTopDishes({
          from,
          to,
          restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
        })
      : [],
    includeIiko
      ? getIikoTopDishes({
          from,
          to,
          departmentIds: restaurants.iikoDepartmentIds
        })
      : []
  ]);

  const merged = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of [...rkeeperData, ...iikoData]) {
    const key = item.name.trim().toLowerCase();
    const current = merged.get(key);
    if (current) {
      current.quantity += item.quantity;
      current.revenue += item.revenue;
      continue;
    }

    merged.set(key, { ...item });
  }

  const data = Array.from(merged.values())
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);

  return NextResponse.json(data);
}
