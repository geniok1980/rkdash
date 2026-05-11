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

export default function SummaryStats() {
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  const filter = React.useMemo(
    () => ({
      from: params.from ?? undefined,
      to: params.to ?? undefined
    }),
    [params.from, params.to]
  );

  const query = useQuery({ ...salesSummaryOptions(filter), enabled });

  if (!enabled) return null;
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
            Данные из Rkeeper <Icons.trendingUp className='size-4' />
          </div>
        </CardFooter>
      </Card>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Всего чеков</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {summary.totalChecks.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>Обработано заказов</div>
        </CardFooter>
      </Card>
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Средний чек</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            ₽{(summary.totalRevenue / (summary.totalChecks || 1)).toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='line-clamp-1 flex gap-2 font-medium'>Средняя стоимость заказа</div>
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
