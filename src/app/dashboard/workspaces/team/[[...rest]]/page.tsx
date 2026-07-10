import PageContainer from '@/components/layout/page-container';

export default function TeamPage() {
  return (
    <PageContainer pageTitle='Team Management'>
      <div className='p-4 border rounded-lg bg-card'>
        <h3 className='text-lg font-medium'>Manage Team</h3>
        <p className='text-sm text-muted-foreground'>
          Team management is disabled in offline mode.
        </p>
      </div>
    </PageContainer>
  );
}
