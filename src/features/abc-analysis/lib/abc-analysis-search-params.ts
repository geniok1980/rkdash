import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs';
import { abcPresets } from '@/features/abc-analysis/api/types';

export const abcAnalysisSearchParams = {
  from: parseAsString,
  to: parseAsString,
  preset: parseAsStringEnum([...abcPresets]),
  restaurants: parseAsArrayOf(parseAsString, ',')
};
