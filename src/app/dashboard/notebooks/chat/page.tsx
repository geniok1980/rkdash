import { ChatBox } from '@/components/chat/chat-box';
import PageContainer from '@/components/layout/page-container';

export default function NotebookChatPage() {
  return (
    <PageContainer>
      <div className='space-y-4'>
        <h2 className='text-3xl font-bold tracking-tight'>Чат с базой знаний (Open Notebook)</h2>
        <p className='text-muted-foreground text-sm'>
          Исследовательский агент Open Notebook — поиск по ноутбукам, RAG-вопросы, управление
          заметками и источниками.
        </p>
        <ChatBox defaultAgentId='notebook-agent' />
      </div>
    </PageContainer>
  );
}
