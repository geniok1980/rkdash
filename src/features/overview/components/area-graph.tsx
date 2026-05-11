'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import type { WaiterRevenueItem } from '@/features/overview/api/types';

const chartConfig = {
  revenue: {
    label: 'Выручка',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

export function AreaGraph({ data }: { data: WaiterRevenueItem[] }) {
  const chartHeight = Math.max(280, data.length * 28);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Выручка по официантам</CardTitle>
        <CardDescription>Все официанты за период (прокрутка)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='max-h-[420px] overflow-y-auto'>
          <ChartContainer
            config={chartConfig}
            className='aspect-auto w-full'
            style={{ height: chartHeight }}
          >
            <BarChart accessibilityLayer data={data} layout='vertical' margin={{ left: 12 }}>
              <CartesianGrid horizontal={false} strokeDasharray='3 3' />
              <YAxis
                dataKey='waiter'
                type='category'
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={160}
              />
              <XAxis
                type='number'
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `₽${value}`}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey='revenue' fill='var(--chart-2)' radius={4} barSize={18} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
