import { useEffect, useState } from "react";
import { Bike, Car, Footprints, Navigation, TrainFront } from "lucide-react";
import type { Item } from "../../domain/types";
import { estimateLeg, formatMinutes, gmapsRoute } from "../../domain/geo";
import { formatHm, zonedDate } from "../../domain/clock";
import { cachedLegTimes, computeLeg, formatMeters, grabUrl, rememberLegTimes, type LegTimes, type Mode, type RouteResult } from "../../infra/routes";
import { hasGoogleKey } from "../../infra/google";
import { sheetMode, useLegPill } from "./useLegPill";
import { Sheet } from "../Sheet";
import { toast } from "../toast";

const MODES: { mode: Mode; label: string; icon: typeof Car; gmaps: string }[] = [
  { mode: "DRIVING", label: "차·그랩", icon: Car, gmaps: "driving" },
  { mode: "TWO_WHEELER", label: "오토바이", icon: Bike, gmaps: "two-wheeler" },
  { mode: "WALKING", label: "도보", icon: Footprints, gmaps: "walking" },
  { mode: "TRANSIT", label: "대중교통", icon: TrainFront, gmaps: "transit" },
];

type Located = Item & { lat: number; lng: number };
/** lite: only the time and distance kept by the timeline, no steps yet */
type State = { status: "loading" } | { status: "none" } | { status: "error" } | { status: "ok"; route: RouteResult; lite?: boolean };

function fromKept(kept: LegTimes | null): Partial<Record<Mode, State>> {
  if (!kept) return {};
  const lite = (t: { minutes: number; meters: number }): State => ({ status: "ok", lite: true, route: { ...t, steps: [], fare: null, transfers: 0, departAt: null, arriveAt: null, walkOnly: false } });
  const out: Partial<Record<Mode, State>> = {};
  if (kept.walk) out.WALKING = lite(kept.walk);
  if (kept.transit) out.TRANSIT = lite(kept.transit);
  if (kept.car) out.DRIVING = lite(kept.car);
  return out;
}

/** How to get from one stop to the next: real times per mode from Google, steps, and hand-off to Maps or Grab. */
export function LegSheet({ from, to, date, tz, onClose }: { from: Located; to: Located; date: string; tz: string; onClose: () => void }) {
  const guess = estimateLeg(from, to);
  const pill = useLegPill(from, to);
  // open on the mode the timeline shows, so the number matches what was tapped
  const [mode, setMode] = useState<Mode>(sheetMode(pill.mode));
  // tabs start from the times the timeline already keeps on the phone; Google is asked only for what's missing
  const kept = cachedLegTimes(from, to);
  const [results, setResults] = useState<Partial<Record<Mode, State>>>(() => fromKept(kept));
  const offline = !navigator.onLine || !hasGoogleKey();
  // item times are the destination's wall clock, wherever the phone is set
  const departure = from.time ? zonedDate(date, from.time, tz) : undefined;
  const [asked, setAsked] = useState<Set<Mode>>(new Set());

  function ask(m: Mode) {
    if (offline || asked.has(m)) return;
    setAsked((a) => new Set(a).add(m));
    setResults((r) => ({ ...r, [m]: r[m]?.status === "ok" ? r[m] : { status: "loading" } }));
    computeLeg(from, to, m, departure, tz)
      .then((route) => {
        setResults((r) => ({ ...r, [m]: route ? { status: "ok", route } : { status: "none" } }));
        // the timeline adopts exactly what the sheet shows
        const slot = m === "WALKING" ? "walk" : m === "TRANSIT" ? "transit" : m === "DRIVING" ? "car" : null;
        if (slot) {
          const v = route && !(m === "TRANSIT" && route.walkOnly) ? { minutes: route.minutes, meters: route.meters } : null;
          rememberLegTimes(from, to, { ...(cachedLegTimes(from, to) ?? { walk: null, transit: null, car: null }), [slot]: v });
        }
      })
      .catch(() => setResults((r) => ({ ...r, [m]: { status: "error" } })));
  }

  useEffect(() => {
    // modes without a kept time, plus transit's steps when transit is the one shown
    for (const m of MODES) if (!results[m.mode] || (m.mode === "TRANSIT" && mode === "TRANSIT")) ask(m.mode);
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
      <a className="btn primary" style={{ textDecoration: "none" }} href={mapsUrl} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />{mode === "TRANSIT" ? "구글맵에서 실시간 보기" : "구글맵에서 길찾기"}</a>
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
            <button key={m} role="tab" aria-selected={m === mode} className={`leg-mode ${s && s.status !== "ok" && s.status !== "loading" ? "off" : ""}`} onClick={() => { setMode(m); if (m === "TRANSIT") ask(m); }}>
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
        mode === "TRANSIT" ? (
          <div className="note-box">
            Google이 이 구간의 대중교통 경로를 주지 않았어요. 일본처럼 앱 밖으로는 대중교통 경로를 주지 않는 나라도 있어요. 구글맵 앱에서는 보일 수 있어요.
            <a className="btn ghost" style={{ marginTop: 10, textDecoration: "none" }} href={mapsUrl} target="_blank" rel="noopener noreferrer"><TrainFront className="icon" />구글맵 앱에서 대중교통 보기</a>
          </div>
        ) : <p className="note-box">이 수단으로는 경로가 없어요.</p>
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
          {mode === "TRANSIT" && (current?.status === "ok" && current.lite
            ? <p className="note-box">타는 곳과 시간을 불러오는 중이에요</p>
            : (
              // only the rides: walking between them is left to the map app
              <ol className="leg-steps">
                {route.steps.filter((s) => s.kind === "transit").map((s, i) => (
                  <li key={i} className="leg-step">
                    <span className="s-ic line" style={{ background: s.line?.color, color: s.line?.textColor }}>{s.line?.short}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="s-main keep">{s.text}</span>
                      <span className="s-sub keep">{s.sub}{s.everyMin ? ` · 약 ${s.everyMin}분 간격` : ""}</span>
                    </span>
                    <span className="s-time num">{formatMinutes(s.minutes)}</span>
                  </li>
                ))}
              </ol>
            ))}
          <p className="fine">{mode === "TRANSIT"
            ? "Google 시간표 기준이에요. 지연·실시간 도착은 구글맵 앱에서 보세요."
            : `Google 경로 기준이에요. 자세한 길은 구글맵에서 보세요.${mode === "DRIVING" || mode === "TWO_WHEELER" ? " 그랩 요금과 실제 시간은 그랩 앱에서 확인하세요." : ""}`}</p>
        </>
      )}
    </Sheet>
  );
}
