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
import {
  abcPresetLabels,
  type AbcPreset
} from '@/features/abc-analysis/api/types';
import { abcAnalysisSearchParams } from '@/features/abc-analysis/lib/abc-analysis-search-params';
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

function buildPresetRange(preset: AbcPreset, maxDateIso?: string) {
  const end = parseIsoDate(maxDateIso) ?? new Date();
  end.setHours(0, 0, 0, 0);

  const length =
    preset === 'week' ? 7
    : preset === 'month' ? 30
    : 90;

  const start = addDays(end, -(length - 1));

  return {
    preset,
    from: toIsoDate(start),
    to: toIsoDate(end)
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

function DateRangeControl({
  value,
  onChange
}: {
  value: DateRange;
  onChange: (range: DateRange | undefined) => void;
}) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-muted-foreground text-xs'>Период</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'min-w-[280px] justify-start'
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

interface AbcAnalysisFiltersProps {
  maxDateIso?: string;
}

export function AbcAnalysisFilters({ maxDateIso }: AbcAnalysisFiltersProps) {
  const [mounted, setMounted] = React.useState(false);
  const [, startRefresh] = useTransition();
  const [params, setParams] = useQueryStates(abcAnalysisSearchParams, {
    history: 'replace',
    shallow: true,
    scroll: false,
    startTransition: startRefresh
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (params.from && params.to) return;

    const defaults = buildPresetRange('month', maxDateIso);
    void setParams({
      preset: params.preset ?? defaults.preset,
      from: params.from ?? defaults.from,
      to: params.to ?? defaults.to
    });
  }, [maxDateIso, params.from, params.to, params.preset, setParams]);

  const period = React.useMemo<DateRange>(
    () => ({
      from: parseIsoDate(params.from),
      to: parseIsoDate(params.to)
    }),
    [params.from, params.to]
  );

  const setRange = React.useCallback(
    (range: DateRange | undefined) => {
      if (!range?.from || !range.to) return;

      void setParams({
        preset: null,
        from: toIsoDate(range.from),
        to: toIsoDate(range.to)
      });
    },
    [setParams]
  );

  if (!mounted) return null;

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='flex flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>Пресет</span>
        <Select
          value={params.preset ?? 'month'}
          onValueChange={(value) => {
            const preset = value as AbcPreset;
            const next = buildPresetRange(preset, maxDateIso);
            void setParams({
              preset: next.preset,
              from: next.from,
              to: next.to
            });
          }}
        >
          <SelectTrigger size='sm' className='min-w-[220px]'>
            <SelectValue placeholder='Выберите пресет' />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(abcPresetLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DateRangeControl value={period} onChange={setRange} />

      <div className='flex items-center pb-0.5'>
        <OverviewRestaurantFilter />
      </div>

      <div className='flex items-center pb-0.5'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            const defaults = buildPresetRange('month', maxDateIso);
            void setParams({
              preset: defaults.preset,
              from: defaults.from,
              to: defaults.to,
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
