import { useEffect, useState } from "react";
import { Clock, Navigation, Ticket } from "lucide-react";
import type { Booking, Item } from "../../domain/types";
import { estimateLeg, formatMinutes } from "../../domain/geo";
import { fromMinutes, toMinutes } from "../../domain/clock";
import { leaveBy } from "../../domain/now";
import { computeLeg } from "../../infra/routes";
import { hasGoogleKey } from "../../infra/google";

type Located = Item & { lat: number; lng: number };

/** Top of today's timeline during the trip: what's next and when to leave for it. */
export function NowCard({ dayN, dateLabel, time, next, from, ticket, onLeg, onTicket }: {
  dayN: number;
  dateLabel: string;
  time: string;
  next: Item | null;
  from: Located | null;
  ticket: Booking | null;
  onLeg: (() => void) | null;
  onTicket: () => void;
}) {
  const to = next && next.lat !== null && next.lng !== null ? (next as Located) : null;
  const guess = from && to ? estimateLeg(from, to) : null;
  const [minutes, setMinutes] = useState<number | null>(guess?.minutes ?? null);
  const [real, setReal] = useState(false);

  useEffect(() => {
    setMinutes(guess?.minutes ?? null);
    setReal(false);
    if (!from || !to || !guess || !navigator.onLine || !hasGoogleKey()) return;
    let alive = true;
    computeLeg(from, to, guess.mode === "walk" ? "WALKING" : "DRIVING")
      .then((r) => { if (alive && r) { setMinutes(r.minutes); setReal(true); } })
      .catch(() => { /* keep the estimate */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id]);

  const leave = next && minutes !== null ? leaveBy(next, minutes, time) : null;
  const how = guess?.mode === "walk" ? "걸어서" : "차로";

  return (
    <section className="now-card" aria-label="지금">
      <div className="now-k"><i />지금<span className="num">{dayN}일차 · {dateLabel} · 현지 {time}</span></div>
      {next ? (
        <>
          <div className="now-t">{next.time && <small className="num">다음 일정 {next.time}</small>}<span className="keep">{next.title}</span></div>
          {leave && (
            <div className={`now-leave ${leave.left < 0 ? "late" : ""}`}>
              <Clock className="icon" />
              <span className="num">
                {how} {real ? "" : "약 "}{formatMinutes(minutes!)} · {leave.left >= 0
                  ? <><b>{fromMinutes(leave.at)}엔 출발</b>해야 해요 ({formatMinutes(leave.left)} 남음)</>
                  : leave.left > -minutes!
                    ? <><b>지금 출발</b>해야 해요 ({formatMinutes(-leave.left)} 늦었어요)</>
                    : <>출발 시각 {fromMinutes(leave.at)}이 지났어요</>}
              </span>
            </div>
          )}
          {!leave && next.time && toMinutes(next.time) > toMinutes(time) && (
            <div className="now-leave"><Clock className="icon" /><span className="num"><b>{formatMinutes(toMinutes(next.time) - toMinutes(time))} 뒤</b>예요</span></div>
          )}
          {(onLeg || ticket) && (
            <div className="now-btns">
              {onLeg && <button className="mini dark" onClick={onLeg}><Navigation className="icon" />이동 방법</button>}
              {ticket && <button className="mini" onClick={onTicket}><Ticket className="icon" />티켓</button>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="now-t">오늘 일정은 다 끝났어요</div>
          {ticket && <div className="now-btns"><button className="mini" onClick={onTicket}><Ticket className="icon" />티켓</button></div>}
        </>
      )}
    </section>
  );
}
