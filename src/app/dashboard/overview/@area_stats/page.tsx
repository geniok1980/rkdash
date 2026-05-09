import { getDailySales } from '@/lib/rkeeper-data';
import { AreaGraph } from '@/features/overview/components/area-graph';

export default async function AreaStats() {
  const data = await getDailySales();
  return <AreaGraph data={data} />;
}
