'use client';
import { useTheme } from 'next-themes';
import React from 'react';
import { ActiveThemeProvider } from '../themes/active-theme';
import QueryProvider from './query-provider';

const measurePatched: { current: boolean } = { current: false };

if (
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  typeof Performance !== 'undefined' &&
  !measurePatched.current
) {
  measurePatched.current = true;
  const proto = Performance.prototype as unknown as { measure?: (...args: any[]) => any };
  const original = proto.measure;
  if (typeof original === 'function') {
    proto.measure = function (...args: any[]) {
      try {
        return original.apply(this, args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('cannot have a negative time stamp')) return undefined;
        throw error;
      }
    };
  }
}

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ActiveThemeProvider initialTheme={activeThemeValue}>
        <QueryProvider>{children}</QueryProvider>
      </ActiveThemeProvider>
    </>
  );
}
