import { queryOptions } from '@tanstack/react-query';
import { getAbcAnalysis } from './service';
import type { AbcFilter } from './types';

export const abcAnalysisKeys = {
  all: ['abc-analysis'] as const,
  detail: (filter: AbcFilter) => [...abcAnalysisKeys.all, filter] as const
};

export const abcAnalysisQueryOptions = (filter: AbcFilter) =>
  queryOptions({
    queryKey: abcAnalysisKeys.detail(filter),
    queryFn: () => getAbcAnalysis(filter),
    staleTime: 15_000
  });
