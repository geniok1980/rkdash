'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

import { BarGraph } from '@/features/overview/components/bar-graph';
import { BarGraphSkeleton } from '@/features/overview/components/bar-graph-skeleton';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';
import { dailySalesOptions } from '@/features/overview/api/queries';

export default function BarStats() {
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  const filter = React.useMemo(
    () => ({
      from: params.from ?? undefined,
      to: params.to ?? undefined
    }),
    [params.from, params.to]
  );

  const query = useQuery({ ...dailySalesOptions(filter), enabled });

  if (!enabled) return null;
  if (query.isLoading) return <BarGraphSkeleton />;
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

  return <BarGraph data={query.data ?? []} />;
}
