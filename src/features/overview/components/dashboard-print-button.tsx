'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export function DashboardPrintButton() {
  return (
    <Button
      variant='outline'
      size='sm'
      onClick={() => window.print()}
      aria-label='Печать отчета'
      title='Печать отчета'
    >
      <Icons.printer className='size-4' />
    </Button>
  );
}
