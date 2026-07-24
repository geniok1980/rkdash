import Script from 'next/script';
import Providers from '@/components/layout/providers';
import YandexMetrica from '@/components/yandex-metrica';
import { Toaster } from '@/components/ui/sonner';
import { fontVariables } from '@/components/themes/font.config';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import ThemeProvider from '@/components/themes/theme-provider';
import { cn } from '@/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import '../styles/globals.css';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  title: {
    default: 'RKDash — AI-аналитика для ресторанов на r_keeper и iiko',
    template: '%s | RKDash'
  },
  description:
    'Платформа с AI-агентами для ресторанов. Анализируйте продажи, прогнозируйте спрос, управляйте меню. r_keeper, iiko.',
  keywords: [
    'ресторанная аналитика',
    'ai для ресторанов',
    'r_keeper аналитика',
    'iiko аналитика',
    'автоматизация ресторана',
    'фудкост контроль',
    'аналитика ресторана',
    'цифровые сотрудники ресторан',
    'отчетность ресторана',
    'rkdash'
  ],
  openGraph: {
    title: 'RKDash — AI-аналитика для ресторанов',
    description:
      'Цифровые сотрудники для вашего ресторана на базе AI. Анализируйте продажи, прогнозируйте спрос, управляйте меню.',
    url: 'https://rkdash.com',
    siteName: 'RKDash',
    locale: 'ru_RU',
    type: 'website',
    images: [
      {
        url: 'https://rkdash.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'RKDash — AI-аналитика для ресторанов'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RKDash — AI-аналитика для ресторанов',
    description:
      'Цифровые сотрудники для вашего ресторана на базе AI.'
  },
  robots: {
    index: true,
    follow: true
  },
  alternates: {
    canonical: 'https://rkdash.com'
  }
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.light
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get('active_theme')?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;

  return (
    <html lang='en' suppressHydrationWarning data-theme={themeToApply}>
      <head>
        <Script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // Set meta theme color
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '${META_THEME_COLORS.dark}')
                }
              } catch (_) {}
            `
          }}
        />
        <YandexMetrica />
      </head>
      <body
        className={cn(
          'bg-background overflow-x-hidden overscroll-none font-sans antialiased',
          fontVariables
        )}
      >
        <NextTopLoader color='var(--primary)' showSpinner={false} />
        <NuqsAdapter>
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange
            enableColorScheme
          >
            <Providers activeThemeValue={themeToApply}>
              <Toaster />
              {children}
            </Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
