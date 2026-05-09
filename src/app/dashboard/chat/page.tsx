import { ChatBox } from '@/components/chat/chat-box';
import PageContainer from '@/components/layout/page-container';

export default function ChatPage() {
  return (
    <PageContainer>
      <div className='space-y-4'>
        <h2 className='text-3xl font-bold tracking-tight'>Чат с базой данных (v1.0.2)</h2>
        <ChatBox />
      </div>
    </PageContainer>
  );
}
