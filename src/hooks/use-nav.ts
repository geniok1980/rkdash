'use client';

/**
 * MOCKED use-nav.ts to bypass Clerk
 */

import { useMemo } from 'react';
import type { NavItem, NavGroup } from '@/types';

// Mock values
const mockUser = { id: 'admin', fullName: 'Admin User' };
const mockOrg = { id: 'org_1', name: 'Admin Org' };

export function useFilteredNavItems(items: NavItem[]) {
  // Always return all items for the demo/bypass
  return useMemo(() => {
    return items.map((item) => {
      if (item.items && item.items.length > 0) {
        return {
          ...item,
          items: [...item.items]
        };
      }
      return item;
    });
  }, [items]);
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  return useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        items: [...group.items]
      }))
      .filter((group) => group.items.length > 0);
  }, [groups]);
}
