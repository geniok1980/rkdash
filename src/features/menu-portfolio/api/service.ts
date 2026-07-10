import { apiClient } from '@/lib/api-client';
import type { MenuPortfolioFilter, MenuPortfolioResponse } from './types';

function toSearchParams(filter: MenuPortfolioFilter): string {
  const params = new URLSearchParams();

  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.restaurants && filter.restaurants.length > 0) {
    params.set('restaurants', filter.restaurants.join(','));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getMenuPortfolioAnalysis(
  filter: MenuPortfolioFilter
): Promise<MenuPortfolioResponse> {
  return apiClient(`/rkeeper/menu-portfolio${toSearchParams(filter)}`, { cache: 'no-store' });
}
