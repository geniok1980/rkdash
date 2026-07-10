import PageContainer from '@/components/layout/page-container';
import { getLatestSalesDate } from '@/lib/rkeeper-data';
import { DashboardPrintButton } from '@/features/overview/components/dashboard-print-button';
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
    <PageContainer pageTitle='Премии и штрафы' pageHeaderAction={<DashboardPrintButton />}>
      <div className='flex flex-1 flex-col space-y-2'>
        <div className='space-y-2'>
          <OverviewPeriodFilter maxDateIso={latestSalesDate} />
        </div>

        <PremiumsPenaltiesDashboard />
      </div>
    </PageContainer>
  );
}
