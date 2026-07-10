'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from '@radix-ui/react-icons';
import { useQueryStates } from 'nuqs';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  overviewSearchParams
} from '@/features/overview/lib/overview-search-params';
import type { DashboardRestaurantOption } from '@/features/overview/lib/restaurant-filter-types';
import { cn } from '@/lib/utils';

async function fetchRestaurantOptions(): Promise<DashboardRestaurantOption[]> {
  const response = await fetch('/api/dashboard/restaurants', { cache: 'no-store' });
  const json = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      typeof json === 'object' && json && 'message' in json
        ? String((json as { message?: unknown }).message)
        : 'Не удалось загрузить список ресторанов';
    throw new Error(message);
  }

  if (
    typeof json === 'object' &&
    json &&
    'options' in json &&
    Array.isArray((json as { options?: unknown }).options)
  ) {
    return (json as { options: DashboardRestaurantOption[] }).options;
  }

  return [];
}

function getSourceLabel(source: DashboardRestaurantOption['source']): string {
  return source === 'iiko' ? 'IIKO' : 'R-Keeper';
}

export function OverviewRestaurantFilter() {
  const [open, setOpen] = React.useState(false);
  const [, startRefresh] = useTransition();
  const [params, setParams] = useQueryStates(overviewSearchParams, {
    history: 'replace',
    shallow: true,
    scroll: false,
    startTransition: startRefresh
  });

  const query = useQuery({
    queryKey: ['dashboard', 'restaurants'],
    queryFn: fetchRestaurantOptions,
    staleTime: 60_000
  });

  const selectedValues = React.useMemo(
    () => new Set((params.restaurants ?? []).filter((value) => value.trim().length > 0)),
    [params.restaurants]
  );

  const selectedOptions = React.useMemo(() => {
    const options = query.data ?? [];
    return options.filter((option) => selectedValues.has(option.value));
  }, [query.data, selectedValues]);

  const setRestaurants = React.useCallback(
    (values: string[]) => {
      void setParams({
        restaurants: values.length > 0 ? values : null
      });
    },
    [setParams]
  );

  const onToggle = React.useCallback(
    (value: string) => {
      const next = new Set(selectedValues);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      setRestaurants(Array.from(next));
    },
    [selectedValues, setRestaurants]
  );

  const onReset = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      setRestaurants([]);
    },
    [setRestaurants]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='border-dashed'>
          {selectedValues.size > 0 ? (
            <span
              role='button'
              tabIndex={0}
              aria-label='Сбросить фильтр ресторанов'
              onClick={onReset}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onReset();
                }
              }}
              className='focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none'
            >
              <Icons.xCircle className='size-4' />
            </span>
          ) : (
            <Icons.workspace className='size-4' />
          )}
          Рестораны
          {selectedValues.size > 0 ? (
            <>
              <Separator orientation='vertical' className='mx-0.5 data-[orientation=vertical]:h-4' />
              <Badge variant='secondary' className='rounded-sm px-1 font-normal lg:hidden'>
                {selectedValues.size}
              </Badge>
              <div className='hidden items-center gap-1 lg:flex'>
                {selectedOptions.length > 2 ? (
                  <Badge variant='secondary' className='rounded-sm px-1 font-normal'>
                    {selectedValues.size} выбрано
                  </Badge>
                ) : (
                  selectedOptions.map((option) => (
                    <Badge
                      variant='secondary'
                      key={option.value}
                      className='rounded-sm px-1 font-normal'
                    >
                      {option.label}
                    </Badge>
                  ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[28rem] max-w-[calc(100vw-2rem)] p-0' align='start'>
        <Command>
          <CommandInput placeholder='Найти ресторан...' />
          <CommandList className='max-h-full'>
            <CommandEmpty>
              {query.isLoading ? 'Загрузка...' : 'Рестораны не найдены.'}
            </CommandEmpty>
            <CommandGroup className='max-h-[20rem] overflow-x-hidden overflow-y-auto'>
              {(query.data ?? []).map((option) => {
                const isSelected = selectedValues.has(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => onToggle(option.value)}
                    className='items-start gap-2 py-2'
                  >
                    <div
                      className={cn(
                        'border-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <CheckIcon />
                    </div>
                    <span className='min-w-0 flex-1 whitespace-normal break-words leading-snug'>
                      {option.label}
                    </span>
                    <Badge variant='outline' className='ml-auto shrink-0 text-[10px] uppercase'>
                      {getSourceLabel(option.source)}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onReset()} className='justify-center text-center'>
                    Сбросить фильтр
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
