import { useEffect, useState } from "react";
import { Link2, Share2 } from "lucide-react";
import { refresh, useApp } from "../app/store";
import { createInvite, decideRequest, inviteUrl, me, tripRequests, type JoinRequest } from "../infra/pocketbase";
import { Sheet } from "./Sheet";
import { attempt, toast } from "./toast";

const COLORS = ["#5b4fe0", "#e2557a", "#2f9e8f", "#d9822b", "#3a7bd5", "#8a6d3b"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const linkKey = (tripId: string) => `invite-link:${tripId}`;

function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s.replace(" ", "T")).getTime()) / 60000);
  return m < 2 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
}

/** 더보기 > 일행: who is in, who asks to join, and the invite link (owner only). */
export function MembersSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const self = me();
  const tripId = snapshot?.trip.id ?? "";
  const owner = snapshot?.members.find((m) => m.role === "owner");
  const isOwner = !!owner && owner.user === self?.id;
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  // the server keeps only a hash, so the owner's phone remembers the link it made
  const [link, setLink] = useState<{ token: string; expires: string } | null>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(linkKey(tripId)) ?? "null");
      return v && new Date(v.expires).getTime() > Date.now() ? v : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (isOwner) tripRequests(tripId).then(setRequests).catch(() => setRequests([]));
  }, [isOwner, tripId]);

  if (!snapshot) return null;

  const [confirmRenew, setConfirmRenew] = useState(false);

  async function makeLink() {
    setConfirmRenew(false);
    try {
      const v = await createInvite(tripId);
      setLink(v);
      try { localStorage.setItem(linkKey(tripId), JSON.stringify(v)); } catch { /* ignore */ }
      toast("초대 링크를 만들었어요");
    } catch {
      toast("링크를 만들지 못했어요. 인터넷을 확인해 주세요.");
    }
  }

  async function send() {
    if (!link) return;
    const url = inviteUrl(link.token);
    const text = `${snapshot!.trip.title}에 초대해요. 링크를 열고 참여를 요청해 주세요.`;
    try {
      if (navigator.share) await navigator.share({ title: snapshot!.trip.title, text, url });
      else { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
    } catch { /* share sheet closed */ }
  }

  async function decide(r: JoinRequest, approve: boolean) {
    if (await attempt(() => decideRequest(r.id, approve), approve ? `${r.name}님이 함께해요` : "거절했어요")) {
      setRequests((list) => list?.filter((x) => x.id !== r.id) ?? null);
      if (approve) void refresh();
    }
  }

  const until = link ? new Date(link.expires) : null;
  return (
    <Sheet title="일행" onClose={onClose}>
      {isOwner && requests && requests.length > 0 && (
        <section>
          <h3 className="sheet-sec">승인 기다리는 사람 <span className="count-badge num">{requests.length}</span></h3>
          <div className="mem-list">
            {requests.map((r) => (
              <div key={r.id} className="mem-row">
                <span className="av" style={{ background: colorFor(r.id) }}>{r.name.slice(0, 1)}</span>
                <div className="mem-who"><b>{r.name}</b><small>@{r.username}, {ago(r.created)}</small></div>
                <div className="mem-btns">
                  <button className="btn ghost sm" onClick={() => decide(r, false)}>거절</button>
                  <button className="btn primary sm" onClick={() => decide(r, true)}>승인</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="sheet-sec">함께하는 일행 {snapshot.members.length}명</h3>
        <div className="mem-list">
          {snapshot.members.map((m) => (
            <div key={m.id} className="mem-row">
              <span className="av" style={{ background: colorFor(m.user) }}>{m.displayName.slice(0, 1)}</span>
              <div className="mem-who"><b>{m.displayName}{m.user === self?.id && <small className="me-tag"> 나</small>}</b></div>
              {m.role === "owner" && <span className="owner-tag">방장</span>}
            </div>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section>
          <h3 className="sheet-sec">초대 링크</h3>
          {link ? (
            <div className="link-card">
              <div className="link-url"><Link2 className="icon" /><span>{inviteUrl(link.token).replace(/^https?:\/\//, "")}</span></div>
              <p className="link-meta">받은 사람은 로그인한 뒤 참여를 요청하고, 내가 승인해야 여행이 보여요. {until!.getMonth() + 1}월 {until!.getDate()}일까지 쓸 수 있어요.</p>
              {confirmRenew ? (
                <div className="link-btns">
                  <p className="link-meta" style={{ flex: "1 1 100%", margin: "0 0 4px", color: "var(--danger)" }}>새 링크를 만들면 예전 링크는 바로 막혀요.</p>
                  <button className="btn ghost" onClick={() => setConfirmRenew(false)}>그대로 두기</button>
                  <button className="btn primary" onClick={makeLink}>새 링크 만들기</button>
                </div>
              ) : (
                <div className="link-btns">
                  <button className="btn ghost" onClick={() => setConfirmRenew(true)}>링크 바꾸기</button>
                  <button className="btn primary" onClick={send}><Share2 className="icon" />링크 보내기</button>
                </div>
              )}
            </div>
          ) : (
            <div className="link-card">
              <p className="link-meta" style={{ marginTop: 0 }}>링크를 보내면 받은 사람이 참여를 요청하고, 내가 승인하면 함께해요. 링크는 1주일 동안 쓸 수 있어요.</p>
              <div className="link-btns"><button className="btn primary" onClick={makeLink}>초대 링크 만들기</button></div>
            </div>
          )}
        </section>
      ) : (
        <p className="sheet-note">일행 초대는 방장 {owner?.displayName ?? ""}님이 할 수 있어요.</p>
      )}
    </Sheet>
  );
}
