import { lazy, Suspense, useSyncExternalStore } from "react";
import { pb } from "../infra/pocketbase";
import { start, useApp } from "../app/store";
import { Gate } from "./Gate";
const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
const TripList = lazy(() => import("./TripList").then((m) => ({ default: m.TripList })));
import { Toast } from "./toast";
import { UpdateBanner } from "./UpdateBanner";

const subscribeAuth = (l: () => void) => pb.authStore.onChange(l);
const isAuthed = () => pb.authStore.isValid;

export function App() {
  const authed = useSyncExternalStore(subscribeAuth, isAuthed);
  const { tripId } = useApp();
  return (
    <>
      {authed
        ? <Suspense fallback={null}>{tripId ? <Shell key={tripId} /> : <TripList />}</Suspense>
        : <Gate onEnter={() => void start()} />}
      <Toast />
      <UpdateBanner />
    </>
  );
}
