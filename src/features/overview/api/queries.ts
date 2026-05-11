import { queryOptions } from '@tanstack/react-query';
import type { SalesDateFilter } from './types';
import {
  getCategorySales,
  getDailySales,
  getPaymentTypeSales,
  getSalesSummary,
  getTopDishes,
  getWaitersRevenue
} from './service';

export const rkeeperKeys = {
  all: ['rkeeper'] as const,
  summary: (filter: SalesDateFilter) => [...rkeeperKeys.all, 'summary', filter] as const,
  dailySales: (filter: SalesDateFilter) => [...rkeeperKeys.all, 'dailySales', filter] as const,
  categorySales: (filter: SalesDateFilter) =>
    [...rkeeperKeys.all, 'categorySales', filter] as const,
  paymentTypeSales: (filter: SalesDateFilter) =>
    [...rkeeperKeys.all, 'paymentTypeSales', filter] as const,
  waitersRevenue: (filter: SalesDateFilter) =>
    [...rkeeperKeys.all, 'waitersRevenue', filter] as const,
  topDishes: (filter: SalesDateFilter) => [...rkeeperKeys.all, 'topDishes', filter] as const
};

export const salesSummaryOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.summary(filter),
    queryFn: () => getSalesSummary(filter),
    staleTime: 15_000
  });

export const dailySalesOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.dailySales(filter),
    queryFn: () => getDailySales(filter),
    staleTime: 15_000
  });

export const categorySalesOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.categorySales(filter),
    queryFn: () => getCategorySales(filter),
    staleTime: 15_000
  });

export const paymentTypeSalesOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.paymentTypeSales(filter),
    queryFn: () => getPaymentTypeSales(filter),
    staleTime: 15_000
  });

export const waitersRevenueOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.waitersRevenue(filter),
    queryFn: () => getWaitersRevenue(filter),
    staleTime: 15_000
  });

export const topDishesOptions = (filter: SalesDateFilter) =>
  queryOptions({
    queryKey: rkeeperKeys.topDishes(filter),
    queryFn: () => getTopDishes(filter),
    staleTime: 15_000
  });
