import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUser, deleteUser } from '@/lib/auth-db';
import { auth } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

export const GET = auth(async (_req: NextRequest, { params }: Params) => {
  if (!_req.auth || _req.auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const user = await getUserById(Number(id));
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}) as unknown as typeof GET;

export const PATCH = auth(async (req: NextRequest, { params }: Params) => {
  if (!req.auth || req.auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const userId = Number(id);

  const existing = await getUserById(userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = await req.json();
    const updated = await updateUser(userId, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}) as unknown as typeof PATCH;

export const DELETE = auth(async (_req: NextRequest, { params }: Params) => {
  if (!_req.auth || _req.auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const userId = Number(id);

  if (userId === Number(_req.auth.user?.id)) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const deleted = await deleteUser(userId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}) as unknown as typeof DELETE;
