'use client';

import * as React from 'react';
import { useTransition } from 'react';
import type { DateRange } from 'react-day-picker';
import { useQueryStates } from 'nuqs';
import { Icons } from '@/components/icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  overviewSearchParams,
  type OverviewPreset
} from '@/features/overview/lib/overview-search-params';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
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

function getPresetRange(preset: OverviewPreset, maxDateIso?: string): DateRange {
  const base = parseIsoDate(maxDateIso) ?? new Date();
  const end = new Date(base);
  end.setHours(0, 0, 0, 0);

  const start =
    preset === 'day'
      ? new Date(end)
      : preset === 'week'
        ? addDays(end, -6)
        : preset === 'month'
          ? addDays(end, -29)
          : addDays(end, -364);

  return { from: start, to: end };
}

function formatIsoLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

interface OverviewPeriodFilterProps {
  maxDateIso?: string;
}

export function OverviewPeriodFilter({ maxDateIso }: OverviewPeriodFilterProps) {
  const [isRefreshing, startRefresh] = useTransition();
  const [params, setParams] = useQueryStates(overviewSearchParams, {
    history: 'replace',
    shallow: true,
    scroll: false,
    startTransition: startRefresh
  });

  const hasInitialized = React.useRef(false);
  const hasUserInteracted = React.useRef(false);

  const from = React.useMemo(() => parseIsoDate(params.from), [params.from]);
  const to = React.useMemo(() => parseIsoDate(params.to), [params.to]);
  const presetInUrl = params.preset;
  const activePreset: OverviewPreset | null = presetInUrl ?? null;

  const selectedRange = React.useMemo<DateRange>(() => {
    if (from || to) {
      return { from, to };
    }
    if (activePreset) {
      return getPresetRange(activePreset, maxDateIso);
    }
    return { from: undefined, to: undefined };
  }, [activePreset, from, maxDateIso, to]);
  const [draftRange, setDraftRange] = React.useState<DateRange>(selectedRange);

  React.useEffect(() => {
    setDraftRange(selectedRange);
  }, [selectedRange]);

  React.useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    if (hasUserInteracted.current) return;
    if (params.from || params.to || params.preset) return;

    const day = getPresetRange('day', maxDateIso);
    void setParams({
      from: day.from ? toIsoDate(day.from) : null,
      to: day.to ? toIsoDate(day.to) : null,
      preset: 'day',
      anchorDate: maxDateIso ?? null
    });
  }, [maxDateIso, params.from, params.to, setParams]);

  const applyRangeAndPreset = React.useCallback(
    (next: { from?: Date | null; to?: Date | null; preset: OverviewPreset | null }) => {
      hasUserInteracted.current = true;
      void setParams({
        from: next.from ? toIsoDate(next.from) : null,
        to: next.to ? toIsoDate(next.to) : null,
        preset: next.preset,
        anchorDate: maxDateIso ?? null
      });
    },
    [maxDateIso, setParams]
  );

  const resetPeriod = React.useCallback(
    (event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      hasUserInteracted.current = true;
      setDraftRange({ from: undefined, to: undefined });
      void setParams({
        from: null,
        to: null,
        preset: null,
        anchorDate: maxDateIso ?? null
      });
    },
    [maxDateIso, setParams]
  );

  const applyPreset = React.useCallback(
    (preset: OverviewPreset) => {
      const range = getPresetRange(preset, maxDateIso);
      applyRangeAndPreset({ from: range.from, to: range.to, preset });
    },
    [applyRangeAndPreset, maxDateIso]
  );

  const onSelectRange = React.useCallback(
    (range: DateRange | undefined) => {
      setDraftRange(range ?? { from: undefined, to: undefined });

      if (!range) {
        resetPeriod();
        return;
      }

      if (!range.from || !range.to) {
        return;
      }

      applyRangeAndPreset({
        from: range.from,
        to: range.to,
        preset: null
      });
    },
    [applyRangeAndPreset, resetPeriod]
  );

  const showReset =
    Boolean(params.from || params.to || presetInUrl) ||
    activePreset === 'month' ||
    activePreset === 'year';
  const label = React.useMemo(() => {
    if (params.from && params.to) {
      if (params.from === params.to) return formatIsoLabel(params.from);
      return `${formatIsoLabel(params.from)} - ${formatIsoLabel(params.to)}`;
    }

    if (activePreset) {
      const range = getPresetRange(activePreset, maxDateIso);
      if (range.from && range.to) {
        const fromIso = toIsoDate(range.from);
        const toIso = toIsoDate(range.to);
        if (fromIso === toIso) return formatIsoLabel(fromIso);
        return `${formatIsoLabel(fromIso)} - ${formatIsoLabel(toIso)}`;
      }
    }

    return 'Выбрать период';
  }, [activePreset, maxDateIso, params.from, params.to]);

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <div className='flex items-center rounded-md border p-1'>
        <Button
          variant={activePreset === 'day' ? 'default' : 'ghost'}
          size='sm'
          onClick={() => applyPreset('day')}
        >
          День
        </Button>
        <Button
          variant={activePreset === 'week' ? 'default' : 'ghost'}
          size='sm'
          onClick={() => applyPreset('week')}
        >
          Неделя
        </Button>
        <Button
          variant={activePreset === 'month' ? 'default' : 'ghost'}
          size='sm'
          onClick={() => applyPreset('month')}
        >
          Месяц
        </Button>
        <Button
          variant={activePreset === 'year' ? 'default' : 'ghost'}
          size='sm'
          onClick={() => applyPreset('year')}
        >
          Год
        </Button>
      </div>

      {isRefreshing ? (
        <span className='text-muted-foreground text-xs tabular-nums'>Обновление…</span>
      ) : null}

      <div className='flex items-center rounded-md border'>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type='button'
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'min-w-[240px] justify-start rounded-none'
              )}
            >
              <Icons.calendar className='mr-2 size-4' />
              <span className='truncate'>{label}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className='w-auto p-0' align='end'>
            <Calendar
              initialFocus
              mode='range'
              numberOfMonths={2}
              selected={draftRange}
              onSelect={onSelectRange}
              disabled={
                maxDateIso && /^\d{4}-\d{2}-\d{2}$/.test(maxDateIso)
                  ? (date) => date > (parseIsoDate(maxDateIso) ?? date)
                  : undefined
              }
            />
          </PopoverContent>
        </Popover>

        {showReset ? (
          <>
            <Separator orientation='vertical' className='mx-0.5 data-[orientation=vertical]:h-6' />
            <button
              type='button'
              aria-label='Сбросить период'
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}
              onClick={(event) => resetPeriod(event)}
            >
              <Icons.xCircle className='size-4' />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
