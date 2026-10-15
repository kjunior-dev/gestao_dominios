import type { NextConfig } from 'next';
const output = process.env.NEXT_OUTPUT_DIR || '.next';
if (!['.next', '.next-e2e', '.next-build'].includes(output))
  throw new Error('NEXT_OUTPUT_DIR must be .next, .next-e2e or .next-build');
const config: NextConfig = {
  distDir: output,
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
