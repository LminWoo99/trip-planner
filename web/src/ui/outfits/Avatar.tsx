import { memo } from "react";
import type { Garment, Look } from "../../domain/wardrobe";
import { avatarScene } from "./avatarSvg";

/** One or two people standing together (same ground line, so height differences show). */
export const Avatars = memo(function Avatars({ people, label, className = "" }: { people: readonly { look: Look; items: readonly Garment[] }[]; label: string; className?: string }) {
  // built only from checked hex colors and fixed shapes (see avatarSvg)
  return <span className={`avatar ${className}`} dangerouslySetInnerHTML={{ __html: avatarScene(people, label) }} />;
});

export const Avatar = ({ look, items, label, className }: { look: Look; items: readonly Garment[]; label: string; className?: string }) =>
  <Avatars people={[{ look, items }]} label={label} className={className} />;
