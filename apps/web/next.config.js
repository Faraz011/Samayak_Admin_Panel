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
      'pdf-to-png-converter'
    ],
  },
  outputFileTracingIncludes: {
    '/api/**/*': [
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'node_modules/.pnpm/pdfjs-dist@6.0.227/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'node_modules/tesseract.js/src/**/*',
      'node_modules/tesseract.js-core/**/*',
    ],
  },
  images: {
    domains: ['urgtpxnrutgeiyuxkawx.supabase.co'],
  },
};

module.exports = nextConfig;
