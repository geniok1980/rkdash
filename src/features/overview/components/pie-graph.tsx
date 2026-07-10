'use client';

import * as React from 'react';
import { Pie, PieChart } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import type { PaymentTypeSalesItem } from '@/features/overview/api/types';

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

export function PieGraph({ data }: { data: PaymentTypeSalesItem[] }) {
  const [mounted, setMounted] = React.useState(false);
  const chartData = data.map((item, index) => ({
    ...item,
    fill: COLORS[index % COLORS.length]
  }));

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const label = ({
    cx,
    cy,
    midAngle,
    outerRadius,
    payload
  }: {
    cx: number;
    cy: number;
    midAngle: number;
    outerRadius: number;
    payload: PaymentTypeSalesItem;
  }) => {
    const radian = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * radian);
    const y = cy + radius * Math.sin(-midAngle * radian);

    return (
      <text
        x={x}
        y={y}
        fill='currentColor'
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline='central'
        fontSize={10}
        fontWeight={500}
        transform={`rotate(-35 ${x} ${y})`}
      >
        {payload.paymentType}
      </text>
    );
  };

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='items-center pb-0'>
        <CardTitle>По типам оплат</CardTitle>
        <CardDescription>Все типы оплат за период</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 items-center justify-center pb-4'>
        <ChartContainer
          config={chartConfig}
          className='mx-auto aspect-square max-h-[340px] min-h-[280px] w-full'
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey='paymentType' hideLabel />} />
            <Pie
              data={chartData}
              innerRadius={30}
              dataKey='revenue'
              nameKey='paymentType'
              labelLine
              label={label}
              radius={10}
              cornerRadius={8}
              paddingAngle={4}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
