import { NextRequest, NextResponse } from 'next/server';
import {
  importRestaurantStackAgents,
  listRestaurantStackAgents
} from '@/lib/hermes-restaurant-stack';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const agents = await listRestaurantStackAgents();
    return NextResponse.json({ agents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { slug?: string; slugs?: string[] };
    const slugs = Array.isArray(body.slugs)
      ? body.slugs.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : body.slug && body.slug.trim()
        ? [body.slug.trim()]
        : undefined;

    const result = await importRestaurantStackAgents(slugs);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
