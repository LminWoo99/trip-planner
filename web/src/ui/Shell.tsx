import { lazy, Suspense, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, Ellipsis, ListChecks, MapPinned, Shirt, Wallet } from "lucide-react";
import { closeTrip, useApp } from "../app/store";
import { stamp } from "./format";
import { keepTicketsOffline } from "../infra/photos";
import { me, subscribeSnapshots } from "../infra/pocketbase";
import { toast } from "./toast";
import { ScheduleScreen } from "./schedule/ScheduleScreen";
// other tabs load on first visit so the schedule opens fast on a slow connection
const PlacesScreen = lazy(() => import("./PlacesScreen").then((m) => ({ default: m.PlacesScreen })));
const ExpensesScreen = lazy(() => import("./ExpensesScreen").then((m) => ({ default: m.ExpensesScreen })));
const ChecklistScreen = lazy(() => import("./ChecklistScreen").then((m) => ({ default: m.ChecklistScreen })));
const OutfitsScreen = lazy(() => import("./outfits/OutfitsScreen").then((m) => ({ default: m.OutfitsScreen })));
const MoreScreen = lazy(() => import("./MoreScreen").then((m) => ({ default: m.MoreScreen })));

const TABS = [
  { id: "schedule", label: "일정", icon: CalendarDays },
  { id: "places", label: "장소", icon: MapPinned },
  { id: "expenses", label: "경비", icon: Wallet },
  // only for people the admin turned outfits on for
  { id: "outfits", label: "코디", icon: Shirt },
  { id: "checklist", label: "준비물", icon: ListChecks },
  { id: "more", label: "더보기", icon: Ellipsis },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Shell() {
  const app = useApp();
  // keep every ticket image on the phone while there is signal
  const ticketKey = app.snapshot?.bookings.map((b) => b.id + b.files.join()).join("|") ?? "";
  useEffect(() => {
    if (app.snapshot && ticketKey) void keepTicketsOffline(app.snapshot.bookings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketKey, app.online]);
  const [tab, setTab] = useState<TabId>("schedule");
  const canOutfit = !!me()?.perms.includes("outfits");
  // tell the other person when someone changed the schedule with AI
  const tripIdForAlerts = app.snapshot?.trip.id;
  useEffect(() => {
    if (!tripIdForAlerts) return;
    let unsub: (() => void) | null = null;
    void subscribeSnapshots(tripIdForAlerts, (s) => {
      if (s.by && s.by !== me()?.id && !s.label.includes("되돌리기 직전")) toast(`${s.label}. 더보기 > 되돌리기 기록에서 원래대로 살릴 수 있어요`);
    }).then((u) => { unsub = u; }).catch(() => { /* offline */ });
    return () => { unsub?.(); };
  }, [tripIdForAlerts]);
  const [tabbarHidden, setTabbarHidden] = useState(false);

  if (!app.snapshot) {
    return (
      <div className="app">
        <div className="empty" style={{ marginTop: "40vh" }}>{app.error ?? "일정을 불러오는 중이에요"}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="back-btn" onClick={closeTrip} aria-label="여행 목록"><ChevronLeft className="icon" /></button>
        <h1>{app.snapshot.trip.title}</h1>
        <span className="sync" aria-live="polite">
          <span className={`dot ${app.online ? "" : "off"}`} />
          {app.online ? "동기화" : "오프라인, 마지막 동기화"} {app.syncedAt ? stamp(app.syncedAt) : ""}
        </span>
      </header>
      {tab === "schedule" && <ScheduleScreen onSelectionBar={setTabbarHidden} />}
      <Suspense fallback={<div className="screen ground" />}>
        {tab === "places" && <PlacesScreen />}
        {tab === "expenses" && <ExpensesScreen />}
        {tab === "outfits" && <OutfitsScreen />}
        {tab === "checklist" && <ChecklistScreen />}
        {tab === "more" && <MoreScreen />}
      </Suspense>
      {!tabbarHidden && (
        <nav className="tabbar" aria-label="메뉴">
          {TABS.filter((t) => t.id !== "outfits" || canOutfit).map(({ id, label, icon: Icon }) => (
            <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              <Icon className="icon" />{label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
