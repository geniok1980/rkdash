import { deleteTelegramAgent } from '@/lib/hermes-telegram-agents';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await ctx.params;
    await deleteTelegramAgent(agentId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
