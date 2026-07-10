export type DashboardRestaurantSource = 'rkeeper' | 'iiko';

export interface DashboardRestaurantOption {
  value: string;
  label: string;
  source: DashboardRestaurantSource;
  count?: number;
}
