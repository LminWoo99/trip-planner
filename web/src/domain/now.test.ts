import { describe, expect, it } from "vitest";
import { bookingDate, leaveBy, nowState } from "./now";
import { formatHm, localNow, zonedDate } from "./clock";
import type { Item } from "./types";

const item = (id: string, time: string, done = false): Item => ({
  id, day: "d", order: 0, time, cat: "sight", title: id, place: "", placeId: "", lat: null, lng: null, memo: "",
  cost: 0, cur: null, link: "", done, group: null, branch: null, stops: [], photos: [], booking: null,
});

describe("nowState", () => {
  it("다음 일정은 지금 이후의 첫 시간 있는 일정이고 그 앞은 지난 일정이다", () => {
    // given
    const items = [item("a", "07:30"), item("b", "09:00"), item("c", "10:30"), item("d", "14:00")];
    // when
    const s = nowState(items, "10:05");
    // then
    expect(s.next?.id).toBe("c");
    expect([...s.past]).toEqual(["a", "b"]);
    expect(s.lineAt).toBe(2);
  });

  it("시간 없는 일정은 앞 일정을 따라간다", () => {
    // given
    const items = [item("a", "09:00"), item("b", ""), item("c", "12:00")];
    // when
    const s = nowState(items, "10:00");
    // then
    expect([...s.past]).toEqual(["a", "b"]);
  });

  it("이미 완료한 다음 일정은 건너뛴다", () => {
    // given
    const items = [item("a", "11:00", true), item("b", "13:00")];
    // when
    const s = nowState(items, "10:00");
    // then
    expect(s.next?.id).toBe("b");
  });

  it("남은 일정이 없으면 다음 일정은 없고 선은 맨 끝이다", () => {
    // given
    const items = [item("a", "09:00"), item("b", "12:00")];
    // when
    const s = nowState(items, "23:00");
    // then
    expect(s.next).toBeNull();
    expect(s.lineAt).toBe(2);
  });
});

describe("leaveBy", () => {
  it("다음 일정 시각에서 이동 시간을 빼서 출발 시각과 남은 분을 준다", () => {
    // given
    const next = item("c", "10:30");
    // when
    const r = leaveBy(next, 12, "10:05");
    // then
    expect(r).toEqual({ at: 10 * 60 + 18, left: 13 });
  });
});

describe("bookingDate", () => {
  it("자유 텍스트의 첫 날짜를 여행 연도로 읽는다", () => {
    // when / then
    expect(bookingDate({ when: "12/3 – 12/5" }, "2026-12-02")).toBe("2026-12-03");
  });

  it("여행 시작 월보다 앞선 월은 다음 해다", () => {
    // when / then
    expect(bookingDate({ when: "1/2 08:00" }, "2026-12-30")).toBe("2027-01-02");
  });

  it("날짜가 없으면 null이다", () => {
    // when / then
    expect(bookingDate({ when: "미정" }, "2026-12-02")).toBeNull();
  });
});

describe("clock", () => {
  it("한국 시간 자정 직후에도 하노이는 아직 전날이다", () => {
    // given 2026-12-04 00:30 KST
    const instant = new Date("2026-12-03T15:30:00Z");
    // when / then
    expect(localNow("Asia/Seoul", instant)).toEqual({ date: "2026-12-04", time: "00:30" });
    expect(localNow("Asia/Ho_Chi_Minh", instant)).toEqual({ date: "2026-12-03", time: "22:30" });
  });

  it("현지 날짜와 시각을 폰 시간대와 무관한 실제 시각으로 바꾼다", () => {
    // when
    const d = zonedDate("2026-12-04", "10:30", "Asia/Ho_Chi_Minh");
    // then
    expect(d.toISOString()).toBe("2026-12-04T03:30:00.000Z");
    expect(formatHm(d, "Asia/Seoul")).toBe("12:30");
  });
});
