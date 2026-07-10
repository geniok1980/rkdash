import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AbcBucket, AbcCellCode, AbcMatrixCell } from '@/features/abc-analysis/api/types';
import { cn } from '@/lib/utils';

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
  return `${value.toFixed(1)}%`;
}

function getCellClasses(cell: AbcCellCode): string {
  if (cell === 'AA') return 'border-emerald-500/40 bg-emerald-500/10';
  if (cell === 'AB' || cell === 'BA') return 'border-sky-500/40 bg-sky-500/10';
  if (cell === 'BB' || cell === 'CA') return 'border-amber-500/40 bg-amber-500/10';
  if (cell === 'AC' || cell === 'BC' || cell === 'CB') return 'border-orange-500/40 bg-orange-500/10';
  return 'border-rose-500/40 bg-rose-500/10';
}

function getBucketLabel(bucket: AbcBucket) {
  if (bucket === 'A') return 'Высокий';
  if (bucket === 'B') return 'Средний';
  return 'Низкий';
}

interface AbcMatrixProps {
  cells: AbcMatrixCell[];
}

export function AbcMatrix({ cells }: AbcMatrixProps) {
  const cellMap = new Map(cells.map((cell) => [cell.key, cell]));
  const grossProfitOrder: AbcBucket[] = ['A', 'B', 'C'];
  const revenueOrder: AbcBucket[] = ['A', 'B', 'C'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>ABC-матрица 3x3</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='text-muted-foreground text-sm'>
          По горизонтали выручка, по вертикали валовая прибыль. Ячейка показывает, какие блюда и как именно стоит продвигать.
        </div>

        <div className='space-y-3 overflow-x-auto'>
          <div className='grid min-w-[980px] grid-cols-[160px_repeat(3,minmax(0,1fr))] gap-3'>
            <div />
            {revenueOrder.map((bucket) => (
              <div key={bucket} className='px-2 text-sm font-medium'>
                Выручка {bucket}
                <div className='text-muted-foreground text-xs font-normal'>
                  {getBucketLabel(bucket)}
                </div>
              </div>
            ))}

            {grossProfitOrder.map((grossProfitBucket) => (
              <React.Fragment key={grossProfitBucket}>
                <div className='flex items-center px-2 text-sm font-medium'>
                  <div>
                    Прибыль {grossProfitBucket}
                    <div className='text-muted-foreground text-xs font-normal'>
                      {getBucketLabel(grossProfitBucket)}
                    </div>
                  </div>
                </div>

                {revenueOrder.map((revenueBucket) => {
                  const cellKey = `${revenueBucket}${grossProfitBucket}` as AbcCellCode;
                  const cell = cellMap.get(cellKey);

                  return (
                    <div
                      key={cellKey}
                      className={cn(
                        'rounded-lg border p-4 shadow-sm transition-colors',
                        getCellClasses(cellKey)
                      )}
                    >
                      <div className='mb-3 flex items-start justify-between gap-2'>
                        <div>
                          <div className='text-sm font-semibold'>{cellKey}</div>
                          <div className='text-xs text-muted-foreground'>
                            {cell?.title ?? 'Нет данных'}
                          </div>
                        </div>
                        <Badge variant='secondary'>{cell?.dishesCount ?? 0} блюд</Badge>
                      </div>

                      <div className='grid grid-cols-2 gap-3 text-sm'>
                        <div>
                          <div className='text-muted-foreground text-xs'>Выручка</div>
                          <div className='font-medium'>{formatRub(cell?.revenue ?? 0)}</div>
                        </div>
                        <div>
                          <div className='text-muted-foreground text-xs'>Прибыль</div>
                          <div className='font-medium'>{formatRub(cell?.grossProfit ?? 0)}</div>
                        </div>
                        <div>
                          <div className='text-muted-foreground text-xs'>Маржа</div>
                          <div className='font-medium'>{formatPercent(cell?.marginPct ?? null)}</div>
                        </div>
                        <div>
                          <div className='text-muted-foreground text-xs'>Количество</div>
                          <div className='font-medium'>{Math.round(cell?.quantity ?? 0)}</div>
                        </div>
                      </div>

                      <div className='mt-3 text-xs text-muted-foreground'>
                        {cell?.recommendation ?? 'Нет блюд в этой ячейке за выбранный период.'}
                      </div>

                      <div className='mt-3 text-xs'>
                        <span className='text-muted-foreground'>Лидеры:</span>{' '}
                        {cell?.topDishes.length ? cell.topDishes.join(', ') : '—'}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
