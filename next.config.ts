import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const baseConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.slingacademy.com' },
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'clerk.com' }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: false
  },
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  // Добавляем проксирование для Hermes WebUI
  async rewrites() {
    return [
      {
        source: '/proxy/hermes/:path*',
        destination: 'http://141.98.7.195:9119/:path*', // Проксируем на порт Hermes
      },
    ];
  },
};

let configWithPlugins = baseConfig;

if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    org: process.env.NEXT_PUBLIC_SENTRY_ORG,
    project: process.env.NEXT_PUBLIC_SENTRY_PROJECT,
    silent: true,
    widenClientFileUpload: true,
    tunnelRoute: '/monitoring',
    telemetry: false,
    webpack: {
      reactComponentAnnotation: { enabled: true },
      treeshake: { removeDebugLogging: true }
    },
    sourcemaps: {
      disable: true
    }
  });
}

export default configWithPlugins;
