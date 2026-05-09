import { mastra } from '@/mastra';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const { message, threadId = 'default-session' } = await req.json();
    console.log(`[${requestId}] Chat API: Request started for thread ${threadId}`);
    console.log(`[${requestId}] User message: ${message}`);

    const agent = mastra.getAgent('sqlAgent');
    if (!agent) {
      console.error(`[${requestId}] Agent sqlAgent not found`);
      return NextResponse.json({ error: 'Agent not found' }, { status: 500 });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Время ожидания от AI истекло (290 сек)')), 290000)
    );

    console.log(`[${requestId}] Calling agent.generate...`);

    const result = (await Promise.race([
      agent.generate(message, {
        threadId: threadId
      } as any),
      timeoutPromise
    ])) as any;

    console.log(`[${requestId}] Agent generation success`);
    // console.log(`[${requestId}] AI Response preview: ${result.text?.substring(0, 100)}...`);

    return NextResponse.json({ text: result.text });
  } catch (error: any) {
    console.error(`[${requestId}] Chat API Error:`, error.message);
    if (error.stack) console.error(error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
