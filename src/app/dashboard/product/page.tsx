import { searchParamsCache } from '@/lib/searchparams';
import ProductListingPage from '@/features/products/components/product-listing';
import { Metadata } from 'next';
import { SearchParams } from 'nuqs/server';
import React, { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Rkeeper: Продукты'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <ProductListingPage />
    </Suspense>
  );
}
