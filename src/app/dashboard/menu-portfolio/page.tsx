import PageContainer from '@/components/layout/page-container';
import { DashboardPrintButton } from '@/features/overview/components/dashboard-print-button';
import { MenuPortfolioDashboard } from '@/features/menu-portfolio/components/menu-portfolio-dashboard';
import { MenuPortfolioFilters } from '@/features/menu-portfolio/components/menu-portfolio-filters';
import { getLatestSalesDate } from '@/lib/rkeeper-data';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const metadata = {
  title: 'Dashboard: Портфельный анализ меню'
};

export default async function MenuPortfolioPage() {
  const latestSalesDate = (await getLatestSalesDate()) ?? toIsoDate(new Date());

  return (
    <PageContainer
      pageTitle='Портфельный анализ меню'
      pageDescription='Категории меню на одной карте: доля выручки, доля объема продаж и маржинальность.'
      pageHeaderAction={<DashboardPrintButton />}
    >
      <div className='flex flex-1 flex-col space-y-4'>
        <MenuPortfolioFilters maxDateIso={latestSalesDate} />
        <MenuPortfolioDashboard />
      </div>
    </PageContainer>
  );
}
