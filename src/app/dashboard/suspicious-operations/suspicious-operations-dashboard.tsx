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

type Nullable<T> = T | null;

interface SuspiciousOperationSumDecreaseItem {
  datetime: string;
  operation: string;
  orderName: Nullable<string>;
  tableName: Nullable<string>;
  waiter: Nullable<string>;
  operator: Nullable<string>;
  manager: Nullable<string>;
  sumBefore: number;
  sumAfter: number;
  delta: number;
}

interface SuspiciousOperationTransferItem {
  datetime: string;
  operation: string;
  dish: Nullable<string>;
  quantity: Nullable<number>;
  orderName: Nullable<string>;
  tableName: Nullable<string>;
  sourceOrder: Nullable<string>;
  sourceTable: Nullable<string>;
  waiter: Nullable<string>;
  operator: Nullable<string>;
  manager: Nullable<string>;
}

interface SuspiciousOperationPrecheckCancelItem {
  datetime: string;
  operation: string;
  orderName: Nullable<string>;
  tableName: Nullable<string>;
  waiter: Nullable<string>;
  operator: Nullable<string>;
  manager: Nullable<string>;
  reason: Nullable<string>;
  parameter: Nullable<string>;
}

interface SuspiciousOperationDeleteAfterShiftCloseItem {
  datetime: string;
  operation: string;
  dish: Nullable<string>;
  quantity: Nullable<number>;
  orderName: Nullable<string>;
  tableName: Nullable<string>;
  waiter: Nullable<string>;
  operator: Nullable<string>;
  manager: Nullable<string>;
}

interface SuspiciousOperationsResult {
  sumDecreases: SuspiciousOperationSumDecreaseItem[];
  transfers: SuspiciousOperationTransferItem[];
  deletesAfterShiftClose: SuspiciousOperationDeleteAfterShiftCloseItem[];
  precheckCancels: SuspiciousOperationPrecheckCancelItem[];
  missing: string[];
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  }
  return value;
}

async function fetchSuspiciousOperations(
  from?: string,
  to?: string
): Promise<SuspiciousOperationsResult> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`/api/rkeeper/suspicious-operations?${params.toString()}`, {
    cache: 'no-store'
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'message' in json
        ? String((json as any).message)
        : 'Ошибка';
    throw new Error(message);
  }
  return json as SuspiciousOperationsResult;
}

function CountCard({ title, count }: { title: string; count: number }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-semibold tabular-nums'>{count.toLocaleString('ru-RU')}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title }: { title: string }) {
  return <div className='text-muted-foreground rounded-md border p-4 text-sm'>{title}</div>;
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return <div className='max-h-[460px] overflow-auto rounded-md border'>{children}</div>;
}

export default function SuspiciousOperationsDashboard() {
  const [params] = useQueryStates(overviewSearchParams);
  const enabled = Boolean(params.from && params.to);

  const query = useQuery({
    queryKey: ['rkeeper', 'suspicious-operations', { from: params.from, to: params.to }],
    queryFn: () => fetchSuspiciousOperations(params.from ?? undefined, params.to ?? undefined),
    enabled
  });

  if (!enabled) {
    return (
      <Alert>
        <Icons.info className='h-4 w-4' />
        <AlertTitle>Выберите период</AlertTitle>
        <AlertDescription>
          Для анализа подозрительных операций нужно указать даты “с” и “по”.
        </AlertDescription>
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
        <AlertTitle>Ошибка</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  if (!query.data) return null;
  const data = query.data;

  return (
    <div className='space-y-4'>
      {data.missing.length > 0 ? (
        <Alert>
          <Icons.warning className='h-4 w-4' />
          <AlertTitle>Ограничения данных</AlertTitle>
          <AlertDescription>
            <div className='space-y-1'>
              {data.missing.map((m, idx) => (
                <div key={`${idx}-${m}`}>{m}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <CountCard title='Уменьшение суммы чека' count={data.sumDecreases.length} />
        <CountCard title='Перенос блюд между заказами' count={data.transfers.length} />
        <CountCard
          title='Удаление после закрытия смены'
          count={data.deletesAfterShiftClose.length}
        />
        <CountCard title='Отмена пречека' count={data.precheckCancels.length} />
      </div>

      <Tabs defaultValue='sumDecreases'>
        <TabsList className='w-full justify-start'>
          <TabsTrigger value='sumDecreases'>Сумма чека</TabsTrigger>
          <TabsTrigger value='transfers'>Перенос блюд</TabsTrigger>
          <TabsTrigger value='deletes'>Удаления</TabsTrigger>
          <TabsTrigger value='precheck'>Пречек</TabsTrigger>
        </TabsList>

        <TabsContent value='sumDecreases'>
          {data.sumDecreases.length === 0 ? (
            <EmptyState title='За выбранный период уменьшений суммы чека не найдено.' />
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Операция</TableHead>
                    <TableHead>Официант</TableHead>
                    <TableHead>Стол</TableHead>
                    <TableHead className='text-right'>Было</TableHead>
                    <TableHead className='text-right'>Стало</TableHead>
                    <TableHead className='text-right'>Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sumDecreases.map((row, idx) => (
                    <TableRow key={`${row.datetime}-${idx}`}>
                      <TableCell className='text-muted-foreground'>
                        {formatDateTime(row.datetime)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Badge variant='destructive'>Аномалия</Badge>
                          <span className='truncate'>{row.operation}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.waiter ?? '—'}</TableCell>
                      <TableCell>{row.tableName ?? '—'}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatRub(row.sumBefore)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatRub(row.sumAfter)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums text-red-500'>
                        {formatRub(row.delta)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>

        <TabsContent value='transfers'>
          {data.transfers.length === 0 ? (
            <EmptyState title='За выбранный период переносов блюд между заказами не найдено.' />
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Операция</TableHead>
                    <TableHead>Блюдо</TableHead>
                    <TableHead className='text-right'>Кол-во</TableHead>
                    <TableHead>Из заказа</TableHead>
                    <TableHead>В заказ</TableHead>
                    <TableHead>Официант</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transfers.map((row, idx) => (
                    <TableRow key={`${row.datetime}-${idx}`}>
                      <TableCell className='text-muted-foreground'>
                        {formatDateTime(row.datetime)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Badge variant='outline'>Перенос</Badge>
                          <span className='truncate'>{row.operation}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.dish ?? '—'}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {row.quantity ?? '—'}
                      </TableCell>
                      <TableCell>
                        {row.sourceOrder ?? '—'}
                        {row.sourceTable ? (
                          <span className='text-muted-foreground'> ({row.sourceTable})</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.orderName ?? '—'}
                        {row.tableName ? (
                          <span className='text-muted-foreground'> ({row.tableName})</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.waiter ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>

        <TabsContent value='deletes'>
          {data.deletesAfterShiftClose.length === 0 ? (
            <EmptyState title='За выбранный период удалений после закрытия смены не найдено (или это вычисление недоступно).' />
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Операция</TableHead>
                    <TableHead>Блюдо</TableHead>
                    <TableHead className='text-right'>Кол-во</TableHead>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Официант</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deletesAfterShiftClose.map((row, idx) => (
                    <TableRow key={`${row.datetime}-${idx}`}>
                      <TableCell className='text-muted-foreground'>
                        {formatDateTime(row.datetime)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Badge variant='secondary'>Удаление</Badge>
                          <span className='truncate'>{row.operation}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.dish ?? '—'}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {row.quantity ?? '—'}
                      </TableCell>
                      <TableCell>{row.orderName ?? '—'}</TableCell>
                      <TableCell>{row.waiter ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>

        <TabsContent value='precheck'>
          {data.precheckCancels.length === 0 ? (
            <EmptyState title='За выбранный период отмен пречека не найдено.' />
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Операция</TableHead>
                    <TableHead>Официант</TableHead>
                    <TableHead>Стол</TableHead>
                    <TableHead>Причина</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.precheckCancels.map((row, idx) => (
                    <TableRow key={`${row.datetime}-${idx}`}>
                      <TableCell className='text-muted-foreground'>
                        {formatDateTime(row.datetime)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <Badge variant='outline'>Пречек</Badge>
                          <span className='truncate'>{row.operation}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.waiter ?? '—'}</TableCell>
                      <TableCell>{row.tableName ?? '—'}</TableCell>
                      <TableCell className='max-w-[360px] truncate'>
                        {row.reason ?? row.parameter ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
