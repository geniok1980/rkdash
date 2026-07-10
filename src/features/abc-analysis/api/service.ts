import { apiClient } from '@/lib/api-client';
import type { AbcFilter, AbcResponse } from './types';

function toSearchParams(filter: AbcFilter): string {
  const params = new URLSearchParams();

  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.restaurants && filter.restaurants.length > 0) {
    params.set('restaurants', filter.restaurants.join(','));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getAbcAnalysis(filter: AbcFilter): Promise<AbcResponse> {
  return apiClient(`/rkeeper/abc-analysis${toSearchParams(filter)}`, { cache: 'no-store' });
}
