export const menuPortfolioPresets = ['week', 'month', 'quarter'] as const;

export type MenuPortfolioPreset = (typeof menuPortfolioPresets)[number];

export interface MenuPortfolioFilter {
  from?: string | null;
  to?: string | null;
  restaurants?: string[] | null;
}

export interface MenuPortfolioCategoryRow {
  category: string;
  categoryPath: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number | null;
  quantity: number;
  dishesCount: number;
  revenueShare: number;
  quantityShare: number;
  topDishes: string[];
}

export interface MenuPortfolioResponse {
  period: {
    from: string;
    to: string;
  };
  totals: {
    revenue: number;
    cost: number;
    grossProfit: number;
    quantity: number;
    categoriesCount: number;
    dishesCount: number;
    marginPct: number | null;
  };
  categories: MenuPortfolioCategoryRow[];
}

export const menuPortfolioPresetLabels: Record<MenuPortfolioPreset, string> = {
  week: 'Последние 7 дней',
  month: 'Последние 30 дней',
  quarter: 'Последние 90 дней'
};
