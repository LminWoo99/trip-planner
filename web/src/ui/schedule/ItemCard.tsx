import { useState } from "react";
import { AlignLeft, Bus, Check, ChevronRight, Plane, Route, Ticket } from "lucide-react";
import type { Booking, Item } from "../../domain/types";
import { courseKm, formatKm, formatMinutes, gmapsSearch, type LatLng } from "../../domain/geo";
import { PILL, useLegPill } from "./useLegPill";
import { CATEGORY_ICON } from "../icons";
import { PhotoStrip } from "../Photos";

const RAIL_ICON = { flight: Plane, move: Bus } as const;

export function Marker({ item, n }: { item: Item; n: number | null }) {
  const Rail = RAIL_ICON[item.cat as keyof typeof RAIL_ICON];
  if (Rail && n === null) return <span className="mk"><Rail className="icon" /></span>;
  return n !== null ? <span className={`mk ${item.done ? "done" : ""}`}>{n}</span> : <span className="mk dot" />;
}

export function GapRow({ from, to, onOpen }: { from: LatLng; to: LatLng; onOpen: () => void }) {
  const pill = useLegPill(from, to);
  const { icon: Mode, label } = PILL[pill.mode];
  const text = `${label} ${pill.real ? "" : "약 "}${formatMinutes(pill.minutes)}`;
  return (
    <div className="tl-gap">
      <span className="dist">{formatKm(pill.km)}</span>
      <button className="gap-btn" onClick={onOpen} aria-label={`다음 장소까지 ${formatKm(pill.km)}, ${text}. 이동 방법 보기`}>
        <Mode className="icon" />{text}<ChevronRight className="icon chev" />
      </button>
    </div>
  );
}

interface Props {
  item: Item;
  n: number | null;
  onOpen: () => void;
  onToggle: () => void;
  onRoute?: () => void;
  className?: string;
  /** linked booking that has ticket images */
  ticket?: Booking | null;
  onTicket?: (b: Booking) => void;
}

const isLongMemo = (m: string) => m.length > 70 || m.split("\n").length > 2;

export function ItemRow({ item, n, onOpen, onToggle, onRoute, className = "", ticket, onTicket }: Props) {
  const CatIcon = CATEGORY_ICON[item.cat];
  const [memoOpen, setMemoOpen] = useState(false);
  const km = item.stops.length ? courseKm(item.stops) : 0;
  return (
    <div className={`tl-row ${className}`}>
      <div className="tl-rail">
        <Marker item={item} n={n} />
        {item.time && <span className="tl-time">{item.time}</span>}
      </div>
      <div className={`card ${item.done ? "is-done" : ""}`}>
        <div className="c-main">
          <button className={`c-title keep ${item.place || item.memo ? "" : "plain"}`} style={{ textAlign: "left", width: "100%" }} onClick={onOpen}>
            {item.title}
          </button>
          {item.place && (
            <a className="c-meta" href={gmapsSearch(item)} target="_blank" rel="noopener noreferrer">
              <CatIcon className="icon" /><span>{item.place}</span>
            </a>
          )}
          {item.stops.length > 0 && (
            <button className="c-route" onClick={onRoute ?? onOpen}>
              <Route className="icon" /><span>경유 {item.stops.length}곳{km > 0 ? `, 약 ${formatKm(km)}` : ""}</span><b>코스 보기</b><ChevronRight className="icon" />
            </button>
          )}
          {item.memo && (
            <div className="c-memo">
              <AlignLeft className="icon" />
              <span className={memoOpen ? "open" : ""}>{item.memo}</span>
            </div>
          )}
          {item.memo && isLongMemo(item.memo) && (
            <button className="memo-more" onClick={() => setMemoOpen(!memoOpen)} aria-expanded={memoOpen}>{memoOpen ? "접기" : "메모 더보기"}</button>
          )}
          {ticket && onTicket && <button className="c-ticket" onClick={() => onTicket(ticket)}><Ticket className="icon" />티켓 {ticket.files.length}장</button>}
          <PhotoStrip itemId={item.id} photos={item.photos} />
        </div>
        <button className="check" role="checkbox" aria-checked={item.done} aria-label={`${item.title} 완료`} onClick={onToggle}>
          <span className="box"><Check className="icon" /></span>
        </button>
      </div>
    </div>
  );
}
