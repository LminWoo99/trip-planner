import { expect, test, type Page } from "@playwright/test";

// End-to-end QA on phone viewports. Screenshots go to qa-screens/ for visual review.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `qa-screens/${test.info().project.name}-${name}.png`, fullPage: false });

async function openDay(page: Page, n: number) {
  await page.getByRole("button", { name: new RegExp(`^${n}일차`) }).click();
}

test.describe("진입", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("틀린 코드는 거절하고 맞는 코드와 이름으로 들어간다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "gate is rate limited; run once");
    await page.goto("/");
    await shot(page, "01-gate");
    await page.getByLabel("사귄 날짜 4자리").fill("1111");
    await page.getByRole("button", { name: "들어가기" }).click();
    await expect(page.getByRole("alert")).toHaveText("땡! 다시 생각해 봐");
    await page.getByLabel("사귄 날짜 4자리").fill(process.env.TRIP_GATE_CODE ?? "1234");
    await page.getByRole("button", { name: "들어가기" }).click();
    await expect(page.getByRole("heading", { name: "누구세요?" })).toBeVisible();
    await shot(page, "02-who");
    await page.getByRole("button", { name: /^민우/ }).click();
    await expect(page.getByRole("button", { name: /^1일차/ })).toBeVisible();
  });
});

test.describe("일정", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("1일차 타임라인이 시간·번호·거리와 함께 보인다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 1);
    await expect(page.getByRole("heading", { name: "출국 & 야간버스" })).toBeVisible();
    await expect(page.locator(".tl .card").first()).toBeVisible();
    await shot(page, "10-day1");
    await page.locator(".tl").scrollIntoViewIfNeeded();
    await shot(page, "11-day1-timeline");
  });

  test("갈림길에서 플랜을 미리 보고 고르면 상대 화면에도 반영되고 다시 고를 수 있다", async ({ page, browser }) => {
    await page.goto("/");
    await openDay(page, 2);
    const fork = page.locator("section.fork").first();
    await fork.scrollIntoViewIfNeeded();
    await expect(fork.getByRole("tab")).toHaveCount(3);
    await shot(page, "20-fork-before");

    await fork.getByRole("tab", { name: /B/ }).click();
    await expect(fork.getByRole("tab", { name: /B/ })).toHaveAttribute("aria-selected", "true");
    await expect(fork.locator(".p-title").first()).toHaveText(/0.5박/);
    await shot(page, "21-fork-plan-b");

    // the other phone
    const other = await browser.newContext({ ...test.info().project.use, storageState: "qa/.auth/ryeojin.json" });
    const page2 = await other.newPage();
    await page2.goto("/");
    await openDay(page2, 2);
    await expect(page2.locator("section.fork .trail")).toBeVisible();

    await fork.getByRole("button", { name: "플랜 B로 갈게" }).click();
    await expect(page.getByText("민우가 플랜 B로 골랐어요")).toBeVisible();
    await expect(page2.getByText("민우가 플랜 B로 골랐어요")).toBeVisible({ timeout: 5000 });
    await shot(page, "22-fork-chosen");
    await page2.screenshot({ path: `qa-screens/${test.info().project.name}-23-fork-chosen-other-phone.png` });

    await page.getByRole("button", { name: "다시 고르기" }).click();
    await expect(page2.locator("section.fork .trail")).toBeVisible({ timeout: 5000 });
    await other.close();
  });

  test("+ 버튼으로 일정을 추가하고 카드를 눌러 고치고 지운다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 4);
    await page.getByRole("button", { name: "일정 추가" }).click();
    await page.getByLabel("제목").fill("QA 테스트 일정");
    await page.getByRole("button", { name: "카페" }).click();
    await page.locator("#item-time").fill("15:30");
    await shot(page, "30-item-sheet");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    const card = page.locator(".card", { hasText: "QA 테스트 일정" });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "QA 테스트 일정" }).click();
    await page.getByLabel("제목").fill("QA 테스트 일정 수정");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".card", { hasText: "QA 테스트 일정 수정" })).toBeVisible();

    await page.locator(".card", { hasText: "QA 테스트 일정 수정" }).getByRole("button", { name: "QA 테스트 일정 수정" }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".card", { hasText: "QA 테스트 일정 수정" })).toHaveCount(0);
  });

  test("메모에 사진을 붙이면 카드에 썸네일이 보이고 눌러서 크게 본다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 4);
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await page.getByLabel("제목").fill("QA 사진 일정");
    await page.locator(".photo-add input[type=file]").setInputFiles("qa/fixtures/photo.png");
    await expect(page.locator(".photo-strip.edit img")).toHaveCount(1);
    await page.getByRole("button", { name: "추가", exact: true }).click();
    const card = page.locator(".card", { hasText: "QA 사진 일정" });
    await expect(card.locator(".photo-strip img")).toHaveCount(1);
    await expect.poll(() => card.locator(".photo-strip img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await shot(page, "45-photo-card");
    await card.getByRole("button", { name: "사진 1 크게 보기" }).click();
    await expect(page.getByRole("dialog", { name: "사진 보기" }).locator("img")).toBeVisible();
    await shot(page, "46-photo-viewer");
    await page.getByRole("button", { name: "닫기" }).click();
    // clean up
    await card.getByRole("button", { name: "QA 사진 일정" }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".card", { hasText: "QA 사진 일정" })).toHaveCount(0);
  });

  test("편집 모드에서 손잡이를 끌어 순서를 바꾼다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 4);
    await page.getByRole("button", { name: "편집" }).click();
    const titles = page.locator(".edit-list > .e-row .e-title");
    await expect(titles.first()).toBeVisible();
    const before = await titles.allTextContents();
    expect(before.length).toBeGreaterThan(1);
    await shot(page, "40-edit-mode");

    const handles = page.locator(".edit-list > .e-row > .handle");
    const from = await handles.nth(0).boundingBox();
    const to = await handles.nth(1).boundingBox();
    await page.mouse.move(from!.x + 22, from!.y + 22);
    await page.mouse.down();
    await page.mouse.move(from!.x + 22, from!.y + 30, { steps: 4 });
    await page.mouse.move(to!.x + 22, to!.y + 40, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => titles.allTextContents()).toEqual([before[1], before[0], ...before.slice(2)]);

    // persisted: survives a reload
    await page.reload();
    await openDay(page, 4);
    await page.getByRole("button", { name: "편집" }).click();
    await expect(titles.first()).toBeVisible();
    await expect.poll(() => titles.allTextContents()).toEqual([before[1], before[0], ...before.slice(2)]);
  });

  test("편집 화면과 갈림길 플랜에서 메모를 그 자리에서 펼쳐 본다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 2);
    const fork = page.locator("section.fork").first();
    await fork.getByRole("button", { name: "메모 보기" }).first().click();
    await expect(fork.locator(".memo-toggle p").first()).toBeVisible();
    await page.getByRole("button", { name: "편집" }).click();
    const memoBtn = page.locator(".edit-list").getByRole("button", { name: "메모 보기" }).first();
    await memoBtn.click();
    await expect(page.locator(".edit-list .memo-toggle p").first()).toBeVisible();
    await shot(page, "42-edit-memo");
  });

  test("좌우로 밀면 다른 날로 넘어간다", async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, "touch only");
    await page.goto("/");
    await openDay(page, 2);
    const box = (await page.locator(".screen").boundingBox())!;
    const y = box.y + 120;
    await page.locator(".screen").dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: box.x + 300, clientY: y }] });
    await page.locator(".screen").dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: box.x + 80, clientY: y }] });
    await expect(page.getByRole("button", { name: /^3일차/ })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Google 지도·장소", () => {
  // Google's per-minute quota can reject a burst of test calls; one retry keeps the run honest
  test.describe.configure({ retries: 1 });
  test.use({ storageState: "qa/.auth/minu.json" });

  test("동선 지도가 Google 지도로 뜨고 번호 핀이 찍힌다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 5);
    const map = page.locator(".map");
    await map.scrollIntoViewIfNeeded();
    await expect(map.locator(".map-empty")).toHaveCount(0, { timeout: 15000 });
    await expect(map.locator(".gm-style")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await shot(page, "80-google-map");
    await page.getByRole("button", { name: "지도 크게 보기" }).click();
    await page.waitForTimeout(1500);
    await shot(page, "80b-google-map-big");
    await page.getByRole("button", { name: "지도 작게 보기" }).click();
  });

  test("일정 추가에서 이름을 치면 Google 후보가 뜨고 고르면 위치가 채워진다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 2);
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await page.locator("#item-place").fill("Pistachio Hotel Sapa");
    const first = page.locator(".suggest-row").first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Powered by Google")).toBeVisible();
    await shot(page, "81-place-suggest");
    await first.click();
    await expect(page.getByText("지도에 표시되는 장소예요")).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("제목")).not.toHaveValue("");
    await shot(page, "82-place-picked");
  });

  test("일정에 코스를 붙여넣으면 경유지가 저장되고 코스 화면에서 지도와 순서를 본다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "uses Google quota; once is enough");
    await page.goto("/");
    await openDay(page, 3);
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await page.getByLabel("제목").fill("QA 트레킹 코스");
    await page.getByRole("button", { name: "트레킹" }).click();
    await page.getByRole("button", { name: "코스 붙여넣기" }).click();
    await page.locator("#stops-paste").fill("Sapana Bistro → Lao Chai Valley View → Ta Van Village");
    await page.getByRole("button", { name: /3곳 찾아서 넣기/ }).click();
    await expect(page.locator(".stops-edit li")).toHaveCount(3, { timeout: 30000 });
    await shot(page, "84-stops-edit");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    const card = page.locator(".card", { hasText: "QA 트레킹 코스" });
    await expect(card.getByRole("button", { name: /경유 3곳/ })).toBeVisible();
    await card.getByRole("button", { name: /경유 3곳/ }).click();
    await expect(page.getByRole("link", { name: "구글맵 도보 길찾기" })).toBeVisible();
    await page.waitForTimeout(2500);
    await shot(page, "85-route-sheet");
    // clean up
    await page.getByRole("button", { name: "고치기" }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".card", { hasText: "QA 트레킹 코스" })).toHaveCount(0);
  });

  test("위치 없는 장소 채우기가 Google에서 후보를 찾아 보여준다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("button", { name: /위치 없는 장소 채우기/ }).click();
    await page.getByRole("button", { name: /Google에서 찾기/ }).click();
    await expect(page.getByRole("button", { name: /찾는 중이에요/ })).toBeVisible();
    const save = page.getByRole("button", { name: /선택한 \d+곳 저장/ });
    await expect(save).toBeVisible({ timeout: 90000 });
    await expect(save).not.toHaveText("선택한 0곳 저장");
    await page.locator(".sheet-body").evaluate((el) => el.scrollTo(0, 0));
    await shot(page, "83-fill-locations");
  });
});

test.describe("다른 탭", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("지출을 기록하면 총 지출에 잡히고 정산 탭에서 보낼 돈이 나온다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "경비" }).click();
    await page.getByRole("button", { name: "지출 추가" }).click();
    await page.getByLabel("내용").fill("쌀국수 두 그릇");
    await page.locator("#exp-amount").fill("200000");
    await shot(page, "50-expense-sheet");
    await page.getByRole("button", { name: "기록", exact: true }).click();
    await expect(page.locator(".big")).toHaveText("10,600원");
    await shot(page, "51-expenses");
    await page.getByRole("tab", { name: "정산" }).click();
    await expect(page.getByText("려진 → 민우 5,300원")).toBeVisible();
    await shot(page, "52-settle");
    // clean up for the other project
    await page.getByRole("tab", { name: "지출" }).click();
    await page.getByRole("button", { name: /쌀국수 두 그릇/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".big")).toHaveText("0원");
  });

  test("공용비로 쓰면 잔액이 줄고 넣은 금액 차이만 정산된다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "경비" }).click();
    await page.getByRole("button", { name: "넣기" }).click();
    await page.locator("#dep-amount").fill("1000000");
    await page.getByRole("button", { name: "넣기", exact: true }).last().click();
    await expect(page.getByText("1,000,000₫")).toBeVisible();

    await page.getByRole("button", { name: "지출 추가" }).click();
    await page.getByLabel("내용").fill("택시");
    await page.locator("#exp-amount").fill("150000");
    await page.getByRole("button", { name: "공용비", exact: true }).click();
    await page.getByRole("button", { name: "기록", exact: true }).click();
    await expect(page.getByText("850,000₫")).toBeVisible();
    await shot(page, "53-pool");

    await page.getByRole("tab", { name: "정산" }).click();
    // only 민우 deposited 1,000,000₫ → 려진 owes half of 53,000원
    await expect(page.getByText("려진 → 민우 26,500원")).toBeVisible();

    // clean up
    await page.getByRole("button", { name: /민우 입금/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("tab", { name: "지출" }).click();
    await page.getByRole("button", { name: /택시/ }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".big")).toHaveText("0원");
  });

  test("장소를 검색·종류로 거르고 눌러서 상세를 본다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "장소" }).click();
    await expect(page.locator(".place-row").first()).toBeVisible();
    await shot(page, "60-places");
    const total = await page.locator(".place-row").count();
    await page.getByLabel("장소 검색").fill("철갑상어");
    await expect(page.locator(".place-row")).toHaveCount(1);
    await page.getByLabel("장소 검색").fill("없는장소이름");
    await expect(page.getByText(/에 맞는 장소가 없어요/)).toBeVisible();
    await page.getByRole("button", { name: "검색어 지우기" }).click();
    await page.getByRole("button", { name: /^식당 \d+/ }).click();
    const food = await page.locator(".place-row").count();
    expect(food).toBeGreaterThan(0);
    expect(food).toBeLessThan(total);
    await page.locator(".place-main").first().click();
    await expect(page.getByRole("link", { name: "구글맵에서 보기" })).toBeVisible();
    await shot(page, "61-place-detail");
  });

  test("여러 곳 한 번에 추가에서 이름을 붙여넣으면 Google 후보를 보여준다", async ({ page }) => {
    test.skip(test.info().project.name !== "iphone", "uses Google quota; once is enough");
    await page.goto("/");
    await page.getByRole("button", { name: "장소" }).click();
    await page.getByRole("button", { name: "여러 곳 한 번에 추가" }).click();
    await page.locator("#import-text").fill("Moana Sapa | 그네 사진\nCong Caphe Sapa");
    await page.getByRole("button", { name: /2곳 Google에서 찾기/ }).click();
    await expect(page.getByRole("button", { name: /선택한 \d+곳 추가/ })).toBeVisible({ timeout: 30000 });
    await shot(page, "62-import");
  });

  test("준비물·더보기 화면이 데이터와 함께 보인다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "준비물" }).click();
    await expect(page.getByText(/챙긴 것/)).toBeVisible();
    await shot(page, "63-checklist");
    await page.getByRole("button", { name: "더보기" }).click();
    await expect(page.getByRole("heading", { name: "예약" })).toBeVisible();
    await expect(page.getByText("+82-2-3210-0404")).toBeVisible();
    await shot(page, "64-more");
  });
});

test.describe("오프라인", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("한 번 연 뒤에는 네트워크가 끊겨도 일정을 읽을 수 있다", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^1일차/ })).toBeVisible();
    // let the service worker install and take control
    await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
    await page.reload();
    await expect(page.getByRole("button", { name: /^1일차/ })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await openDay(page, 2);
    await expect(page.locator("section.fork, .chosen").first()).toBeVisible();
    await expect(page.getByText(/오프라인, 마지막 동기화/)).toBeVisible();
    await shot(page, "70-offline");
    await context.setOffline(false);
  });
});
