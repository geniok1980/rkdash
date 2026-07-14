import { createClient } from '@libsql/client';
import { hashSync } from 'bcryptjs';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'path';

const DB_PATH = process.env.AUTH_DB_PATH ?? path.resolve(process.cwd(), 'data/auth.db');

async function setup() {
  // Ensure data directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = createClient({
    url: DB_PATH.startsWith('file:') ? DB_PATH : `file:${DB_PATH}`
  });

  // Check if already seeded
  const existing = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
  );

  if (existing.rows.length > 0) {
    console.log('Auth database already set up. Skipping creation.');
  } else {
    console.log('Creating users table...');
    await db.execute(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('Users table created.');
  }

  // Seed admin user
  const adminEmail = process.env.AUTH_ADMIN_EMAIL || 'admin@rkdash.ru';
  const adminPassword = process.env.AUTH_ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.AUTH_ADMIN_NAME || 'Admin';

  const existingAdmin = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [adminEmail]
  });

  if (existingAdmin.rows.length === 0) {
    const passwordHash = hashSync(adminPassword, 12);
    await db.execute({
      sql: 'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      args: [adminEmail, adminName, passwordHash, 'admin']
    });
    console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  console.log('Auth DB setup complete.');
}

setup().catch((err) => {
  console.error('Failed to setup auth database:', err);
  process.exit(1);
});
