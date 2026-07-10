import PageContainer from '@/components/layout/page-container';

export default function ProfileViewPage() {
  return (
    <PageContainer pageTitle='Profile'>
      <div className='p-4 border rounded-lg bg-card'>
        <h3 className='text-lg font-medium'>Admin Profile</h3>
        <p className='text-sm text-muted-foreground'>
          Profile management is disabled in offline mode.
        </p>
      </div>
    </PageContainer>
  );
}
