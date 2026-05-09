import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';

export function RecentSales({ data }: { data: any[] }) {
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>Самые популярные блюда</CardTitle>
        <CardDescription>Лидеры продаж по выручке</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-8'>
          {data.map((item, index) => (
            <div key={index} className='flex items-center'>
              <Avatar className='h-9 w-9'>
                <AvatarFallback>{item.name.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className='ml-4 space-y-1'>
                <p className='text-sm leading-none font-medium'>{item.name}</p>
                <p className='text-muted-foreground text-sm'>Продано: {item.quantity} шт.</p>
              </div>
              <div className='ml-auto font-medium'>₽{item.revenue.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
