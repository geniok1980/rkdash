'use client';

import * as React from 'react';
import PageContainer from '@/components/layout/page-container';
import { DashboardPrintButton } from '@/features/overview/components/dashboard-print-button';
import { OverviewPeriodFilter } from '@/features/overview/components/overview-period-filter';

interface OverviewShellProps {
  latestSalesDate: string;
  summary: React.ReactNode;
  sales: React.ReactNode;
  pieStats: React.ReactNode;
  barStats: React.ReactNode;
  areaStats: React.ReactNode;
}

export function OverviewShell({
  latestSalesDate,
  summary,
  sales,
  pieStats,
  barStats,
  areaStats
}: OverviewShellProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <PageContainer>
        <div className='flex-1' />
      </PageContainer>
    );
  }

  return (
    <PageContainer pageTitle='Алитика по ресторану' pageHeaderAction={<DashboardPrintButton />}>
      <div className='flex flex-1 flex-col space-y-2'>
        <div className='space-y-2'>
          <OverviewPeriodFilter maxDateIso={latestSalesDate} />
        </div>

        {summary}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
          <div className='col-span-4'>{barStats}</div>
          <div className='col-span-4 md:col-span-3'>{sales}</div>
          <div className='col-span-4'>{areaStats}</div>
          <div className='col-span-4 min-h-0 md:col-span-3'>{pieStats}</div>
        </div>
      </div>
    </PageContainer>
  );
}
