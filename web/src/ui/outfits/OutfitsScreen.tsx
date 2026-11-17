import { useEffect, useMemo, useState } from "react";
import { Check, Heart, Pencil, Sparkles } from "lucide-react";
import { useApp } from "../../app/store";
import { DEFAULT_LOOK, packedCount, type Garment } from "../../domain/outfit";
import { aiCoord, listOutfits, me, outfitPeople, saveOutfit, subscribeOutfits, type OutfitPerson, type OutfitRec } from "../../infra/pocketbase";
import { describe, weatherFor } from "../../infra/weather";
import { useForecast } from "../useForecast";
import { tripToday, useNow } from "../useNow";
import { attempt, toast } from "../toast";
import { Avatar } from "./Avatar";
import { AvatarSetup } from "./AvatarSetup";
import { OutfitSheet } from "./OutfitSheet";

/** 코디: each day the two of us side by side, a heart for "goes well", and what's packed. */
export function OutfitsScreen() {
  const { snapshot } = useApp();
  const self = me();
  const tripId = snapshot?.trip.id ?? "";
  const days = useMemo(() => [...(snapshot?.days ?? [])].sort((a, b) => a.n - b.n), [snapshot?.days]);
  const now = useNow();
  const [dayIdx, setDayIdx] = useState(() => { const t = tripToday(days, new Date()).day; return t ? Math.max(0, days.indexOf(t)) : 0; });
  const [people, setPeople] = useState<OutfitPerson[] | null>(null);
  const [outfits, setOutfits] = useState<OutfitRec[]>([]);
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState(false);
  const [coord, setCoord] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const day = days[Math.min(dayIdx, days.length - 1)];
  const { spots, forecast } = useForecast(day?.city ?? "");
  const aiAllowed = !!self?.perms.includes("ai");

  const load = () => {
    void outfitPeople(tripId).then(setPeople).catch(() => setPeople([]));
    void listOutfits(tripId).then(setOutfits).catch(() => { /* offline */ });
  };
  useEffect(() => {
    if (!tripId) return;
    load();
    let unsub: (() => void) | null = null;
    void subscribeOutfits(tripId, () => void listOutfits(tripId).then(setOutfits)).then((u) => { unsub = u; }).catch(() => { /* offline */ });
    return () => { unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (!snapshot || !day || !self) return null;
  if (!people) return <div className="screen ground"><div className="empty">코디를 불러오는 중이에요</div></div>;
  const mePerson = people.find((p) => p.user === self.id) ?? { user: self.id, name: self.name, avatar: null };
  const partner = people.find((p) => p.user !== self.id) ?? null;

  if (!mePerson.avatar || setup) {
    return (
      <div className="screen ground">
        <AvatarSetup me={mePerson} partner={partner} initial={setup ? mePerson.avatar : null} aiAllowed={aiAllowed} onDone={() => { setSetup(false); load(); }} />
      </div>
    );
  }

  const outfitOf = (user: string) => outfits.find((o) => o.day === day.id && o.user === user) ?? null;
  const mine = outfitOf(self.id);
  const theirs = partner ? outfitOf(partner.user) : null;
  const liked = (o: OutfitRec | null, user: string) => !!o?.likedBy.includes(user);
  const partnerLikes = partner && (liked(mine, partner.user) || liked(theirs, partner.user));
  const iLike = liked(mine, self.id) || liked(theirs, self.id);
  const allMine = outfits.filter((o) => o.user === self.id).flatMap((o) => o.items);
  const { packed, total } = packedCount(allMine);
  const w = spots[0] ? weatherFor(forecast, spots[0].id, day.date) : null;
  const weatherText = w ? `${spots[0].name} ${w.tMax}°/${w.tMin}°, ${describe(w.code).label}, 비 올 확률 ${w.rainProb}%` : "";

  async function toggleLike() {
    const next = iLike ? (mine?.likedBy ?? []).filter((u) => u !== self!.id) : [...(mine?.likedBy ?? []), self!.id];
    await attempt(async () => { const r = await saveOutfit(tripId, day.id, mine, { likedBy: next }); setOutfits((list) => [...list.filter((o) => o.id !== r.id), r]); });
  }
  async function togglePacked(i: number) {
    if (!mine) return;
    const items = mine.items.map((g, k) => (k === i ? { ...g, packed: !g.packed } : g));
    setOutfits((list) => list.map((o) => (o.id === mine.id ? { ...o, items } : o)));
    await attempt(() => saveOutfit(tripId, day.id, mine, { items }));
  }
  async function askCoord() {
    setAsking(true);
    try {
      const { text } = await aiCoord(day.id, weatherText);
      setCoord((c) => ({ ...c, [day.id]: text }));
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "코디 한마디를 받지 못했어요.");
    } finally {
      setAsking(false);
    }
  }

  const List = ({ o, own }: { o: OutfitRec | null; own: boolean }) => (
    <ul className="of-list">
      {!o?.items.length && <li className="of-empty">{own ? "아직 안 정했어요" : "아직 안 정했대요"}</li>}
      {o?.items.map((g: Garment, i) => (
        <li key={i} className={g.packed ? "got" : ""}>
          <button className="of-check" role="checkbox" aria-checked={g.packed} aria-label={`${g.text} 챙김`} disabled={!own} onClick={() => togglePacked(i)}>{g.packed && <Check className="icon" />}</button>
          {g.slot && <span className="of-dot" style={{ background: g.color }} />}
          <span>{g.text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className="days-bar">
        <div className="days" role="toolbar" aria-label="날짜">
          {days.map((d, i) => <button key={d.id} className="pill" aria-pressed={i === dayIdx} onClick={() => setDayIdx(i)} aria-label={`코디 ${d.n}일차`}>{tripToday(days, now).day?.id === d.id && <span className="today-dot" />}Day {d.n}</button>)}
        </div>
        <button className="pill days-edit" onClick={() => setSetup(true)}>아바타</button>
      </div>
      <div className="screen ground of-screen">
        {weatherText && <div className="of-wx">{weatherText}</div>}
        <div className={`of-duo ${partner ? "" : "solo"}`}>
          <button className="of-who" onClick={() => setEditing(true)} aria-label="내 코디 정하기">
            <Avatar look={mePerson.avatar} items={mine?.items ?? []} label={`${mePerson.name} 아바타`} />
            <b>{mePerson.name}<Pencil className="icon" /></b>
          </button>
          {partner && (
            <div className="of-who">
              <Avatar look={partner.avatar ?? DEFAULT_LOOK.f} items={theirs?.items ?? []} label={`${partner.name} 아바타`} />
              <b>{partner.name}</b>
            </div>
          )}
          {partner && (
            <div className="of-heart">
              <button aria-pressed={iLike} aria-label="잘 어울려요" onClick={toggleLike}><Heart className="icon" fill={iLike ? "currentColor" : "none"} /></button>
              {(partnerLikes || iLike) && <span>{partnerLikes && iLike ? "둘 다 잘 어울린대요" : partnerLikes ? `${partner.name}이 잘 어울린대요` : "나는 좋아요"}</span>}
            </div>
          )}
        </div>
        {aiAllowed && (mine?.items.length || theirs?.items.length) ? (
          <div className="of-coord">
            {coord[day.id] ? <p>{coord[day.id]}</p> : <button className="btn ghost sm" disabled={asking} onClick={askCoord}><Sparkles className="icon" />{asking ? "보는 중" : "코디 한마디 듣기"}</button>}
          </div>
        ) : null}
        <div className={`of-lists ${partner ? "" : "solo"}`}>
          <List o={mine} own />
          {partner && <List o={theirs} own={false} />}
        </div>
        {total > 0 && <div className="of-packed"><span>챙긴 옷 <b className="num">{packed} / {total}</b></span><span className="bar"><i style={{ width: `${Math.round((packed / total) * 100)}%` }} /></span><span>전체 날</span></div>}
      </div>
      {editing && (
        <OutfitSheet title={`${day.n}일차 내 코디`} look={mePerson.avatar} items={mine?.items ?? []} aiAllowed={aiAllowed} partnerName={partner?.name ?? null}
          onClose={() => setEditing(false)}
          onSave={(items) => attempt(async () => { const r = await saveOutfit(tripId, day.id, mine, { items }); setOutfits((list) => [...list.filter((o) => o.id !== r.id), r]); }, "저장했어요")} />
      )}
    </>
  );
}
