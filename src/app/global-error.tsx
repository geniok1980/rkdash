'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='ru'>
      <body className='flex h-screen w-screen flex-col items-center justify-center gap-4'>
        <h2 className='text-2xl font-bold'>Что-то пошло не так!</h2>
        <p className='text-muted-foreground'>Произошла критическая ошибка приложения.</p>
        <Button onClick={() => reset()}>Попробовать снова</Button>
      </body>
    </html>
  );
}
