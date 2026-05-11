import { NextRequest, NextResponse } from 'next/server';
import { getDailyRevenue, getMonthlyRevenue, getRevenueGrowthYoYPercent } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

type PlanFactPoint = {
  period: string;
  granularity: 'day' | 'month';
  actualRevenue: number;
  plannedRevenue: number;
};

function parseIsoUtc(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function toIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysUtc(date: Date, days: number): Date {
  const dt = new Date(date.getTime());
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function daysInMonthUtc(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function monthStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEndUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addYearsUtc(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function toIsoMonthUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function daysDiffInclusiveUtc(from: Date, to: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
}

function weekOfMonthForWeekdayUtc(date: Date): number {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth(); // 0-11
  const weekday = date.getUTCDay(); // 0-6
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const weekdayOfFirst = first.getUTCDay();
  const day = date.getUTCDate();
  const firstOccurrence = 1 + ((weekday - weekdayOfFirst + 7) % 7);
  return Math.floor((day - firstOccurrence) / 7) + 1;
}

function matchPrevYearDateUtc(current: Date): Date | null {
  const yearPrev = current.getUTCFullYear() - 1;
  const monthIndex = current.getUTCMonth();
  const weekday = current.getUTCDay();
  const weekIndex = weekOfMonthForWeekdayUtc(current);

  const firstPrev = new Date(Date.UTC(yearPrev, monthIndex, 1));
  const weekdayOfFirstPrev = firstPrev.getUTCDay();
  const firstOccurrencePrev = 1 + ((weekday - weekdayOfFirstPrev + 7) % 7);
  const dayPrev = firstOccurrencePrev + (weekIndex - 1) * 7;

  const dim = daysInMonthUtc(yearPrev, monthIndex + 1);
  if (dayPrev < 1 || dayPrev > dim) return null;
  return new Date(Date.UTC(yearPrev, monthIndex, dayPrev));
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  const preset = req.nextUrl.searchParams.get('preset') ?? undefined;

  if (!from || !to) return NextResponse.json([] satisfies PlanFactPoint[]);

  const fromDate = parseIsoUtc(from);
  const toDate = parseIsoUtc(to);
  if (!fromDate || !toDate) return NextResponse.json([] satisfies PlanFactPoint[]);

  const growthPercent = (await getRevenueGrowthYoYPercent()) ?? 0;

  const monthlyMode = preset === 'year' || daysDiffInclusiveUtc(fromDate, toDate) > 31;

  if (monthlyMode) {
    const currentFrom = toIsoUtc(monthStartUtc(fromDate));
    const currentTo = toIsoUtc(monthEndUtc(toDate));

    const prevFrom = toIsoUtc(addYearsUtc(monthStartUtc(fromDate), -1));
    const prevTo = toIsoUtc(addYearsUtc(monthEndUtc(toDate), -1));

    const current = await getMonthlyRevenue({ from: currentFrom, to: currentTo });
    const prev = await getMonthlyRevenue({ from: prevFrom, to: prevTo });

    const currentMap = new Map(current.map((p) => [p.month, p.revenue]));
    const prevMap = new Map(prev.map((p) => [p.month, p.revenue]));

    const points: PlanFactPoint[] = [];
    for (
      let m = monthStartUtc(fromDate);
      m.getTime() <= monthStartUtc(toDate).getTime();
      m = addMonthsUtc(m, 1)
    ) {
      const monthIso = toIsoMonthUtc(m);
      const actualRevenue = currentMap.get(monthIso) ?? 0;
      const prevMonthIso = `${m.getUTCFullYear() - 1}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
      const base = prevMap.get(prevMonthIso) ?? 0;
      const plannedRevenue = base * (1 + growthPercent / 100);
      points.push({ period: monthIso, granularity: 'month', actualRevenue, plannedRevenue });
    }

    return NextResponse.json(points);
  }

  const actual = await getDailyRevenue({ from, to });
  const actualMap = new Map(actual.map((p) => [p.date, p.revenue]));

  const prevFrom = toIsoUtc(addYearsUtc(monthStartUtc(fromDate), -1));
  const prevTo = toIsoUtc(addYearsUtc(monthEndUtc(toDate), -1));

  const prev = await getDailyRevenue({ from: prevFrom, to: prevTo });
  const prevMap = new Map(prev.map((p) => [p.date, p.revenue]));

  const points: PlanFactPoint[] = [];
  for (let d = fromDate; d.getTime() <= toDate.getTime(); d = addDaysUtc(d, 1)) {
    const dateIso = toIsoUtc(d);
    const actualRevenue = actualMap.get(dateIso) ?? 0;

    const prevDate = matchPrevYearDateUtc(d);
    const prevIso = prevDate ? toIsoUtc(prevDate) : null;
    const base = prevIso ? (prevMap.get(prevIso) ?? 0) : 0;
    const plannedRevenue = base * (1 + growthPercent / 100);

    points.push({ period: dateIso, granularity: 'day', actualRevenue, plannedRevenue });
  }

  return NextResponse.json(points);
}
