'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

const chartConfig = {
  checks: {
    label: 'Чеки',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

export function AreaGraph({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Объем чеков</CardTitle>
        <CardDescription>Количество чеков по дням</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.split('-').slice(1).join('/')}
            />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey='checks'
              type='monotone'
              fill='var(--chart-2)'
              fillOpacity={0.4}
              stroke='var(--chart-2)'
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
