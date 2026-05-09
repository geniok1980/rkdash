import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Обзор',
    items: [
      {
        title: 'Панель управления',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd']
      },
      {
        title: 'Чат с базой (AI)',
        url: '/dashboard/chat',
        icon: 'billing',
        isActive: false,
        shortcut: ['c', 'c']
      },
      {
        title: 'Hermes AI',
        url: '/dashboard/hermes',
        icon: 'user',
        isActive: false,
        shortcut: ['h', 'h']
      }
    ]
  },
  {
    label: 'Управление',
    items: [
      {
        title: 'Профиль',
        url: '/dashboard/profile',
        icon: 'user',
        isActive: false,
        shortcut: ['p', 'p']
      },
      {
        title: 'Уведомления',
        url: '/dashboard/notifications',
        icon: 'notification',
        isActive: false,
        shortcut: ['n', 'n']
      }
    ]
  }
];
