import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs';

export const overviewSearchParams = {
  from: parseAsString,
  to: parseAsString,
  preset: parseAsStringEnum(['day', 'week', 'month', 'year']),
  anchorDate: parseAsString,
  restaurants: parseAsArrayOf(parseAsString, ',')
};

export type OverviewPreset = 'day' | 'week' | 'month' | 'year';
