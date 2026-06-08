const path = require('path');
const dotenv = require('dotenv');

// Load env variables from root .env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@samayak/shared', '@samayak/db'],
  experimental: {
    serverComponentsExternalPackages: ['pino', 'bullmq', 'ioredis'],
  },
  images: {
    domains: ['urgtpxnrutgeiyuxkawx.supabase.co'],
  },
};

module.exports = nextConfig;
