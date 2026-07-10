export const comparisonDimensions = [
  'restaurant',
  'dish',
  'category',
  'paymentType',
  'waiter'
] as const;

export type ComparisonDimension = (typeof comparisonDimensions)[number];

export const comparisonPresets = ['day', 'week', 'month', 'quarter'] as const;

export type ComparisonPreset = (typeof comparisonPresets)[number];

export interface ComparisonFilter {
  dimension: ComparisonDimension;
  periodAFrom?: string | null;
  periodATo?: string | null;
  periodBFrom?: string | null;
  periodBTo?: string | null;
  restaurants?: string[] | null;
}

export interface ComparisonRow {
  label: string;
  periodA: number;
  periodB: number;
  delta: number;
  deltaPercent: number | null;
}

export interface ComparisonPeriodSummary {
  from: string;
  to: string;
  total: number;
}

export interface ComparisonResponse {
  dimension: ComparisonDimension;
  periodA: ComparisonPeriodSummary;
  periodB: ComparisonPeriodSummary;
  totals: {
    periodA: number;
    periodB: number;
    delta: number;
    deltaPercent: number | null;
  };
  rows: ComparisonRow[];
}

export const comparisonDimensionLabels: Record<ComparisonDimension, string> = {
  restaurant: 'Ресторан',
  dish: 'Блюдо',
  category: 'Категория',
  paymentType: 'Тип оплаты',
  waiter: 'Официант'
};

export const comparisonPresetLabels: Record<ComparisonPreset, string> = {
  day: 'День к дню',
  week: 'Неделя к неделе',
  month: '30 дней к 30 дням',
  quarter: '90 дней к 90 дням'
};
