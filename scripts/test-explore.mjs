import { chromium, devices, expect } from "@playwright/test";
import { loadModule } from "../tests/load-module.mjs";
import { mkdir } from "node:fs/promises";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3110";
const { places } = loadModule("../src/data/places.ts");
const { placeImages } = loadModule("../src/data/place-images.ts");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile ? devices["Pixel 7"] : { viewport: { width: 1440, height: 1000 } });
    await context.route("**/api/plan**", route => route.abort());
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/explore`);
    await expect(page.locator(".destination-card")).toHaveCount(34);
    await page.locator("#place-search").fill("南博");
    await expect(page.locator(".destination-card")).toHaveCount(1);
    await expect(page.locator(".destination-card h3")).toHaveText("南京博物院");
    await page.locator("#place-search").fill("");
    await page.getByRole("button", { name: "美食街巷", exact: true }).click();
    await expect(page.locator(".destination-card")).toHaveCount(5);
    await page.getByRole("button", { name: "全部", exact: true }).click();
    await page.locator("#place-region").selectOption("钟山片区");
    await expect(page.locator(".destination-card")).toHaveCount(3);
    await page.goto(`${base}/explore/mingxiaoling`);
    await expect(page.locator(".gallery-thumbnails button")).toHaveCount(8);
    await page.getByRole("button", { name: "下一张图片", exact: true }).click();
    await expect(page.locator(".gallery-count")).toHaveText("2 / 8");
    await page.locator(".gallery-open").click();
    await expect(page.locator("dialog")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".gallery-count")).toHaveText("3 / 8");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).not.toBeVisible();
    await expect(page.locator(".gallery-open")).toBeFocused();
    if (mobile) {
      await page.locator(".gallery-stage").evaluate(element => {
        const start = new Event("touchstart", { bubbles: true }); Object.defineProperty(start, "touches", { value: [{ clientX: 280 }] }); element.dispatchEvent(start);
        const end = new Event("touchend", { bubbles: true }); Object.defineProperty(end, "changedTouches", { value: [{ clientX: 100 }] }); element.dispatchEvent(end);
      });
      await expect(page.locator(".gallery-count")).toHaveText("4 / 8");
      await expect(page.locator("dialog")).not.toBeVisible();
    }
    await page.locator(".gallery-credit summary").click();
    await expect(page.locator(".gallery-credit a").first()).toHaveAttribute("href", /^https:\/\/commons.wikimedia.org\//);
    await page.waitForFunction(() => { const photo = document.querySelector(".gallery-open img"); return photo?.complete && photo.naturalWidth > 0; });
    await mkdir(".local/previews", { recursive: true });
    await page.screenshot({ path: `.local/previews/gallery-${mobile ? "mobile" : "desktop"}.jpg`, fullPage: false });
    if (errors.length) throw new Error(errors.join("\n"));
    await context.close(); console.log(`${mobile ? "Mobile" : "Desktop"}: search, category, region, gallery, lightbox and credits passed`);
  }
  for (const place of places) {
    const response = await fetch(`${base}/explore/${place.id}`);
    if (response.status !== 200) throw new Error(`Page failed: ${place.id}`);
    for (const photo of placeImages[place.id] || []) {
      const image = await fetch(base + photo.src);
      if (!image.ok || !(image.headers.get("content-type") || "").includes("image/")) throw new Error(`Image failed: ${photo.src}`);
    }
  }
  console.log("All 34 detail pages and registered images returned successfully; no model calls");
} finally { await browser.close(); }
