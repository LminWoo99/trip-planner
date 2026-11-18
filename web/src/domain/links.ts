/** Adds https:// when a pasted address has no scheme ("www.example.com/..."). */
export const withScheme = (raw: string): string => {
  const s = raw.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/** The site name of a pasted link without "www." ("mountain-forecast.com"), or "" when it is not a web address. */
export function linkHost(raw: string): string {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return "";
  try {
    const u = new URL(withScheme(s));
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return "";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
