import { RefreshCw } from "lucide-react";
import { applyUpdate, useUpdatePending } from "../app/updater";

/** A new version is ready; it is applied only when tapped, never automatically. */
export function UpdateBanner() {
  const pending = useUpdatePending();
  if (!pending) return null;
  return (
    <div className="update-banner" role="status">
      <span>새 버전이 있어요</span>
      <button onClick={applyUpdate}><RefreshCw className="icon" />지금 적용</button>
    </div>
  );
}
