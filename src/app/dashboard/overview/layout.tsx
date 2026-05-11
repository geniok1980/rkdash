import PageContainer from '@/components/layout/page-container';
import React from 'react';
import { getLatestSalesDate } from '@/lib/rkeeper-data';
import { OverviewPeriodFilter } from '@/features/overview/components/overview-period-filter';

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default async function OverViewLayout({
  summary,
  sales,
  pie_stats,
  bar_stats,
  area_stats
}: {
  summary: React.ReactNode;
  sales: React.ReactNode;
  pie_stats: React.ReactNode;
  bar_stats: React.ReactNode;
  area_stats: React.ReactNode;
}) {
  const latestSalesDate = (await getLatestSalesDate()) ?? toIsoDate(new Date());

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-2'>
        <div className='space-y-2'>
          <h2 className='text-2xl font-bold tracking-tight'>Аналитика Rkeeper</h2>
          <OverviewPeriodFilter maxDateIso={latestSalesDate} />
        </div>

        {summary}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
          <div className='col-span-4'>{bar_stats}</div>
          <div className='col-span-4 md:col-span-3'>{sales}</div>
          <div className='col-span-4'>{area_stats}</div>
          <div className='col-span-4 min-h-0 md:col-span-3'>{pie_stats}</div>
        </div>
      </div>
    </PageContainer>
  );
}
