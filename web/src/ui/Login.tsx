import { useState, type FormEvent } from "react";
import { Check, ChevronLeft, Eye, EyeOff, X } from "lucide-react";
import { login, signup } from "../infra/pocketbase";

const ID_RULE = /^[a-z0-9_]{4,20}$/;

/** Sign in, or create an account. Messages never say which of id/password was wrong. */
export function Login({ onEnter, invited = false }: { onEnter: () => void; invited?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">(invited ? "signup" : "login");
  return mode === "login"
    ? <LoginForm onEnter={onEnter} onSignup={() => setMode("signup")} invited={invited} />
    : <SignupForm onEnter={onEnter} onBack={() => setMode("login")} invited={invited} />;
}

const errText = (e: unknown, fallback: string) => {
  const err = e as { status?: number; response?: { message?: string } };
  if (err.status === 429) return "잠시 뒤에 다시 해 주세요. 너무 여러 번 시도했어요.";
  if (!err.status) return "연결이 안 돼요. 인터넷을 확인해 주세요.";
  return err.response?.message || fallback;
};

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} className="input" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}>{show ? <EyeOff className="icon" /> : <Eye className="icon" />}</button>
    </div>
  );
}

function LoginForm({ onEnter, onSignup, invited }: { onEnter: () => void; onSignup: () => void; invited: boolean }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await login(id, pw);
      onEnter();
    } catch (err) {
      setMsg(errText(err, "아이디 또는 비밀번호가 올바르지 않습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
      <img className="auth-mark" src="/icon.svg" alt="" />
      <h1 className="auth-title">답답해서<br />직접 만든 여행 일정</h1>
      {invited && <p className="auth-note">초대를 받으려면 로그인해 주세요. 계정이 없으면 아래에서 가입할 수 있어요.</p>}
      <label className="field" htmlFor="login-id"><span>아이디</span></label>
      <input id="login-id" className="input" value={id} onChange={(e) => setId(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
      <label className="field" htmlFor="login-pw" style={{ marginTop: 14 }}><span>비밀번호</span></label>
      <PasswordInput id="login-pw" value={pw} onChange={setPw} autoComplete="current-password" />
      {msg && <p className="auth-err" role="alert">{msg}</p>}
      <div className="auth-fill" />
      <button className="btn primary" disabled={busy || !id || !pw}>{busy ? "확인하는 중" : "로그인"}</button>
      <p className="auth-switch">처음이에요? <button type="button" onClick={onSignup}>가입하기</button></p>
    </form>
  );
}

function SignupForm({ onEnter, onBack, invited }: { onEnter: () => void; onBack: () => void; invited: boolean }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const idOk = ID_RULE.test(id);
  const longEnough = pw.length >= 8;
  const notDigits = pw.length > 0 && !/^\d+$/.test(pw);
  const ok = idOk && name.trim().length > 0 && longEnough && notDigits;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      await signup(id, name.trim(), pw);
      onEnter();
    } catch (err) {
      setMsg(errText(err, "가입하지 못했어요. 다시 해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  const Rule = ({ pass, text }: { pass: boolean; text: string }) => (
    <li className={pw ? (pass ? "ok" : "bad") : ""}>{pw && !pass ? <X className="icon" /> : <Check className="icon" />}{text}</li>
  );

  return (
    <form className="auth" onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack} aria-label="로그인으로"><ChevronLeft className="icon" />가입하기</button>
      {invited && <p className="auth-note">가입하면 초대받은 여행에 참여를 요청할 수 있어요.</p>}
      <label className="field" htmlFor="su-id"><span>아이디</span></label>
      <input id="su-id" className="input" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
      <small className={`auth-cap ${id && !idOk ? "bad" : ""}`}>영문 소문자, 숫자, 밑줄로 4~20자</small>
      <label className="field" htmlFor="su-name" style={{ marginTop: 14 }}><span>이름</span></label>
      <input id="su-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" />
      <small className="auth-cap">일행에게 이 이름으로 보여요</small>
      <label className="field" htmlFor="su-pw" style={{ marginTop: 14 }}><span>비밀번호</span></label>
      <PasswordInput id="su-pw" value={pw} onChange={setPw} autoComplete="new-password" />
      <ul className="pw-rules">
        <Rule pass={longEnough} text="8자 이상" />
        <Rule pass={notDigits} text="숫자만으로는 안 돼요. 영문이나 기호를 섞어 주세요" />
      </ul>
      {msg && <p className="auth-err" role="alert">{msg}</p>}
      <div className="auth-fill" />
      <button className="btn primary" disabled={busy || !ok}>{busy ? "가입하는 중" : "가입하기"}</button>
      <p className="auth-switch">이미 계정이 있어요? <button type="button" onClick={onBack}>로그인</button></p>
    </form>
  );
}
