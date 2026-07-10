import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs';
import { menuPortfolioPresets } from '@/features/menu-portfolio/api/types';

export const menuPortfolioSearchParams = {
  from: parseAsString,
  to: parseAsString,
  preset: parseAsStringEnum([...menuPortfolioPresets]),
  restaurants: parseAsArrayOf(parseAsString, ',')
};
