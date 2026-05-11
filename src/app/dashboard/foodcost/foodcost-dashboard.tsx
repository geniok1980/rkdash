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
  grossProfit: {
    available: boolean;
    message: string;
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

async function fetchFoodcost(from: string, to: string): Promise<FoodcostResponse> {
  const res = await fetch(
    `/api/rkeeper/foodcost?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { cache: 'no-store' }
  );
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'message' in json ? String((json as any).message) : null;
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
    queryKey: ['rkeeper', 'foodcost', params.from, params.to],
    queryFn: () => fetchFoodcost(params.from!, params.to!),
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

  return (
    <div className='space-y-4'>
      {data.missing.length > 0 ? <MissingDataAlert missing={data.missing} /> : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Выручка</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            Используется поле <Badge variant='outline'>{data.revenue.basis}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Скидки</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {data.available.hasDiscountComponents ? 'Доступны' : 'Нет данных'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Себестоимость</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {data.available.hasFoodcostTable ? 'Доступна' : 'Нет данных'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Валовая прибыль</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {data.grossProfit.message}
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
          {data.revenue.revenueByDish.length === 0 ? (
            <div className='text-muted-foreground rounded-md border p-4 text-sm'>
              Нет данных по блюдам для выбранного периода.
            </div>
          ) : (
            <div className='space-y-2'>
              <div className='text-muted-foreground text-sm'>
                Показано блюд: {data.revenue.revenueByDish.length.toLocaleString('ru-RU')} (лимит{' '}
                {data.revenue.dishLimit})
              </div>
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Блюдо</TableHead>
                      <TableHead className='text-right'>Выручка</TableHead>
                      <TableHead className='text-right'>Кол-во</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.revenue.revenueByDish.map((r, idx) => (
                      <TableRow key={`${r.dish}-${idx}`}>
                        <TableCell className='max-w-[520px] truncate'>{r.dish}</TableCell>
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
            </div>
          )}
        </TabsContent>

        <TabsContent value='gross'>
          <div className='text-muted-foreground rounded-md border p-4 text-sm'>
            {data.grossProfit.message}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
