/**
 * Submission asset capture (docs/assets/). Requires seller + dashboard running
 * with live keys and an EMPTY history. Order: block → pass → escalate.
 * During escalate it prints the approval link and waits for the human to DENY
 * (leaves a denied row for the history shot), then captures history + cover.
 */
import path from "node:path";
import { chromium } from "playwright";

const base = "http://localhost:3000";
const assets = path.resolve("docs/assets");
const out = (name: string) => path.join(assets, name);

const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(base);

async function waitFinished(marker: string): Promise<void> {
  await page.waitForFunction(
    (m) => document.querySelector("#steps")?.textContent?.includes(m) ?? false,
    marker,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(400); // let the last SSE render settle
}

// 1. BLOCK — toxicScore 100 + traits + reason all visible
await page.click('button:has-text("/api/risky")');
await waitFinished("finished: blocked");
await page.locator("#intercepta").scrollIntoViewIfNeeded();
await page.screenshot({ path: out("screenshot-2-block.png") });
console.log("captured screenshot-2-block.png");

// 2. PASS — settled + tx hash
await page.click('button:has-text("/api/data")');
await waitFinished("finished: paid");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: out("screenshot-1-pass.png") });
console.log("captured screenshot-1-pass.png");

// 3. ESCALATE — QR + user_code + waiting state
await page.click('button:has-text("/api/premium")');
await page.waitForFunction(
  () => (document.getElementById("wid-code")?.textContent ?? "").length > 5,
  undefined,
  { timeout: 120_000 },
);
await page.waitForTimeout(600); // QR img render
await page.locator("#worldid").scrollIntoViewIfNeeded();
await page.screenshot({ path: out("screenshot-3-escalate.png") });
console.log("captured screenshot-3-escalate.png");
const link = await page.evaluate(
  () => (document.getElementById("wid-link") as HTMLAnchorElement).href,
);
const code = await page.evaluate(
  () => document.getElementById("wid-code")?.textContent,
);
console.log(`\n=== HUMAN ACTION REQUIRED: open and press DENY ===`);
console.log(`Approval link: ${link}`);
console.log(`User code:     ${code}`);
console.log(`==================================================\n`);

// wait for the human to deny
await page.waitForFunction(
  () => {
    const t = document.querySelector("#steps")?.textContent ?? "";
    return /finished: (denied|paid|expired|failed)/.test(t);
  },
  undefined,
  { timeout: 1_260_000 },
);
const stepsText = await page.evaluate(
  () => document.querySelector("#steps")?.textContent ?? "",
);
if (!stepsText.includes("finished: denied")) {
  console.error(`expected denied, steps ended with: ${stepsText.slice(-120)}`);
  await browser.close();
  process.exit(1);
}
console.log("denied confirmed");

// 4. History — paid / blocked / denied rows
await page.waitForTimeout(500);
await page.locator(".panel:has(#history)").screenshot({
  path: out("screenshot-4-history.png"),
});
console.log("captured screenshot-4-history.png");

// 5. Cover 1280x720 from local HTML
const cover = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await cover.goto("file://" + out("cover.html"));
await cover.waitForTimeout(500);
await cover.screenshot({ path: out("cover.png") });
console.log("captured cover.png");

await browser.close();
console.log("\n[capture-assets] DONE");
