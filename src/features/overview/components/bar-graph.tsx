'use client';

import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

const chartConfig = {
  revenue: {
    label: 'Выручка',
    color: 'var(--chart-1)'
  }
} satisfies ChartConfig;

export function BarGraph({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Дневная выручка</CardTitle>
        <CardDescription>Последние 7 активных смен Rkeeper</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='date'
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.split('-').slice(1).join('/')}
            />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₽${value}`} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey='revenue' fill='var(--chart-1)' radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
