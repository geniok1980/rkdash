import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs';
import { comparisonDimensions, comparisonPresets } from '@/features/comparison/api/types';

export const comparisonSearchParams = {
  preset: parseAsStringEnum([...comparisonPresets]),
  dimension: parseAsStringEnum([...comparisonDimensions]),
  periodAFrom: parseAsString,
  periodATo: parseAsString,
  periodBFrom: parseAsString,
  periodBTo: parseAsString,
  restaurants: parseAsArrayOf(parseAsString, ',')
};
