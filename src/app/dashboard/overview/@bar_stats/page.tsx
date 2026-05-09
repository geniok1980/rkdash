import { getDailySales } from '@/lib/rkeeper-data';
import { BarGraph } from '@/features/overview/components/bar-graph';

export default async function BarStats() {
  const data = await getDailySales();
  return <BarGraph data={data} />;
}
