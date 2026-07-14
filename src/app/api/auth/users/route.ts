import { NextRequest, NextResponse } from 'next/server';
import { listUsers, createUser } from '@/lib/auth-db';
import { auth } from '@/lib/auth';

export const GET = auth(async (req) => {
  if (!req.auth || req.auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const users = await listUsers();
  return NextResponse.json(users);
}) as unknown as typeof GET;

export const POST = auth(async (req) => {
  if (!req.auth || req.auth.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, name, password, role } = body;

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'email, name, password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = await import('@/lib/auth-db').then(m => m.getUserByEmail(email));
    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    const user = await createUser({ email, name, password, role });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}) as unknown as typeof POST;
