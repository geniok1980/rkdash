'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { abcAnalysisQueryOptions } from '@/features/abc-analysis/api/queries';
import type { AbcDishRow, AbcFilter } from '@/features/abc-analysis/api/types';
import { AbcMatrix } from '@/features/abc-analysis/components/abc-matrix';
import { GoList } from '@/features/abc-analysis/components/go-list';
import { abcAnalysisSearchParams } from '@/features/abc-analysis/lib/abc-analysis-search-params';
import { hasSelectedRestaurantSource } from '@/features/overview/lib/restaurant-selection-source';

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

function formatRub(value: number) {
  return rubFormatter.format(value);
}

function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatShortPeriod(from: string, to: string) {
  if (from === to) return from;
  return `${from} - ${to}`;
}

function getCellBadgeVariant(cell: AbcDishRow['cell']) {
  if (cell === 'AA') return 'default';
  if (cell === 'AB' || cell === 'BA' || cell === 'BB' || cell === 'CA') return 'secondary';
  return 'outline';
}

type DishSortKey = 'priority' | 'revenueDesc' | 'profitDesc' | 'marginDesc' | 'dishAsc';

const dishSortLabels: Record<DishSortKey, string> = {
  priority: 'Приоритет Go-list',
  revenueDesc: 'Выручка: больше -> меньше',
  profitDesc: 'Прибыль: больше -> меньше',
  marginDesc: 'Маржа: больше -> меньше',
  dishAsc: 'Блюдо: А -> Я'
};

function MetricCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-semibold tabular-nums'>{value}</div>
      </CardContent>
    </Card>
  );
}

export function AbcAnalysisDashboard() {
  const [params] = useQueryStates(abcAnalysisSearchParams, { shallow: true });
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<DishSortKey>('priority');

  const enabled = Boolean(params.from && params.to);
  const hasIikoSelected = hasSelectedRestaurantSource(params.restaurants, 'iiko');
  const hasRkeeperSelected =
    !params.restaurants?.length || hasSelectedRestaurantSource(params.restaurants, 'rkeeper');

  const filter = React.useMemo(
    (): AbcFilter | null => {
      if (!params.from || !params.to) return null;

      return {
        from: params.from,
        to: params.to,
        restaurants: params.restaurants ?? null
      };
    },
    [params.from, params.to, params.restaurants]
  );

  const query = useQuery({
    ...(filter ? abcAnalysisQueryOptions(filter) : abcAnalysisQueryOptions({ from: '', to: '' })),
    enabled: enabled && hasRkeeperSelected
  });

  const filteredRows = React.useMemo(() => {
    const rows = query.data?.dishes ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    const nextRows =
      normalizedSearch.length === 0
        ? rows
        : rows.filter((row) => {
            const haystack = `${row.dish} ${row.category} ${row.cell}`.toLocaleLowerCase('ru-RU');
            return haystack.includes(normalizedSearch);
          });

    return nextRows.toSorted((a, b) => {
      if (sortBy === 'revenueDesc') return b.revenue - a.revenue;
      if (sortBy === 'profitDesc') return b.grossProfit - a.grossProfit;
      if (sortBy === 'marginDesc') return (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY);
      if (sortBy === 'dishAsc') return a.dish.localeCompare(b.dish, 'ru');
      const priorityOrder = ['focus', 'support', 'review', 'stop'];
      const actionDelta =
        priorityOrder.indexOf(a.goListAction) - priorityOrder.indexOf(b.goListAction);
      if (actionDelta !== 0) return actionDelta;
      if (a.cell !== b.cell) return a.cell.localeCompare(b.cell, 'ru');
      return b.grossProfit - a.grossProfit;
    });
  }, [query.data?.dishes, search, sortBy]);

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Выберите период</AlertTitle>
        <AlertDescription>
          ABC-анализ строится по продажам и валовой прибыли блюд за выбранный диапазон дат.
        </AlertDescription>
      </Alert>
    );
  }

  if (hasIikoSelected && !hasRkeeperSelected) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Отчет пока только для R-Keeper</AlertTitle>
        <AlertDescription>
          Двойной ABC-анализ сейчас считается только по данным R-Keeper.
        </AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Двойной ABC-анализ</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>Загрузка...</CardContent>
      </Card>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Не удалось построить ABC-анализ</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data) return null;

  return (
    <div className='space-y-4'>
      {hasIikoSelected ? (
        <Alert>
          <Icons.info className='h-4 w-4' />
          <AlertTitle>Частичное покрытие данных</AlertTitle>
          <AlertDescription>
            В фильтре выбраны рестораны IIKO, но отчет посчитан только по R-Keeper.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'>
        <MetricCard
          title={`Период (${formatShortPeriod(query.data.period.from, query.data.period.to)})`}
          value={formatRub(query.data.totals.revenue)}
        />
        <MetricCard title='Себестоимость' value={formatRub(query.data.totals.cost)} />
        <MetricCard title='Валовая прибыль' value={formatRub(query.data.totals.grossProfit)} />
        <MetricCard title='Маржа, %' value={formatPercent(query.data.totals.marginPct)} />
        <MetricCard title='Блюд в анализе' value={query.data.totals.dishesCount} />
      </div>

      <AbcMatrix cells={query.data.matrix} />
      <GoList groups={query.data.goList} />

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-1'>
            <CardTitle>Детализация по блюдам</CardTitle>
            <div className='text-sm text-muted-foreground'>
              Полный список позиций с классом по выручке и прибыли.
            </div>
          </div>

          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Поиск по блюду, категории или ячейке'
              className='md:max-w-sm'
            />

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as DishSortKey)}>
              <SelectTrigger className='w-full md:w-[250px]'>
                <SelectValue placeholder='Сортировка' />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(dishSortLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Блюдо</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Ячейка</TableHead>
                  <TableHead className='text-right'>Выручка</TableHead>
                  <TableHead className='text-right'>Себестоимость</TableHead>
                  <TableHead className='text-right'>Прибыль</TableHead>
                  <TableHead className='text-right'>Маржа</TableHead>
                  <TableHead className='text-right'>Кол-во</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className='text-center text-muted-foreground'>
                      Ничего не найдено.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={`${row.dish}-${row.category}-${row.cell}`}>
                      <TableCell>
                        <div className='font-medium'>{row.dish}</div>
                        <div className='text-xs text-muted-foreground'>{row.recommendation}</div>
                      </TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>
                        <Badge variant={getCellBadgeVariant(row.cell)}>{row.cell}</Badge>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.revenue)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.cost)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.grossProfit)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatPercent(row.marginPct)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{Math.round(row.quantity)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
