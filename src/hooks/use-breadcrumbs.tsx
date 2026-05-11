'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

type BreadcrumbItem = {
  title: string;
  link: string;
};

// This allows to add custom title as well
const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard': [{ title: 'Обзор', link: '/dashboard' }],
  '/dashboard/overview': [{ title: 'Панель управления', link: '/dashboard/overview' }],
  '/dashboard/chat': [{ title: 'Чат с базой', link: '/dashboard/chat' }],
  '/dashboard/product': [{ title: 'Продукты', link: '/dashboard/product' }],
  '/dashboard/profile': [{ title: 'Профиль', link: '/dashboard/profile' }]
};

const segmentTranslation: Record<string, string> = {
  dashboard: 'Обзор',
  overview: 'Панель управления',
  chat: 'Чат с базой',
  product: 'Продукты',
  profile: 'Профиль',
  notifications: 'Уведомления',
  hermes: 'Hermes — агенты'
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    // Check if we have a custom mapping for this exact path
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // If no exact match, fall back to generating breadcrumbs from the path
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      const title =
        segmentTranslation[segment.toLowerCase()] ||
        segment.charAt(0).toUpperCase() + segment.slice(1);
      return {
        title: title,
        link: path
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
