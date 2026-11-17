import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Heart, Paintbrush, Pencil } from "lucide-react";
import { useApp } from "../../app/store";
import { DEFAULT_LOOK, packedCount, renderKey, type Garment } from "../../domain/wardrobe";
import { aiBase, aiRender, listOutfits, me, outfitPeople, saveOutfit, subscribeOutfits, type OutfitPerson, type OutfitRec } from "../../infra/pocketbase";
import { fileUrl } from "../../infra/photos";
import { useFileToken } from "../Photos";
import { describe, weatherFor } from "../../infra/weather";
import { useForecast } from "../useForecast";
import { tripToday, useNow } from "../useNow";
import { attempt, toast } from "../toast";
import { Avatars } from "./Avatar";
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
  const [drawing, setDrawing] = useState(false);
  // plain-clothes drawings being made, by user id
  const [basing, setBasing] = useState<string[]>([]);
  const tok = useFileToken(outfits.some((o) => o.render) || !!people?.some((p) => p.base) || basing.length > 0);
  const asked = useRef(new Set<string>());
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

  // someone has a face but no plain-clothes drawing yet (new face, or made before this existed): draw it once
  useEffect(() => {
    if (!people || !aiAllowed || !tripId) return;
    for (const p of people) {
      if (!p.face || p.base || asked.current.has(p.user + p.face)) continue;
      asked.current.add(p.user + p.face);
      setBasing((b) => [...b, p.user]);
      void aiBase(tripId, p.user)
        .then(({ base }) => setPeople((list) => list && list.map((x) => (x.user === p.user ? { ...x, base } : x))))
        .catch(() => { /* the next visit tries again */ })
        .finally(() => setBasing((b) => b.filter((u) => u !== p.user)));
    }
  }, [people, aiAllowed, tripId]);

  if (!snapshot || !day || !self) return null;
  if (!people) return <div className="screen ground"><div className="empty">코디를 불러오는 중이에요</div></div>;
  const mePerson = people.find((p) => p.user === self.id) ?? { user: self.id, member: "", name: self.name, avatar: null, face: "", base: "" };
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
  // people whose drawing is missing or was made with other clothes, and who have a face to draw from
  const pair = [{ p: mePerson, o: mine }, ...(partner ? [{ p: partner, o: theirs }] : [])];
  const fresh = (o: OutfitRec | null) => !!o?.render && o.renderFor === renderKey(o.items);
  const toDraw = pair.filter(({ p, o }) => p.face && o?.items.length && !fresh(o));
  async function draw() {
    setDrawing(true);
    try {
      for (const { o } of toDraw) {
        const r = await aiRender(o!.id);
        setOutfits((list) => list.map((x) => (x.id === o!.id ? { ...x, ...r } : x)));
      }
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "그림을 받지 못했어요. 잠시 뒤 다시 열어 보세요.");
      // the server may still finish the drawing; pick it up
      void listOutfits(tripId).then(setOutfits).catch(() => { /* offline */ });
    } finally {
      setDrawing(false);
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
          {/* both on one ground line so the height difference shows */}
          {pair.some(({ p, o }) => o?.render || p.base || basing.includes(p.user)) && tok !== null ? (
            // AI drawings, standing on one ground line and sized by height
            <div className="of-scene of-drawn" role="img" aria-label={partner ? `${mePerson.name}와 ${partner.name} 코디 그림` : `${mePerson.name} 코디 그림`}>
              {pair.map(({ p, o }) => {
                const h = (p.avatar ?? DEFAULT_LOOK.f).height / Math.max(...pair.map((x) => (x.p.avatar ?? DEFAULT_LOOK.f).height));
                return (
                  <div key={p.user} className="of-fig" style={{ height: `${Math.round(h * 100)}%` }}>
                    {o?.render
                      ? <img src={fileUrl("outfits", o.id, o.render, tok)} alt="" />
                      : p.base
                        ? <img src={fileUrl("trip_members", p.member, p.base, tok)} alt="" />
                        : basing.includes(p.user)
                          ? <span className="of-basing">아바타 만드는 중</span>
                          : <Avatars people={[{ look: p.avatar ?? DEFAULT_LOOK.f, items: o?.items ?? [] }]} label="" />}
                    {o?.render && !fresh(o) && <span className="of-stale">이전 옷</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <Avatars className="of-scene" label={partner ? `${mePerson.name}와 ${partner.name}` : `${mePerson.name} 아바타`}
              people={[{ look: mePerson.avatar, items: mine?.items ?? [] }, ...(partner ? [{ look: partner.avatar ?? DEFAULT_LOOK.f, items: theirs?.items ?? [] }] : [])]} />
          )}
          <div className="of-names">
            <button className="of-who" onClick={() => setEditing(true)} aria-label="내 코디 정하기"><b>{mePerson.name}<Pencil className="icon" /></b><small className="num">{mePerson.avatar.height}</small></button>
            {partner && <div className="of-who"><b>{partner.name}</b>{partner.avatar && <small className="num">{partner.avatar.height}</small>}</div>}
          </div>
          {partner && (
            <div className="of-heart">
              <button aria-pressed={iLike} aria-label="잘 어울려요" onClick={toggleLike}><Heart className="icon" fill={iLike ? "currentColor" : "none"} /></button>
              {(partnerLikes || iLike) && <span>{partnerLikes && iLike ? "둘 다 잘 어울린대요" : partnerLikes ? `${partner.name}이 잘 어울린대요` : "나는 좋아요"}</span>}
            </div>
          )}
        </div>
        {aiAllowed && (drawing || toDraw.length > 0) && (
          <div className="of-draw">
            <button className="btn ghost sm" disabled={drawing} onClick={draw}><Paintbrush className="icon" />{drawing ? "그리는 중이에요" : pair.some(({ o }) => o?.render) ? "바뀐 옷으로 다시 그리기" : "코디 그림으로 보기"}</button>
            <small>{drawing ? `한 명에 30초쯤 걸려요` : `${toDraw.map(({ p }) => (p.user === self.id ? "나" : p.name)).join(", ")} 그림을 만들어요`}</small>
          </div>
        )}
        {aiAllowed && !mePerson.face && mine?.items.length ? <button className="of-faceask" onClick={() => setSetup(true)}>얼굴을 만들면 코디를 그림으로 볼 수 있어요</button> : null}
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
