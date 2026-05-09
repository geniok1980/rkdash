import PageContainer from '@/components/layout/page-container';

export default function ExclusivePage() {
  return (
    <PageContainer pageTitle='Exclusive Content'>
      <div className='p-4 border rounded-lg bg-card'>
        <h3 className='text-lg font-medium'>Premium Analytics</h3>
        <p className='text-sm text-muted-foreground'>
          This content is available to all admins in the current configuration.
        </p>
      </div>
    </PageContainer>
  );
}
