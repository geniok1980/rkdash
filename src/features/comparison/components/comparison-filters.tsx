'use client';

import * as React from 'react';
import { useTransition } from 'react';
import type { DateRange } from 'react-day-picker';
import { useQueryStates } from 'nuqs';
import { Icons } from '@/components/icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OverviewRestaurantFilter } from '@/features/overview/components/overview-restaurant-filter';
import { comparisonSearchParams } from '@/features/comparison/lib/comparison-search-params';
import {
  comparisonDimensionLabels,
  comparisonPresetLabels,
  type ComparisonPreset,
  type ComparisonDimension
} from '@/features/comparison/api/types';
import { cn } from '@/lib/utils';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildPresetRanges(preset: ComparisonPreset, maxDateIso?: string) {
  const base = parseIsoDate(maxDateIso) ?? new Date();
  base.setHours(0, 0, 0, 0);

  const length =
    preset === 'day' ? 1
    : preset === 'week' ? 7
    : preset === 'month' ? 30
    : 90;

  const periodATo = base;
  const periodAFrom = addDays(base, -(length - 1));
  const periodBTo = addDays(periodAFrom, -1);
  const periodBFrom = addDays(periodBTo, -(length - 1));

  return {
    preset,
    dimension: 'category' as ComparisonDimension,
    periodAFrom: toIsoDate(periodAFrom),
    periodATo: toIsoDate(periodATo),
    periodBFrom: toIsoDate(periodBFrom),
    periodBTo: toIsoDate(periodBTo)
  };
}

function formatIsoLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

function formatRangeLabel(from?: string | null, to?: string | null): string {
  if (!from || !to) return 'Выбрать период';
  if (from === to) return formatIsoLabel(from);
  return `${formatIsoLabel(from)} - ${formatIsoLabel(to)}`;
}

function buildDefaultRanges(maxDateIso?: string) {
  return buildPresetRanges('week', maxDateIso);
}

function DateRangeControl({
  label,
  value,
  onChange
}: {
  label: string;
  value: DateRange;
  onChange: (range: DateRange | undefined) => void;
}) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'min-w-[250px] justify-start'
            )}
          >
            <Icons.calendar className='mr-2 size-4' />
            <span className='truncate'>
              {formatRangeLabel(
                value.from ? toIsoDate(value.from) : null,
                value.to ? toIsoDate(value.to) : null
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <Calendar
            mode='range'
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface ComparisonFiltersProps {
  maxDateIso?: string;
}

export function ComparisonFilters({ maxDateIso }: ComparisonFiltersProps) {
  const [mounted, setMounted] = React.useState(false);
  const [, startRefresh] = useTransition();
  const [params, setParams] = useQueryStates(comparisonSearchParams, {
    history: 'replace',
    shallow: true,
    scroll: false,
    startTransition: startRefresh
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (
      params.dimension &&
      params.periodAFrom &&
      params.periodATo &&
      params.periodBFrom &&
      params.periodBTo
    ) {
      return;
    }

    const defaults = buildDefaultRanges(maxDateIso);
    void setParams({
      preset: params.preset ?? defaults.preset,
      dimension: params.dimension ?? defaults.dimension,
      periodAFrom: params.periodAFrom ?? defaults.periodAFrom,
      periodATo: params.periodATo ?? defaults.periodATo,
      periodBFrom: params.periodBFrom ?? defaults.periodBFrom,
      periodBTo: params.periodBTo ?? defaults.periodBTo
    });
  }, [
    maxDateIso,
    params.preset,
    params.dimension,
    params.periodAFrom,
    params.periodATo,
    params.periodBFrom,
    params.periodBTo,
    setParams
  ]);

  const periodA = React.useMemo<DateRange>(
    () => ({
      from: parseIsoDate(params.periodAFrom),
      to: parseIsoDate(params.periodATo)
    }),
    [params.periodAFrom, params.periodATo]
  );

  const periodB = React.useMemo<DateRange>(
    () => ({
      from: parseIsoDate(params.periodBFrom),
      to: parseIsoDate(params.periodBTo)
    }),
    [params.periodBFrom, params.periodBTo]
  );

  const setRange = React.useCallback(
    (key: 'A' | 'B', range: DateRange | undefined) => {
      if (!range?.from || !range.to) return;

      void setParams(
        key === 'A'
          ? {
              preset: null,
              periodAFrom: toIsoDate(range.from),
              periodATo: toIsoDate(range.to)
            }
          : {
              preset: null,
              periodBFrom: toIsoDate(range.from),
              periodBTo: toIsoDate(range.to)
            }
      );
    },
    [setParams]
  );

  if (!mounted) return null;

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='flex flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>Пресет</span>
        <Select
          value={params.preset ?? 'week'}
          onValueChange={(value) => {
            const preset = value as ComparisonPreset;
            const next = buildPresetRanges(preset, maxDateIso);
            void setParams({
              preset: next.preset,
              periodAFrom: next.periodAFrom,
              periodATo: next.periodATo,
              periodBFrom: next.periodBFrom,
              periodBTo: next.periodBTo
            });
          }}
        >
          <SelectTrigger size='sm' className='min-w-[220px]'>
            <SelectValue placeholder='Выберите пресет' />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(comparisonPresetLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='flex flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>Группировка</span>
        <Select
          value={params.dimension ?? 'category'}
          onValueChange={(value) => void setParams({ dimension: value as ComparisonDimension })}
        >
          <SelectTrigger size='sm' className='min-w-[220px]'>
            <SelectValue placeholder='Выберите группировку' />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(comparisonDimensionLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DateRangeControl label='Период A' value={periodA} onChange={(range) => setRange('A', range)} />
      <DateRangeControl label='Период B' value={periodB} onChange={(range) => setRange('B', range)} />

      <div className='flex items-center pb-0.5'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            if (!params.periodAFrom || !params.periodATo || !params.periodBFrom || !params.periodBTo) {
              return;
            }

            void setParams({
              preset: null,
              periodAFrom: params.periodBFrom,
              periodATo: params.periodBTo,
              periodBFrom: params.periodAFrom,
              periodBTo: params.periodATo
            });
          }}
        >
          Поменять A/B
        </Button>
      </div>

      <div className='flex items-center pb-0.5'>
        <OverviewRestaurantFilter />
      </div>

      <div className='flex items-center pb-0.5'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            const defaults = buildDefaultRanges(maxDateIso);
            void setParams({
              preset: defaults.preset,
              dimension: defaults.dimension,
              periodAFrom: defaults.periodAFrom,
              periodATo: defaults.periodATo,
              periodBFrom: defaults.periodBFrom,
              periodBTo: defaults.periodBTo,
              restaurants: null
            });
          }}
        >
          Сбросить
        </Button>
      </div>
    </div>
  );
}
