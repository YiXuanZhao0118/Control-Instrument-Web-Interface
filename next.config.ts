import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true }, // 可選
  typescript: { ignoreBuildErrors: false },
  experimental: { turbo: { rules: {} } },
};
export default nextConfig;
