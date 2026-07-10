import PageContainer from '@/components/layout/page-container';
import { AbcAnalysisDashboard } from '@/features/abc-analysis/components/abc-analysis-dashboard';
import { AbcAnalysisFilters } from '@/features/abc-analysis/components/abc-analysis-filters';
import { DashboardPrintButton } from '@/features/overview/components/dashboard-print-button';
import { getLatestSalesDate } from '@/lib/rkeeper-data';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const metadata = {
  title: 'Dashboard: Двойной ABC-анализ'
};

export default async function AbcAnalysisPage() {
  const latestSalesDate = (await getLatestSalesDate()) ?? toIsoDate(new Date());

  return (
    <PageContainer
      pageTitle='Двойной ABC-анализ + Go-list'
      pageDescription='Матрица 3x3 по выручке и валовой прибыли блюд с готовыми рекомендациями для официантов.'
      pageHeaderAction={<DashboardPrintButton />}
    >
      <div className='flex flex-1 flex-col space-y-4'>
        <AbcAnalysisFilters maxDateIso={latestSalesDate} />
        <AbcAnalysisDashboard />
      </div>
    </PageContainer>
  );
}
