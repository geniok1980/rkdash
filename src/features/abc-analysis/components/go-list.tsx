import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AbcCellCode, AbcGoListGroup } from '@/features/abc-analysis/api/types';
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

function getCellBadgeClasses(cell: AbcCellCode): string {
  if (cell === 'AA') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (cell === 'AB' || cell === 'BA') return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (cell === 'BB' || cell === 'CA') return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  if (cell === 'AC' || cell === 'BC' || cell === 'CB') return 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
}

interface GoListProps {
  groups: AbcGoListGroup[];
}

export function GoList({ groups }: GoListProps) {
  return (
    <div className='grid grid-cols-1 gap-4 2xl:grid-cols-2'>
      {groups.map((group) => (
        <Card key={group.action}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <div className='text-sm text-muted-foreground'>{group.description}</div>
          </CardHeader>
          <CardContent>
            {group.items.length === 0 ? (
              <div className='text-sm text-muted-foreground'>
                За выбранный период подходящих блюд не найдено.
              </div>
            ) : (
              <div className='space-y-3'>
                {group.items.map((item) => (
                  <div
                    key={`${group.action}-${item.dish}-${item.category}`}
                    className='rounded-lg border p-3'
                  >
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>{item.dish}</div>
                        <div className='text-sm text-muted-foreground'>{item.category}</div>
                      </div>
                      <Badge
                        variant='outline'
                        className={cn('font-semibold', getCellBadgeClasses(item.cell))}
                      >
                        {item.cell}
                      </Badge>
                    </div>

                    <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
                      <div>
                        <div className='text-muted-foreground text-xs'>Выручка</div>
                        <div className='font-medium'>{formatRub(item.revenue)}</div>
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Прибыль</div>
                        <div className='font-medium'>{formatRub(item.grossProfit)}</div>
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Маржа</div>
                        <div className='font-medium'>{formatPercent(item.marginPct)}</div>
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Количество</div>
                        <div className='font-medium'>{Math.round(item.quantity)}</div>
                      </div>
                    </div>

                    <div className='mt-3 text-xs text-muted-foreground'>{item.recommendation}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
