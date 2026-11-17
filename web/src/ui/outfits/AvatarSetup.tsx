import { useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { DEFAULT_LOOK, parseGarment, type Look } from "../../domain/outfit";
import { aiAvatar, saveLook, type AiPerson, type OutfitPerson } from "../../infra/pocketbase";
import { shrink } from "../../infra/photos";
import { Avatar } from "./Avatar";
import { toast } from "../toast";

const PLAIN = ["흰 티셔츠", "청바지", "흰 운동화"].map((l) => parseGarment(l)!);
const HAIRS: [Look["hair"], string][] = [["short", "짧은 머리"], ["bob", "단발"], ["long", "긴 머리"], ["tied", "묶은 머리"]];
const HAIR_COLORS = ["#1f1b1a", "#3b2a22", "#6b4630", "#a87b4f"];
const SKINS = ["#f6dcc8", "#f3d3bd", "#e3b796", "#c99673"];
const BUILDS: [Look["build"], string][] = [["slim", "마른"], ["avg", "보통"], ["broad", "다부진"]];

const toLook = (p: AiPerson): Look => ({ body: p.body, build: p.build, hair: p.hair, hairColor: p.hairColor, skin: p.skin });
const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

/** First-time avatar: from a photo (AI reads looks only, nothing stored) or from a gender pick; then fine-tune. */
export function AvatarSetup({ me, partner, initial, aiAllowed, onDone }: {
  me: OutfitPerson; partner: OutfitPerson | null; initial: Look | null; aiAllowed: boolean; onDone: () => void;
}) {
  const [step, setStep] = useState<"choose" | "reading" | "found" | "gender" | "refine">(initial ? "refine" : "choose");
  const [look, setLook] = useState<Look>(initial ?? DEFAULT_LOOK.m);
  const [found, setFound] = useState<AiPerson[]>([]);
  const [assign, setAssign] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function pickPhoto(file: File) {
    setStep("reading");
    try {
      const small = await shrink(file, 1024, 0.85);
      const { people } = await aiAvatar(await readAsDataUrl(small));
      if (!people.length) { toast("사진에서 사람을 찾지 못했어요. 다른 사진으로 해 주세요."); setStep("choose"); return; }
      setFound(people);
      setAssign(people.map((_, i) => (i === 0 ? me.user : i === 1 && partner ? partner.user : "")));
      setStep("found");
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "사진을 읽지 못했어요. 다시 해 주세요.");
      setStep("choose");
    }
  }

  async function saveFound() {
    setBusy(true);
    try {
      let mine: Look | null = null;
      for (let i = 0; i < found.length; i++) {
        if (!assign[i]) continue;
        const l = toLook(found[i]);
        if (assign[i] === me.user) mine = l;
        await saveLook(l, assign[i] === me.user ? undefined : assign[i]);
      }
      if (mine) { setLook(mine); setStep("refine"); } else onDone();
    } catch {
      toast("저장하지 못했어요. 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRefined() {
    setBusy(true);
    try { await saveLook(look); toast("아바타를 저장했어요"); onDone(); } catch { toast("저장하지 못했어요. 다시 해 주세요."); } finally { setBusy(false); }
  }

  if (step === "choose") {
    return (
      <div className="avs-wrap">
        <p className="avs-lead">코디를 입혀 볼<br />내 아바타부터 만들어요</p>
        {aiAllowed && (
          <label className="avs-choice">
            <span className="avs-ci"><Camera className="icon" /></span>
            <span><b>사진으로 만들기</b><span>사진에서 성별, 체격, 머리 모양을 읽어 비슷하게 만들어요.{partner ? ` ${partner.name}이랑 같이 나온 사진이면 ${partner.name} 아바타도 함께 만들어요.` : ""}</span></span>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ""; }} />
          </label>
        )}
        <button className="avs-choice" onClick={() => setStep("gender")}>
          <span className="avs-ci"><UserRound className="icon" /></span>
          <span><b>성별만 고르기</b><span>사진 없이 남자, 여자 기본 아바타로 시작해요. 머리와 피부는 나중에 고를 수 있어요.</span></span>
        </button>
        {aiAllowed && <p className="avs-privacy">사진은 아바타 특징을 읽는 데만 쓰고 저장하지 않아요. 읽는 동안 OpenAI로 전송돼요.</p>}
      </div>
    );
  }
  if (step === "reading") return <div className="avs-wrap"><p className="avs-lead">사진을 읽는 중이에요</p><p className="avs-privacy">10초쯤 걸려요.</p></div>;
  if (step === "found") {
    const options = [{ id: me.user, name: `나 (${me.name})` }, ...(partner ? [{ id: partner.user, name: partner.name }] : []), { id: "", name: "아니에요" }];
    return (
      <div className="avs-wrap">
        <p className="avs-sub">{found.length}명을 찾았어요. 누가 누구인지 골라 주세요.</p>
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
        <button className="btn primary avs-cta" disabled={busy || !assign.some(Boolean)} onClick={saveFound}>{busy ? "저장하는 중" : "이렇게 만들기"}</button>
      </div>
    );
  }
  if (step === "gender") {
    return (
      <div className="avs-wrap">
        <p className="avs-lead">어떤 아바타로<br />시작할까요?</p>
        <div className="avs-gender">
          {(["m", "f"] as const).map((g) => (
            <button key={g} aria-pressed={look.body === g} onClick={() => setLook(DEFAULT_LOOK[g])}>
              <Avatar look={DEFAULT_LOOK[g]} items={PLAIN} label={g === "m" ? "남자 아바타" : "여자 아바타"} />{g === "m" ? "남자" : "여자"}
            </button>
          ))}
        </div>
        <button className="btn primary avs-cta" onClick={() => setStep("refine")}>이걸로 시작하기</button>
      </div>
    );
  }
  return (
    <div className="avs-wrap">
      <div className="avs-stage"><Avatar look={look} items={PLAIN} label="내 아바타" /></div>
      <Chooser label="머리 모양">{HAIRS.map(([k, n]) => <button key={k} className="chip" aria-pressed={look.hair === k} onClick={() => setLook({ ...look, hair: k })}>{n}</button>)}</Chooser>
      <Chooser label="머리 색">{HAIR_COLORS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={`머리 색 ${c}`} aria-pressed={look.hairColor === c} onClick={() => setLook({ ...look, hairColor: c })} />)}</Chooser>
      <Chooser label="피부 톤">{SKINS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={`피부 톤 ${c}`} aria-pressed={look.skin === c} onClick={() => setLook({ ...look, skin: c })} />)}</Chooser>
      <Chooser label="체격">{BUILDS.map(([k, n]) => <button key={k} className="chip" aria-pressed={look.build === k} onClick={() => setLook({ ...look, build: k })}>{n}</button>)}</Chooser>
      <button className="btn primary avs-cta" disabled={busy} onClick={saveRefined}>{busy ? "저장하는 중" : "이 아바타로 할게요"}</button>
    </div>
  );
}

function Chooser({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="avs-grp"><span>{label}</span><div className="chips">{children}</div></div>;
}
