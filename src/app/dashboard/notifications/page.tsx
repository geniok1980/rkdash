import NotificationsPage from '@/features/notifications/components/notifications-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rkeeper : Уведомления'
};

export default function Page() {
  return <NotificationsPage />;
}
