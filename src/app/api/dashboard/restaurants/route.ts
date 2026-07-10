import { NextResponse } from 'next/server';
import { getDashboardRestaurantOptions } from '@/lib/dashboard-restaurants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const options = await getDashboardRestaurantOptions();
  return NextResponse.json({ options });
}
