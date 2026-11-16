import { writeFile, mkdir } from "node:fs/promises";

// Sign both people in once (the gate is rate limited) and store their sessions for the tests.
export default async function globalSetup() {
  const base = process.env.QA_URL ?? "http://127.0.0.1:8090";
  const code = process.env.TRIP_GATE_CODE ?? "1234";
  await mkdir("qa/.auth", { recursive: true });
  for (const [who, file] of [["민우", "minu"], ["려진", "ryeojin"]] as const) {
    const res = await fetch(`${base}/api/gate/enter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, who }),
    });
    if (!res.ok) throw new Error(`gate failed for ${who}: ${res.status}`);
    const { token, record } = await res.json();
    // open straight into the seeded trip (the app remembers the last trip)
    const trips = await (await fetch(`${base}/api/collections/trips/records`, { headers: { Authorization: token } })).json();
    const state = {
      cookies: [],
      origins: [{ origin: base, localStorage: [
        { name: "pocketbase_auth", value: JSON.stringify({ token, record }) },
        { name: "trip-current", value: JSON.stringify(trips.items[0].id) },
      ] }],
    };
    await writeFile(`qa/.auth/${file}.json`, JSON.stringify(state));
  }
}
