// OpenAI calls for the AI features. The key stays on the server (OPENAI_API_KEY in .env).

const DAILY_LIMIT = 30;

function requirePerm(e, perm) {
  const perms = e.auth ? e.auth.get("perms") || [] : [];
  if (!perms.includes(perm)) throw new ForbiddenError("이 기능은 관리자가 켜 준 사람만 쓸 수 있어요.");
}

/** Counts today's calls (UTC day) and records this one; 30 per person per day. */
function useQuota(app, userId, kind) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const used = app.countRecords("ai_usage", $dbx.exp("user = {:u} AND created >= {:s}", { u: userId, s: start.toISOString().replace("T", " ") }));
  if (used >= DAILY_LIMIT) throw new TooManyRequestsError("오늘 AI를 30번 다 썼어요. 내일 다시 써 주세요.");
  const r = new Record(app.findCollectionByNameOrId("ai_usage"));
  r.set("user", userId);
  r.set("kind", kind);
  app.save(r);
}

/** Responses API with a JSON schema; returns the parsed object. opts.webSearch lets the model look things up first. */
function askJson(instructions, content, name, schema, opts) {
  const webSearch = !!(opts && opts.webSearch);
  const key = $os.getenv("OPENAI_API_KEY");
  if (!key) throw new BadRequestError("AI 설정이 아직 안 돼 있어요.");
  const res = $http.send({
    url: ($os.getenv("OPENAI_BASE_URL") || "https://api.openai.com/v1") + "/responses",
    method: "POST",
    timeout: webSearch ? 95 : 90,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: $os.getenv("OPENAI_MODEL") || "gpt-6-luna",
      instructions,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
      ...(webSearch ? { tools: [{ type: "web_search" }] } : {}),
    }),
  });
  if (res.statusCode !== 200) {
    console.log("openai error", res.statusCode, toString(res.body).slice(0, 300));
    throw new BadRequestError("AI가 지금 답하지 않아요. 잠시 뒤 다시 해 주세요.");
  }
  for (const o of res.json.output || []) {
    for (const c of o.content || []) {
      if (c.type === "output_text") return JSON.parse(c.text);
    }
  }
  throw new BadRequestError("AI 답을 읽지 못했어요. 다시 해 주세요.");
}

/** You, or a trip partner who also uses outfits (e.g. a photo with both of you). Returns their user record. */
function personYouCanEdit(e, target) {
  requirePerm(e, "outfits");
  const u = e.app.findRecordById("users", target);
  if (target === e.auth.id) return u;
  if (!(u.get("perms") || []).includes("outfits")) throw new ForbiddenError("그 사람은 코디를 쓰지 않아요.");
  const trips = (user) => e.app.findRecordsByFilter("trip_members", "user = {:u}", "", 0, 0, { u: user }).map((m) => m.getString("trip"));
  const theirs = trips(target);
  if (!trips(e.auth.id).some((t) => theirs.includes(t))) throw new ForbiddenError("같은 여행의 일행만 만들어 줄 수 있어요.");
  return u;
}

module.exports = { requirePerm, useQuota, askJson, personYouCanEdit };
