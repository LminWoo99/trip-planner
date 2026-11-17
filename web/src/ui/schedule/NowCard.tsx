import { Clock, Navigation, Ticket } from "lucide-react";
import type { Booking, Item } from "../../domain/types";
import { formatMinutes } from "../../domain/geo";
import { useLegPill } from "./useLegPill";
import { fromMinutes, toMinutes } from "../../domain/clock";
import { leaveBy } from "../../domain/now";

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
  return (
    <section className="now-card" aria-label="지금">
      <div className="now-k"><i />지금<span className="num">{dayN}일차 · {dateLabel} · 현지 {time}</span></div>
      {next ? (
        <>
          <div className="now-t">{next.time && <small className="num">다음 일정 {next.time}</small>}<span className="keep">{next.title}</span></div>
          {from && to ? <LeaveLine from={from} to={to} next={next} time={time} />
            : next.time && toMinutes(next.time) > toMinutes(time) && (
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

/** When to leave, using the same travel time the timeline shows (real once known). */
function LeaveLine({ from, to, next, time }: { from: Located; to: Located; next: Item; time: string }) {
  const pill = useLegPill(from, to);
  const leave = leaveBy(next, pill.minutes, time);
  if (!leave) return null;
  const by = { walk: "걸어서", car: "차로", transit: "대중교통으로" }[pill.mode];
  const how = `${by} ${pill.real ? "" : "약 "}${formatMinutes(pill.minutes)}`;
  return (
    <div className={`now-leave ${leave.left < 0 ? "late" : ""}`}>
      <Clock className="icon" />
      <span className="num">
        {how} · {leave.left >= 0
          ? <><b>{fromMinutes(leave.at)}엔 출발</b>해야 해요 ({formatMinutes(leave.left)} 남음)</>
          : leave.left > -pill.minutes
            ? <><b>지금 출발</b>해야 해요 ({formatMinutes(-leave.left)} 늦었어요)</>
            : <>출발 시각 {fromMinutes(leave.at)}이 지났어요</>}
      </span>
    </div>
  );
}
