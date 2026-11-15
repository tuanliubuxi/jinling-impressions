import { chromium, devices, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.SMOKE_BASE_URL || "http://jinling.test:3103";
// 先确认验证服务没有真实凭据，双重保证测试绝不消耗用户额度。
const testHealth = await (await fetch("http://127.0.0.1:3103/api/health")).json();
if (testHealth.aiConfigured) throw new Error("Refusing mobile tests: start with AI_BASE_URL=https://no-model.invalid");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--host-resolver-rules=MAP jinling.test 127.0.0.1", "--no-proxy-server"] });
const fixture = {
  title: "手机回归测试行程", summary: "这是模拟响应，不调用模型。",
  days: [{ day: 1, theme: "明代文化", meal: "安排用餐休息", stops: [{ placeId: "mingxiaoling", period: "上午", reason: "兴趣匹配", activities: ["看神道", "看陵宫"], transition: "确认入口", optional: false }] }],
  tips: [], budgetAdvice: ["预留餐费", "核实门票"], warnings: ["测试提示"],
  sources: [{ id: "mingxiaoling", name: "明孝陵", description: "明代帝陵", region: "钟山", image: "/images/mingxiaoling.jpg", durationMinutes: [120, 180], effort: "适中", arrival: "先选入口", ticket: "查官方公告", reminder: "预留休息", references: [{ title: "官方介绍", url: "https://zschina.nanjing.gov.cn/" }] }],
};
async function context(options = {}) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block", ...options });
  // 默认阻断模型入口，只有单个用例的模拟处理器可以响应。
  await ctx.route("**/api/plan**", route => route.fulfill({ status: 500, json: { code: "TEST_INTERCEPT_REQUIRED", message: "No live API calls permitted" } }));
  return ctx;
}
async function fill(page) {
  await expect(page.locator("#date")).toBeEnabled();
  await page.locator("#date").fill("2026-11-18");
  await page.locator("#startPoint").fill("test station");
  await page.locator("#interests").fill("history");
}

try {
  // 无脚本/脚本尚未加载：按钮从 SSR 起禁用，不能原生 GET 提交。
  for (const noJS of [true, false]) {
    const ctx = await context({ javaScriptEnabled: !noJS });
    if (!noJS) await ctx.route("**/_next/static/**/*.js*", route => route.abort());
    const page = await ctx.newPage();
    await page.goto(`${base}/planner`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("button[type=submit]")).toBeDisabled();
    await expect(page.locator("#startPoint")).toBeDisabled();
    expect(new URL(page.url()).search).toBe("");
    console.log(`PASS mobile ${noJS ? "JavaScript disabled" : "JS chunks failed"}: submission blocked`);
    await ctx.close();
  }

  // 同一次任务在慢响应、刷新、恢复结果时不变编号，也不会出现原生导航。
  {
    const ctx = await context();
    let generationCount = 0, posts = 0, complete = false, jobId;
    await ctx.route("**/api/plan**", async route => {
      const req = route.request();
      if (req.method() === "POST") {
        posts++;
        const id = req.headers()["idempotency-key"];
        expect(id).toMatch(/^[a-f0-9-]{36}$/);
        if (!jobId) { generationCount++; jobId = id; } else expect(id).toBe(jobId);
      } else expect(new URL(req.url()).searchParams.get("requestId")).toBe(jobId);
      await route.fulfill(complete ? { status: 200, json: { status: "completed", requestId: jobId, result: fixture } } : { status: 202, json: { status: "pending", requestId: jobId } });
    });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/planner`); await fill(page);
    if (new URL(base).hostname === "jinling.test") expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    let navigations = 0; page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
    await page.locator("button[type=submit]").tap();
    await page.evaluate(() => { document.querySelector("form").requestSubmit(); document.querySelector("form").requestSubmit(); });
    await expect(page.locator("#startPoint")).toBeDisabled();
    await expect.poll(() => posts).toBe(1);
    expect(navigations).toBe(0);
    expect(new URL(page.url()).searchParams.has("duration")).toBe(false);
    // 模拟手机浏览器刷新/回收页面；已提交任务编号应恢复。
    complete = true;
    await page.reload();
    await expect(page.locator("#plan-title")).toHaveText(fixture.title, { timeout: 15000 });
    await expect(page.locator("#startPoint")).toHaveValue("test station");
    expect(generationCount).toBe(1);
    const countAfterComplete = posts;
    await page.reload();
    await expect(page.locator("#plan-title")).toHaveText(fixture.title);
    expect(posts).toBe(countAfterComplete);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await mkdir(".local", { recursive: true });
    await page.screenshot({ path: ".local/mobile-planner-fixed.png", fullPage: true });
    console.log("PASS mobile submit: no navigation, refresh resumes same task, completed result restores without POST");
    await ctx.close();
  }

  // 回车提交、暂停后恢复、旧响应结构错误均不触发整页重载或新任务。
  {
    const ctx = await context();
    let jobId, complete = false, calls = 0;
    await ctx.route("**/api/plan**", async route => {
      if (route.request().method() === "POST") {
        const id = route.request().headers()["idempotency-key"];
        if (!jobId) { jobId = id; calls++; } else expect(id).toBe(jobId);
      }
      await route.fulfill(complete ? { status: 200, json: { status: "completed", requestId: jobId, result: fixture } } : { status: 202, json: { status: "pending", requestId: jobId } });
    });
    const page = await ctx.newPage(); await page.goto(`${base}/planner`); await fill(page);
    await page.locator("#startPoint").press("Enter");
    await expect.poll(() => calls).toBe(1);
    await page.getByRole("button", { name: "暂停等待", exact: false }).click();
    await expect(page.getByRole("button", { name: "继续查看这次结果" })).toBeVisible();
    complete = true;
    await page.getByRole("button", { name: "继续查看这次结果" }).click();
    await expect(page.locator("#plan-title")).toHaveText(fixture.title);
    expect(calls).toBe(1);
    expect(new URL(page.url()).searchParams.has("budget")).toBe(false);
    console.log("PASS mobile Enter and pause/resume: same generation, no native form navigation");
    await ctx.close();
  }

  {
    const ctx = await context();
    await ctx.route("**/api/plan**", route => route.fulfill({ status: 200, json: { status: "completed", requestId: route.request().headers()["idempotency-key"], result: { title: "old schema" } } }));
    const page = await ctx.newPage(); let errors = 0; page.on("pageerror", () => errors++);
    await page.goto(`${base}/planner`); await fill(page); await page.locator("button[type=submit]").tap();
    await expect(page.locator(".error-message[role=alert]")).toContainText("结果格式");
    expect(errors).toBe(0); expect(new URL(page.url()).searchParams.has("duration")).toBe(false);
    console.log("PASS malformed result: visible error, no render crash and no navigation");
    await ctx.close();
  }

  {
    const ctx = await context(); let calls = 0;
    await ctx.addInitScript(() => Object.defineProperty(window, "sessionStorage", { value: { getItem: () => null, removeItem: () => {}, setItem: () => { throw new DOMException("Storage unavailable", "QuotaExceededError"); } } }));
    await ctx.route("**/api/plan**", route => { calls++; return route.abort(); });
    const page = await ctx.newPage(); await page.goto(`${base}/planner`); await fill(page);
    await page.locator("button[type=submit]").tap();
    await expect(page.locator(".error-message[role=alert]")).toContainText("已阻止生成");
    expect(calls).toBe(0);
    console.log("PASS unavailable session storage: generation blocked before any API request");
    await ctx.close();
  }
} finally { await browser.close(); }
