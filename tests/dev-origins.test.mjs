import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./load-module.mjs";

test("开发来源自动跟随本机网卡，兼容网卡切换和多网卡，保留穿透通配符", () => {
  const original = process.env.DEV_ALLOWED_ORIGINS;
  try {
    process.env.DEV_ALLOWED_ORIGINS = "**.cpolar.top";
    const config = interfaces => loadModule("../next.config.ts", { "node:os": { networkInterfaces: () => interfaces } }).default;
    const first = config({ wifi: [{ family: "IPv4", address: "192.0.2.10", internal: false }], ethernet: [{ family: "IPv4", address: "198.51.100.20", internal: false }], loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }] });
    assert.deepEqual(first.allowedDevOrigins, ["192.0.2.10", "198.51.100.20", "**.cpolar.top"]);
    const switched = config({ wifi: [{ family: "IPv4", address: "203.0.113.30", internal: false }] });
    assert.deepEqual(switched.allowedDevOrigins, ["203.0.113.30", "**.cpolar.top"]);
  } finally { if (original === undefined) delete process.env.DEV_ALLOWED_ORIGINS; else process.env.DEV_ALLOWED_ORIGINS = original; }
});
