import { useState } from "react";
import { Camera, RefreshCw, UserRound } from "lucide-react";
import { DEFAULT_LOOK, HAIR_PRESETS, parseGarment, type Look } from "../../domain/wardrobe";
import { aiAvatar, aiFace, saveFace, saveLook, type AiPerson, type OutfitPerson } from "../../infra/pocketbase";
import { fileUrl, shrink } from "../../infra/photos";
import { useFileToken } from "../Photos";
import { Avatar } from "./Avatar";
import { toast } from "../toast";

const PLAIN = ["흰 반팔티", "청바지", "흰 운동화"].map((l) => parseGarment(l)!);
const HAIR_COLORS = ["#1f1b1a", "#3b2a22", "#6b4630", "#a87b4f"];
const SKINS = ["#f6dcc8", "#f3d3bd", "#e3b796", "#c99673"];
const BUILDS: [Look["build"], string][] = [["slim", "마른"], ["avg", "보통"], ["broad", "다부진"]];
const GLASSES: [Look["glasses"], string][] = [["", "없음"], ["round", "동그란 안경"], ["square", "네모난 안경"]];

const toLook = (p: AiPerson): Look => ({
  ...DEFAULT_LOOK[p.body],
  body: p.body, build: p.build,
  hairStyle: HAIR_PRESETS[p.hairStyle] ? p.hairStyle : DEFAULT_LOOK[p.body].hairStyle,
  glasses: p.glasses === "round" || p.glasses === "square" ? p.glasses : "",
  hairColor: p.hairColor, skin: p.skin,
});
const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

interface FaceDraft { image: string; busy: boolean; note: string }
const errorText = (e: unknown, fallback: string) => (e as { response?: { message?: string } }).response?.message || fallback;

/**
 * First-time avatar: from a photo (AI reads looks and makes a 3D face per person; the photo is not stored)
 * or from a gender pick; then fine-tune incl. height.
 */
export function AvatarSetup({ me, partner, initial, aiAllowed, onDone }: {
  me: OutfitPerson; partner: OutfitPerson | null; initial: Look | null; aiAllowed: boolean; onDone: () => void;
}) {
  const [step, setStep] = useState<"choose" | "reading" | "found" | "faces" | "gender" | "refine">(initial ? "refine" : "choose");
  const [photo, setPhoto] = useState("");
  const [faces, setFaces] = useState<Record<number, FaceDraft>>({});
  const [myFace, setMyFace] = useState(me.face);
  const tok = useFileToken(!!myFace);
  const [look, setLook] = useState<Look>(initial ?? DEFAULT_LOOK.m);
  const [heightText, setHeightText] = useState(String(initial?.height ?? DEFAULT_LOOK.m.height));
  const [found, setFound] = useState<AiPerson[]>([]);
  const [assign, setAssign] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const useLook = (l: Look) => { setLook(l); setHeightText(String(l.height)); };

  async function pickPhoto(file: File) {
    setStep("reading");
    try {
      const small = await shrink(file, 1024, 0.85);
      const image = await readAsDataUrl(small);
      setPhoto(image);
      const { people } = await aiAvatar(image, Object.keys(HAIR_PRESETS));
      if (!people.length) { toast("사진에서 사람을 찾지 못했어요. 다른 사진으로 해 주세요."); setStep("choose"); return; }
      setFound(people);
      setAssign(people.map((_, i) => (i === 0 ? me.user : i === 1 && partner ? partner.user : "")));
      setStep("found");
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "사진을 읽지 못했어요. 다시 해 주세요.");
      setStep("choose");
    }
  }

  async function makeFace(i: number) {
    setFaces((f) => ({ ...f, [i]: { image: f[i]?.image ?? "", note: f[i]?.note ?? "", busy: true } }));
    try {
      const { image } = await aiFace(photo, found.length, found[i].position || i + 1, found[i].summary, faces[i]?.note ?? "");
      setFaces((f) => ({ ...f, [i]: { ...f[i], image, busy: false } }));
    } catch (e) {
      toast(errorText(e, "얼굴을 만들지 못했어요. 다시 해 주세요."));
      setFaces((f) => ({ ...f, [i]: { ...f[i], busy: false } }));
    }
  }

  function startFaces() {
    setStep("faces");
    found.forEach((_, i) => { if (assign[i]) void makeFace(i); });
  }

  async function saveFound() {
    setBusy(true);
    try {
      let mine: Look | null = null;
      for (let i = 0; i < found.length; i++) {
        if (!assign[i]) continue;
        const l = toLook(found[i]);
        const face = faces[i]?.image;
        if (assign[i] === me.user) {
          mine = l;
          if (face) setMyFace((await saveFace(face)).face);
        } else {
          await saveLook(l, assign[i]);
          if (face) await saveFace(face, assign[i]);
        }
      }
      // height cannot be read from a photo: ask for it next
      if (mine) { useLook(mine); setStep("refine"); } else onDone();
    } catch {
      toast("저장하지 못했어요. 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRefined() {
    const h = Number(heightText);
    if (!(h >= 140 && h <= 200)) { toast("키는 140~200cm 사이로 써 주세요"); return; }
    setBusy(true);
    try { await saveLook({ ...look, height: h }); toast("아바타를 저장했어요"); onDone(); } catch { toast("저장하지 못했어요. 다시 해 주세요."); } finally { setBusy(false); }
  }

  if (step === "choose") {
    return (
      <div className="avs-wrap">
        <p className="avs-lead">코디를 입혀 볼<br />내 아바타부터 만들어요</p>
        {aiAllowed && (
          <label className="avs-choice">
            <span className="avs-ci"><Camera className="icon" /></span>
            <span><b>사진으로 만들기</b><span>사진에서 성별, 체격, 머리 스타일, 안경을 읽어 비슷하게 만들어요.{partner ? ` ${partner.name}이랑 같이 나온 사진이면 ${partner.name} 아바타도 함께 만들어요.` : ""}</span></span>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ""; }} />
          </label>
        )}
        <button className="avs-choice" onClick={() => setStep("gender")}>
          <span className="avs-ci"><UserRound className="icon" /></span>
          <span><b>성별만 고르기</b><span>사진 없이 남자, 여자 기본 아바타로 시작해요. 머리, 안경, 키는 다음 화면에서 골라요.</span></span>
        </button>
        {aiAllowed && <p className="avs-privacy">사진은 얼굴 그림을 만드는 데만 쓰고 저장하지 않아요. 만드는 동안 OpenAI로 전송돼요.</p>}
      </div>
    );
  }
  if (step === "reading") return <div className="avs-wrap"><p className="avs-lead">사진을 읽는 중이에요</p><p className="avs-privacy">10초쯤 걸려요.</p></div>;
  if (step === "found") {
    const options = [{ id: me.user, name: `나 (${me.name})` }, ...(partner ? [{ id: partner.user, name: partner.name }] : []), { id: "", name: "아니에요" }];
    return (
      <div className="avs-wrap">
        <p className="avs-sub">{found.length}명을 찾았어요. 누가 누구인지 골라 주세요. 키는 다음 화면에서 써요.</p>
        <div className="avs-found">
          {found.map((p, i) => (
            <div key={i} className="avs-card">
              <Avatar look={toLook(p)} items={PLAIN} label={`${i + 1}번 사람`} />
              <small>{i + 1}번: {p.summary}</small>
              <div className="avs-assign">
                {options.map((o) => (
                  <button key={o.id || "none"} className="chip" aria-pressed={assign[i] === o.id} onClick={() => setAssign((a) => a.map((x, k) => (k === i ? o.id : x === o.id && o.id ? "" : x)))}>{o.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn primary avs-cta" disabled={!assign.some(Boolean)} onClick={startFaces}>얼굴 만들기</button>
      </div>
    );
  }
  if (step === "faces") {
    const chosen = found.map((p, i) => ({ p, i })).filter(({ i }) => assign[i]);
    const nameOf = (id: string) => (id === me.user ? "나" : partner?.name ?? "");
    const pending = chosen.some(({ i }) => faces[i]?.busy || !faces[i]?.image);
    return (
      <div className="avs-wrap">
        <p className="avs-sub">사진을 보고 얼굴을 만들고 있어요. 한 명에 20~40초쯤 걸려요. 마음에 안 들면 고칠 점을 적고 다시 만들 수 있어요.</p>
        <div className="avs-faces">
          {chosen.map(({ i }) => {
            const f = faces[i];
            return (
              <div key={i} className="avs-face">
                <div className="avs-face-img">{f?.image ? <img src={f.image} alt={`${nameOf(assign[i])} 얼굴`} /> : null}{f?.busy && <span className="avs-face-busy">만드는 중</span>}</div>
                <b>{nameOf(assign[i])}</b>
                <input className="input" value={f?.note ?? ""} placeholder="예: 안경 빼 줘, 앞머리 내려 줘" aria-label={`${nameOf(assign[i])} 얼굴 고칠 점`} maxLength={200}
                  onChange={(e) => { const note = e.target.value; setFaces((x) => ({ ...x, [i]: { image: x[i]?.image ?? "", busy: x[i]?.busy ?? false, note } })); }} />
                <button className="btn ghost sm" disabled={f?.busy} onClick={() => makeFace(i)}><RefreshCw className="icon" />다시 만들기</button>
              </div>
            );
          })}
        </div>
        <button className="btn primary avs-cta" disabled={busy || pending} onClick={saveFound}>{busy ? "저장하는 중" : "이 얼굴로 할게요"}</button>
      </div>
    );
  }
  if (step === "gender") {
    return (
      <div className="avs-wrap">
        <p className="avs-lead">어떤 아바타로<br />시작할까요?</p>
        <div className="avs-gender">
          {(["m", "f"] as const).map((g) => (
            <button key={g} aria-pressed={look.body === g} onClick={() => useLook(DEFAULT_LOOK[g])}>
              <Avatar look={DEFAULT_LOOK[g]} items={PLAIN} label={g === "m" ? "남자 아바타" : "여자 아바타"} />{g === "m" ? "남자" : "여자"}
            </button>
          ))}
        </div>
        <button className="btn primary avs-cta" onClick={() => setStep("refine")}>이걸로 시작하기</button>
      </div>
    );
  }
  const presets = Object.entries(HAIR_PRESETS).sort(([, a], [, b]) => Number(b.for === look.body) - Number(a.for === look.body));
  return (
    <div className="avs-wrap">
      <div className="avs-stage">
        {myFace && tok
          ? <img className="avs-myface" src={fileUrl("users", me.user, myFace, tok)} alt="내 얼굴" />
          : <Avatar look={{ ...look, height: Number(heightText) || look.height }} items={PLAIN} label="내 아바타" />}
      </div>
      {aiAllowed && <button className="btn ghost sm avs-reface" onClick={() => setStep("choose")}><Camera className="icon" />{myFace ? "사진으로 얼굴 다시 만들기" : "사진으로 얼굴 만들기"}</button>}
      <div className="avs-grp">
        <span>키</span>
        <div className="avs-height"><input id="avatar-height" className="input num" inputMode="numeric" value={heightText} onChange={(e) => setHeightText(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="키 (cm)" /><span>cm</span><small>둘을 나란히 세울 때 키 차이로 보여요</small></div>
      </div>
      {!myFace && <>
      <Chooser label="안경">{GLASSES.map(([k, n]) => <button key={k || "none"} className="chip" aria-pressed={look.glasses === k} onClick={() => setLook({ ...look, glasses: k })}>{n}</button>)}</Chooser>
      <Chooser label="머리 스타일">{presets.map(([k, p]) => <button key={k} className="chip" aria-pressed={look.hairStyle === k} onClick={() => setLook({ ...look, hairStyle: k })}>{p.label}</button>)}</Chooser>
      <Chooser label="머리 색">{HAIR_COLORS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={`머리 색 ${c}`} aria-pressed={look.hairColor === c} onClick={() => setLook({ ...look, hairColor: c })} />)}</Chooser>
      <Chooser label="피부 톤">{SKINS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={`피부 톤 ${c}`} aria-pressed={look.skin === c} onClick={() => setLook({ ...look, skin: c })} />)}</Chooser>
      </>}
      <Chooser label="체격">{BUILDS.map(([k, n]) => <button key={k} className="chip" aria-pressed={look.build === k} onClick={() => setLook({ ...look, build: k })}>{n}</button>)}</Chooser>
      <Chooser label="성별">{(["m", "f"] as const).map((g) => <button key={g} className="chip" aria-pressed={look.body === g} onClick={() => setLook({ ...look, body: g })}>{g === "m" ? "남자" : "여자"}</button>)}</Chooser>
      <button className="btn primary avs-cta" disabled={busy} onClick={saveRefined}>{busy ? "저장하는 중" : "이 아바타로 할게요"}</button>
    </div>
  );
}

function Chooser({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="avs-grp"><span>{label}</span><div className="chips">{children}</div></div>;
}
