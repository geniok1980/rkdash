import { apiClient } from '@/lib/api-client';
import type {
  CategorySalesItem,
  DailySalesPoint,
  PaymentTypeSalesItem,
  SalesDateFilter,
  SalesSummary,
  TopDishItem,
  WaiterRevenueItem
} from './types';

function toSearchParams(filter: SalesDateFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getSalesSummary(filter: SalesDateFilter): Promise<SalesSummary> {
  return apiClient(`/rkeeper/summary${toSearchParams(filter)}`, { cache: 'no-store' });
}

export async function getDailySales(filter: SalesDateFilter): Promise<DailySalesPoint[]> {
  return apiClient(`/rkeeper/daily-sales${toSearchParams(filter)}`, { cache: 'no-store' });
}

export async function getCategorySales(filter: SalesDateFilter): Promise<CategorySalesItem[]> {
  return apiClient(`/rkeeper/category-sales${toSearchParams(filter)}`, { cache: 'no-store' });
}

export async function getPaymentTypeSales(
  filter: SalesDateFilter
): Promise<PaymentTypeSalesItem[]> {
  return apiClient(`/rkeeper/payment-types${toSearchParams(filter)}`, { cache: 'no-store' });
}

export async function getWaitersRevenue(filter: SalesDateFilter): Promise<WaiterRevenueItem[]> {
  return apiClient(`/rkeeper/waiters-revenue${toSearchParams(filter)}`, { cache: 'no-store' });
}

export async function getTopDishes(filter: SalesDateFilter): Promise<TopDishItem[]> {
  return apiClient(`/rkeeper/top-dishes${toSearchParams(filter)}`, { cache: 'no-store' });
}
