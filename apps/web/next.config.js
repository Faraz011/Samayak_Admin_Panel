const path = require('path');
const dotenv = require('dotenv');

// Load env variables from root .env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@samayak/shared', '@samayak/db'],
  experimental: {
    serverComponentsExternalPackages: [
      'pino',
      'bullmq',
      'ioredis',
      'tesseract.js',
      'tesseract.js-core',
      'pdfjs-dist',
      'pdf-to-png-converter',
      'canvas',
      '@napi-rs/canvas',
      '@napi-rs/canvas-linux-x64-gnu',
    ],
    outputFileTracingRoot: path.join(__dirname, '../../'),
    outputFileTracingIncludes: {
      '/api/pdf-ingestions/process': [
        'node_modules/@napi-rs/canvas/**/*',
        'node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      ],
    },
  },
  images: {
    domains: ['urgtpxnrutgeiyuxkawx.supabase.co'],
  },
};

module.exports = nextConfig;
