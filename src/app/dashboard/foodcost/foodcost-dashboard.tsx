'use client';

import * as React from 'react';
import { useQueryStates } from 'nuqs';
import { useQuery } from '@tanstack/react-query';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';
import { overviewSearchParams } from '@/features/overview/lib/overview-search-params';

type FoodcostResponse = {
  period: { from: string | null; to: string | null };
  available: {
    hasSalesGold: boolean;
    hasSales: boolean;
    hasPayments: boolean;
    hasRestaurantInSales: boolean;
    hasDiscountComponents: boolean;
    hasFoodcostTable: boolean;
  };
  missing: string[];
  revenue: {
    basis: string;
    revenueByRestaurant: Array<{ restaurant: string; revenue: number; quantity: number }>;
    discountByRestaurant: Array<{
      restaurant: string;
      discount: number;
      gross: number;
      net: number;
    }> | null;
    revenueByCategory: Array<{ category: string; revenue: number; quantity: number }>;
    revenueByDish: Array<{ dish: string; revenue: number; quantity: number }>;
    dishLimit: number;
  };
  grossProfit:
    | {
        available: false;
        message: string;
      }
    | {
        available: true;
        message?: string;
        basis: {
          salesTable: string;
          costTable: string;
          join: string;
        };
        totals: {
          revenue: number;
          cost: number;
          profit: number;
        };
        missingCostRows: number;
        fallbackCostRows?: number;
        byRestaurant: Array<{ restaurant: string; revenue: number; cost: number; profit: number }>;
        byCategory: Array<{
          category: string;
          revenue: number;
          cost: number;
          profit: number;
          quantity: number;
        }>;
        byDish: Array<{
          dish: string;
          revenue: number;
          cost: number;
          profit: number;
          quantity: number;
        }>;
        dishLimit: number;
      };
};

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

function formatRub(value: number) {
  return rubFormatter.format(value);
}

function formatPercent(value: number) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatUnitValue(value: number) {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatUnitRub(value: number) {
  return `${formatUnitValue(value)} ₽`;
}

async function fetchFoodcost(
  from: string,
  to: string,
  restaurants?: string[]
): Promise<FoodcostResponse> {
  const params = new URLSearchParams({
    from,
    to
  });
  if (restaurants && restaurants.length > 0) {
    params.set('restaurants', restaurants.join(','));
  }
  const res = await fetch(
    `/api/rkeeper/foodcost?${params.toString()}`,
    { cache: 'no-store' }
  );
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'message' in json
        ? String((json as { message?: unknown }).message)
        : null;
    if (message) throw new Error(message);
  }
  return json as FoodcostResponse;
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return <div className='max-h-[460px] overflow-auto rounded-md border'>{children}</div>;
}

function MissingDataAlert({ missing }: { missing: string[] }) {
  return (
    <Alert>
      <Icons.info className='h-4 w-4' />
      <AlertTitle>Каких данных не хватает</AlertTitle>
      <AlertDescription>
        <div className='space-y-1'>
          {missing.map((m, idx) => (
            <div key={`${idx}-${m}`}>{m}</div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default function FoodcostDashboard() {
  const [params] = useQueryStates(overviewSearchParams, { shallow: true });
  const enabled = Boolean(params.from && params.to);

  const query = useQuery({
    queryKey: ['rkeeper', 'foodcost', params.from, params.to, params.restaurants ?? []],
    queryFn: () => fetchFoodcost(params.from!, params.to!, params.restaurants ?? undefined),
    enabled,
    staleTime: 15_000
  });

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Выберите период</AlertTitle>
        <AlertDescription>Фудкост считается для выбранного периода.</AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <Alert variant='destructive'>
        <Icons.alertCircle className='h-4 w-4' />
        <AlertTitle>Нельзя построить фудкост</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data) return null;
  const data = query.data;
  const grossProfitAvailable = data.grossProfit.available;
  const totalRevenue = grossProfitAvailable
    ? data.grossProfit.totals.revenue
    : data.revenue.revenueByRestaurant.reduce((sum, row) => sum + row.revenue, 0);
  const totalDiscount =
    data.revenue.discountByRestaurant?.reduce((sum, row) => sum + row.discount, 0) ?? 0;
  const totalCost = grossProfitAvailable ? data.grossProfit.totals.cost : 0;
  const foodcostPercent = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
  const grossMargin =
    grossProfitAvailable && totalRevenue > 0
      ? (data.grossProfit.totals.profit / totalRevenue) * 100
      : 0;

  return (
    <div className='space-y-4'>
      {data.missing.length > 0 ? <MissingDataAlert missing={data.missing} /> : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Выручка</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='text-2xl font-semibold'>{formatRub(totalRevenue)}</div>
            <div className='text-sm text-muted-foreground'>
              Используется поле <Badge variant='outline'>{data.revenue.basis}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Скидки</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='text-2xl font-semibold'>
              {data.available.hasDiscountComponents ? formatRub(totalDiscount) : '-'}
            </div>
            <div className='text-sm text-muted-foreground'>
              {data.available.hasDiscountComponents ? 'PRLISTSUM - PAYSUM' : 'Нет данных'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Себестоимость</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='text-2xl font-semibold'>
              {grossProfitAvailable ? formatRub(totalCost) : '-'}
            </div>
            <div className='text-sm text-muted-foreground'>
              {grossProfitAvailable ? `Фудкост ${formatPercent(foodcostPercent)}` : 'Нет данных'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Валовая прибыль</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <div className='text-2xl font-semibold'>
              {grossProfitAvailable ? formatRub(data.grossProfit.totals.profit) : '-'}
            </div>
            <div className='text-sm text-muted-foreground'>
              {grossProfitAvailable
                ? `Маржа ${formatPercent(grossMargin)}`
                : data.grossProfit.message}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue='restaurants'>
        <TabsList className='w-full justify-start'>
          <TabsTrigger value='restaurants'>Рестораны</TabsTrigger>
          <TabsTrigger value='categories'>Категории</TabsTrigger>
          <TabsTrigger value='dishes'>Блюда</TabsTrigger>
          <TabsTrigger value='gross'>Валовая прибыль</TabsTrigger>
        </TabsList>

        <TabsContent value='restaurants'>
          {data.revenue.revenueByRestaurant.length === 0 ? (
            <div className='text-muted-foreground rounded-md border p-4 text-sm'>
              Нет данных по ресторанам для выбранного периода.
            </div>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ресторан</TableHead>
                    <TableHead className='text-right'>Выручка</TableHead>
                    <TableHead className='text-right'>Кол-во</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.revenue.revenueByRestaurant.map((r, idx) => (
                    <TableRow key={`${r.restaurant}-${idx}`}>
                      <TableCell>{r.restaurant}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatRub(r.revenue)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {r.quantity.toLocaleString('ru-RU')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {data.revenue.discountByRestaurant ? (
            <div className='mt-4 space-y-2'>
              <div className='text-sm font-medium'>Скидки (PRLISTSUM - PAYSUM)</div>
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ресторан</TableHead>
                      <TableHead className='text-right'>Скидка</TableHead>
                      <TableHead className='text-right'>Сумма до</TableHead>
                      <TableHead className='text-right'>Сумма после</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.revenue.discountByRestaurant.map((r, idx) => (
                      <TableRow key={`${r.restaurant}-${idx}`}>
                        <TableCell>{r.restaurant}</TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatRub(r.discount)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatRub(r.gross)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatRub(r.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value='categories'>
          {data.revenue.revenueByCategory.length === 0 ? (
            <div className='text-muted-foreground rounded-md border p-4 text-sm'>
              Нет данных по категориям для выбранного периода.
            </div>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Категория</TableHead>
                    <TableHead className='text-right'>Выручка</TableHead>
                    <TableHead className='text-right'>Кол-во</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.revenue.revenueByCategory.map((r, idx) => (
                    <TableRow key={`${r.category}-${idx}`}>
                      <TableCell>{r.category}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatRub(r.revenue)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {r.quantity.toLocaleString('ru-RU')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>

        <TabsContent value='dishes'>
          {(grossProfitAvailable ? data.grossProfit.byDish.length : data.revenue.revenueByDish.length) ===
          0 ? (
            <div className='text-muted-foreground rounded-md border p-4 text-sm'>
              Нет данных по блюдам для выбранного периода.
            </div>
          ) : (
            <div className='space-y-2'>
              <div className='text-muted-foreground text-sm'>
                {grossProfitAvailable
                  ? `Показано блюд: ${data.grossProfit.byDish.length.toLocaleString('ru-RU')} (лимит ${data.grossProfit.dishLimit}).`
                  : `Показано блюд: ${data.revenue.revenueByDish.length.toLocaleString('ru-RU')} (лимит ${data.revenue.dishLimit}).`}
              </div>
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Блюдо</TableHead>
                      <TableHead className='text-right'>Кол-во</TableHead>
                      {grossProfitAvailable ? (
                        <>
                          <TableHead className='text-right'>Отпускная цена/ед.</TableHead>
                          <TableHead className='text-right'>Себестоимость/ед.</TableHead>
                          <TableHead className='text-right'>Выручка</TableHead>
                          <TableHead className='text-right'>Себестоимость</TableHead>
                          <TableHead className='text-right'>Валовая прибыль</TableHead>
                          <TableHead className='text-right'>Маржа</TableHead>
                        </>
                      ) : (
                        <TableHead className='text-right'>Выручка</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grossProfitAvailable
                      ? data.grossProfit.byDish.map((row, idx) => {
                          const salePricePerUnit =
                            row.quantity > 0 ? row.revenue / row.quantity : 0;
                          const costPerUnit = row.quantity > 0 ? row.cost / row.quantity : 0;
                          const rowMargin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;

                          return (
                            <TableRow key={`${row.dish}-${idx}`}>
                              <TableCell className='max-w-[520px] truncate'>{row.dish}</TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {row.quantity.toLocaleString('ru-RU')}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatUnitRub(salePricePerUnit)}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatUnitRub(costPerUnit)}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatRub(row.revenue)}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatRub(row.cost)}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatRub(row.profit)}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatPercent(rowMargin)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : data.revenue.revenueByDish.map((row, idx) => (
                          <TableRow key={`${row.dish}-${idx}`}>
                            <TableCell className='max-w-[520px] truncate'>{row.dish}</TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {row.quantity.toLocaleString('ru-RU')}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatRub(row.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value='gross'>
          {!grossProfitAvailable ? (
            <div className='text-muted-foreground rounded-md border p-4 text-sm'>
              {data.grossProfit.message}
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>Выручка</CardTitle>
                  </CardHeader>
                  <CardContent className='text-2xl font-semibold'>
                    {formatRub(data.grossProfit.totals.revenue)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>Себестоимость</CardTitle>
                  </CardHeader>
                  <CardContent className='text-2xl font-semibold'>
                    {formatRub(data.grossProfit.totals.cost)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>Валовая прибыль</CardTitle>
                  </CardHeader>
                  <CardContent className='text-2xl font-semibold'>
                    {formatRub(data.grossProfit.totals.profit)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>Маржинальность</CardTitle>
                  </CardHeader>
                  <CardContent className='text-2xl font-semibold'>
                    {formatPercent(grossMargin)}
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <Icons.info className='h-4 w-4' />
                <AlertTitle>Логика расчета</AlertTitle>
                <AlertDescription className='space-y-1'>
                  <div>Источник продаж: {data.grossProfit.basis.salesTable}</div>
                  <div>Источник себестоимости: {data.grossProfit.basis.costTable}</div>
                  <div>{data.grossProfit.basis.join}</div>
                  <div>Строк без себестоимости: {data.grossProfit.missingCostRows.toLocaleString('ru-RU')}</div>
                  <div>
                    Строк с fallback по предыдущей дате:{' '}
                    {(data.grossProfit.fallbackCostRows ?? 0).toLocaleString('ru-RU')}
                  </div>
                </AlertDescription>
              </Alert>

              <div className='space-y-2'>
                <div className='text-sm font-medium'>По ресторанам</div>
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ресторан</TableHead>
                        <TableHead className='text-right'>Выручка</TableHead>
                        <TableHead className='text-right'>Себестоимость</TableHead>
                        <TableHead className='text-right'>Валовая прибыль</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.grossProfit.byRestaurant.map((row, idx) => (
                        <TableRow key={`${row.restaurant}-${idx}`}>
                          <TableCell>{row.restaurant}</TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.revenue)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.cost)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>

              <div className='space-y-2'>
                <div className='text-sm font-medium'>По категориям</div>
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Категория</TableHead>
                        <TableHead className='text-right'>Выручка</TableHead>
                        <TableHead className='text-right'>Себестоимость</TableHead>
                        <TableHead className='text-right'>Валовая прибыль</TableHead>
                        <TableHead className='text-right'>Кол-во</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.grossProfit.byCategory.map((row, idx) => (
                        <TableRow key={`${row.category}-${idx}`}>
                          <TableCell>{row.category}</TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.revenue)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.cost)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatRub(row.profit)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {row.quantity.toLocaleString('ru-RU')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>

              <div className='space-y-2'>
                <div className='text-sm font-medium'>
                  По блюдам: отпускная цена, себестоимость и валовая прибыль (
                  {data.grossProfit.byDish.length.toLocaleString('ru-RU')} из лимита{' '}
                  {data.grossProfit.dishLimit})
                </div>
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Блюдо</TableHead>
                        <TableHead className='text-right'>Кол-во</TableHead>
                        <TableHead className='text-right'>Отпускная цена/ед.</TableHead>
                        <TableHead className='text-right'>Себестоимость/ед.</TableHead>
                        <TableHead className='text-right'>Выручка</TableHead>
                        <TableHead className='text-right'>Себестоимость</TableHead>
                        <TableHead className='text-right'>Валовая прибыль</TableHead>
                        <TableHead className='text-right'>Маржа</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.grossProfit.byDish.map((row, idx) => {
                        const salePricePerUnit = row.quantity > 0 ? row.revenue / row.quantity : 0;
                        const costPerUnit = row.quantity > 0 ? row.cost / row.quantity : 0;
                        const rowMargin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;

                        return (
                          <TableRow key={`${row.dish}-${idx}`}>
                            <TableCell className='max-w-[520px] truncate'>{row.dish}</TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {row.quantity.toLocaleString('ru-RU')}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatUnitRub(salePricePerUnit)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatUnitRub(costPerUnit)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatRub(row.revenue)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatRub(row.cost)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatRub(row.profit)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {formatPercent(rowMargin)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
