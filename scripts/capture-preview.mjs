import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.PREVIEW_BASE_URL || "http://127.0.0.1:3110";
const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "zh-CN", reducedMotion: "reduce" });
  await context.route("**/api/plan**", route => route.abort());
  await mkdir("docs/images", { recursive: true });
  const page = await context.newPage();
  for (const [route, name] of [["/", "homepage"], ["/explore", "explore"]]) {
    await page.goto(new URL(route, base).href, { waitUntil: "networkidle" });
    await page.evaluate(() => { for (const image of document.images) image.loading = "eager"; });
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/images/${name}.jpg`, type: "jpeg", quality: 90, fullPage: true, animations: "disabled" });
    console.log(`Saved docs/images/${name}.jpg`);
  }
  await context.close();
} finally { await browser.close(); }
