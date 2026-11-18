import { expect, test, type Page } from "@playwright/test";

/** Opens the item form from the + button; people with the AI permission first pick "직접 추가". */
async function openItemForm(page: Page) {
  await page.getByRole("button", { name: "일정 추가", exact: true }).click();
  const direct = page.getByRole("button", { name: /직접 추가/ });
  await direct.or(page.locator("#item-title")).first().waitFor();
  if (await direct.isVisible()) await direct.click();
}

// End-to-end QA on phone viewports. Screenshots go to qa-screens/ for visual review.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `qa-screens/${test.info().project.name}-${name}.png`, fullPage: false });

async function openDay(page: Page, n: number) {
  await page.getByRole("button", { name: new RegExp(`^${n}일차`) }).click();
}

test.describe("진입", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("틀린 비밀번호는 같은 문구로 거절하고 맞으면 여행 목록으로 들어간다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "login is rate limited; run once");
    await page.goto("/");
    await shot(page, "01-login");
    await page.locator("#login-id").fill("qa_minu");
    await page.locator("#login-pw").fill("9999");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("alert")).toHaveText("아이디 또는 비밀번호가 올바르지 않습니다.");
    await page.waitForTimeout(3100); // PocketBase: 2 auth calls per 3 seconds
    await page.locator("#login-pw").fill("qa-pass-11");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
    await page.getByRole("button", { name: /사파 여행/ }).click();
    await expect(page.getByRole("button", { name: /^1일차/ })).toBeVisible();
  });

  test("가입은 숫자만 된 비밀번호를 막고 규칙을 지키면 바로 들어간다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "creates an account; run once");
    await page.goto("/");
    await page.getByRole("button", { name: "가입하기" }).click();
    await page.locator("#su-id").fill("qa_friend");
    await page.locator("#su-name").fill("친구");
    await page.locator("#su-pw").fill("12345678");
    await expect(page.locator(".pw-rules li.bad")).toContainText("숫자만으로는 안 돼요");
    await expect(page.getByRole("button", { name: "가입하기", exact: true })).toBeDisabled();
    await shot(page, "02-signup");
    await page.locator("#su-pw").fill("trip2026!");
    await page.getByRole("button", { name: "가입하기", exact: true }).click();
    // a new person sees no trips: the Sapa trip is only for its members
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
    await expect(page.getByRole("button", { name: /사파 여행/ })).toHaveCount(0);
  });
});

test.describe("일정", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("날짜가 많아도 편집 버튼은 항상 화면에 보이고 고른 날짜도 보이게 스크롤된다", async ({ page }) => {
    await page.goto("/");
    const editBtn = page.getByRole("button", { name: "편집", exact: true });
    await expect(editBtn).toBeInViewport({ ratio: 1 });
    await openDay(page, 5);
    await expect(page.getByRole("button", { name: /^5일차/ })).toBeInViewport();
    await expect(editBtn).toBeInViewport({ ratio: 1 });
    await page.waitForTimeout(400);
    await shot(page, "15-days-edit-pinned");
  });

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
    await openItemForm(page);
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
    await openItemForm(page);
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

  test("하루 예상 비용이 보이고 갈림길에서 고른 플랜에 따라 바뀐다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 2);
    const addItem = async (title: string, cost: string) => {
      await page.getByLabel("제목").fill(title);
      await page.locator("#item-cost").fill(cost);
      await page.getByRole("button", { name: "추가", exact: true }).click();
      await expect(page.locator(".sheet")).toHaveCount(0);
    };
    // common item: 200,000₫ → 10,600원
    await openItemForm(page);
    await addItem("QA 공통 비용", "200000");
    await expect(page.locator(".day-cost")).toContainText("약 11,000원");
    // plan B item: 1,000,000₫ → 53,000원
    const fork = page.locator("section.fork").first();
    await fork.getByRole("tab", { name: /B/ }).click();
    await fork.getByRole("button", { name: "플랜 B에 일정 추가" }).click();
    await addItem("QA 플랜B 비용", "1000000");
    await expect(fork.getByRole("tab", { name: /B/ })).toContainText("약 53,000원");
    // previewing B (before deciding) already moves the day total to B
    await expect(page.locator(".day-cost")).toContainText("약 64,000원");
    await expect(page.locator(".day-cost")).toContainText("플랜 B 미리보기");
    await fork.getByRole("tab", { name: /A/ }).click();
    await expect(page.locator(".day-cost")).toContainText("약 11,000원");
    await expect(page.locator(".day-cost")).toContainText("플랜 A 미리보기");
    await fork.scrollIntoViewIfNeeded();
    await shot(page, "47-fork-costs");
    await fork.getByRole("tab", { name: /B/ }).click();
    await page.getByRole("button", { name: "플랜 B로 갈게" }).click();
    await expect(page.locator(".day-cost")).toContainText("약 64,000원");
    await expect(page.locator(".day-cost")).toContainText("플랜 B 기준");
    await page.locator(".screen").evaluate((el) => el.scrollTo(0, 0));
    await shot(page, "48-day-cost-b");
    // clean up
    await page.getByRole("button", { name: "다시 고르기" }).click();
    for (const t of ["QA 공통 비용", "QA 플랜B 비용"]) {
      await page.getByRole("button", { name: "편집" }).click();
      if (t.includes("플랜B")) await page.locator(".e-fork").getByRole("tab", { name: "플랜 B" }).click();
      await page.getByRole("button", { name: t, exact: true }).click();
      await page.getByRole("button", { name: "삭제" }).click();
      await page.getByRole("button", { name: "삭제하기" }).click();
      await page.getByRole("button", { name: "완료" }).click();
    }
    await expect(page.locator(".day-cost")).toHaveCount(0);
  });

  test("편집 모드에서 일정을 골라 다른 날로 복사하면 원래 날에도 남는다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 4);
    await page.getByRole("button", { name: "편집" }).click();
    const first = page.locator(".edit-list > .e-row").first();
    const title = (await first.locator(".e-title").textContent())!.trim();
    await first.getByRole("checkbox").click();
    await page.getByRole("button", { name: "복사" }).click();
    await shot(page, "43-copy-sheet");
    await page.getByRole("dialog").getByRole("button", { name: /^5일차/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".edit-list .e-title").filter({ hasText: new RegExp(`^${title}$`) })).toHaveCount(1);
    await page.getByRole("button", { name: "완료" }).click();
    await openDay(page, 5);
    const copied = page.locator(".card").filter({ has: page.getByRole("button", { name: title, exact: true }) });
    await expect(copied).toHaveCount(1);
    // clean up the copy
    await copied.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(copied).toHaveCount(0);
  });

  test("복사할 때 갈림길이 있는 날은 플랜을 골라 그 안에 넣는다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 4);
    await page.getByRole("button", { name: "편집" }).click();
    const first = page.locator(".edit-list > .e-row").first();
    const title = (await first.locator(".e-title").textContent())!.trim();
    await first.getByRole("checkbox").click();
    await page.getByRole("button", { name: "복사" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^2일차/ }).click();
    const planB = page.getByRole("dialog").getByRole("button", { name: /^플랜 B/ });
    await expect(planB).toBeVisible();
    await shot(page, "44-copy-into-plan");
    await planB.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "완료" }).click();
    await openDay(page, 2);
    const fork = page.locator("section.fork").first();
    await fork.getByRole("tab", { name: /B/ }).click();
    await expect(fork.locator(".p-title").getByText(title, { exact: true })).toBeVisible();
    // clean up: open the copy from the edit list (plan B tab) and delete it
    await page.getByRole("button", { name: "편집" }).click();
    await page.locator(".e-fork").getByRole("tab", { name: "플랜 B" }).click();
    await page.locator(".e-fork").getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".e-fork").getByRole("button", { name: title, exact: true })).toHaveCount(0);
  });

  test("DAY 제목 옆 연필로 제목·메모를 고치고 긴 메모는 접혀 보인다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 3);
    await expect(page.getByRole("button", { name: "메모 더보기" }).first()).toBeVisible();
    await page.getByRole("button", { name: "하루 정보 고치기" }).click();
    const before = await page.locator("#day-memo").inputValue();
    await page.locator("#day-memo").fill(before + "\nQA 메모 추가");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("button", { name: "메모 더보기" }).first().click();
    await expect(page.locator(".day-memo")).toContainText("QA 메모 추가");
    await shot(page, "15-day-edit");
    // restore
    await page.getByRole("button", { name: "하루 정보 고치기" }).click();
    await page.locator("#day-memo").fill(before);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".day-memo")).not.toContainText("QA 메모 추가");
  });

  test("날짜에 날씨 링크를 넣으면 날씨 아래에 바로가기가 생기고 지우면 사라진다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "writes the shared trip; once is enough");
    await page.goto("/");
    await openDay(page, 2);
    await page.getByRole("button", { name: "하루 정보 고치기" }).click();
    await page.locator("#day-weather-url").fill("www.mountain-forecast.com/peaks/Fan-Si-Pan/forecasts/3211");
    await expect(page.getByText("mountain-forecast.com 링크예요")).toBeVisible();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    const link = page.getByRole("link", { name: /예보 자세히 보기/ });
    await expect(link).toHaveAttribute("href", "https://www.mountain-forecast.com/peaks/Fan-Si-Pan/forecasts/3211");
    await shot(page, "15b-weather-link");
    await page.getByRole("button", { name: "하루 정보 고치기" }).click();
    await page.locator("#day-weather-url").fill("");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(link).toHaveCount(0);
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

  test("갈림길 플랜의 세부 일정을 누르면 상세보기가 열리고 고치기로 넘어간다", async ({ page }) => {
    await page.goto("/");
    await openDay(page, 2);
    const fork = page.locator("section.fork").first();
    await fork.getByRole("button", { name: /썬 월드 판시판 케이블카 역 상세보기/ }).click();
    const sheet = page.getByRole("dialog", { name: "썬 월드 판시판 케이블카 역" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Sun World Fansipan Legend")).toBeVisible();
    await expect(sheet.locator(".detail-memo")).toContainText("케이블카");
    await shot(page, "26-plan-step-detail");
    await sheet.getByRole("button", { name: "고치기" }).click();
    await expect(page.getByRole("dialog", { name: "일정 고치기" })).toBeVisible();
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

test.describe("여행 목록", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("‹로 목록에 가서 새 여행을 만들면 날짜만큼 일차가 생기고, 설정에서 지울 수 있다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "creates and deletes a trip; once is enough");
    await page.goto("/");
    await page.getByRole("button", { name: "여행 목록" }).click();
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
    await expect(page.getByRole("button", { name: /사파 여행/ })).toBeVisible();
    await shot(page, "90-trip-list");

    await page.getByRole("button", { name: "새 여행" }).click();
    await page.locator("#trip-title").fill("QA 도쿄 여행");
    // abroad → Japan: the trip keeps money in yen
    await page.getByRole("button", { name: "일본" }).click();
    await expect(page.getByText(/엔\(¥\)으로 기록해요/)).toBeVisible();
    await page.locator("#trip-start").fill("2027-03-20");
    await page.locator("#trip-end").fill("2027-03-23");
    await expect(page.getByText("3박 4일")).toBeVisible();
    await shot(page, "91-new-trip");
    await page.getByRole("button", { name: "만들기" }).click();

    await expect(page.getByRole("heading", { name: "QA 도쿄 여행" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^\d일차/ })).toHaveCount(4);
    await shot(page, "92-new-trip-opened");
    await page.getByRole("button", { name: "경비" }).click();
    await expect(page.getByText("엔 → 원 계산기")).toBeVisible();
    await page.getByRole("button", { name: "지출 추가" }).click();
    await expect(page.getByRole("button", { name: "¥", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "일정" }).click();

    // reopening the app lands in the last trip
    await page.reload();
    await expect(page.getByRole("heading", { name: "QA 도쿄 여행" })).toBeVisible();

    // delete it from 더보기 → 여행 설정
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("button", { name: /여행 설정/ }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.locator("#trip-delete-confirm").fill("QA 도쿄 여행");
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
    await expect(page.getByRole("button", { name: /QA 도쿄 여행/ })).toHaveCount(0);
  });

  test("국내 여행은 원으로만 기록하고 환율 계산기가 없다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "creates and deletes a trip; once is enough");
    await page.goto("/");
    await page.getByRole("button", { name: "여행 목록" }).click();
    await page.getByRole("button", { name: "새 여행" }).click();
    await page.locator("#trip-title").fill("QA 부산 여행");
    await page.getByRole("radio", { name: "국내" }).click();
    await expect(page.getByRole("button", { name: "일본" })).toHaveCount(0);
    await page.locator("#trip-start").fill("2027-04-10");
    await page.locator("#trip-end").fill("2027-04-11");
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("heading", { name: "QA 부산 여행" })).toBeVisible();
    await page.getByRole("button", { name: "경비" }).click();
    await expect(page.getByText(/→ 원 계산기/)).toHaveCount(0);
    await page.getByRole("button", { name: "지출 추가" }).click();
    await expect(page.locator("#exp-amount")).toBeVisible();
    await expect(page.getByRole("button", { name: "$", exact: true })).toHaveCount(0);
    await shot(page, "93-domestic-expense");
    await page.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "더보기" }).click();
    await expect(page.getByRole("button", { name: /^예산 설정/ })).toBeVisible();
    await page.getByRole("button", { name: /여행 설정/ }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.locator("#trip-delete-confirm").fill("QA 부산 여행");
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
  });

  test("사파·하노이가 아닌 도시도 날짜의 도시를 적으면 그 도시 날씨가 나온다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "creates and deletes a trip; once is enough");
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(Date.now() + 2 * 86_400_000);
    const end = new Date(Date.now() + 3 * 86_400_000);
    await page.goto("/");
    await page.getByRole("button", { name: "여행 목록" }).click();
    await page.getByRole("button", { name: "새 여행" }).click();
    await page.locator("#trip-title").fill("QA 날씨 여행");
    await page.locator("#trip-start").fill(iso(start));
    await page.locator("#trip-end").fill(iso(end));
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("heading", { name: "QA 날씨 여행" })).toBeVisible();
    await page.getByRole("button", { name: "하루 정보 고치기" }).click();
    await page.locator("#day-city").fill("도쿄");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".wx-place").first()).toContainText("도쿄", { timeout: 20000 });
    await expect(page.locator(".wx-temp").first()).toContainText("°");
    await shot(page, "93-other-city-weather");
    // clean up
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("button", { name: /여행 설정/ }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.locator("#trip-delete-confirm").fill("QA 날씨 여행");
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.getByRole("heading", { name: "우리 여행" })).toBeVisible();
  });

  test("일정이 있는 날을 빼는 날짜 변경은 막고 안내한다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("button", { name: /여행 설정/ }).click();
    await page.locator("#set-trip-end").fill("2026-12-04");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText(/일정이 있어서 그 날짜는 뺄 수 없어요/)).toBeVisible();
  });
});

test.describe("Google 지도·장소", () => {
  // Google's per-minute quota can reject a burst of test calls; one retry keeps the run honest
  test.describe.configure({ retries: 1 });
  test.skip(process.env.QA_MAPS !== "1", "needs the real Google key; run with QA_MAPS=1");
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
    await openItemForm(page);
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
    await openItemForm(page);
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
    await page.getByRole("dialog").getByRole("button", { name: "고치기", exact: true }).click();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("button", { name: "삭제하기" }).click();
    await expect(page.locator(".card", { hasText: "QA 트레킹 코스" })).toHaveCount(0);
  });

  test("이동 구간을 누르면 Google 경로로 수단별 시간과 단계별 안내가 나온다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "uses Google Routes quota; once is enough");
    await page.goto("/");
    await openDay(page, 5);
    await page.getByRole("button", { name: /이동 방법 보기/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "이동 방법" });
    await expect(sheet).toBeVisible();
    const drive = sheet.getByRole("tab", { name: /차·그랩/ });
    await expect(drive).toContainText(/\d+분|\d+시간/, { timeout: 20000 });
    await drive.click();
    // car: just the time and distance, the way is left to Google Maps
    await expect(sheet.locator(".leg-summary")).toBeVisible();
    await expect(sheet.locator(".leg-step, .leg-map")).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "구글맵에서 길찾기" })).toHaveAttribute("href", /travelmode=driving/);
    await page.waitForTimeout(1500);
    await shot(page, "86-leg-drive");
    await sheet.getByRole("tab", { name: /대중교통/ }).click();
    await expect(sheet.locator(".leg-step, .note-box").first()).toBeVisible({ timeout: 20000 });
    await expect(sheet.getByRole("link", { name: "구글맵에서 실시간 보기" })).toHaveAttribute("href", /travelmode=transit/);
    await shot(page, "87-leg-transit");
  });

  test("타임라인 이동 시간은 실제 Google 시간이고 상세 시트의 같은 수단 값과 같다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "uses Google Routes quota; once is enough");
    await page.goto("/");
    await openDay(page, 3);
    const pill = page.locator(".gap-btn").first();
    // the estimate says "약"; the real time replaces it
    await expect(pill).not.toContainText("약", { timeout: 20000 });
    const text = (await pill.innerText()).trim();
    const [, label, mins] = /^(도보|차|대중교통)\s+(.+?)$/.exec(text) ?? [];
    expect(label).toBeTruthy();
    await pill.click();
    const sheet = page.getByRole("dialog", { name: "이동 방법" });
    const tab = sheet.getByRole("tab", { selected: true });
    await expect(tab).toContainText({ 도보: "도보", 차: "차·그랩", 대중교통: "대중교통" }[label]!);
    await expect(tab).toContainText(mins, { timeout: 20000 });
    await shot(page, "88-leg-match");
    await sheet.getByRole("button", { name: "닫기" }).click();
    await page.locator(".gap-btn").last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    await shot(page, "89-timeline-real");
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
    test.skip(test.info().project.name !== "iphone" || process.env.QA_MAPS !== "1", "uses Google quota; once, with QA_MAPS=1");
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

test.describe("초대", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("방장이 링크를 보내면 받은 사람이 가입하고 요청하고, 방장이 승인해야 여행이 보인다", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "iphone", "creates accounts; run once");
    // owner makes a separate trip (the shared Sapa trip must keep its two members for other tests)
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    await page.goto("/");
    await page.getByRole("button", { name: "여행 목록" }).click();
    await page.getByRole("button", { name: "새 여행" }).click();
    await page.locator("#trip-title").fill("QA 초대 여행");
    await page.locator("#trip-start").fill(iso(new Date(Date.now() + 5 * 86_400_000)));
    await page.locator("#trip-end").fill(iso(new Date(Date.now() + 6 * 86_400_000)));
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("heading", { name: "QA 초대 여행" })).toBeVisible();
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: /^일행/ }).click();
    const sheet = page.getByRole("dialog", { name: "일행" });
    await sheet.getByRole("button", { name: "초대 링크 만들기" }).click();
    const url = (await sheet.locator(".link-url span").innerText()).trim();
    const token = url.split("/j/")[1];
    expect(token).toMatch(/^[A-Za-z0-9]{24}$/);
    await shot(page, "92-members-link");

    // invitee opens it, signs up, asks to join
    const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const guest = await ctx.newPage();
    await guest.goto(`/j/${token}`);
    await expect(guest.getByText("가입하면 초대받은 여행에 참여를 요청할 수 있어요.")).toBeVisible();
    await guest.locator("#su-id").fill("qa_guest");
    await guest.locator("#su-name").fill("지수");
    await guest.locator("#su-pw").fill("trip2026!");
    await guest.getByRole("button", { name: "가입하기", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "QA 초대 여행" })).toBeVisible();
    await guest.getByRole("button", { name: "참여 요청 보내기" }).click();
    await expect(guest.getByText("방장 승인을 기다리고 있어요")).toBeVisible();
    await shot(guest, "93-invitee-waiting");
    // not a member yet: the list shows it as waiting, not openable
    await guest.getByRole("button", { name: "여행 목록으로" }).click();
    await expect(guest.getByLabel("QA 초대 여행, 방장 승인 기다리는 중")).toBeVisible();

    // owner approves
    await sheet.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: /^일행/ }).click();
    await expect(sheet.getByText("지수")).toBeVisible();
    await shot(page, "94-members-request");
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet.getByText("함께하는 일행 2명")).toBeVisible();

    // invitee now sees and opens the trip
    await guest.reload();
    await guest.getByRole("button", { name: /QA 초대 여행/ }).click();
    await expect(guest.getByRole("button", { name: /^1일차/ })).toBeVisible();
    await ctx.close();
  });
});

test.describe("관리자", () => {
  test.use({ storageState: "qa/.auth/minu.json" });
  test("관리자는 /admin에서 가입자·권한·접속 기록을 보고 권한을 켜고 끌 수 있다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "changes permissions; run once");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "관리" })).toBeVisible();
    await expect(page.locator(".admin-row").filter({ hasText: "@qa_ryeojin" })).toBeVisible();
    await shot(page, "90-admin-users");
    await page.getByRole("tab", { name: "권한" }).click();
    const sw = page.getByRole("switch", { name: "려진 AI" });
    await expect(sw).toBeChecked();
    await sw.click({ force: true });
    await expect(sw).not.toBeChecked();
    await sw.click({ force: true });
    await expect(sw).toBeChecked();
    await page.getByRole("tab", { name: "접속 기록" }).click();
    await expect(page.locator(".admin-row").first()).toBeVisible();
    await shot(page, "91-admin-events");
  });

  test("관리자가 아니면 /admin을 볼 수 없다", async ({ browser }, info) => {
    test.skip(info.project.name !== "iphone", "once is enough");
    const ctx = await browser.newContext({ ...info.project.use, storageState: "qa/.auth/ryeojin.json" });
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page.getByText("관리자 계정만 볼 수 있어요.")).toBeVisible();
    await ctx.close();
  });
});

test.describe("지금 모드·티켓", () => {
  test.use({ storageState: "qa/.auth/minu.json" });
  test("여행 당일이면 오늘이 열리고 지금 카드가 다음 일정과 출발 시각을 알려준다", async ({ page }) => {
    // 2026-12-04 10:05 in Hanoi
    await page.clock.setFixedTime(new Date("2026-12-04T03:05:00Z"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^3일차.*오늘$/ })).toHaveAttribute("aria-pressed", "true");
    const card = page.getByRole("region", { name: "지금" });
    await expect(card).toContainText("현지 10:05");
    await expect(page.locator(".now-line")).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, "95-now");
  });

  test("폰이 한국 시간이어도 하노이 날짜로 오늘을 고른다", async ({ browser }, info) => {
    test.skip(info.project.name !== "iphone", "time zone logic; once is enough");
    const ctx = await browser.newContext({ ...info.project.use, timezoneId: "Asia/Seoul", storageState: "qa/.auth/minu.json" });
    const page = await ctx.newPage();
    // 12/05 01:30 in Seoul is still 12/04 23:30 in Hanoi
    await page.clock.setFixedTime(new Date("2026-12-04T16:30:00Z"));
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^3일차.*오늘$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "지금" })).toContainText("현지 23:30");
    await ctx.close();
  });

  test("예약에 티켓을 붙이면 썸네일이 생기고 크게 열면 예약번호와 함께 보인다", async ({ page, context }, info) => {
    test.skip(info.project.name !== "iphone", "writes to the shared seed; once is enough");
    await page.goto("/");
    await page.getByRole("button", { name: "더보기" }).click();
    await page.getByRole("button", { name: /알파인 코스터/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "예약 고치기" });
    await sheet.locator("#bk-code").fill("KL8842019");
    await sheet.locator(".photo-add input[type=file]").setInputFiles("qa/fixtures/photo.png");
    await sheet.getByRole("button", { name: "저장" }).click();
    const thumb = page.getByRole("button", { name: /알파인 코스터.*티켓 1 크게 보기/ });
    await expect(thumb).toBeVisible();
    await expect(page.getByText("이 폰에 저장돼 오프라인에서도 열려요")).toBeVisible();
    await shot(page, "96-booking-ticket");
    await thumb.click();
    const viewer = page.getByRole("dialog", { name: /알파인 코스터.*티켓/ });
    await expect(viewer.getByText("KL8842019")).toBeVisible();
    await expect(viewer.locator("img")).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "97-ticket-viewer");
    await viewer.getByRole("button", { name: "닫기" }).click();

    // link it from a schedule item, then open from the card
    await page.getByRole("button", { name: "일정", exact: true }).click();
    await openDay(page, 3);
    await page.locator(".tl .c-title").filter({ hasText: /코스터/ }).first().click();
    const item = page.getByRole("dialog");
    await item.getByRole("group", { name: "연결된 예약" }).getByRole("button", { name: /알파인 코스터/ }).click();
    await item.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("button", { name: "티켓 1장" }).first().click();
    await expect(page.getByRole("dialog", { name: /알파인 코스터.*티켓/ })).toBeVisible();
    await page.getByRole("button", { name: "닫기" }).click();

    // with the service worker in control the ticket is kept; it must open with no network
    await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
    await page.reload();
    await expect(page.getByRole("button", { name: /^1일차/ })).toBeVisible();
    await page.waitForTimeout(2000); // prefetch of tickets
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: /알파인 코스터.*티켓 1 크게 보기/ }).click();
    const off = page.getByRole("dialog", { name: /알파인 코스터.*티켓/ });
    await expect.poll(() => off.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 10000 }).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await shot(page, "98-ticket-offline");
    await context.setOffline(false);
  });
});

test.describe("코디", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("권한이 있으면 코디 탭이 보이고 사진으로 둘의 아바타를 만들고 글자로 옷을 입힌다", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "iphone", "writes outfits; run once");
    await page.goto("/");
    await page.getByRole("button", { name: "코디", exact: true }).click();
    await expect(page.getByText("내 아바타부터 만들어요")).toBeVisible();
    await shot(page, "100-outfit-start");
    await page.locator(".avs-choice input[type=file]").setInputFiles("qa/fixtures/photo.png");
    await expect(page.getByText("2명을 찾았어요")).toBeVisible({ timeout: 20000 });
    await shot(page, "101-outfit-found");
    await page.getByRole("button", { name: "얼굴 만들기" }).click();
    // a 3D face per person from the photo; one can be remade with a note
    await expect(page.getByRole("img", { name: "나 얼굴" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("img", { name: "려진 얼굴" })).toBeVisible({ timeout: 20000 });
    await page.getByRole("textbox", { name: "려진 얼굴 고칠 점" }).fill("안경 빼 줘");
    await page.getByRole("button", { name: "다시 만들기" }).nth(1).click();
    await expect(page.getByRole("button", { name: "이 얼굴로 할게요" })).toBeEnabled({ timeout: 20000 });
    await shot(page, "101a-outfit-faces");
    await page.getByRole("button", { name: "이 얼굴로 할게요" }).click();
    // height can't come from a photo: it's asked next
    await page.locator("#avatar-height").fill("178");
    await expect(page.getByRole("img", { name: "내 얼굴" })).toBeVisible();
    await shot(page, "101b-outfit-refine");
    await page.getByRole("button", { name: "이 아바타로 할게요" }).click();
    // with faces saved, both stand in plain clothes on every day right away
    await expect(page.locator(".of-drawn img")).toHaveCount(2, { timeout: 20000 });
    await page.getByRole("button", { name: "코디 3일차" }).click();
    await expect(page.locator(".of-drawn img")).toHaveCount(2);
    await page.getByRole("button", { name: "코디 1일차" }).click();
    // dress up with text; an unknown word goes to the (fake) AI on save
    await page.getByRole("button", { name: "내 코디 정하기" }).click();
    await page.locator("#outfit-text").fill("네이비 바람막이\n검정 등산바지\n트레킹화\n아빠가 입던 그거");
    await expect(page.locator(".of-parsed li").first()).toContainText("겉옷");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".of-list").first()).toContainText("네이비 바람막이");
    // a full-body drawing in these clothes, made from the saved face
    await page.getByRole("button", { name: "코디 그림으로 보기" }).click();
    await expect(page.getByRole("button", { name: /다시 그리기|그림으로 보기/ })).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator(".of-drawn img").first()).toHaveAttribute("src", /\/api\/files\/outfits\//);
    await shot(page, "101c-outfit-drawn");
    // partner sees it and hearts it
    const ctx = await browser.newContext({ ...info.project.use, storageState: "qa/.auth/ryeojin.json" });
    const her = await ctx.newPage();
    await her.goto("/");
    await her.getByRole("button", { name: "코디", exact: true }).click();
    await expect(her.locator(".of-list").nth(1)).toContainText("네이비 바람막이");
    await her.getByRole("button", { name: "잘 어울려요" }).click();
    await expect(page.getByText("려진이 잘 어울린대요")).toBeVisible({ timeout: 10000 });
    await page.getByRole("checkbox", { name: "트레킹화 챙김" }).click();
    await expect(page.locator(".of-packed")).toContainText("1 / 4");
    await shot(page, "102-outfit-pair");
    await ctx.close();
  });

  test("예전에 들어온 폰도 다시 로그인하지 않고 새 권한이 반영된다", async ({ browser }, info) => {
    test.skip(info.project.name !== "iphone", "once is enough");
    // a phone that signed in before accounts existed: its saved record has no permissions
    const state = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync("qa/.auth/minu.json", "utf8")));
    const auth = state.origins[0].localStorage.find((x: { name: string }) => x.name === "pocketbase_auth");
    const saved = JSON.parse(auth.value);
    delete saved.record.perms;
    delete saved.record.username;
    delete saved.record.role;
    auth.value = JSON.stringify(saved);
    const ctx = await browser.newContext({ ...info.project.use, storageState: state });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "코디", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await expect(page.getByRole("button", { name: /글로 추가/ })).toBeVisible();
    await ctx.close();
  });

  test("코디 권한이 없으면 탭이 보이지 않는다", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "iphone", "once is enough");
    // a fresh account has no permissions
    const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await p.goto("/");
    await p.getByRole("button", { name: "가입하기" }).click();
    await p.locator("#su-id").fill("qa_noperm");
    await p.locator("#su-name").fill("권한없음");
    await p.locator("#su-pw").fill("trip2026!");
    await p.getByRole("button", { name: "가입하기", exact: true }).click();
    await p.getByRole("button", { name: "새 여행" }).click();
    await p.locator("#trip-title").fill("권한 없는 여행");
    await p.locator("#trip-start").fill("2026-12-20");
    await p.locator("#trip-end").fill("2026-12-21");
    await p.getByRole("button", { name: "만들기" }).click();
    await expect(p.getByRole("heading", { name: "권한 없는 여행" })).toBeVisible();
    await expect(p.getByRole("button", { name: "코디", exact: true })).toHaveCount(0);
    await p.getByRole("button", { name: "일정 추가", exact: true }).click();
    // without the AI permission the + button goes straight to the item form
    await expect(p.locator("#item-title")).toBeVisible();
    await expect(p.getByRole("button", { name: /글로 추가/ })).toHaveCount(0);
    await ctx.close();
    void page;
  });
});

test.describe("글로 일정 넣기", () => {
  test.use({ storageState: "qa/.auth/minu.json" });

  test("글을 AI가 날짜별로 나누고 미리보기에서 고른 것만 넣으며, 바꾸기는 한 번 더 묻고 되돌릴 수 있다", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "changes the shared schedule; run once");
    await page.goto("/");
    await openDay(page, 2);
    const before = await page.locator(".tl .tl-row").count();
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await shot(page, "102b-add-menu");
    await page.getByRole("button", { name: /글로 추가/ }).click();
    await page.locator("#ai-plan-text").fill("둘째 날 오후 3시쯤 호안끼엠 호수 산책하고 저녁은 분짜");
    await page.getByRole("button", { name: "일정으로 나누기" }).click();
    const sheet = page.getByRole("dialog", { name: "이렇게 넣을게요" });
    await expect(sheet.getByText("호안끼엠 호수 산책")).toBeVisible({ timeout: 30000 });
    await shot(page, "103-ai-preview");
    // add only the walk
    await sheet.getByRole("checkbox", { name: /저녁: 분짜/ }).click();
    await sheet.getByRole("button", { name: "1개 추가" }).click();
    await expect(page.getByText("호안끼엠 호수 산책").first()).toBeVisible();
    await expect(page.locator(".tl .tl-row")).toHaveCount(before + 1);

    // replace asks first, and history can bring the day back
    await page.getByRole("button", { name: "일정 추가", exact: true }).click();
    await page.getByRole("button", { name: /글로 추가/ }).click();
    await page.locator("#ai-plan-text").fill("둘째 날 오후 3시쯤 호안끼엠 호수 산책하고 저녁은 분짜");
    await page.getByRole("radio", { name: "그 날 일정 바꾸기" }).click();
    await page.getByRole("button", { name: "일정으로 나누기" }).click();
    await page.getByRole("button", { name: /바꿔 넣기/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "일정 바꾸기 확인" });
    await expect(confirm).toContainText("2일차에 있는 일정을 바꿀까요?");
    await shot(page, "104-ai-confirm");
    await confirm.getByRole("button", { name: "바꾸기" }).click();
    await expect(page.locator(".tl .tl-row")).toHaveCount(2);
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: /되돌리기 기록/ }).click();
    const hist = page.getByRole("dialog", { name: "되돌리기 기록" });
    await expect(hist.getByText(/민우가 AI로 2일차 일정을 바꿈/)).toBeVisible();
    await shot(page, "105-history");
    await hist.getByRole("button", { name: "되돌리기" }).first().click();
    await hist.getByRole("button", { name: "되돌리기" }).first().click();
    await expect(hist.getByText(/되돌리기 직전 상태/)).toBeVisible();
    await hist.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "일정", exact: true }).click();
    await openDay(page, 2);
    await expect(page.locator(".tl .tl-row")).toHaveCount(before + 1);
  });
});
