import { chromium } from "playwright";
import path from "node:path";

/**
 * Drive the real UI end-to-end against the local dev server:
 * login → upload → review → approve clean rows → (optionally) apply → screenshots into .context/.
 *   npx tsx --env-file=.env.local scripts/ui-smoke.ts "<file.xlsx>" [--apply] [--base http://localhost:55000]
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("usage: ui-smoke.ts <file.xlsx> [--apply] [--base URL]");
  const apply = args.includes("--apply");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : `http://localhost:${process.env.CONDUCTOR_PORT ?? 3000}`;
  const out = (name: string) => path.join(process.cwd(), ".context", name);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));

  await page.goto(`${base}/inject`);
  await page.waitForURL(/\/login/);
  await page.screenshot({ path: out("01-login.png") });
  await page.fill('input[name="username"]', process.env.DEV_ADMIN_USERNAME ?? "inject_dev");
  await page.fill('input[name="password"]', process.env.DEV_ADMIN_PASSWORD ?? "inject123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inject$/);
  console.log("logged in");

  await page.setInputFiles('input[type="file"]', file);
  await page.click('button:has-text("Unggah dan periksa")');
  await page.waitForURL(/\/inject\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  const batchUrl = page.url();
  console.log("batch", batchUrl);
  await page.waitForSelector("table tbody tr");
  await page.screenshot({ path: out("02-review.png"), fullPage: false });

  // open first row that needs review to show the detail panel
  const reviewTab = page.getByRole("tab", { name: /Perlu tinjau/ });
  await reviewTab.click();
  const firstRow = page.locator("table tbody tr").first();
  if ((await firstRow.count()) && !(await firstRow.innerText()).includes("Tidak ada baris")) {
    await firstRow.click();
    await page.waitForSelector("text=Rencana penulisan");
    await page.waitForTimeout(500); // let the disclosure transition settle before shooting
    await page.screenshot({ path: out("03-row-detail.png"), fullPage: true });
  }
  await page.getByRole("tab", { name: /^Semua/ }).click();

  await page.getByRole("button", { name: "Setujui baris bersih" }).click();
  await page.waitForSelector("text=/baris bersih disetujui/");
  console.log("approved clean rows:", await page.locator("[role=status]").innerText());
  await page.screenshot({ path: out("04-approved.png") });

  if (apply) {
    await page.getByRole("button", { name: /^Tulis \d+ baris/ }).click();
    await page.getByRole("button", { name: "Ya, tulis sekarang" }).click();
    await page.waitForSelector("text=/diterapkan ke database|Gagal/", { timeout: 120_000 });
    console.log("apply:", await page.locator("[role=status]").innerText());
    await page.screenshot({ path: out("05-applied.png") });
  }

  await page.goto(`${base}/inject`);
  await page.screenshot({ path: out("06-batches.png") });
  await browser.close();
  console.log("done", batchUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
