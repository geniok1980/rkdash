import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { getIikoSalesSummary } from '@/lib/iiko-data';
import { getSalesSummary } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));
  const includeRkeeper = !restaurants.hasSelection || restaurants.rkeeperRestaurantNames.length > 0;
  const includeIiko = restaurants.iikoDepartmentIds.length > 0;

  const [rkeeperData, iikoData] = await Promise.all([
    includeRkeeper
      ? getSalesSummary({
          from,
          to,
          restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
        })
      : null,
    includeIiko
      ? getIikoSalesSummary({
          from,
          to,
          departmentIds: restaurants.iikoDepartmentIds
        })
      : null
  ]);

  const totalRevenue = (rkeeperData?.totalRevenue ?? 0) + (iikoData?.totalRevenue ?? 0);
  const totalItems = (rkeeperData?.totalItems ?? 0) + (iikoData?.totalItems ?? 0);
  const totalChecks = includeRkeeper ? (rkeeperData?.totalChecks ?? 0) : null;
  const averageCheck =
    includeRkeeper && (rkeeperData?.totalChecks ?? 0) > 0
      ? (rkeeperData?.totalRevenue ?? 0) / (rkeeperData?.totalChecks ?? 1)
      : null;
  const sources = [
    ...(includeRkeeper ? (['rkeeper'] as const) : []),
    ...(includeIiko ? (['iiko'] as const) : [])
  ];
  const unavailableMetrics = includeIiko && !includeRkeeper ? (['checks', 'averageCheck'] as const) : [];
  const partialMetrics =
    includeIiko && includeRkeeper ? (['checks', 'averageCheck'] as const) : [];

  return NextResponse.json({
    totalRevenue,
    totalChecks,
    averageCheck,
    totalItems,
    unavailableMetrics,
    partialMetrics,
    sources
  });
}
