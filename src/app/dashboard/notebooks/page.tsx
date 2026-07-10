import PageContainer from '@/components/layout/page-container';
import Link from 'next/link';

export default function NotebooksPage() {
  return (
    <PageContainer pageTitle='База знаний' pageDescription='Управление ноутбуками Open Notebook'>
      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
        <Link
          href='/dashboard/notebooks/chat'
          className='group rounded-lg border p-6 hover:border-primary/50 hover:shadow-sm transition-all'
        >
          <h3 className='font-semibold mb-2'>Чат с базой знаний</h3>
          <p className='text-sm text-muted-foreground'>
            Задавайте вопросы по загруженным документам, ищите информацию, создавайте заметки через
            AI-агента.
          </p>
        </Link>

        <Link
          href='/dashboard/settings/knowledge-base'
          className='group rounded-lg border p-6 hover:border-primary/50 hover:shadow-sm transition-all'
        >
          <h3 className='font-semibold mb-2'>Управление ноутбуками</h3>
          <p className='text-sm text-muted-foreground'>
            Создавайте и удаляйте ноутбуки, загружайте документы, отслеживайте статус
            индексирования.
          </p>
        </Link>

        <a
          href='http://localhost:8502'
          target='_blank'
          rel='noreferrer'
          className='group rounded-lg border p-6 hover:border-primary/50 hover:shadow-sm transition-all'
        >
          <h3 className='font-semibold mb-2'>Open Notebook UI</h3>
          <p className='text-sm text-muted-foreground'>
            Полноценный интерфейс Open Notebook: подкасты, трансформации, настройки моделей и
            провайдеров.
          </p>
        </a>
      </div>
    </PageContainer>
  );
}
