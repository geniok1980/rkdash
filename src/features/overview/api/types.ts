export interface SalesDateFilter {
  from?: string | null;
  to?: string | null;
}

export interface SalesSummary {
  totalRevenue: number;
  totalChecks: number;
  totalItems: number;
}

export interface DailySalesPoint {
  date: string;
  revenue: number;
  checks: number;
}

export interface CategorySalesItem {
  category: string;
  revenue: number;
}

export interface PaymentTypeSalesItem {
  paymentType: string;
  revenue: number;
}

export interface WaiterRevenueItem {
  waiter: string;
  revenue: number;
}

export interface TopDishItem {
  name: string;
  quantity: number;
  revenue: number;
}
