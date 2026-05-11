'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

import { AreaGraph } from '@/features/overview/components/area-graph';
import { AreaGraphSkeleton } from '@/features/overview/components/area-graph-skeleton';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { waitersRevenueOptions } from '@/features/overview/api/queries';

export default function AreaStats() {
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  const filter = React.useMemo(
    () => ({
      from: params.from ?? undefined,
      to: params.to ?? undefined
    }),
    [params.from, params.to]
  );

  const query = useQuery({ ...waitersRevenueOptions(filter), enabled });

  if (!enabled) return null;
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

  return <AreaGraph data={query.data ?? []} />;
}
