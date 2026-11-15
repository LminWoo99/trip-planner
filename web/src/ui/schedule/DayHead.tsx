import { BedDouble } from "lucide-react";
import type { Day } from "../../domain/types";
import { describe, spotsForCity, weatherFor, type Forecast } from "../../infra/weather";
import { WEATHER_ICON } from "../icons";
import { dayLabel, stamp } from "../format";

export function DayHead({ day, forecast }: { day: Day; forecast: Forecast | null }) {
  const spots = spotsForCity(day.city);
  const cells = spots.map((s) => ({ spot: s, w: weatherFor(forecast, s.id, day.date) }));
  const hasAny = cells.some((c) => c.w);

  return (
    <div className="day-head">
      <h2 className="keep">{day.title || `${day.n}일차`}</h2>
      <div className="day-meta">
        <span>{dayLabel(day.date)}</span>
        {day.stay && <span><BedDouble className="icon" />{day.stay}</span>}
      </div>
      {spots.length > 0 && (hasAny ? (
        <>
          <div className="wx" style={cells.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
            {cells.map(({ spot, w }) => {
              const Icon = w ? WEATHER_ICON[describe(w.code).icon] : null;
              return (
                <div className="wx-cell" key={spot.id}>
                  <span className="wx-place">{spot.name} <i>{spot.elevation.toLocaleString()}m</i></span>
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
        <p className="wx-empty">예보는 16일 전부터 나와요. {forecast ? `마지막 확인 ${stamp(forecast.fetchedAt)}` : ""}</p>
      ))}
      {day.memo && <p className="day-memo keep"><Linkified text={day.memo} /></p>}
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
