import type { DashboardRestaurantSource } from '@/features/overview/lib/restaurant-filter-types';

export function hasSelectedRestaurantSource(
  values: string[] | null | undefined,
  source: DashboardRestaurantSource
): boolean {
  return (values ?? []).some((value) => value.startsWith(`${source}:`));
}
