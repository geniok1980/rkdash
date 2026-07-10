import DashboardShell from '@/components/layout/dashboard-shell';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'RKDash',
  description: 'Аналитика и управление рестораном в RKDash',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Persisting the sidebar state in the cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  return (
    <DashboardShell defaultOpen={defaultOpen}>{children}</DashboardShell>
  );
}
