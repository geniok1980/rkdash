import PageContainer from '@/components/layout/page-container';

export default function BillingPage() {
  return (
    <PageContainer pageTitle='Billing'>
      <div className='p-4 border rounded-lg bg-card'>
        <h3 className='text-lg font-medium'>Subscription Management</h3>
        <p className='text-sm text-muted-foreground'>
          Billing features are disabled in offline mode.
        </p>
      </div>
    </PageContainer>
  );
}
