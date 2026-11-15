import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { hasGoogleKey, PlaceSearchSession, type FoundPlace, type Suggestion } from "../infra/google";

interface Props {
  id: string;
  value: string;
  city: string;
  located: boolean;
  placeholder?: string;
  onText: (text: string) => void;
  onPick: (place: FoundPlace) => void;
  onClear: () => void;
}

/** Type a name → Google suggestions near the day's city → pick one to fill name, position and map link. */
export function PlaceSearch({ id, value, city, located, placeholder, onText, onPick, onClear }: Props) {
  const session = useRef(new PlaceSearchSession());
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"" | "busy" | "error">("");
  const seq = useRef(0);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || !hasGoogleKey()) return;
    const q = value.trim();
    if (q.length < 2) { setList([]); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setState("busy");
      try {
        const res = await session.current.suggest(q, city);
        if (mine === seq.current) { setList(res); setState(""); setOpen(true); }
      } catch {
        if (mine === seq.current) setState("error");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, city]);

  async function pick(s: Suggestion) {
    setOpen(false);
    setList([]);
    typed.current = false;
    setState("busy");
    try {
      const place = await session.current.select(s);
      setState(place ? "" : "error");
      if (place) onPick(place);
    } catch {
      setState("error");
    }
  }

  const hint = !hasGoogleKey()
    ? "장소 검색을 쓰려면 Google 지도 키가 필요해요"
    : state === "busy" ? "찾는 중이에요"
    : state === "error" ? "검색하지 못했어요. 연결을 확인하고 다시 해 주세요."
    : located ? "지도에 표시되는 장소예요"
    : "이름을 입력하고 목록에서 고르면 지도에 표시돼요";

  return (
    <div className="place-search">
      <div style={{ position: "relative" }}>
        <input
          id={id}
          className="input"
          value={value}
          placeholder={placeholder ?? "예: Phở Hà Nội Sapa"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls={`${id}-list`}
          onChange={(e) => { typed.current = true; onText(e.target.value); }}
          onFocus={() => list.length && setOpen(true)}
          style={{ paddingRight: value ? 40 : undefined }}
        />
        {value && (
          <button type="button" className="icon-btn" style={{ position: "absolute", right: 1, top: 1, height: 44 }} aria-label="장소 지우기"
            onClick={() => { typed.current = false; setList([]); onClear(); }}>
            <X className="icon" style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>
      {open && list.length > 0 && (
        <div className="suggest" id={`${id}-list`} role="listbox">
          {list.map((s) => (
            <button key={s.placeId} type="button" role="option" aria-selected={false} className="suggest-row" onClick={() => pick(s)}>
              <MapPin className="icon" />
              <span style={{ minWidth: 0 }}>
                <span className="suggest-main">{s.main}</span>
                {s.secondary && <span className="suggest-sub">{s.secondary}</span>}
              </span>
            </button>
          ))}
          <div className="suggest-attr">Powered by Google</div>
        </div>
      )}
      <small style={{ fontSize: 12, color: state === "error" ? "var(--danger)" : "var(--ink3)" }}>{hint}</small>
    </div>
  );
}
