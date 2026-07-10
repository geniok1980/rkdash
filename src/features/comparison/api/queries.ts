import { queryOptions } from '@tanstack/react-query';
import { getComparison } from './service';
import type { ComparisonFilter } from './types';

export const comparisonKeys = {
  all: ['comparison'] as const,
  detail: (filter: ComparisonFilter) => [...comparisonKeys.all, filter] as const
};

export const comparisonQueryOptions = (filter: ComparisonFilter) =>
  queryOptions({
    queryKey: comparisonKeys.detail(filter),
    queryFn: () => getComparison(filter),
    staleTime: 15_000
  });
