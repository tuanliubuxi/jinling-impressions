import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./load-module.mjs";

test("开发来源自动跟随本机网卡，兼容172/10网段和多网卡，保留穿透通配符", () => {
  const original = process.env.DEV_ALLOWED_ORIGINS;
  try {
    process.env.DEV_ALLOWED_ORIGINS = "**.cpolar.top";
    const config = interfaces => loadModule("../next.config.ts", { "node:os": { networkInterfaces: () => interfaces } }).default;
    const first = config({ wifi: [{ family: "IPv4", address: "192.0.2.10", internal: false }], ethernet: [{ family: "IPv4", address: "10.8.0.2", internal: false }], loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }] });
    assert.deepEqual(first.allowedDevOrigins, ["192.0.2.10", "10.8.0.2", "**.cpolar.top"]);
    const switched = config({ wifi: [{ family: "IPv4", address: "192.0.2.10", internal: false }] });
    assert.deepEqual(switched.allowedDevOrigins, ["192.0.2.10", "**.cpolar.top"]);
  } finally { if (original === undefined) delete process.env.DEV_ALLOWED_ORIGINS; else process.env.DEV_ALLOWED_ORIGINS = original; }
});
