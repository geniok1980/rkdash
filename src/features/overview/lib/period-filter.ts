import type { SalesDateFilter } from '@/lib/rkeeper-data';

interface SearchParamsLike {
  from?: string | string[];
  to?: string | string[];
  preset?: string | string[];
  anchorDate?: string | string[];
}

export function getAnchorDateFromSearchParams(searchParams?: SearchParamsLike): string | undefined {
  const anchorDate = pickFirst(searchParams?.anchorDate);
  return isValidDate(anchorDate) ? anchorDate : undefined;
}

function pickFirst(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isValidDate(value?: string): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (!isValidDate(value)) return undefined;
  const [y, m, d] = value.split('-').map((p) => Number(p));
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveOverviewDateFilter(searchParams?: SearchParamsLike): SalesDateFilter {
  const from = pickFirst(searchParams?.from);
  const to = pickFirst(searchParams?.to);

  if (isValidDate(from) && isValidDate(to)) {
    return { from, to };
  }

  const preset = pickFirst(searchParams?.preset) ?? 'day';
  const anchorDate = pickFirst(searchParams?.anchorDate);
  const end = parseIsoDate(anchorDate) ?? new Date();
  end.setHours(0, 0, 0, 0);
  const start =
    preset === 'day'
      ? end
      : preset === 'month'
        ? addDays(end, -29)
        : preset === 'year'
          ? addDays(end, -364)
          : addDays(end, -6);

  return {
    from: toIsoDate(start),
    to: toIsoDate(end)
  };
}
