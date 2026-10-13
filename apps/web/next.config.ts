import type { NextConfig } from 'next';
const config: NextConfig = {
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
    fetches: { fullUrl: false },
    serverFunctions: false,
  },
  transpilePackages: ['@devtrust/ui', '@devtrust/contracts'],
  turbopack: {
    root: process.cwd() + '/../..',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination:
          (process.env.API_INTERNAL_URL || 'http://localhost:4000') +
          '/api/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
