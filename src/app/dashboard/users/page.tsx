import { searchParamsCache } from '@/lib/searchparams';
import UserClientPage from '@/features/users/components/user-listing';
import { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import React, { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Rkeeper: Пользователи'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <UserClientPage />
    </Suspense>
  );
}
