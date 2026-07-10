import { apiClient } from '@/lib/api-client';
import type { ComparisonFilter, ComparisonResponse } from './types';

function toSearchParams(filter: ComparisonFilter): string {
  const params = new URLSearchParams();

  params.set('dimension', filter.dimension);
  if (filter.periodAFrom) params.set('periodAFrom', filter.periodAFrom);
  if (filter.periodATo) params.set('periodATo', filter.periodATo);
  if (filter.periodBFrom) params.set('periodBFrom', filter.periodBFrom);
  if (filter.periodBTo) params.set('periodBTo', filter.periodBTo);
  if (filter.restaurants && filter.restaurants.length > 0) {
    params.set('restaurants', filter.restaurants.join(','));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getComparison(filter: ComparisonFilter): Promise<ComparisonResponse> {
  return apiClient(`/rkeeper/comparison${toSearchParams(filter)}`, { cache: 'no-store' });
}
