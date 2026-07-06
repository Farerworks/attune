import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cloudflare tunnels and other reverse-proxy origins in dev mode
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
