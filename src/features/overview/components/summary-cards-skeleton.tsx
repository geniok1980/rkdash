import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SummaryCardsSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className='space-y-2'>
            <Skeleton className='h-4 w-28' />
            <Skeleton className='h-8 w-36' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-4 w-24' />
          </CardContent>
          <CardFooter>
            <Skeleton className='h-3 w-32' />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
