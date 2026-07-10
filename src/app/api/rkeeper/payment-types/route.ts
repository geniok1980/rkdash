import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { getPaymentTypeSales } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));
  const data = await getPaymentTypeSales({
    from,
    to,
    restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
  });
  return NextResponse.json(data);
}
