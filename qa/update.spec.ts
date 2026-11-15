import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// A deploy reaches an open app as an offer: the screen never reloads by itself.
test.use({ storageState: "qa/.auth/minu.json" });

async function deployWhileOpen(page: import("@playwright/test").Page) {
  // build id is minute-based, so wait for the next minute
  await page.waitForTimeout(61_000 - (Date.now() % 60_000));
  execSync("npm run build", { stdio: "ignore" });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("새 버전이 나와도 저절로 새로고침하지 않고, '지금 적용'을 누르면 새 버전이 된다", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "rebuilds the app; run once");
  test.setTimeout(150_000);
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole("button", { name: "더보기" }).click();
  const before = await page.locator("#build-id").textContent();
  let loads = 0;
  page.on("load", () => loads++);

  await deployWhileOpen(page);
  await expect(page.getByText("새 버전이 있어요")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(5_000);
  expect(loads).toBe(0);
  await expect(page.locator("#build-id")).toHaveText(before ?? "");

  await page.getByRole("button", { name: "지금 적용" }).click();
  await page.waitForEvent("load", { timeout: 30_000 });
  await page.getByRole("button", { name: "더보기" }).click();
  await expect(page.locator("#build-id")).not.toHaveText(before ?? "");
  await expect(page.getByText("새 버전이 있어요")).toHaveCount(0);
});

test("입력 시트를 연 상태에서도 입력값은 그대로 두고 안내만 띄운다", async ({ page }, info) => {
  test.skip(info.project.name !== "android", "rebuilds the app; run once");
  test.setTimeout(150_000);
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  await page.getByLabel("제목").fill("쓰는 중인 일정");
  await deployWhileOpen(page);
  await expect(page.getByText("새 버전이 있어요")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("제목")).toHaveValue("쓰는 중인 일정");
});
