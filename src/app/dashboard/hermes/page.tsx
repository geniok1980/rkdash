import PageContainer from '@/components/layout/page-container';

export default function HermesPage() {
  // Используем прямой IP сервера для iframe, так как проксирование сложной SPA может ломать пути к ассетам
  const hermesUrl = 'http://141.98.7.195:9119/';

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-2 h-[calc(100vh-120px)]'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-bold tracking-tight'>Hermes AI Agent</h2>
        </div>
        <div className='flex-1 border rounded-lg overflow-hidden bg-background relative'>
          <iframe
            src={hermesUrl}
            className='w-full h-full border-none absolute inset-0'
            title='Hermes WebUI'
            allow='clipboard-read; clipboard-write; wasm'
          />
        </div>
      </div>
    </PageContainer>
  );
}
