'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { apiClient } from '@/lib/api-client';

type PlanFactPoint = {
  period: string;
  granularity: 'day' | 'month';
  actualRevenue: number;
  plannedRevenue: number;
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

function formatShortMonth(iso: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}.${m[1]}`;
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

export default function PlanFactDashboard() {
  const [params] = useQueryStates(overviewSearchParams, { shallow: true });
  const enabled = Boolean(params.from && params.to);

  const query = useQuery({
    queryKey: ['rkeeper', 'planFact', params.from, params.to, params.preset],
    queryFn: () =>
      apiClient<PlanFactPoint[]>(
        `/rkeeper/plan-fact?from=${encodeURIComponent(params.from!)}&to=${encodeURIComponent(params.to!)}${
          params.preset ? `&preset=${encodeURIComponent(params.preset)}` : ''
        }`
      ),
    enabled,
    staleTime: 15_000
  });

  const data = React.useMemo(() => {
    const items = query.data ?? [];
    return items.map((p) => ({
      ...p,
      periodLabel:
        p.granularity === 'month' ? formatShortMonth(p.period) : formatShortDate(p.period)
    }));
  }, [query.data]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>План/Факт выручки</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          Выберите период, чтобы рассчитать план по сравнению с прошлым годом.
        </CardContent>
      </Card>
    );
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>План/Факт выручки</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>Загрузка...</CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>План/Факт выручки</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          Не удалось рассчитать план/факт.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>План/Факт выручки</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='aspect-auto h-[360px] w-full'>
          <BarChart accessibilityLayer data={data} margin={{ left: 28, right: 12 }}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='periodLabel'
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
                    const p = payload?.[0]?.payload as PlanFactPoint | undefined;
                    if (!p) return undefined;
                    return p.granularity === 'month' ? `Месяц: ${p.period}` : `Дата: ${p.period}`;
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
            <Bar dataKey='plannedRevenue' fill='var(--chart-1)' radius={4} barSize={12} />
            <Bar dataKey='actualRevenue' fill='var(--chart-2)' radius={4} barSize={12} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
