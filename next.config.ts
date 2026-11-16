import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// 开发服务每次启动自动读取本机网卡，切换宿舍/校园网无需手改IP。
const localHosts = Object.values(networkInterfaces()).flatMap(entries =>
  (entries || []).filter(entry => entry.family === "IPv4" && !entry.internal).map(entry => entry.address),
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: [...new Set([...localHosts, ...(process.env.DEV_ALLOWED_ORIGINS || "").split(",").map(host => host.trim()).filter(Boolean)])],
};

export default nextConfig;
