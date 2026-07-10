import { queryOptions } from '@tanstack/react-query';
import { getMenuPortfolioAnalysis } from './service';
import type { MenuPortfolioFilter } from './types';

export const menuPortfolioKeys = {
  all: ['menu-portfolio'] as const,
  detail: (filter: MenuPortfolioFilter) => [...menuPortfolioKeys.all, filter] as const
};

export const menuPortfolioQueryOptions = (filter: MenuPortfolioFilter) =>
  queryOptions({
    queryKey: menuPortfolioKeys.detail(filter),
    queryFn: () => getMenuPortfolioAnalysis(filter),
    staleTime: 15_000
  });
