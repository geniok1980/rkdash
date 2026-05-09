import { getCategorySales } from '@/lib/rkeeper-data';
import { PieGraph } from '@/features/overview/components/pie-graph';

export default async function PieStats() {
  const data = await getCategorySales();
  return <PieGraph data={data} />;
}
