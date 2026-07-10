export interface SalesDateFilter {
  from?: string | null;
  to?: string | null;
  restaurants?: string[] | null;
}

export interface SalesSummary {
  totalRevenue: number;
  totalChecks: number | null;
  averageCheck: number | null;
  totalItems: number;
  unavailableMetrics?: Array<'checks' | 'averageCheck'>;
  partialMetrics?: Array<'checks' | 'averageCheck'>;
  sources?: Array<'rkeeper' | 'iiko'>;
}

export interface DailySalesPoint {
  date: string;
  revenue: number;
  checks: number | null;
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
