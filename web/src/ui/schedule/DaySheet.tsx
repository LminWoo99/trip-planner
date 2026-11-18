import { useState } from "react";
import type { Day } from "../../domain/types";
import { update } from "../../app/store";
import { attempt, toast } from "../toast";
import { linkHost, withScheme } from "../../domain/links";
import { Sheet } from "../Sheet";
import { dayLabel } from "../format";

/** Edit a day's heading: title, city (drives the weather spots), where we sleep, and the day memo. */
export function DaySheet({ day, onClose }: { day: Day; onClose: () => void }) {
  const [title, setTitle] = useState(day.title);
  const [city, setCity] = useState(day.city);
  const [stay, setStay] = useState(day.stay);
  const [memo, setMemo] = useState(day.memo);
  const [weatherUrl, setWeatherUrl] = useState(day.weatherUrl);
  const wxHost = linkHost(weatherUrl);

  async function save() {
    if (weatherUrl.trim() && !wxHost) { toast("날씨 링크는 http로 시작하는 주소로 붙여 넣어 주세요"); return; }
    const data = { title: title.trim(), city: city.trim(), stay: stay.trim(), memo, weatherUrl: weatherUrl.trim() ? withScheme(weatherUrl) : "" };
    if (await attempt(() => update("days", day.id, data), "저장했어요")) onClose();
  }

  return (
    <Sheet title={`${day.n}일차 고치기`} onClose={onClose} footer={<button className="btn primary" onClick={save}>저장</button>}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--ink3)" }}>{dayLabel(day.date)}</p>
      <label className="field"><span>제목</span><input id="day-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 판시판" /></label>
      <label className="field">
        <span>도시</span>
        <input id="day-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 사파 → 하노이" />
        <small style={{ fontSize: 12, color: "var(--ink3)" }}>"사파"나 "하노이"가 들어가면 그 지역 날씨가 나와요. 이동하는 날은 도착지를 뒤에 써 주세요.</small>
      </label>
      <label className="field"><span>숙소</span><input id="day-stay" className="input" value={stay} onChange={(e) => setStay(e.target.value)} placeholder="예: 피스타치오 호텔 사파" /></label>
      <label className="field">
        <span>날씨 링크 (선택)</span>
        <input id="day-weather-url" className="input" inputMode="url" autoCapitalize="off" value={weatherUrl} onChange={(e) => setWeatherUrl(e.target.value)} placeholder="https://..." />
        {wxHost ? <small className="field-ok">{wxHost} 링크예요</small> : null}
        <small className="field-hint">기본 예보보다 정확한 예보 사이트가 있으면 주소를 붙여 넣으세요. 일정 화면의 날씨 아래에 바로가기로 보여요.</small>
      </label>
      <label className="field"><span>메모</span><textarea id="day-memo" className="input" style={{ minHeight: 180 }} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
    </Sheet>
  );
}
