import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Auth.js v5 + Drizzle run in the Node runtime; keep server externals explicit
    // so the serverless bundle stays small.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;
