import { NextRequest, NextResponse } from 'next/server';
import { getDailyRevenue, getRevenueGrowthYoYPercent } from '@/lib/rkeeper-data';

export const dynamic = 'force-dynamic';

function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function nthWeekdayInMonth(date: Date): number {
  const weekday = date.getDay();
  let count = 0;
  for (let day = 1; day <= date.getDate(); day++) {
    const d = new Date(date.getFullYear(), date.getMonth(), day);
    if (d.getDay() === weekday) count++;
  }
  return count;
}

function findDateByNthWeekday(
  year: number,
  monthIndex: number,
  weekday: number,
  nth: number
): Date | null {
  let count = 0;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    if (d.getDay() === weekday) {
      count++;
      if (count === nth) return d;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;

  if (!from || !to) {
    return NextResponse.json(
      { message: 'Нужно указать from и to в формате YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const asOf = parseIsoDate(to);
  if (!asOf) {
    return NextResponse.json(
      { message: 'Некорректная дата to. Ожидается формат YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const growthPercent = await getRevenueGrowthYoYPercent();
  if (growthPercent === null) {
    return NextResponse.json(
      {
        message: 'Не задан процент роста к прошлому году. Укажите его в Настройки → План продаж.'
      },
      { status: 501 }
    );
  }

  const monthStart = startOfMonth(asOf);
  const monthEnd = endOfMonth(asOf);
  const lastYearMonthStart = new Date(asOf.getFullYear() - 1, asOf.getMonth(), 1);
  const lastYearMonthEnd = new Date(asOf.getFullYear() - 1, asOf.getMonth() + 1, 0);

  const currentDaily = await getDailyRevenue({
    from: toIsoDate(monthStart),
    to: toIsoDate(asOf)
  });

  const lastYearDaily = await getDailyRevenue({
    from: toIsoDate(lastYearMonthStart),
    to: toIsoDate(lastYearMonthEnd)
  });

  if (lastYearDaily.length === 0) {
    return NextResponse.json(
      {
        message:
          'Нет данных по выручке за прошлый год для выбранного месяца. Нужны данные rkeeper_sales_gold минимум за год.'
      },
      { status: 501 }
    );
  }

  const currentMap = new Map<string, number>();
  for (const item of currentDaily) currentMap.set(item.date, item.revenue);

  const lastYearMap = new Map<string, number>();
  for (const item of lastYearDaily) lastYearMap.set(item.date, item.revenue);

  const monthIndex = asOf.getMonth();
  const year = asOf.getFullYear();
  const lastYear = year - 1;
  const lastDay = monthEnd.getDate();
  const asOfIso = toIsoDate(asOf);

  const points: Array<{
    date: string;
    actualRevenue: number | null;
    plannedRevenue: number;
    baselineLastYearDate: string | null;
    baselineLastYearRevenue: number;
  }> = [];

  const growthFactor = 1 + growthPercent / 100;

  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    const iso = toIsoDate(d);
    const actualRevenue = iso <= asOfIso ? (currentMap.get(iso) ?? 0) : null;

    const weekday = d.getDay();
    const nth = nthWeekdayInMonth(d);
    const baselineDate = findDateByNthWeekday(lastYear, monthIndex, weekday, nth);
    const baselineIso = baselineDate ? toIsoDate(baselineDate) : null;
    const baselineRevenue = baselineIso ? (lastYearMap.get(baselineIso) ?? 0) : 0;
    const plannedRevenue = baselineRevenue * growthFactor;

    points.push({
      date: iso,
      actualRevenue,
      plannedRevenue,
      baselineLastYearDate: baselineIso,
      baselineLastYearRevenue: baselineRevenue
    });
  }

  const monthPlan = points.reduce((acc, p) => acc + p.plannedRevenue, 0);
  const actualMtd = points.reduce((acc, p) => acc + (p.actualRevenue ?? 0), 0);
  const planMtd = points
    .filter((p) => p.date <= asOfIso)
    .reduce((acc, p) => acc + p.plannedRevenue, 0);

  if (planMtd <= 0) {
    return NextResponse.json(
      {
        message:
          'Невозможно рассчитать прогноз: план на текущие даты равен 0. Проверьте наличие данных за прошлый год.'
      },
      { status: 501 }
    );
  }

  const adjustment = actualMtd / planMtd;
  const remainingPlan = points
    .filter((p) => p.date > asOfIso)
    .reduce((acc, p) => acc + p.plannedRevenue, 0);
  const forecast = actualMtd + remainingPlan * adjustment;

  const remainingDays = points.filter((p) => p.date > asOfIso).length;
  const needToPlan = Math.max(0, monthPlan - actualMtd);
  const neededPerDay = remainingDays > 0 ? needToPlan / remainingDays : 0;

  return NextResponse.json({
    month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    asOf: asOfIso,
    growthPercent,
    monthPlan,
    actualMtd,
    planMtd,
    forecast,
    forecastVsPlanPercent: monthPlan > 0 ? (forecast / monthPlan) * 100 : null,
    remainingDays,
    neededPerDay,
    points,
    dataRequirements: {
      weather: {
        available: false,
        needed:
          'Таблица погоды (по дням) с привязкой к ресторану/локации: date, restaurant_id (или lat/lon), temperature_avg, precipitation_mm, wind_speed, condition.'
      },
      seasonality: {
        available: true,
        source: 'rkeeper_sales_gold (история прошлых лет)'
      },
      weekdayPatterns: {
        available: true,
        source: 'rkeeper_sales_gold (выручка по дням)'
      }
    }
  });
}
