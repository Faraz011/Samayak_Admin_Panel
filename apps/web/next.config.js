const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require("path");
const dotenv = require("dotenv");

// Load env variables from root .env if present
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@samayak/shared", "@samayak/db"],
  experimental: {
    serverComponentsExternalPackages: [
      "pino",
      "bullmq",
      "ioredis",
      "sharp",
    ],
  },
  images: {
    domains: ["urgtpxnrutgeiyuxkawx.supabase.co"],
  },
};

module.exports = nextConfig;
