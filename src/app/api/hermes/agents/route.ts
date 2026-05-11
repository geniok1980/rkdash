import { createTelegramAgent, listTelegramAgents } from '@/lib/hermes-telegram-agents';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const agents = await listTelegramAgents();
    return NextResponse.json({ agents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      telegramBotToken?: string;
      chatId?: string;
    };
    const agent = await createTelegramAgent({
      name: body.name || '',
      telegramBotToken: body.telegramBotToken || '',
      chatId: body.chatId || ''
    });
    return NextResponse.json({ ok: true, agent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
