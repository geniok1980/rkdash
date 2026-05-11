'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

import { RecentSales } from '@/features/overview/components/recent-sales';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { topDishesOptions } from '@/features/overview/api/queries';

export default function Sales() {
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  const filter = React.useMemo(
    () => ({
      from: params.from ?? undefined,
      to: params.to ?? undefined
    }),
    [params.from, params.to]
  );

  const query = useQuery({ ...topDishesOptions(filter), enabled });

  if (!enabled) return null;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Ошибка</AlertTitle>
        <AlertDescription>Не удалось загрузить продажи: {message}</AlertDescription>
      </Alert>
    );
  }

  return <RecentSales data={query.data ?? []} />;
}
