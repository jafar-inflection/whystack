import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: "standalone",
  // Skip TypeScript errors during build (type checking done separately in CI)
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
