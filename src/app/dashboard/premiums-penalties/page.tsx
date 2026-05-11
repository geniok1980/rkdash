import PageContainer from '@/components/layout/page-container';
import { getLatestSalesDate } from '@/lib/rkeeper-data';
import { OverviewPeriodFilter } from '@/features/overview/components/overview-period-filter';
import PremiumsPenaltiesDashboard from '@/app/dashboard/premiums-penalties/premiums-penalties-dashboard';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default async function PremiumsPenaltiesPage() {
  const latestSalesDate = (await getLatestSalesDate()) ?? toIsoDate(new Date());

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-2'>
        <div className='space-y-2'>
          <h2 className='text-2xl font-bold tracking-tight'>Премии и штрафы</h2>
          <OverviewPeriodFilter maxDateIso={latestSalesDate} />
        </div>

        <PremiumsPenaltiesDashboard />
      </div>
    </PageContainer>
  );
}
