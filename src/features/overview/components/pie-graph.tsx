'use client';

import { LabelList, Pie, PieChart } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

const chartConfig = {
  revenue: {
    label: 'Выручка'
  }
} satisfies ChartConfig;

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
];

export function PieGraph({ data }: { data: any[] }) {
  const chartData = data.map((item, index) => ({
    ...item,
    fill: COLORS[index % COLORS.length]
  }));

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='items-center pb-0'>
        <CardTitle>Продажи по категориям</CardTitle>
        <CardDescription>Топ-5 категорий по выручке</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 items-center justify-center pb-0'>
        <ChartContainer
          config={chartConfig}
          className='mx-auto aspect-square max-h-[300px] min-h-[250px] w-full'
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey='revenue' hideLabel />} />
            <Pie
              data={chartData}
              innerRadius={30}
              dataKey='revenue'
              nameKey='category'
              radius={10}
              cornerRadius={8}
              paddingAngle={4}
            >
              <LabelList
                dataKey='category'
                stroke='none'
                fontSize={10}
                fontWeight={500}
                fill='currentColor'
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
