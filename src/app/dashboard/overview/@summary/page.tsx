'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { salesSummaryOptions } from '@/features/overview/api/queries';
import { SummaryCardsSkeleton } from '@/features/overview/components/summary-cards-skeleton';

function formatCount(value: number | null) {
  if (value === null) return '—';
  return value.toLocaleString();
}

function formatSources(sources?: Array<'rkeeper' | 'iiko'>) {
  if (!sources || sources.length === 0) return 'R-Keeper';
  return sources.map((source) => (source === 'iiko' ? 'IIKO' : 'R-Keeper')).join(' + ');
}

export default function SummaryStats() {
  const [mounted, setMounted] = React.useState(false);
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const filter = React.useMemo(
    () => ({
      from: params.from ?? undefined,
      to: params.to ?? undefined,
      restaurants: params.restaurants ?? undefined
    }),
    [params.from, params.restaurants, params.to]
  );

  const query = useQuery({ ...salesSummaryOptions(filter), enabled });

  if (!mounted || !enabled) return null;
  if (query.isLoading) return <SummaryCardsSkeleton />;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Ошибка</AlertTitle>
        <AlertDescription>Не удалось загрузить статистику: {message}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data) return <SummaryCardsSkeleton />;
  const summary = query.data;
  const averageCheck =
    typeof summary.averageCheck === 'number' ? `₽${summary.averageCheck.toFixed(2)}` : '—';
  const sourceLabel = formatSources(summary.sources);
  const checksUnavailable = summary.unavailableMetrics?.includes('checks') ?? false;
  const checksPartial = summary.partialMetrics?.includes('checks') ?? false;
  const averageCheckUnavailable = summary.unavailableMetrics?.includes('averageCheck') ?? false;
  const averageCheckPartial = summary.partialMetrics?.includes('averageCheck') ?? false;

  return (
    <div className='*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:grid-cols-4'>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Общая выручка</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            ₽{summary.totalRevenue.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant='outline'>
              <Icons.trendingUp />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>
            Данные из {sourceLabel} <Icons.trendingUp className='size-4' />
          </div>
        </CardFooter>
      </Card>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Всего чеков</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {formatCount(summary.totalChecks)}
          </CardTitle>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>
            {checksUnavailable
              ? 'Для IIKO чеки недоступны'
              : checksPartial
                ? 'Чеки показаны только по R-Keeper'
                : 'Обработано заказов'}
          </div>
        </CardFooter>
      </Card>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Средний чек</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {averageCheck}
          </CardTitle>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>
            {averageCheckUnavailable
              ? 'Средний чек недоступен для IIKO'
              : averageCheckPartial
                ? 'Средний чек показан только по R-Keeper'
                : 'Средняя стоимость заказа'}
          </div>
        </CardFooter>
      </Card>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Продано позиций</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {summary.totalItems.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>Объем проданных блюд</div>
        </CardFooter>
      </Card>
    </div>
  );
}
