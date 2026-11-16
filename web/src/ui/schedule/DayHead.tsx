import { useState } from "react";
import { BedDouble, Pencil, Wallet } from "lucide-react";
import { formatApproxKrw, formatKrw, type PlannedCost } from "../../domain/money";
import type { Day } from "../../domain/types";
import { describe, weatherFor, type Forecast, type Spot } from "../../infra/weather";
import { WEATHER_ICON } from "../icons";
import { dayLabel, parseDay, stamp } from "../format";

export function DayHead({ day, spots, forecast, planned, spent, basis, onEdit }: { day: Day; spots: readonly Spot[]; forecast: Forecast | null; planned: PlannedCost; spent: number; basis: string | null; onEdit: () => void }) {
  const [memoOpen, setMemoOpen] = useState(false);
  const longMemo = day.memo.length > 120 || day.memo.split("\n").length > 3;
  const cells = spots.map((s) => ({ spot: s, w: weatherFor(forecast, s.id, day.date) }));
  const hasAny = cells.some((c) => c.w);

  return (
    <div className="day-head">
      <div className="day-title-row">
        <h2 className="keep">{day.title || `${day.n}일차`}</h2>
        <button className="icon-btn" onClick={onEdit} aria-label="하루 정보 고치기"><Pencil className="icon" style={{ width: 17, height: 17 }} /></button>
      </div>
      <div className="day-meta">
        <span>{dayLabel(day.date)}</span>
        {day.stay && <span><BedDouble className="icon" />{day.stay}</span>}
      </div>
      {(planned.counted > 0 || spent > 0) && (
        <div className="day-cost" aria-live="polite">
          <Wallet className="icon" />
          {planned.counted > 0 && <span>예상 <b className="num">{formatApproxKrw(planned.krw)}</b>{basis && <small>{basis} 기준</small>}</span>}
          {spent > 0 && <span>쓴 돈 <b className="num">{formatKrw(spent)}</b></span>}
        </div>
      )}
      {spots.length > 0 && (hasAny ? (
        <>
          <div className="wx" style={cells.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
            {cells.map(({ spot, w }) => {
              const Icon = w ? WEATHER_ICON[describe(w.code).icon] : null;
              return (
                <div className="wx-cell" key={spot.id}>
                  <span className="wx-place">{spot.name}{spot.elevation > 300 && <i> {spot.elevation.toLocaleString()}m</i>}</span>
                  {w ? (
                    <>
                      <span className="wx-temp">{Icon && <Icon className="icon" />}{w.tMax}°<small>/ {w.tMin}°</small></span>
                      <span className="wx-detail"><span>강수 {w.rainProb}%</span><span>구름 {w.cloud}%</span><span>바람 {w.wind}</span></span>
                    </>
                  ) : <span className="wx-detail">예보 없음</span>}
                </div>
              );
            })}
          </div>
          <div className="wx-foot"><span>Open-Meteo {forecast ? stamp(forecast.fetchedAt) : ""} 기준</span><span>바람 km/h</span></div>
        </>
      ) : (
        <p className="wx-empty">{forecastHint(day.date)}</p>
      ))}
      {day.memo && <p className={`day-memo keep ${longMemo && !memoOpen ? "clamped" : ""}`}><Linkified text={day.memo} /></p>}
      {day.memo && longMemo && (
        <button className="memo-more" style={{ marginLeft: 0 }} onClick={() => setMemoOpen(!memoOpen)} aria-expanded={memoOpen}>{memoOpen ? "접기" : "메모 더보기"}</button>
      )}
    </div>
  );
}

/** Turns bare URLs into short links ("maps.app.goo.gl") so long memos stay readable. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return p;
        let host = p;
        try { host = new URL(p).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
        return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{host}</a>;
      })}
    </>
  );
}

/** "12월 3일 예보는 11월 17일부터 나와요" — forecasts reach 16 days ahead. */
export function forecastHint(date: string): string {
  const d = parseDay(date);
  const from = new Date(d);
  from.setDate(d.getDate() - 15);
  const md = (x: Date) => `${x.getMonth() + 1}월 ${x.getDate()}일`;
  return from <= new Date() ? `${md(d)} 예보를 아직 받지 못했어요. 연결되면 다시 불러와요.` : `${md(d)} 예보는 ${md(from)}부터 나와요`;
}
