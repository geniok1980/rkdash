'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { waitersRevenueOptions } from '@/features/overview/api/queries';
import type { SalesDateFilter, WaiterRevenueItem } from '@/features/overview/api/types';

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

function formatRub(value: number) {
  return rubFormatter.format(value);
}

type RewardPercentResponse = { percent: number | null };

type WaiterPremiumRow = WaiterRevenueItem & { premium: number };

const chartConfig = {
  premium: {
    label: 'Премия (₽)',
    color: 'var(--chart-2)'
  }
};

export default function PremiumsPenaltiesDashboard() {
  const [params] = useQueryStates(overviewSearchParams, { shallow: true });
  const enabled = Boolean(params.from && params.to);

  const filter = React.useMemo(
    (): SalesDateFilter => ({ from: params.from ?? null, to: params.to ?? null }),
    [params.from, params.to]
  );

  const percentQuery = useQuery({
    queryKey: ['settings', 'waiterRewardPercent'],
    queryFn: () =>
      apiClient<RewardPercentResponse>('/settings/waiter-reward-percent', { cache: 'no-store' }),
    staleTime: 15_000
  });

  const waitersQuery = useQuery({
    ...waitersRevenueOptions(filter),
    enabled
  });

  const percent = percentQuery.data?.percent ?? 0;

  const rows = React.useMemo((): WaiterPremiumRow[] => {
    const data = waitersQuery.data ?? [];
    const p = Number.isFinite(percent) ? percent : 0;
    return data
      .map((w) => ({
        ...w,
        premium: (w.revenue * p) / 100
      }))
      .sort((a, b) => b.premium - a.premium);
  }, [waitersQuery.data, percent]);

  const leaders = rows.slice(0, 3);
  const chartHeight = Math.max(280, rows.length * 28);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Премии официантов</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          Выберите период, чтобы рассчитать премии.
        </CardContent>
      </Card>
    );
  }

  if (waitersQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Премии официантов</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>Загрузка...</CardContent>
      </Card>
    );
  }

  if (waitersQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Премии официантов</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          Не удалось загрузить выручку официантов.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='grid gap-4'>
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
        <Card className='lg:col-span-4'>
          <CardHeader>
            <CardTitle>Премия по официантам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-[420px] overflow-y-auto'>
              <ChartContainer
                config={chartConfig}
                className='aspect-auto w-full'
                style={{ height: chartHeight }}
              >
                <BarChart accessibilityLayer data={rows} layout='vertical' margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray='3 3' />
                  <YAxis
                    dataKey='waiter'
                    type='category'
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={160}
                  />
                  <XAxis
                    type='number'
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => formatRub(Number(value))}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey='premium' fill='var(--chart-2)' radius={4} barSize={18} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card className='lg:col-span-3'>
          <CardHeader>
            <CardTitle>Лидеры</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {leaders.length === 0 ? (
              <div className='text-sm text-muted-foreground'>Нет данных за выбранный период.</div>
            ) : (
              leaders.map((l, idx) => (
                <div key={`${l.waiter}-${idx}`} className='flex items-center justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='text-sm font-medium truncate'>
                      {idx + 1}. {l.waiter}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      Выручка: {formatRub(l.revenue)}
                    </div>
                  </div>
                  <div className='text-sm font-semibold tabular-nums'>{formatRub(l.premium)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Официанты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Официант</TableHead>
                  <TableHead className='text-right'>Выручка</TableHead>
                  <TableHead className='text-right'>Процент</TableHead>
                  <TableHead className='text-right'>Премия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={`${r.waiter}-${idx}`}>
                    <TableCell className='font-medium'>{r.waiter}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatRub(r.revenue)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{percent}%</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatRub(r.premium)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
