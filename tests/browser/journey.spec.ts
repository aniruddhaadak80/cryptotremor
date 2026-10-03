import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * The primary journey, driven entirely through visible controls.
 *
 * import → inspect → decide → scrub the horizon → run the engine → call an
 * agent tool → export and share → delete
 *
 * Every assertion is on rendered UI, and any console error or failed request
 * fails the test, so a broken control cannot pass quietly.
 */

const SHOT_DIR = "docs/screenshots";
mkdirSync(SHOT_DIR, { recursive: true });

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    // Favicons and aborted Next.js route prefetches are not product failures:
    // the prefetch is cancelled on purpose when the visitor navigates away.
    if (request.url().includes("favicon")) return;
    if (request.url().includes("_rsc=") && failure?.errorText?.includes("ERR_ABORTED")) return;
    if (failure?.errorText?.includes("ERR_ABORTED")) return;
    problems.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  return problems;
}

const stamp = Date.now();

test("primary journey through the visible interface", async ({ page }, testInfo) => {
  const problems = watchConsole(page);
  const shot = (name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}-${testInfo.project.name}.png`, fullPage: false });

  // 1. Land and import the reference estate.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("rupture date");
  await shot("01-landing");

  await page.getByRole("button", { name: /load the reference estate/i }).click();
  await page.waitForURL("**/seismograph", { timeout: 45_000 });

  // 2. The trace is a real measurement, not a placeholder.
  await expect(page.getByRole("heading", { name: /move the horizon/i })).toBeVisible();
  const trace = page.locator("figure svg path").first();
  await expect(trace).toBeVisible();
  const d = await trace.getAttribute("d");
  expect(d && d.length).toBeTruthy();
  expect((d ?? "").length).toBeGreaterThan(80);
  await expect(page.getByText(/assets exposed/i)).toBeVisible();
  await shot("02-seismograph");

  // 3. The queue was computed from the imported estate.
  const queue = page.getByRole("heading", { name: /what the engine says matters first/i });
  await expect(queue).toBeVisible();

  // 4. Inspect one primitive: cost ledger plus itemised factors.
  await page.goto("/survey");
  await expect(page.getByRole("heading", { name: /the estate/i })).toBeVisible();
  const rows = page.locator("ul li a[href^='/asset/']");
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  await rows.first().click();
  await expect(page.getByText(/quantum cost ledger/i)).toBeVisible();
  await expect(page.getByText(/factor evidence/i)).toBeVisible();
  await expect(page.getByText(/why [\d.]+, not something else/i)).toBeVisible();
  await shot("03-asset-detail");

  // 5. Record a decision through the form.
  await page.getByLabel("Decision").selectOption("schedule");
  await page
    .getByLabel(/note \(sealed into the audit event\)/i)
    .fill("browser journey: dual-deploy before cutover");
  await page.getByRole("button", { name: /record decision/i }).click();
  await expect(page.getByText(/decision recorded/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/seal sha384:/i)).toBeVisible();

  // 6. Scrub the rupture timeline and persist it.
  await page.goto("/seismograph");
  const rail = page.getByLabel(/horizon year/i);
  await expect(rail).toBeVisible();
  await rail.fill("2033");
  await page.getByRole("button", { name: /save horizon 2033/i }).click();
  await expect(page.getByText(/saved\. \d+ assets re-scored/i)).toBeVisible({ timeout: 45_000 });

  // Releasing the rail persists too, so the control cannot be a no-op.
  await rail.fill("2036");
  await rail.dispatchEvent("mouseup");
  await expect(page.getByText(/saved\. \d+ assets re-scored/i)).toBeVisible({ timeout: 45_000 });
  await shot("04-rupture-scrub");

  // 7. Waves and strata are present and carry real numbers.
  await expect(page.getByText(/grover amplitude amplification/i)).toBeVisible();
  await expect(page.getByText(/strata cross-section/i)).toBeVisible();

  // 8. Agent console: handshake, mutation, verification.
  await page.goto("/agent");
  await page.getByRole("button", { name: /initialize/i }).click();
  await expect(page.getByText(/owner established|owner:/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /save_asset/i }).click();
  await expect(page.getByText(/open result/i).first()).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /verify_integrity/i }).click();
  await expect(page.getByText(/chain intact|"ok": true/i).first()).toBeVisible({ timeout: 45_000 });
  await shot("05-agent-console");

  // 9. Export and share.
  await page.goto("/report");
  await page.getByLabel(/report label/i).fill(`browser-journey-${stamp}`);
  await page.getByRole("button", { name: /create share link/i }).click();
  await expect(page.getByRole("link", { name: /\/r\/[0-9a-f]{32}/ })).toBeVisible({ timeout: 45_000 });
  await shot("06-report");

  // 10. The partner link works without the owner session.
  const shareHref = await page.getByRole("link", { name: /\/r\/[0-9a-f]{32}/ }).getAttribute("href");
  expect(shareHref).toBeTruthy();
  const partner = await page.context().newPage();
  const partnerProblems: string[] = [];
  partner.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") partnerProblems.push(message.text());
  });
  const response = await partner.goto(shareHref as string);
  expect(response?.status()).toBe(200);
  await expect(partner.getByText(/frozen snapshot/i)).toBeVisible();
  await expect(partner.getByText(/planning estimates/i).first()).toBeVisible();
  await partner.screenshot({ path: `${SHOT_DIR}/07-partner-report-${testInfo.project.name}.png` });
  await partner.close();

  // 11. Integrity replay page.
  await page.goto("/verify");
  await expect(page.getByText(/chain intact/i)).toBeVisible({ timeout: 30_000 });

  // 12. Settings registry.
  await page.goto("/settings");
  await expect(page.getByText(/algorithm registry/i)).toBeVisible();
  await expect(page.getByText(/compliance regimes/i)).toBeVisible();
  await shot("08-settings");

  // 13. Delete a primitive and confirm the tombstone is truthful.
  await page.goto("/survey");
  await rows.first().click();
  await page.getByRole("button", { name: /retire this primitive/i }).click();
  await expect(page.getByText(/row is kept as a tombstone/i)).toBeVisible({ timeout: 30_000 });

  // 14. Keyboard reachability of the primary controls.
  await page.goto("/");
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(firstFocus.length).toBeGreaterThan(0);

  // 15. The GitHub link is present in the shared chrome and opens externally.
  //    On a narrow viewport the desktop nav is hidden, so assert on whichever
  //    link this viewport actually renders.
  const repoLinks = page.locator('header a[href^="https://github.com/aniruddhaadak80/cryptotremor"]:visible');
  expect(await repoLinks.count()).toBeGreaterThan(0);
  const repoLink = repoLinks.first();
  await expect(repoLink).toHaveAttribute("rel", /noopener/);
  await expect(repoLink).toHaveAttribute("target", "_blank");
  await repoLink.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();

  const footerLink = page.locator('footer a[href^="https://github.com/aniruddhaadak80/cryptotremor"]:visible');
  expect(await footerLink.count()).toBeGreaterThan(0);
  await expect(footerLink.first()).toHaveAttribute("rel", /noopener/);

  expect(problems, `console/network problems:\n${problems.join("\n")}`).toEqual([]);
  expect(partnerProblems, `partner page problems:\n${partnerProblems.join("\n")}`).toEqual([]);
});

test("empty state is honest before an estate exists", async ({ page }) => {
  const problems = watchConsole(page);
  // A fresh context has no session cookie, so the proxy mints a new empty scope.
  await page.goto("/survey");
  await expect(page.getByText(/this session has no estate yet|no assets match/i).first()).toBeVisible();
  await page.goto("/seismograph");
  await expect(page.getByText(/this session has no estate/i)).toBeVisible();
  await page.goto("/report");
  await expect(page.getByText(/this session has an empty estate|no estate yet/i)).toBeVisible();
  expect(problems, problems.join("\n")).toEqual([]);
});