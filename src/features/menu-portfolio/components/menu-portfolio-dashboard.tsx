'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import {
  CartesianGrid,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
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
import { menuPortfolioQueryOptions } from '@/features/menu-portfolio/api/queries';
import type {
  MenuPortfolioCategoryRow,
  MenuPortfolioFilter
} from '@/features/menu-portfolio/api/types';
import { menuPortfolioSearchParams } from '@/features/menu-portfolio/lib/menu-portfolio-search-params';
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

type CategorySortKey =
  | 'revenueShareDesc'
  | 'marginDesc'
  | 'quantityShareDesc'
  | 'grossProfitDesc'
  | 'categoryAsc';

const categorySortLabels: Record<CategorySortKey, string> = {
  revenueShareDesc: 'Доля выручки: больше -> меньше',
  marginDesc: 'Маржа: больше -> меньше',
  quantityShareDesc: 'Доля количества: больше -> меньше',
  grossProfitDesc: 'Прибыль: больше -> меньше',
  categoryAsc: 'Категория: А -> Я'
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

const chartConfig = {
  categories: {
    label: 'Категории',
    color: 'var(--chart-1)'
  }
};

export function MenuPortfolioDashboard() {
  const [params] = useQueryStates(menuPortfolioSearchParams, { shallow: true });
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<CategorySortKey>('revenueShareDesc');

  const enabled = Boolean(params.from && params.to);
  const hasIikoSelected = hasSelectedRestaurantSource(params.restaurants, 'iiko');
  const hasRkeeperSelected =
    !params.restaurants?.length || hasSelectedRestaurantSource(params.restaurants, 'rkeeper');

  const filter = React.useMemo(
    (): MenuPortfolioFilter | null => {
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
    ...(filter
      ? menuPortfolioQueryOptions(filter)
      : menuPortfolioQueryOptions({ from: '', to: '' })),
    enabled: enabled && hasRkeeperSelected
  });

  const filteredRows = React.useMemo(() => {
    const rows = query.data?.categories ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    const nextRows =
      normalizedSearch.length === 0
        ? rows
        : rows.filter((row) => {
            const haystack =
              `${row.category} ${row.categoryPath} ${row.topDishes.join(' ')}`.toLocaleLowerCase(
                'ru-RU'
              );
            return haystack.includes(normalizedSearch);
          });

    return nextRows.toSorted((a, b) => {
      if (sortBy === 'marginDesc') {
        return (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY);
      }
      if (sortBy === 'quantityShareDesc') return b.quantityShare - a.quantityShare;
      if (sortBy === 'grossProfitDesc') return b.grossProfit - a.grossProfit;
      if (sortBy === 'categoryAsc') return a.category.localeCompare(b.category, 'ru');
      return b.revenueShare - a.revenueShare;
    });
  }, [query.data?.categories, search, sortBy]);

  const chartRows = React.useMemo(
    () =>
      filteredRows.map((row) => ({
        ...row,
        zValue: Math.max(row.quantityShare, 1)
      })),
    [filteredRows]
  );

  const leaders = React.useMemo(() => {
    const rows = query.data?.categories ?? [];
    return {
      revenue: rows[0] ?? null,
      margin: rows
        .toSorted(
          (a, b) =>
            (b.marginPct ?? Number.NEGATIVE_INFINITY) - (a.marginPct ?? Number.NEGATIVE_INFINITY)
        )
        .find((row) => row.revenue > 0) ?? null,
      quantity: rows.toSorted((a, b) => b.quantityShare - a.quantityShare)[0] ?? null
    };
  }, [query.data?.categories]);

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Выберите период</AlertTitle>
        <AlertDescription>
          Портфельный анализ показывает, какие категории держат выручку, объем продаж и маржу.
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
          Портфельный анализ меню сейчас считается только по данным R-Keeper.
        </AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Портфельный анализ меню</CardTitle>
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
        <AlertTitle>Не удалось построить портфельный анализ</AlertTitle>
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
        <MetricCard title='Валовая прибыль' value={formatRub(query.data.totals.grossProfit)} />
        <MetricCard title='Маржа, %' value={formatPercent(query.data.totals.marginPct)} />
        <MetricCard title='Категорий' value={query.data.totals.categoriesCount} />
        <MetricCard title='Блюд в анализе' value={query.data.totals.dishesCount} />
      </div>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>Лидер по выручке</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='font-semibold'>{leaders.revenue?.category ?? '—'}</div>
            <div className='text-sm text-muted-foreground'>
              Доля выручки: {formatPercent(leaders.revenue?.revenueShare ?? null)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Лидер по марже</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='font-semibold'>{leaders.margin?.category ?? '—'}</div>
            <div className='text-sm text-muted-foreground'>
              Маржа: {formatPercent(leaders.margin?.marginPct ?? null)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Лидер по объему</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='font-semibold'>{leaders.quantity?.category ?? '—'}</div>
            <div className='text-sm text-muted-foreground'>
              Доля количества: {formatPercent(leaders.quantity?.quantityShare ?? null)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Пузырьковая карта категорий</CardTitle>
          <div className='text-sm text-muted-foreground'>
            Ось X показывает долю выручки, ось Y — маржу, размер пузыря — долю количества продаж.
          </div>
        </CardHeader>
        <CardContent>
          {chartRows.length === 0 ? (
            <div className='text-sm text-muted-foreground'>Нет данных для отображения.</div>
          ) : (
            <ChartContainer config={chartConfig} className='aspect-auto h-[520px] w-full'>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 16, left: 12 }}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis
                  type='number'
                  dataKey='revenueShare'
                  name='Доля выручки'
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                />
                <YAxis
                  type='number'
                  dataKey='marginPct'
                  name='Маржа'
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                />
                <ZAxis type='number' dataKey='zValue' range={[120, 1600]} />
                <ChartTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const first = payload?.[0]?.payload as MenuPortfolioCategoryRow | undefined;
                        return first?.category ?? '';
                      }}
                      formatter={(_, __, item) => {
                        const row = item.payload as MenuPortfolioCategoryRow;
                        return (
                          <div className='space-y-1'>
                            <div className='font-medium'>{row.category}</div>
                            <div className='text-muted-foreground'>Выручка: {formatRub(row.revenue)}</div>
                            <div className='text-muted-foreground'>
                              Доля выручки: {formatPercent(row.revenueShare)}
                            </div>
                            <div className='text-muted-foreground'>Маржа: {formatPercent(row.marginPct)}</div>
                            <div className='text-muted-foreground'>
                              Доля количества: {formatPercent(row.quantityShare)}
                            </div>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Scatter data={chartRows} fill='var(--color-categories)'>
                  <LabelList dataKey='category' position='top' fontSize={11} />
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-1'>
            <CardTitle>Категории меню</CardTitle>
            <div className='text-sm text-muted-foreground'>
              Таблица по доле выручки, доле количества и маржинальности.
            </div>
          </div>

          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Поиск по категории или блюдам'
              className='md:max-w-sm'
            />

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as CategorySortKey)}>
              <SelectTrigger className='w-full md:w-[260px]'>
                <SelectValue placeholder='Сортировка' />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categorySortLabels).map(([value, label]) => (
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
                  <TableHead>Категория</TableHead>
                  <TableHead className='text-right'>Доля выручки</TableHead>
                  <TableHead className='text-right'>Доля количества</TableHead>
                  <TableHead className='text-right'>Выручка</TableHead>
                  <TableHead className='text-right'>Прибыль</TableHead>
                  <TableHead className='text-right'>Маржа</TableHead>
                  <TableHead className='text-right'>Блюд</TableHead>
                  <TableHead>Топ блюд</TableHead>
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
                    <TableRow key={row.category}>
                      <TableCell>
                        <div className='font-medium'>{row.category}</div>
                        <div className='text-xs text-muted-foreground'>{row.categoryPath}</div>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        <Badge variant='secondary'>{formatPercent(row.revenueShare)}</Badge>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatPercent(row.quantityShare)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.revenue)}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatRub(row.grossProfit)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatPercent(row.marginPct)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{row.dishesCount}</TableCell>
                      <TableCell>{row.topDishes.join(', ') || '—'}</TableCell>
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
