import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || "").split(",").map(host => host.trim()).filter(Boolean),
};

export default nextConfig;
