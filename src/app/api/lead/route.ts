import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const LEAD_BOT_TOKEN = process.env.LEAD_BOT_TOKEN;
const LEAD_CHAT_ID = process.env.LEAD_CHAT_ID || '8288589227';
const LEADS_FILE = path.join(process.cwd(), 'data', 'leads.jsonl');

export async function POST(request: Request) {
  try {
    const { name, email, restaurant } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    const lead = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      email,
      restaurant: restaurant || '',
      source: 'rkdash.com landing',
      created_at: new Date().toISOString()
    };

    // Save to local file
    await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
    await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n');

    // Notify via Telegram if token configured
    if (LEAD_BOT_TOKEN) {
      const msg =
        `🆕 *Новый лид с rkdash.com*\n` +
        `👤 *Имя:* ${name}\n` +
        `📧 *Email:* ${email}\n` +
        `🏪 *Ресторан:* ${restaurant || '—'}\n` +
        `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Samara' })}`;

      await fetch(
        `https://api.telegram.org/bot${LEAD_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: LEAD_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
          })
        }
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, id: lead.id });
  } catch (err) {
    console.error('Lead API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
