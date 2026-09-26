/** Regenerates docs/assets/cover.png from cover.html (1280x720). */
import path from "node:path";
import { chromium } from "playwright";

const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("file://" + path.resolve("docs/assets/cover.html"));
await page.waitForTimeout(500);
await page.screenshot({ path: path.resolve("docs/assets/cover.png") });
await browser.close();
console.log("cover regenerated");
