import { memo } from "react";
import { wornBySlot, type Garment, type Look } from "../../domain/outfit";
import { avatarSvg } from "./avatarSvg";

/** The paper-doll avatar wearing the given clothes. */
export const Avatar = memo(function Avatar({ look, items, label, className = "" }: { look: Look; items: readonly Garment[]; label: string; className?: string }) {
  // the markup is built only from checked hex colors and fixed shapes (see avatarSvg)
  return <span className={`avatar ${className}`} dangerouslySetInnerHTML={{ __html: avatarSvg(look, wornBySlot(items), label) }} />;
});
