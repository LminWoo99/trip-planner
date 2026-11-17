import { writeFile, mkdir } from "node:fs/promises";

// Sign both people in once and store their sessions for the tests.
export default async function globalSetup() {
  const base = process.env.QA_URL ?? "http://127.0.0.1:8090";
  await mkdir("qa/.auth", { recursive: true });
  // test-only logins created by ACCOUNT_SETUP in qa/run.sh
  for (const [username, password, file] of [["qa_minu", "qa-pass-11", "minu"], ["qa_ryeojin", "qa-pass-22", "ryeojin"]] as const) {
    const res = await fetch(`${base}/api/collections/users/auth-with-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: username, password }),
    });
    if (!res.ok) throw new Error(`login failed for ${username}: ${res.status}`);
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
    // PocketBase allows 2 auth calls per 3 seconds per client
    await new Promise((r) => setTimeout(r, 3100));
  }
}
