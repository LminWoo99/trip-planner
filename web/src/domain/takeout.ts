/** Google Takeout "Saved" CSV: Title,Note,URL,... (quoted fields, commas inside quotes). */
export function parseTakeoutCsv(csv: string): { name: string; note: string }[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  const col = (names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const ti = Math.max(0, col(["title", "제목", "이름"]));
  const ni = col(["note", "메모"]);
  return body.map((r) => ({ name: (r[ti] ?? "").trim(), note: ni >= 0 ? (r[ni] ?? "").trim() : "" })).filter((r) => r.name);
}
