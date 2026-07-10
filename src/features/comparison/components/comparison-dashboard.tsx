'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { comparisonQueryOptions } from '@/features/comparison/api/queries';
import {
  comparisonDimensionLabels,
  type ComparisonFilter,
  type ComparisonRow
} from '@/features/comparison/api/types';
import { comparisonSearchParams } from '@/features/comparison/lib/comparison-search-params';
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

function toCsvValue(value: string | number) {
  const text = String(value);
  if (/[;"\n,]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type ComparisonSortKey = 'deltaDesc' | 'deltaAsc' | 'growthDesc' | 'revenueBDesc' | 'labelAsc';

const comparisonSortLabels: Record<ComparisonSortKey, string> = {
  deltaDesc: 'Дельта: больше -> меньше',
  deltaAsc: 'Дельта: меньше -> больше',
  growthDesc: 'Изменение %: больше -> меньше',
  revenueBDesc: 'Период B: больше -> меньше',
  labelAsc: 'Название: А -> Я'
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
  delta: {
    label: 'Дельта',
    color: 'var(--chart-1)'
  }
};

export function ComparisonDashboard() {
  const [params] = useQueryStates(comparisonSearchParams, { shallow: true });
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<ComparisonSortKey>('deltaDesc');

  const enabled = Boolean(
    params.dimension &&
      params.periodAFrom &&
      params.periodATo &&
      params.periodBFrom &&
      params.periodBTo
  );

  const hasIikoSelected = hasSelectedRestaurantSource(params.restaurants, 'iiko');
  const hasRkeeperSelected =
    !params.restaurants?.length || hasSelectedRestaurantSource(params.restaurants, 'rkeeper');

  const filter = React.useMemo(
    (): ComparisonFilter | null => {
      if (
        !params.dimension ||
        !params.periodAFrom ||
        !params.periodATo ||
        !params.periodBFrom ||
        !params.periodBTo
      ) {
        return null;
      }

      return {
        dimension: params.dimension,
        periodAFrom: params.periodAFrom,
        periodATo: params.periodATo,
        periodBFrom: params.periodBFrom,
        periodBTo: params.periodBTo,
        restaurants: params.restaurants ?? null
      };
    },
    [
      params.dimension,
      params.periodAFrom,
      params.periodATo,
      params.periodBFrom,
      params.periodBTo,
      params.restaurants
    ]
  );

  const query = useQuery({
    ...(filter ? comparisonQueryOptions(filter) : comparisonQueryOptions({
      dimension: 'category',
      periodAFrom: '',
      periodATo: '',
      periodBFrom: '',
      periodBTo: '',
      restaurants: null
    })),
    enabled: enabled && hasRkeeperSelected
  });

  const chartRows = React.useMemo(() => {
    const rows = query.data?.rows ?? [];
    return rows
      .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 12)
      .toReversed();
  }, [query.data?.rows]);

  const chartHeight = Math.max(320, chartRows.length * 34);
  const result = query.data;
  const dimensionLabel = result ? comparisonDimensionLabels[result.dimension] : '';
  const rows = React.useMemo(() => {
    const sourceRows = result?.rows ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    const filteredRows =
      normalizedSearch.length === 0
        ? sourceRows
        : sourceRows.filter((row) => row.label.toLocaleLowerCase('ru-RU').includes(normalizedSearch));

    return filteredRows.toSorted((a, b) => {
      if (sortBy === 'deltaAsc') return a.delta - b.delta;
      if (sortBy === 'growthDesc') {
        return (b.deltaPercent ?? Number.NEGATIVE_INFINITY) - (a.deltaPercent ?? Number.NEGATIVE_INFINITY);
      }
      if (sortBy === 'revenueBDesc') return b.periodB - a.periodB;
      if (sortBy === 'labelAsc') return a.label.localeCompare(b.label, 'ru');
      return b.delta - a.delta;
    });
  }, [result?.rows, search, sortBy]);
  const leaders = rows.slice(0, 5);

  const exportCsv = React.useCallback(() => {
    if (!result) return;

    const header = [dimensionLabel, 'Период A', 'Период B', 'Дельта', 'Изменение %'];
    const body = rows.map((row) => [
      row.label,
      row.periodA,
      row.periodB,
      row.delta,
      row.deltaPercent == null ? '' : row.deltaPercent.toFixed(2)
    ]);
    const content = [header, ...body].map((line) => line.map(toCsvValue).join(';')).join('\n');
    downloadCsvFile(`like4like-${result.dimension}-${result.periodA.from}-${result.periodB.to}.csv`, content);
  }, [dimensionLabel, result, rows]);

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Заполните оба периода</AlertTitle>
        <AlertDescription>
          Like4Like сравнивает период B относительно периода A по выбранной группировке.
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
          В текущей реализации Like4Like строится только по данным R-Keeper.
        </AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Like4Like</CardTitle>
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
        <AlertTitle>Не удалось построить сравнение</AlertTitle>
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
            В выборке есть рестораны IIKO, но отчет посчитан только по данным R-Keeper.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title={`Период A (${formatShortPeriod(result.periodA.from, result.periodA.to)})`}
          value={formatRub(result.periodA.total)}
        />
        <MetricCard
          title={`Период B (${formatShortPeriod(result.periodB.from, result.periodB.to)})`}
          value={formatRub(result.periodB.total)}
        />
        <MetricCard title='Дельта B к A' value={formatRub(result.totals.delta)} />
        <MetricCard title='Изменение, %' value={formatPercent(result.totals.deltaPercent)} />
      </div>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-7'>
        <Card className='xl:col-span-5'>
          <CardHeader>
            <CardTitle>Топ изменений по измерению «{dimensionLabel}»</CardTitle>
          </CardHeader>
          <CardContent>
            {chartRows.length === 0 ? (
              <div className='text-sm text-muted-foreground'>Нет данных для сравнения.</div>
            ) : (
              <div className='max-h-[520px] overflow-y-auto'>
                <ChartContainer
                  config={chartConfig}
                  className='aspect-auto w-full'
                  style={{ height: chartHeight }}
                >
                  <BarChart accessibilityLayer data={chartRows} layout='vertical' margin={{ left: 12 }}>
                    <CartesianGrid horizontal={false} strokeDasharray='3 3' />
                    <ReferenceLine x={0} stroke='var(--border)' />
                    <YAxis
                      dataKey='label'
                      type='category'
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      width={190}
                    />
                    <XAxis
                      type='number'
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => formatRub(Number(value))}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as ComparisonRow | undefined;
                            return row?.label ?? undefined;
                          }}
                          formatter={(_, __, item) => {
                            const row = item.payload as ComparisonRow;
                            return (
                              <div className='flex min-w-[220px] flex-col gap-1 py-1'>
                                <div className='flex items-center justify-between gap-4'>
                                  <span className='text-muted-foreground'>Период A</span>
                                  <span className='font-mono font-medium tabular-nums'>
                                    {formatRub(row.periodA)}
                                  </span>
                                </div>
                                <div className='flex items-center justify-between gap-4'>
                                  <span className='text-muted-foreground'>Период B</span>
                                  <span className='font-mono font-medium tabular-nums'>
                                    {formatRub(row.periodB)}
                                  </span>
                                </div>
                                <div className='flex items-center justify-between gap-4'>
                                  <span className='text-muted-foreground'>Дельта</span>
                                  <span className='font-mono font-medium tabular-nums'>
                                    {formatRub(row.delta)}
                                  </span>
                                </div>
                                <div className='flex items-center justify-between gap-4'>
                                  <span className='text-muted-foreground'>Изменение</span>
                                  <span className='font-mono font-medium tabular-nums'>
                                    {formatPercent(row.deltaPercent)}
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey='delta' radius={4} barSize={18}>
                      {chartRows.map((row) => (
                        <Cell
                          key={row.label}
                          fill={row.delta >= 0 ? 'var(--chart-2)' : 'var(--chart-5)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle>Лидеры роста</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {leaders.length === 0 ? (
              <div className='text-sm text-muted-foreground'>Нет данных за выбранные периоды.</div>
            ) : (
              leaders.map((row) => (
                <div key={row.label} className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='truncate text-sm font-medium'>{row.label}</div>
                    <div className='text-xs text-muted-foreground'>
                      {formatRub(row.periodA)} {'->'} {formatRub(row.periodB)}
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-sm font-semibold tabular-nums'>{formatRub(row.delta)}</div>
                    <div className='text-muted-foreground text-xs tabular-nums'>
                      {formatPercent(row.deltaPercent)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
            <CardTitle>Детализация по измерению «{dimensionLabel}»</CardTitle>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Поиск по полю «${dimensionLabel}»`}
                className='w-full sm:w-[260px]'
              />
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as ComparisonSortKey)}>
                <SelectTrigger className='w-full sm:w-[250px]'>
                  <SelectValue placeholder='Сортировка' />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(comparisonSortLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant='outline' onClick={exportCsv}>
                Экспорт CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className='text-sm text-muted-foreground'>Нет строк для отображения.</div>
          ) : (
            <div className='space-y-3'>
              <div className='text-muted-foreground text-sm'>
                Найдено строк: <span className='text-foreground font-medium'>{rows.length}</span>
              </div>
              <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimensionLabel}</TableHead>
                    <TableHead className='text-right'>Период A</TableHead>
                    <TableHead className='text-right'>Период B</TableHead>
                    <TableHead className='text-right'>Дельта</TableHead>
                    <TableHead className='text-right'>Изменение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className='max-w-[360px] font-medium'>{row.label}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.periodA)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.periodB)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatRub(row.delta)}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatPercent(row.deltaPercent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
