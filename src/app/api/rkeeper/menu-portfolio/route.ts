import { NextRequest, NextResponse } from 'next/server';
import { getMenuPortfolioAnalysis } from '@/lib/rkeeper-data';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';

export const dynamic = 'force-dynamic';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? '';
  const to = req.nextUrl.searchParams.get('to') ?? '';
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));

  if (!isoDatePattern.test(from) || !isoDatePattern.test(to)) {
    return NextResponse.json({ message: 'Период должен быть в формате YYYY-MM-DD.' }, { status: 400 });
  }

  if (from > to) {
    return NextResponse.json({ message: 'Дата начала не может быть позже даты окончания.' }, { status: 400 });
  }

  const result = await getMenuPortfolioAnalysis({
    from,
    to,
    restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
  });

  return NextResponse.json(result);
}
