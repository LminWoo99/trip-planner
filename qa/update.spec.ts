import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// A deploy must reach a phone that already has the app open, without asking the user to reinstall.
test.use({ storageState: "qa/.auth/minu.json" });

test("앱을 연 채로 새 버전을 배포하면 다시 볼 때 자동으로 새 버전이 된다", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "rebuilds the app; run once");
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole("button", { name: "더보기" }).click();
  const before = await page.locator("#build-id").textContent();

  // new deploy while the page stays open (build id is minute-based, so wait for the next minute)
  const wait = 61_000 - (Date.now() % 60_000);
  await page.waitForTimeout(wait);
  execSync("npm run build", { stdio: "ignore" });

  // coming back to the app triggers the update check; the page reloads by itself
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForEvent("load", { timeout: 30_000 });
  await page.getByRole("button", { name: "더보기" }).click();
  await expect(page.locator("#build-id")).not.toHaveText(before ?? "");
});

test("입력 시트를 연 상태에서는 새로고침하지 않고 '새 버전이 있어요' 안내를 띄운다", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "rebuilds the app; run once");
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  await page.getByLabel("제목").fill("쓰는 중인 일정");

  const wait = 61_000 - (Date.now() % 60_000);
  await page.waitForTimeout(wait);
  execSync("npm run build", { stdio: "ignore" });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await expect(page.getByText("새 버전이 있어요")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("제목")).toHaveValue("쓰는 중인 일정");
  await page.screenshot({ path: "qa-screens/android-90-update-banner.png" });
  await page.getByRole("button", { name: "지금 적용" }).click();
  await page.waitForEvent("load");
  await expect(page.getByText("새 버전이 있어요")).toHaveCount(0);
});
