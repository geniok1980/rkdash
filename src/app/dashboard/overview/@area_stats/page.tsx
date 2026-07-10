'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

import { AreaGraph } from '@/features/overview/components/area-graph';
import { AreaGraphSkeleton } from '@/features/overview/components/area-graph-skeleton';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { hasSelectedRestaurantSource } from '@/features/overview/lib/restaurant-selection-source';
import { waitersRevenueOptions } from '@/features/overview/api/queries';

export default function AreaStats() {
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
  const hasIikoSelected = hasSelectedRestaurantSource(params.restaurants, 'iiko');
  const hasRkeeperSelected =
    !params.restaurants?.length || hasSelectedRestaurantSource(params.restaurants, 'rkeeper');

  const query = useQuery({ ...waitersRevenueOptions(filter), enabled });

  if (!mounted || !enabled) return null;
  if (hasIikoSelected && !hasRkeeperSelected) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Недостаточно данных IIKO</AlertTitle>
        <AlertDescription>
          Выручка по официантам сейчас доступна только для ресторанов из R-Keeper.
        </AlertDescription>
      </Alert>
    );
  }
  if (query.isLoading) return <AreaGraphSkeleton />;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Ошибка</AlertTitle>
        <AlertDescription>Не удалось загрузить график: {message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {hasIikoSelected ? (
        <Alert>
          <Icons.info className='h-4 w-4' />
          <AlertTitle>IIKO учтен частично</AlertTitle>
          <AlertDescription>
            Для выбранной выборки данные IIKO не входят в разрез по официантам, потому что ETL
            пока не передает этот уровень детализации.
          </AlertDescription>
        </Alert>
      ) : null}
      <AreaGraph data={query.data ?? []} />
    </div>
  );
}
