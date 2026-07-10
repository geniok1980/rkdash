'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';

type ForecastPoint = {
  date: string;
  actualRevenue: number | null;
  plannedRevenue: number;
};

type ForecastResponse = {
  month: string;
  asOf: string;
  growthPercent: number;
  monthPlan: number;
  actualMtd: number;
  planMtd: number;
  forecast: number;
  forecastVsPlanPercent: number | null;
  remainingDays: number;
  neededPerDay: number;
  points: ForecastPoint[];
  dataRequirements: {
    weather: { available: boolean; needed: string };
    seasonality: { available: boolean; source: string };
    weekdayPatterns: { available: boolean; source: string };
  };
};

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

const rubCompactFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  compactDisplay: 'short',
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 1
});

function formatRub(value: number) {
  return rubFormatter.format(value);
}

function formatRubAxis(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100_000) return rubCompactFormatter.format(value);
  return formatRub(value);
}

function formatShortDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

const chartConfig = {
  plannedRevenue: {
    label: 'План',
    color: 'var(--chart-1)'
  },
  actualRevenue: {
    label: 'Факт',
    color: 'var(--chart-2)'
  }
};

async function fetchForecast(
  from: string,
  to: string,
  restaurants?: string[]
): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    from,
    to
  });
  if (restaurants && restaurants.length > 0) {
    params.set('restaurants', restaurants.join(','));
  }

  const res = await fetch(`/api/rkeeper/forecasting?${params.toString()}`, { cache: 'no-store' });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'message' in json
        ? String((json as any).message)
        : 'Ошибка';
    throw new Error(message);
  }
  return json as ForecastResponse;
}

function MetricCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-semibold tabular-nums'>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ForecastingDashboard() {
  const [params] = useQueryStates(overviewSearchParams, { shallow: true });
  const enabled = Boolean(params.from && params.to);

  const query = useQuery({
    queryKey: ['rkeeper', 'forecasting', params.from, params.to, params.restaurants ?? []],
    queryFn: () => fetchForecast(params.from!, params.to!, params.restaurants ?? undefined),
    enabled,
    staleTime: 15_000
  });

  const chartData = React.useMemo(() => {
    const points = query.data?.points ?? [];
    return points.map((p) => ({
      ...p,
      dateLabel: formatShortDate(p.date),
      actualRevenue: p.actualRevenue === null ? undefined : p.actualRevenue
    }));
  }, [query.data?.points]);

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Выберите период</AlertTitle>
        <AlertDescription>
          Прогноз строится для месяца, в который попадает дата “по”.
        </AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Нельзя построить прогноз</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data) return null;
  const data = query.data;

  const completion =
    data.forecastVsPlanPercent == null ? null : Math.round(data.forecastVsPlanPercent);

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <MetricCard title={`План месяца (${data.month})`} value={formatRub(data.monthPlan)} />
        <MetricCard title={`Факт на ${data.asOf}`} value={formatRub(data.actualMtd)} />
        <MetricCard title='Прогноз на конец месяца' value={formatRub(data.forecast)} />
        <MetricCard
          title='Прогноз выполнения'
          value={completion == null ? '—' : `${completion}%`}
        />
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>Динамика по дням</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='w-full overflow-x-auto'>
              <div className='min-w-[980px]'>
                <ChartContainer config={chartConfig} className='aspect-auto h-[360px] w-full'>
                  <BarChart accessibilityLayer data={chartData} margin={{ left: 28, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray='3 3' />
                    <XAxis
                      dataKey='dateLabel'
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval='preserveStartEnd'
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      width={96}
                      tickFormatter={(v) => formatRubAxis(Number(v))}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const p = payload?.[0]?.payload as ForecastPoint | undefined;
                            if (!p) return undefined;
                            return `Дата: ${(p as any).date ?? ''}`;
                          }}
                          formatter={(value, name) => {
                            const label = name === 'plannedRevenue' ? 'План' : 'Факт';
                            return (
                              <div className='flex flex-1 items-center justify-between leading-none'>
                                <span className='text-muted-foreground'>{label}</span>
                                <span className='text-foreground font-mono font-medium tabular-nums'>
                                  {formatRub(Number(value))}
                                </span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey='plannedRevenue' fill='var(--chart-1)' radius={4} barSize={10} />
                    <Bar dataKey='actualRevenue' fill='var(--chart-2)' radius={4} barSize={10} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Факторы прогноза</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div>
              <div className='font-medium'>День недели и сезонность</div>
              <div className='text-muted-foreground'>
                Используется выручка за прошлый год для этого месяца с выравниванием по “N‑й день
                недели в месяце” + % роста.
              </div>
            </div>
            <div>
              <div className='font-medium'>Погода</div>
              <div className='text-muted-foreground'>
                Нет данных по погоде — корректировка по погоде сейчас недоступна.
              </div>
            </div>
            <div>
              <div className='font-medium'>До выполнения плана</div>
              <div className='text-muted-foreground'>
                Осталось дней: {data.remainingDays.toLocaleString('ru-RU')}
                <br />
                Нужно в среднем в день: {formatRub(data.neededPerDay)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!data.dataRequirements.weather.available ? (
        <Alert>
          <Icons.info className='h-4 w-4' />
          <AlertTitle>Каких данных не хватает</AlertTitle>
          <AlertDescription>
            Для учета погоды нужно загрузить: {data.dataRequirements.weather.needed}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
