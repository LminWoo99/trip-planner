import { AlignLeft, Bus, Car, Check, Footprints, Plane } from "lucide-react";
import type { Item } from "../../domain/types";
import { estimateLeg, formatKm, formatMinutes, gmapsSearch, type LatLng } from "../../domain/geo";
import { CATEGORY_ICON } from "../icons";

const RAIL_ICON = { flight: Plane, move: Bus } as const;

export function Marker({ item, n }: { item: Item; n: number | null }) {
  const Rail = RAIL_ICON[item.cat as keyof typeof RAIL_ICON];
  if (Rail && n === null) return <span className="mk"><Rail className="icon" /></span>;
  return n !== null ? <span className={`mk ${item.done ? "done" : ""}`}>{n}</span> : <span className="mk dot" />;
}

export function GapRow({ from, to }: { from: LatLng; to: LatLng }) {
  const leg = estimateLeg(from, to);
  const Mode = leg.mode === "walk" ? Footprints : Car;
  return (
    <div className="tl-gap" aria-label={`다음 장소까지 ${formatKm(leg.km)}`}>
      <span className="dist">{formatKm(leg.km)}</span>
      <span className="gap-mode"><Mode className="icon" />{leg.mode === "walk" ? "도보" : "차"} 약 {formatMinutes(leg.minutes)}</span>
    </div>
  );
}

interface Props {
  item: Item;
  n: number | null;
  onOpen: () => void;
  onToggle: () => void;
  className?: string;
}

export function ItemRow({ item, n, onOpen, onToggle, className = "" }: Props) {
  const CatIcon = CATEGORY_ICON[item.cat];
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
            <a className="c-meta" href={gmapsSearch(item.place)} target="_blank" rel="noopener noreferrer">
              <CatIcon className="icon" /><span>{item.place}</span>
            </a>
          )}
          {item.memo && (
            <button className="c-memo" style={{ textAlign: "left" }} onClick={onOpen}>
              <AlignLeft className="icon" /><span>{item.memo}</span>
            </button>
          )}
        </div>
        <button className="check" role="checkbox" aria-checked={item.done} aria-label={`${item.title} 완료`} onClick={onToggle}>
          <span className="box"><Check className="icon" /></span>
        </button>
      </div>
    </div>
  );
}
