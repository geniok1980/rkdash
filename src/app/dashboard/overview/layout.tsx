import React from 'react';
import { getLatestSalesDate } from '@/lib/rkeeper-data';
import { OverviewShell } from '@/features/overview/components/overview-shell';

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
    <OverviewShell
      latestSalesDate={latestSalesDate}
      summary={summary}
      sales={sales}
      pieStats={pie_stats}
      barStats={bar_stats}
      areaStats={area_stats}
    />
  );
}
