import PageContainer from '@/components/layout/page-container';

export default function WorkspacesPage() {
  return (
    <PageContainer pageTitle='Workspaces'>
      <div className='p-4 border rounded-lg bg-card'>
        <h3 className='text-lg font-medium'>Workspace Management</h3>
        <p className='text-sm text-muted-foreground'>
          Multi-workspace features are disabled in offline mode.
        </p>
      </div>
    </PageContainer>
  );
}
