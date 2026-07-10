import { NextRequest, NextResponse } from 'next/server';
import { getComparisonSales } from '@/lib/rkeeper-data';
import type { ComparisonDimension } from '@/features/comparison/api/types';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';

export const dynamic = 'force-dynamic';

const comparisonDimensions = new Set([
  'restaurant',
  'dish',
  'category',
  'paymentType',
  'waiter'
] as const);

function isComparisonDimension(value: string): value is ComparisonDimension {
  return comparisonDimensions.has(value as ComparisonDimension);
}

export async function GET(req: NextRequest) {
  const dimension = req.nextUrl.searchParams.get('dimension') ?? '';
  const periodAFrom = req.nextUrl.searchParams.get('periodAFrom') ?? '';
  const periodATo = req.nextUrl.searchParams.get('periodATo') ?? '';
  const periodBFrom = req.nextUrl.searchParams.get('periodBFrom') ?? '';
  const periodBTo = req.nextUrl.searchParams.get('periodBTo') ?? '';
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));

  if (!isComparisonDimension(dimension)) {
    return NextResponse.json({ message: 'Неверная группировка сравнения.' }, { status: 400 });
  }

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !isoDatePattern.test(periodAFrom) ||
    !isoDatePattern.test(periodATo) ||
    !isoDatePattern.test(periodBFrom) ||
    !isoDatePattern.test(periodBTo)
  ) {
    return NextResponse.json({ message: 'Периоды должны быть в формате YYYY-MM-DD.' }, { status: 400 });
  }

  const result = await getComparisonSales({
    dimension,
    periodAFrom,
    periodATo,
    periodBFrom,
    periodBTo,
    restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
  });

  return NextResponse.json(result);
}
