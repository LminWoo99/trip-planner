import { lazy, Suspense, useSyncExternalStore } from "react";
import { pb } from "../infra/pocketbase";
import { start } from "../app/store";
import { Gate } from "./Gate";
const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
import { Toast } from "./toast";

const subscribeAuth = (l: () => void) => pb.authStore.onChange(l);
const isAuthed = () => pb.authStore.isValid;

export function App() {
  const authed = useSyncExternalStore(subscribeAuth, isAuthed);
  return (
    <>
      {authed ? <Suspense fallback={null}><Shell /></Suspense> : <Gate onEnter={() => void start()} />}
      <Toast />
    </>
  );
}
