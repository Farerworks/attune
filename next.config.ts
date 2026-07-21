import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cloudflare tunnels and other reverse-proxy origins in dev mode
  allowedDevOrigins: ['*.trycloudflare.com'],
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
};

export default nextConfig;
