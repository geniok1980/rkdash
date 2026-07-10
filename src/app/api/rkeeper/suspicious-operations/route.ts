import { NextRequest, NextResponse } from 'next/server';
import { parseRestaurantSearchParamValues } from '@/lib/dashboard-restaurants';
import { getSuspiciousOperations } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const restaurants = parseRestaurantSearchParamValues(req.nextUrl.searchParams.getAll('restaurants'));

  if (restaurants.iikoDepartmentIds.length > 0) {
    return NextResponse.json(
      {
        sumDecreases: [],
        transfers: [],
        deletesAfterShiftClose: [],
        precheckCancels: [],
        missing: [
          'IIKO не передает журнал подозрительных операций в формате, достаточном для этого отчета. Сейчас отчет поддерживается только для R-Keeper.'
        ]
      }
    );
  }

  try {
    const data = await getSuspiciousOperations({
      from,
      to,
      restaurantNames: restaurants.hasSelection ? restaurants.rkeeperRestaurantNames : undefined
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message }, { status: 501 });
  }
}
