import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bike, Car, Footprints, Navigation, TrainFront } from "lucide-react";
import type { Item } from "../../domain/types";
import { estimateLeg, formatMinutes, gmapsRoute } from "../../domain/geo";
import { formatHm, zonedDate } from "../../domain/clock";
import { computeLeg, formatMeters, grabUrl, type Mode, type RouteResult } from "../../infra/routes";
import { hasGoogleKey, loadMaps } from "../../infra/google";
import { Sheet } from "../Sheet";
import { toast } from "../toast";

const MODES: { mode: Mode; label: string; icon: typeof Car; gmaps: string }[] = [
  { mode: "DRIVING", label: "차·그랩", icon: Car, gmaps: "driving" },
  { mode: "TWO_WHEELER", label: "오토바이", icon: Bike, gmaps: "two-wheeler" },
  { mode: "WALKING", label: "도보", icon: Footprints, gmaps: "walking" },
  { mode: "TRANSIT", label: "대중교통", icon: TrainFront, gmaps: "transit" },
];

type Located = Item & { lat: number; lng: number };
type State = { status: "loading" } | { status: "none" } | { status: "error" } | { status: "ok"; route: RouteResult };

/** How to get from one stop to the next: real times per mode from Google, steps, and hand-off to Maps or Grab. */
export function LegSheet({ from, to, date, tz, onClose }: { from: Located; to: Located; date: string; tz: string; onClose: () => void }) {
  const guess = estimateLeg(from, to);
  const [mode, setMode] = useState<Mode>(guess.mode === "walk" ? "WALKING" : "DRIVING");
  const [results, setResults] = useState<Partial<Record<Mode, State>>>({});
  const offline = !navigator.onLine || !hasGoogleKey();
  // item times are the destination's wall clock, wherever the phone is set
  const departure = from.time ? zonedDate(date, from.time, tz) : undefined;

  useEffect(() => {
    if (offline) return;
    let alive = true;
    for (const m of MODES) {
      setResults((r) => ({ ...r, [m.mode]: { status: "loading" } }));
      computeLeg(from, to, m.mode, departure, tz)
        .then((route) => alive && setResults((r) => ({ ...r, [m.mode]: route ? { status: "ok", route } : { status: "none" } })))
        .catch(() => alive && setResults((r) => ({ ...r, [m.mode]: { status: "error" } })));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = results[mode];
  const route = current?.status === "ok" ? current.route : null;
  const gm = MODES.find((m) => m.mode === mode)!.gmaps;
  const mapsUrl = `${gmapsRoute([from, to].map((i) => ({ place: i.place || i.title, placeId: i.placeId })))}&travelmode=${gm}`;

  async function openGrab() {
    try { await navigator.clipboard.writeText(to.place || to.title); toast("도착지 이름을 복사했어요. 그랩에서 안 채워지면 붙여넣으세요."); } catch { /* clipboard refused: the link still opens */ }
    window.location.href = grabUrl(to, to.place || to.title);
  }

  const at = (d: Date) => formatHm(d, tz);
  const arriveGuess = route && departure && departure.getTime() > 0 ? new Date(departure.getTime() + route.minutes * 60_000) : null;

  return (
    <Sheet title="이동 방법" onClose={onClose} footer={<>
      {(mode === "DRIVING" || mode === "TWO_WHEELER") && <button className="btn ghost grab-btn" onClick={openGrab}><i />그랩 열기</button>}
      <a className="btn primary" style={{ textDecoration: "none" }} href={mapsUrl} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />구글맵에서 길찾기</a>
    </>}>
      <div className="leg-ft">
        <span className="dot" /><span className="keep">{from.title}</span>
        <span className="line" /><span />
        <span className="dot to" /><b className="keep">{to.title}</b>
      </div>

      <div className="leg-modes" role="tablist" aria-label="이동 수단">
        {MODES.map(({ mode: m, label }) => {
          const s = results[m];
          const value = offline ? (m === "WALKING" && guess.mode === "walk") || (m === "DRIVING" && guess.mode === "car") ? `약 ${formatMinutes(guess.minutes)}` : "–"
            : !s || s.status === "loading" ? "…" : s.status !== "ok" ? "없음" : s.route.walkOnly ? "걷기" : formatMinutes(s.route.minutes);
          return (
            <button key={m} role="tab" aria-selected={m === mode} className={`leg-mode ${s && s.status !== "ok" && s.status !== "loading" ? "off" : ""}`} onClick={() => setMode(m)}>
              <span>{label}</span><b className="num">{value}</b>
            </button>
          );
        })}
      </div>

      {offline ? (
        <p className="note-box">오프라인이라 실제 경로를 못 불러와요. 직선거리로 어림하면 {guess.mode === "walk" ? "걸어서" : "차로"} 약 {formatMinutes(guess.minutes)}이에요. 구글맵 버튼은 연결되면 열려요.</p>
      ) : !current || current.status === "loading" ? (
        <p className="note-box">경로를 찾는 중이에요</p>
      ) : current.status === "none" ? (
        <p className="note-box">{mode === "TRANSIT" ? "이 구간은 대중교통 경로가 없어요. 차나 도보를 골라 보세요." : "이 수단으로는 경로가 없어요."}</p>
      ) : current.status === "error" ? (
        <p className="note-box" style={{ color: "var(--danger)" }}>경로를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
      ) : route?.walkOnly ? (
        <p className="note-box">타고 갈 버스나 지하철이 없을 만큼 가까워요. 대중교통보다 걷는 게 나아요(걸어서 약 {formatMinutes(route.minutes)}).</p>
      ) : route && (
        <>
          <div className="leg-summary">
            <span className="big num">{formatMinutes(route.minutes)}</span>
            <span className="num">{mode === "TRANSIT" ? [route.transfers ? `환승 ${route.transfers}번` : "환승 없음", route.fare].filter(Boolean).join(" · ") : formatMeters(route.meters)}</span>
          </div>
          {mode === "TRANSIT" && route.departAt && route.arriveAt
            ? <div className="leg-when num">{at(route.departAt)} 출발 → {at(route.arriveAt)} 도착</div>
            : arriveGuess && <div className="leg-when num">{from.time} 출발하면 {at(arriveGuess)} 도착{to.time ? ` · 다음 일정 ${to.time}` : ""}</div>}
          {mode !== "TRANSIT" && <RouteMap path={route.path} />}
          <ol className="leg-steps">
            {route.steps.map((s, i) => (
              <li key={i} className="leg-step">
                {s.line
                  ? <span className="s-ic line" style={{ background: s.line.color, color: s.line.textColor }}>{s.line.short}</span>
                  : <span className="s-ic">{s.kind === "walk" ? <Footprints className="icon" /> : <ArrowUpRight className="icon" />}</span>}
                <span style={{ minWidth: 0 }}><span className="s-main keep">{s.text}</span>{s.sub && <span className="s-sub keep">{s.sub}</span>}</span>
                <span className="s-time num">{formatMinutes(s.minutes)}</span>
              </li>
            ))}
          </ol>
          <p className="fine">Google 경로 기준이에요.{mode === "DRIVING" || mode === "TWO_WHEELER" ? " 그랩 요금과 실제 시간은 그랩 앱에서 확인하세요." : ""}</p>
        </>
      )}
    </Sheet>
  );
}

function RouteMap({ path }: { path: readonly google.maps.LatLngLiteral[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || path.length < 2) return;
    let alive = true;
    loadMaps().then(({ Map }) => {
      if (!alive || !el.current) return;
      const m = new Map(el.current, { disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false });
      new google.maps.Polyline({ map: m, path: [...path], strokeColor: "#5b4fe0", strokeWeight: 5, strokeOpacity: 0.9 });
      for (const [i, p] of [[1, path[0]], [2, path[path.length - 1]]] as const) {
        new google.maps.Marker({ map: m, position: p, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: i === 1 ? "#ffffff" : "#5b4fe0", fillOpacity: 1, strokeColor: "#5b4fe0", strokeWeight: 3 } });
      }
      const b = new google.maps.LatLngBounds();
      path.forEach((p) => b.extend(p));
      m.fitBounds(b, 28);
    }).catch(() => { /* map is a bonus; steps still show */ });
    return () => { alive = false; };
  }, [path]);
  return <div ref={el} className="leg-map" aria-label="경로 지도" />;
}
