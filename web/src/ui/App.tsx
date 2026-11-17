import { lazy, Suspense, useSyncExternalStore } from "react";
import { pb } from "../infra/pocketbase";
import { start, useApp } from "../app/store";
import { Login } from "./Login";
const InviteScreen = lazy(() => import("./InviteScreen").then((m) => ({ default: m.InviteScreen })));
const AdminScreen = lazy(() => import("./AdminScreen").then((m) => ({ default: m.AdminScreen })));
const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
const TripList = lazy(() => import("./TripList").then((m) => ({ default: m.TripList })));
import { Toast } from "./toast";
import { UpdateBanner } from "./UpdateBanner";

const subscribeAuth = (l: () => void) => pb.authStore.onChange(l);
const isAuthed = () => pb.authStore.isValid;

export function App() {
  const authed = useSyncExternalStore(subscribeAuth, isAuthed);
  const { tripId } = useApp();
  const invite = /^\/j\/([A-Za-z0-9]+)$/.exec(location.pathname)?.[1] ?? null;
  return (
    <>
      {!authed
        ? <Login onEnter={() => void start()} invited={invite !== null} />
        : invite
          ? <Suspense fallback={null}><InviteScreen token={invite} /></Suspense>
        : location.pathname.startsWith("/admin")
          ? <Suspense fallback={null}><AdminScreen /></Suspense>
          : <Suspense fallback={null}>{tripId ? <Shell key={tripId} /> : <TripList />}</Suspense>}
      <Toast />
      <UpdateBanner />
    </>
  );
}
