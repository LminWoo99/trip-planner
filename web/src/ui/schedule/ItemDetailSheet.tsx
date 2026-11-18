import { Clock, ExternalLink, MapPin, Pencil, Route, Wallet } from "lucide-react";
import { CATEGORY_LABEL, type Item } from "../../domain/types";
import { courseKm, formatKm, gmapsSearch } from "../../domain/geo";
import { formatApproxKrw, ratesOf, toKrw } from "../../domain/money";
import { formatMoney } from "../../domain/countries";
import { useApp } from "../../app/store";
import { Sheet } from "../Sheet";
import { PhotoStrip } from "../Photos";
import { CATEGORY_ICON } from "../icons";
import { Linkified } from "./DayHead";


/** Read view of one schedule item (used for plan steps inside a fork); edit is one tap away. */
export function ItemDetailSheet({ item, onClose, onEdit, onRoute }: { item: Item; onClose: () => void; onEdit: () => void; onRoute: () => void }) {
  const { snapshot } = useApp();
  const group = item.group ? snapshot?.groups.find((g) => g.id === item.group) : null;
  const rates = snapshot ? ratesOf(snapshot.trip) : null;
  const CatIcon = CATEGORY_ICON[item.cat];
  const km = item.stops.length ? courseKm(item.stops) : 0;

  return (
    <Sheet title={item.title} onClose={onClose} footer={<button className="btn primary" onClick={onEdit}><Pencil className="icon" />고치기</button>}>
      <div className="detail-rows">
        <div className="detail-row"><CatIcon className="icon" /><span>{CATEGORY_LABEL[item.cat]}{group ? `, ${group.title} 플랜 ${item.branch}` : ""}</span></div>
        {item.time && <div className="detail-row"><Clock className="icon" /><span className="num">{item.time}</span></div>}
        {item.place && (
          <a className="detail-row link" href={item.link || gmapsSearch(item)} target="_blank" rel="noopener noreferrer">
            <MapPin className="icon" /><span>{item.place}</span><ExternalLink className="icon end" />
          </a>
        )}
        {item.cost > 0 && (
          <div className="detail-row"><Wallet className="icon" />
            <span className="num">{formatMoney(item.cost, item.cur ?? rates?.local ?? "KRW")}{rates && (item.cur ?? rates.local) !== "KRW" ? ` (${formatApproxKrw(toKrw(item.cost, item.cur ?? rates.local, rates))})` : ""}</span>
          </div>
        )}
        {item.stops.length > 0 && (
          <button className="detail-row link" onClick={onRoute}>
            <Route className="icon" /><span>경유 {item.stops.length}곳{km > 0 ? `, 약 ${formatKm(km)}` : ""} · 코스 보기</span>
          </button>
        )}
      </div>
      {item.memo && <p className="keep detail-memo"><Linkified text={item.memo} /></p>}
      <PhotoStrip itemId={item.id} photos={item.photos} />
      {!item.memo && item.photos.length === 0 && !item.place && <p style={{ margin: 0, fontSize: 13, color: "var(--ink3)" }}>메모나 장소가 아직 없어요. 고치기에서 추가할 수 있어요.</p>}
    </Sheet>
  );
}
