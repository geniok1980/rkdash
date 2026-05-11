import PageContainer from '@/components/layout/page-container';
import { HermesPanel } from '@/features/hermes/components/hermes-panel';

export default function HermesPage() {
  return (
    <PageContainer>
      <div className='space-y-4'>
        <div>
          <h2 className='text-3xl font-bold tracking-tight'>Hermes Agent</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Управление skills, toolsets и config через REST Hermes Dashboard (без iframe). Установка
            skill — запись SKILL.md в каталог skills Hermes.
          </p>
        </div>
        <HermesPanel />
      </div>
    </PageContainer>
  );
}
