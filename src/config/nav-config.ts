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
        title: 'Премии и штрафы',
        url: '/dashboard/premiums-penalties',
        icon: 'badgeCheck',
        isActive: false,
        shortcut: ['b', 'b']
      },
      {
        title: 'План/Факт',
        url: '/dashboard/plan-fact',
        icon: 'trendingUp',
        isActive: false,
        shortcut: ['f', 'f']
      },
      {
        title: 'Подозрительные операции',
        url: '/dashboard/suspicious-operations',
        icon: 'warning',
        isActive: false,
        shortcut: ['o', 'o']
      },
      {
        title: 'Прогнозирование',
        url: '/dashboard/forecasting',
        icon: 'sparkles',
        isActive: false,
        shortcut: ['g', 'g']
      },
      {
        title: 'Фудкост',
        url: '/dashboard/foodcost',
        icon: 'pizza',
        isActive: false,
        shortcut: ['k', 'k']
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
      },
      {
        title: 'Настройки',
        url: '/dashboard/settings',
        icon: 'settings',
        isActive: false,
        shortcut: ['s', 's']
      }
    ]
  }
];
