import { createClient } from '@libsql/client';
import { hashSync, compareSync } from 'bcryptjs';
import path from 'path';

const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? path.resolve(process.cwd(), 'data/auth.db');

function getDb() {
  return createClient({
    url: AUTH_DB_PATH.startsWith('file:') ? AUTH_DB_PATH : `file:${AUTH_DB_PATH}`
  });
}

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
};

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  role?: string;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
};

export async function listUsers(): Promise<AuthUser[]> {
  const db = getDb();
  const result = await db.execute(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
  );
  return result.rows as unknown as AuthUser[];
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
    args: [id]
  });
  return (result.rows[0] as AuthUser) ?? null;
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, email, name, role, created_at FROM users WHERE email = ?',
    args: [email]
  });
  return (result.rows[0] as AuthUser) ?? null;
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  const db = getDb();
  const passwordHash = hashSync(input.password, 12);

  const result = await db.execute({
    sql: 'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, email, name, role, created_at',
    args: [input.email, input.name, passwordHash, input.role ?? 'admin']
  });
  return result.rows[0] as unknown as AuthUser;
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<AuthUser | null> {
  const db = getDb();

  const sets: string[] = [];
  const args: (string | number)[] = [];

  if (input.name !== undefined) {
    sets.push('name = ?');
    args.push(input.name);
  }
  if (input.email !== undefined) {
    sets.push('email = ?');
    args.push(input.email);
  }
  if (input.password !== undefined) {
    sets.push('password_hash = ?');
    args.push(hashSync(input.password, 12));
  }
  if (input.role !== undefined) {
    sets.push('role = ?');
    args.push(input.role);
  }

  if (sets.length === 0) return getUserById(id);

  args.push(id);
  await db.execute({
    sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
    args
  });

  return getUserById(id);
}

export async function deleteUser(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'DELETE FROM users WHERE id = ?',
    args: [id]
  });
  return result.rowsAffected > 0;
}

export async function verifyPassword(id: number, password: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT password_hash FROM users WHERE id = ?',
    args: [id]
  });
  if (result.rows.length === 0) return false;
  return compareSync(password, String(result.rows[0].password_hash));
}
