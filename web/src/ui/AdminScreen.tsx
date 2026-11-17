import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { adminOverview, me, setPerms, type AdminUser, type Perm } from "../infra/pocketbase";
import { attempt } from "./toast";

const COLORS = ["#5b4fe0", "#e2557a", "#2f9e8f", "#d9822b", "#3a7bd5", "#8a6d3b"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const parse = (s: string) => new Date(s.replace(" ", "T"));
const country = (cc: string) => { try { return cc ? new Intl.DisplayNames(["ko"], { type: "region" }).of(cc) ?? cc : ""; } catch { return cc; } };

function ago(s: string): string {
  if (!s) return "접속 기록 없음";
  const m = Math.round((Date.now() - parse(s).getTime()) / 60000);
  if (m < 2) return "방금 전";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
const md = (s: string) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const hm = (s: string) => { const d = parse(s); const today = new Date().toDateString() === d.toDateString(); return today ? d.toTimeString().slice(0, 5) : `${md(s)} ${d.toTimeString().slice(0, 5)}`; };

/** "Mozilla/5.0 (iPhone; …) … Safari" → "iPhone Safari". */
function device(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
  const br = /SamsungBrowser/.test(ua) ? "Samsung" : /CriOS|Chrome/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" ") || "알 수 없는 기기";
}

/** /admin: sign-ups, per-person features and sign-in history. The server checks the role too. */
export function AdminScreen() {
  const self = me();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"users" | "perms" | "events">("users");

  useEffect(() => {
    if (!self?.admin) return;
    adminOverview().then(setData).catch(() => setError("불러오지 못했어요. 새로고침해 주세요."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayCount = useMemo(() => data?.users.filter((u) => u.lastSeen && parse(u.lastSeen).toDateString() === new Date().toDateString()).length ?? 0, [data]);

  if (!self?.admin) {
    return (
      <div className="admin">
        <div className="admin-top"><h1>관리</h1></div>
        <p className="admin-note">관리자 계정만 볼 수 있어요.</p>
        <a className="btn ghost" href="/" style={{ margin: "0 16px", textDecoration: "none" }}>앱으로 돌아가기</a>
      </div>
    );
  }

  async function toggle(u: AdminUser, p: Perm) {
    const next = u.perms.includes(p) ? u.perms.filter((x) => x !== p) : [...u.perms, p];
    if (await attempt(() => setPerms(u.id, next), next.includes(p) ? "켰어요" : "껐어요")) {
      setData((d) => d && { ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, perms: next } : x)) });
    }
  }

  return (
    <div className="admin">
      <div className="admin-top">
        <a href="/" className="icon-btn" aria-label="앱으로"><ChevronLeft className="icon" /></a>
        <div><h1>관리</h1><small>관리자 {self.username}</small></div>
      </div>
      {error && <p className="admin-note" role="alert">{error}</p>}
      {data && <>
        <p className="admin-sum">가입자 {data.users.length}명, 오늘 {todayCount}명이 접속했어요.</p>
        <div className="seg" role="tablist" aria-label="관리 메뉴">
          {([["users", "가입자"], ["perms", "권한"], ["events", "접속 기록"]] as const).map(([k, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{n}</button>
          ))}
        </div>

        {tab === "users" && (
          <div className="admin-list">
            {data.users.map((u) => (
              <div key={u.id} className="admin-row">
                <span className="av" style={{ background: colorFor(u.id) }}>{(u.name || u.username).slice(0, 1)}</span>
                <div className="admin-who"><b>{u.name}{u.role === "admin" && <span className="admin-tag">관리자</span>}</b><small>@{u.username}, {u.trips ? `여행 ${u.trips}개` : "여행 없음"}</small></div>
                <div className="admin-right num">{ago(u.lastSeen)}<em>{md(u.created)} 가입</em></div>
              </div>
            ))}
          </div>
        )}

        {tab === "perms" && (
          <div className="admin-list">
            {data.users.map((u) => (
              <div key={u.id} className="admin-row perm-row">
                <span className="av" style={{ background: colorFor(u.id) }}>{(u.name || u.username).slice(0, 1)}</span>
                <div className="admin-who"><b>{u.name}</b><small>@{u.username}</small></div>
                <div className="perm-togs">
                  {([["outfits", "코디"], ["ai", "AI"]] as const).map(([p, label]) => (
                    <label key={p} className="tog">
                      <input type="checkbox" role="switch" checked={u.perms.includes(p)} onChange={() => toggle(u, p)} aria-label={`${u.name} ${label}`} />
                      <span className="sw" />{label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "perms" && data.aiUsage && (
          <div className="admin-usage">
            <b>이번 달 AI 사용</b>
            <table>
              <tbody>
                {([["plan", "일정 나누기"], ["clothes", "옷 알아듣기"], ["coord", "코디 한마디"], ["avatar", "사진으로 아바타"]] as const).map(([k, n]) => (
                  <tr key={k}><td>{n}</td><td className="num">{data.aiUsage![k]}번</td></tr>
                ))}
              </tbody>
            </table>
            <small>한 사람이 하루 30번까지 쓸 수 있어요.</small>
          </div>
        )}

        {tab === "events" && (
          <div className="admin-list">
            {data.events.length === 0 && <p className="admin-note">아직 기록이 없어요.</p>}
            {data.events.map((ev) => {
              const fail = ev.kind === "login_fail";
              return (
                <div key={ev.id} className="admin-row">
                  <span className="av" style={{ background: ev.user ? colorFor(ev.user) : "#9aa1a9" }}>{ev.name ? ev.name.slice(0, 1) : "?"}</span>
                  <div className="admin-who">
                    <b>{ev.kind === "signup" ? "가입" : "로그인"} <span className={fail ? "ev-bad" : "ev-ok"}>{fail ? "실패" : "성공"}</span></b>
                    <small>{[fail ? `@${ev.username}으로 시도` : ev.name || `@${ev.username}`, device(ev.ua), country(ev.country)].filter(Boolean).join(", ")}{ev.ip && ` (${ev.ip})`}</small>
                  </div>
                  <div className="admin-right num">{hm(ev.created)}</div>
                </div>
              );
            })}
          </div>
        )}
      </>}
    </div>
  );
}
