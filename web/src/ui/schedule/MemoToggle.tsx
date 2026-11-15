import { useState } from "react";
import { AlignLeft, ChevronDown, ChevronUp } from "lucide-react";
import { Linkified } from "./DayHead";

/** Compact lists show only that a memo exists; tapping opens it in place so the order stays in view. */
export function MemoToggle({ memo }: { memo: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="memo-toggle">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <AlignLeft className="icon" />{open ? "메모 접기" : "메모 보기"}{open ? <ChevronUp className="icon" /> : <ChevronDown className="icon" />}
      </button>
      {open && <p className="keep"><Linkified text={memo} /></p>}
    </div>
  );
}
