import PageContainer from '@/components/layout/page-container';
import { ComparisonDashboard } from '@/features/comparison/components/comparison-dashboard';
import { ComparisonFilters } from '@/features/comparison/components/comparison-filters';
import { DashboardPrintButton } from '@/features/overview/components/dashboard-print-button';
import { getLatestSalesDate } from '@/lib/rkeeper-data';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const metadata = {
  title: 'Dashboard: Like4Like'
};

export default async function ComparisonPage() {
  const latestSalesDate = (await getLatestSalesDate()) ?? toIsoDate(new Date());

  return (
    <PageContainer
      pageTitle='Like4Like'
      pageDescription='Сравнение двух периодов по продажам, категориям, блюдам, официантам и типам оплат.'
      pageHeaderAction={<DashboardPrintButton />}
    >
      <div className='flex flex-1 flex-col space-y-4'>
        <ComparisonFilters maxDateIso={latestSalesDate} />
        <ComparisonDashboard />
      </div>
    </PageContainer>
  );
}
