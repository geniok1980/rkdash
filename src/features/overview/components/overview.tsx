import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaGraph } from './area-graph';
import { BarGraph } from './bar-graph';
import { PieGraph } from './pie-graph';
import { RecentSales } from './recent-sales';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { getSalesSummary, getDailySales, getCategorySales, getTopDishes } from '@/lib/rkeeper-data';
import { OverviewPeriodFilter } from './overview-period-filter';

export default async function OverViewPage() {
  const summary = await getSalesSummary();
  const dailySales = await getDailySales();
  const categorySales = await getCategorySales();
  const topDishes = await getTopDishes();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-2'>
        <div className='flex items-center justify-between space-y-2'>
          <h2 className='text-2xl font-bold tracking-tight'>Аналитика Rkeeper</h2>
          <div className='hidden items-center space-x-2 md:flex'>
            <Button>Скачать отчет</Button>
          </div>
        </div>
        <OverviewPeriodFilter />
        <Tabs defaultValue='overview' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='overview'>Обзор</TabsTrigger>
            <TabsTrigger value='analytics' disabled>
              Детальная аналитика
            </TabsTrigger>
          </TabsList>
          <TabsContent value='overview' className='space-y-4'>
            <div className='*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4'>
              <Card className='@container/card'>
                <CardHeader>
                  <CardDescription>Общая выручка</CardDescription>
                  <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                    ₽{summary.totalRevenue.toLocaleString()}
                  </CardTitle>
                  <CardAction>
                    <Badge variant='outline'>
                      <Icons.trendingUp />
                      Live
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                  <div className='line-clamp-1 flex gap-2 font-medium'>
                    Данные из Rkeeper <Icons.trendingUp className='size-4' />
                  </div>
                </CardFooter>
              </Card>
              <Card className='@container/card'>
                <CardHeader>
                  <CardDescription>Всего чеков</CardDescription>
                  <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                    {summary.totalChecks.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                  <div className='line-clamp-1 flex gap-2 font-medium'>Обработано заказов</div>
                </CardFooter>
              </Card>
              <Card className='@container/card'>
                <CardHeader>
                  <CardDescription>Средний чек</CardDescription>
                  <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                    ₽{(summary.totalRevenue / (summary.totalChecks || 1)).toFixed(2)}
                  </CardTitle>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                  <div className='line-clamp-1 flex gap-2 font-medium'>
                    Средняя стоимость заказа
                  </div>
                </CardFooter>
              </Card>
              <Card className='@container/card'>
                <CardHeader>
                  <CardDescription>Продано позиций</CardDescription>
                  <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                    {summary.totalItems.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                  <div className='line-clamp-1 flex gap-2 font-medium'>Объем проданных блюд</div>
                </CardFooter>
              </Card>
            </div>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
              <div className='col-span-4'>
                <BarGraph data={dailySales} />
              </div>
              <Card className='col-span-4 md:col-span-3'>
                <RecentSales data={topDishes} />
              </Card>
              <div className='col-span-4 md:col-span-3'>
                <PieGraph data={categorySales} />
              </div>
              <div className='col-span-4'>
                <AreaGraph data={dailySales} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
