import { useEffect, useState } from "react";
import { invitePreview, requestJoin, type InvitePreview } from "../infra/pocketbase";

const COLORS = ["#5b4fe0", "#e2557a", "#2f9e8f", "#d9822b", "#3a7bd5"];
const toList = () => { window.location.href = "/"; };
const md = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${m}월 ${d}일`; };
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${md(a)}부터 ${Number(b.slice(8, 10))}일까지` : `${md(a)}부터 ${md(b)}까지`);

/** /j/<token>: see which trip you were invited to, ask to join, then wait for the owner. */
export function InviteScreen({ token }: { token: string }) {
  const [info, setInfo] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invitePreview(token).then(setInfo).catch((e) => setError(e?.response?.message || "초대를 불러오지 못했어요. 인터넷을 확인해 주세요."));
  }, [token]);

  async function ask() {
    setBusy(true);
    try {
      const r = await requestJoin(token);
      setInfo((i) => i && { ...i, status: r.status as InvitePreview["status"] });
    } catch (e) {
      setError((e as { response?: { message?: string } }).response?.message || "요청을 보내지 못했어요. 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="invite">
        <p className="invite-msg" role="alert">{error}</p>
        <div className="auth-fill" />
        <button className="btn ghost" onClick={toList}>여행 목록으로</button>
      </div>
    );
  }
  if (!info) return <div className="invite"><p className="invite-msg">초대를 확인하는 중이에요</p></div>;

  const joined = info.status === "member" || info.status === "approved";
  return (
    <div className="invite">
      <div className="invite-card">
        <div className="invite-top">
          <small>{info.inviter}님이 초대했어요</small>
          <h1>{info.title}</h1>
          <p className="num">{range(info.start, info.end)}{info.cities.length ? `, ${info.cities.join(", ")}` : ""}</p>
        </div>
        <div className="invite-bot">
          <span className="avs">{info.members.slice(0, 4).map((m, i) => <span key={i} className="av" style={{ background: COLORS[i % COLORS.length] }}>{m.slice(0, 1)}</span>)}</span>
          {info.members.join(", ")}이 함께해요
        </div>
      </div>

      {info.status === "pending" && (
        <div className="invite-wait"><span className="dot" /><div><b>방장 승인을 기다리고 있어요</b><span>{info.inviter}님이 승인하면 여행 목록에 바로 나타나요. 이 화면은 닫아도 돼요.</span></div></div>
      )}
      {info.status === "rejected" && <p className="invite-msg">지난번 요청은 승인되지 않았어요. 다시 요청할 수 있어요.</p>}
      {joined && <p className="invite-msg">이미 함께하는 여행이에요.</p>}

      <div className="auth-fill" />
      {(info.status === "none" || info.status === "rejected") && (
        <button className="btn primary" disabled={busy} onClick={ask}>{busy ? "보내는 중" : info.status === "rejected" ? "다시 요청하기" : "참여 요청 보내기"}</button>
      )}
      {joined && <button className="btn primary" onClick={() => { try { localStorage.setItem("trip-current", JSON.stringify(info.tripId)); } catch { /* ignore */ } toList(); }}>여행 열기</button>}
      {info.status === "pending" && <button className="btn ghost" onClick={toList}>여행 목록으로</button>}
    </div>
  );
}
