import { getTopDishes } from '@/lib/rkeeper-data';
import { RecentSales } from '@/features/overview/components/recent-sales';

export default async function Sales() {
  const data = await getTopDishes();
  return <RecentSales data={data} />;
}
