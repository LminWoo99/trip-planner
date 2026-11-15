import { pb } from "./pocketbase";

// Protected item photos: URLs need a short-lived file token, refreshed before it expires.
let token: { value: string; at: number } | null = null;
const TOKEN_TTL_MS = 90_000;

export async function fileToken(): Promise<string> {
  if (token && Date.now() - token.at < TOKEN_TTL_MS) return token.value;
  token = { value: await pb.files.getToken(), at: Date.now() };
  return token.value;
}

export function photoUrl(itemId: string, file: string, tok: string, thumb?: "240x240" | "1200x0"): string {
  const q = new URLSearchParams({ token: tok });
  if (thumb) q.set("thumb", thumb);
  return `/api/files/items/${itemId}/${encodeURIComponent(file)}?${q}`;
}

/** Shrinks a photo on the phone before upload (long side 1600px, JPEG) so it goes up fast on mobile data. */
export async function shrink(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC the browser can't decode: upload as is and let the server decide
  }
}
