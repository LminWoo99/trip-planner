import { useState, type FormEvent } from "react";
import { Check, RotateCcw, Route } from "lucide-react";
import { checkCode, enterWithCode } from "../infra/pocketbase";

const PEOPLE = [
  { name: "민우", nick: "우" },
  { name: "려진", nick: "리오" },
];

export function Gate({ onEnter }: { onEnter: () => void }) {
  const [step, setStep] = useState<"code" | "who">("code");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [wrong, setWrong] = useState(0);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    const status = (e as { status?: number }).status;
    setMsg(status === 429 ? "너무 많이 틀렸어요. 1분 뒤에 다시 해 봐" : status === 400 ? "땡! 다시 생각해 봐" : "연결이 안 돼요. 네트워크를 확인해 줘");
    setWrong((n) => n + 1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await checkCode(code);
      setStep("who");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function pick(who: string) {
    setBusy(true);
    try {
      await enterWithCode(code, who);
      onEnter();
    } catch (err) {
      setStep("code");
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  if (step === "who") {
    return (
      <div className="gate">
        <div className="gate-top">
          <div className="gate-mark"><Check className="icon" /></div>
          <div className="gate-name">맞았어요</div>
          <h1 className="gate-q">누구세요?</h1>
          <p className="gate-hint">이 폰을 누가 쓰는지 한 번만 골라 주세요. "려진이 플랜 A 골랐어요", "민우가 계산함"처럼 표시할 때 써요.</p>
        </div>
        <div className="gate-bottom">
          <div className="who">
            {PEOPLE.map((p) => (
              <button key={p.name} type="button" disabled={busy} onClick={() => pick(p.name)}>{p.name}<span>{p.nick}</span></button>
            ))}
          </div>
          <button type="button" className="btn-text" style={{ alignSelf: "center" }} onClick={() => { setStep("code"); setCode(""); }}>
            <RotateCcw className="icon" />처음으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gate">
      <div className="gate-top">
        <div className="gate-mark"><Route className="icon" /></div>
        <div className="gate-name">답답해서 직접 만든다</div>
        <h1 className="gate-q">리오랑 우가<br />사귄 날짜는?</h1>
        <p className="gate-hint">숫자 4자리 (월일)</p>
      </div>
      <form className="gate-bottom" onSubmit={submit}>
        <input
          key={wrong}
          id="gate-code"
          className={`code-input ${wrong ? "wrong" : ""}`}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          placeholder="MMDD"
          aria-label="사귄 날짜 4자리"
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setMsg(""); }}
        />
        <p className="gate-msg" role="alert">{msg}</p>
        <button className="btn primary" disabled={code.length !== 4 || busy}>들어가기</button>
      </form>
    </div>
  );
}
