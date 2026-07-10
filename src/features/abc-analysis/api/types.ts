export const abcPresets = ['week', 'month', 'quarter'] as const;

export type AbcPreset = (typeof abcPresets)[number];
export type AbcBucket = 'A' | 'B' | 'C';
export type AbcGoListAction = 'focus' | 'support' | 'review' | 'stop';
export type AbcCellCode = `${AbcBucket}${AbcBucket}`;

export interface AbcFilter {
  from?: string | null;
  to?: string | null;
  restaurants?: string[] | null;
}

export interface AbcDishRow {
  dish: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number | null;
  quantity: number;
  revenueShare: number;
  cumulativeRevenueShare: number;
  revenueClass: AbcBucket;
  grossProfitShare: number;
  cumulativeGrossProfitShare: number;
  grossProfitClass: AbcBucket;
  cell: AbcCellCode;
  cellTitle: string;
  recommendation: string;
  goListAction: AbcGoListAction;
}

export interface AbcMatrixCell {
  key: AbcCellCode;
  revenueClass: AbcBucket;
  grossProfitClass: AbcBucket;
  title: string;
  recommendation: string;
  dishesCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  quantity: number;
  marginPct: number | null;
  topDishes: string[];
}

export interface AbcGoListGroup {
  action: AbcGoListAction;
  title: string;
  description: string;
  items: AbcDishRow[];
}

export interface AbcResponse {
  period: {
    from: string;
    to: string;
  };
  totals: {
    revenue: number;
    cost: number;
    grossProfit: number;
    quantity: number;
    dishesCount: number;
    marginPct: number | null;
  };
  matrix: AbcMatrixCell[];
  goList: AbcGoListGroup[];
  dishes: AbcDishRow[];
}

export const abcPresetLabels: Record<AbcPreset, string> = {
  week: 'Последние 7 дней',
  month: 'Последние 30 дней',
  quarter: 'Последние 90 дней'
};
