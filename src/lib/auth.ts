import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@libsql/client';
import { compare } from 'bcryptjs';
import path from 'path';

const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? path.resolve(process.cwd(), 'data/auth.db');

function getAuthDb() {
  return createClient({
    url: AUTH_DB_PATH.startsWith('file:') ? AUTH_DB_PATH : `file:${AUTH_DB_PATH}`
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email);
        const password = String(credentials.password);

        try {
          const db = getAuthDb();
          const result = await db.execute({
            sql: 'SELECT id, email, name, password_hash, role FROM users WHERE email = ?',
            args: [email]
          });

          if (result.rows.length === 0) {
            return null;
          }

          const user = result.rows[0];
          const isValid = await compare(password, String(user.password_hash));

          if (!isValid) {
            return null;
          }

          return {
            id: String(user.id),
            email: String(user.email),
            name: String(user.name),
            role: String(user.role)
          };
        } catch {
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? 'admin';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/sign-in'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true
});
