/// <reference path="../pb_data/types.d.ts" />

// AI features (only for people the admin turned on), couple outfits helpers and restore points.

routerAdd("POST", "/api/ai/plan", (e) => {
  const { requirePerm, useQuota, askJson } = require(`${__hooks}/lib/ai.js`);
  requirePerm(e, "ai");
  const body = e.requestInfo().body;
  const tripId = String(body.tripId || "");
  const text = String(body.text || "").trim();
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 할 수 있어요."); }
  if (text.length < 4) throw new BadRequestError("할 일을 조금 더 써 주세요.");
  if (text.length > 4000) throw new BadRequestError("4,000자까지 쓸 수 있어요.");
  useQuota(e.app, e.auth.id, "plan");
  const days = e.app.findRecordsByFilter("days", "trip = {:t}", "n", 0, 0, { t: tripId })
    .map((d) => ({ n: d.getInt("n"), date: d.getString("date").slice(0, 10), city: d.getString("city") }));
  const schema = {
    type: "object", additionalProperties: false, required: ["days"],
    properties: { days: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["n", "items"],
      properties: {
        n: { type: "integer" },
        items: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["time", "title", "cat", "place", "memo"],
          properties: {
            time: { type: "string", description: "HH:MM if the text gives a time, otherwise empty" },
            title: { type: "string" },
            cat: { type: "string", enum: ["flight", "move", "stay", "food", "cafe", "sight", "trek", "shop", "etc"] },
            place: { type: "string", description: "a specific place name to search on a map, or empty if no concrete place" },
            memo: { type: "string", description: "short extra detail from the text, or empty" },
          },
        } },
      },
    } } },
  };
  const result = askJson(
    "너는 여행 일정 정리 도우미야. 사용자가 날짜별로 쓴 글을 일정 항목으로 나눠. 글에 없는 일정이나 시간은 지어내지 마. "
      + "'첫째 날', '1일차', 날짜 표현을 여행 날짜 목록의 n으로 맞춰. 시간이 '오후 3시쯤'이면 15:00처럼 쓰고, '아침'처럼 애매하면 비워. "
      + "제목은 한국어로 짧게, 장소는 지도에서 찾을 수 있는 고유한 이름만 넣어(현지어나 영어 이름이 있으면 그걸로).",
    [{ type: "input_text", text: "여행 날짜: " + JSON.stringify(days) + "\n\n사용자 글:\n" + text }],
    "plan", schema,
  );
  const valid = new Set(days.map((d) => d.n));
  return e.json(200, { days: (result.days || []).filter((d) => valid.has(d.n)) });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/trips/{id}/apply-plan", (e) => {
  const { requirePerm } = require(`${__hooks}/lib/ai.js`);
  const { takeSnapshot } = require(`${__hooks}/lib/snapshots.js`);
  requirePerm(e, "ai");
  const tripId = e.request.pathValue("id");
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 할 수 있어요."); }
  const body = e.requestInfo().body;
  const mode = body.mode === "replace" ? "replace" : "append";
  const CATS = ["flight", "move", "stay", "food", "cafe", "sight", "trek", "shop", "etc"];
  const plan = (body.days || []).filter((d) => d && d.day && Array.isArray(d.items) && d.items.length);
  if (!plan.length) throw new BadRequestError("넣을 일정이 없어요.");
  let added = 0;
  const dayRecs = {};
  for (const d of plan) {
    const rec = e.app.findRecordById("days", String(d.day));
    if (rec.getString("trip") !== tripId) throw new BadRequestError("다른 여행의 날짜예요.");
    dayRecs[d.day] = rec;
  }
  const { subj } = require(`${__hooks}/lib/snapshots.js`);
  const by = subj(e.auth.getString("name") || "일행");
  const dayNames = plan.map((d) => dayRecs[d.day].getInt("n") + "일차").join(", ");
  e.app.runInTransaction((tx) => {
    takeSnapshot(tx, tripId, e.auth.id, mode === "replace" ? `${by} AI로 ${dayNames} 일정을 바꿈` : `${by} AI로 ${dayNames}에 일정 추가`, plan.map((d) => String(d.day)));
    const col = tx.findCollectionByNameOrId("items");
    for (const d of plan) {
      let order = 0;
      if (mode === "replace") {
        for (const r of tx.findRecordsByFilter("items", "day = {:d}", "", 0, 0, { d: d.day })) tx.delete(r);
        for (const r of tx.findRecordsByFilter("groups", "day = {:d}", "", 0, 0, { d: d.day })) tx.delete(r);
      } else {
        for (const r of tx.findRecordsByFilter("items", "day = {:d} && group = ''", "", 0, 0, { d: d.day })) order = Math.max(order, r.getInt("order"));
        for (const r of tx.findRecordsByFilter("groups", "day = {:d}", "", 0, 0, { d: d.day })) order = Math.max(order, r.getInt("order"));
      }
      for (const it of d.items.slice(0, 40)) {
        const title = String(it.title || "").trim().slice(0, 200);
        if (!title) continue;
        const r = new Record(col);
        r.set("trip", tripId);
        r.set("day", d.day);
        r.set("order", ++order);
        r.set("time", /^\d{2}:\d{2}$/.test(String(it.time || "")) ? it.time : "");
        r.set("cat", CATS.includes(it.cat) ? it.cat : "etc");
        r.set("title", title);
        r.set("place", String(it.place || "").slice(0, 200));
        r.set("placeId", String(it.placeId || "").slice(0, 200));
        if (typeof it.lat === "number" && typeof it.lng === "number") { r.set("lat", it.lat); r.set("lng", it.lng); }
        r.set("memo", String(it.memo || "").slice(0, 2000));
        tx.save(r);
        added++;
      }
    }
  });
  return e.json(200, { added });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/snapshots/{id}/restore", (e) => {
  const { takeSnapshot, restoreDays } = require(`${__hooks}/lib/snapshots.js`);
  const snap = e.app.findRecordById("trip_snapshots", e.request.pathValue("id"));
  const tripId = snap.getString("trip");
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 할 수 있어요."); }
  const data = JSON.parse(snap.getString("data") || "{}");
  const dayIds = (data.days || []).map((d) => d.day).filter((d) => { try { e.app.findRecordById("days", d); return true; } catch (_) { return false; } });
  data.days = (data.days || []).filter((d) => dayIds.includes(d.day));
  if (!dayIds.length) throw new BadRequestError("그 날짜가 이제 없어서 되돌릴 수 없어요.");
  const { subj } = require(`${__hooks}/lib/snapshots.js`);
  const by = subj(e.auth.getString("name") || "일행");
  e.app.runInTransaction((tx) => {
    // the current state is kept first, so a restore can be undone too
    takeSnapshot(tx, tripId, e.auth.id, `${by} 되돌리기 직전 상태`, dayIds);
    restoreDays(tx, tripId, data);
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// ---- outfits ----

routerAdd("GET", "/api/outfits/people", (e) => {
  const tripId = String(e.request.url.query().get("trip") || "");
  const perms = e.auth.get("perms") || [];
  if (!perms.includes("outfits")) throw new ForbiddenError("코디는 관리자가 켜 준 사람만 쓸 수 있어요.");
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 볼 수 있어요."); }
  const people = [];
  for (const m of e.app.findRecordsByFilter("trip_members", "trip = {:t}", "", 0, 0, { t: tripId })) {
    const u = e.app.findRecordById("users", m.getString("user"));
    if (!(u.get("perms") || []).includes("outfits")) continue;
    people.push({ user: u.id, name: m.getString("displayName"), avatar: u.get("look") || null });
  }
  return e.json(200, people);
}, $apis.requireAuth("users"));

/** Saves an avatar look for yourself, or for a trip partner who also uses outfits (photo with both). */
routerAdd("POST", "/api/avatar", (e) => {
  const body = e.requestInfo().body;
  const target = String(body.user || e.auth.id);
  const myPerms = e.auth.get("perms") || [];
  if (!myPerms.includes("outfits")) throw new ForbiddenError("코디는 관리자가 켜 준 사람만 쓸 수 있어요.");
  const u = e.app.findRecordById("users", target);
  if (target !== e.auth.id) {
    if (!(u.get("perms") || []).includes("outfits")) throw new ForbiddenError("그 사람은 코디를 쓰지 않아요.");
    const mine = e.app.findRecordsByFilter("trip_members", "user = {:u}", "", 0, 0, { u: e.auth.id }).map((m) => m.getString("trip"));
    const theirs = e.app.findRecordsByFilter("trip_members", "user = {:u}", "", 0, 0, { u: target }).map((m) => m.getString("trip"));
    if (!mine.some((t) => theirs.includes(t))) throw new ForbiddenError("같은 여행의 일행만 만들어 줄 수 있어요.");
  }
  const l = body.look || {};
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d);
  const look = {
    body: l.body === "f" ? "f" : "m",
    build: ["slim", "avg", "broad"].includes(l.build) ? l.build : "avg",
    hair: ["short", "bob", "long", "tied"].includes(l.hair) ? l.hair : "short",
    hairColor: hex(l.hairColor, "#1f1b1a"),
    skin: hex(l.skin, "#f1cfb5"),
  };
  u.set("look", look);
  e.app.saveNoValidate(u);
  return e.json(200, look);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/ai/avatar", (e) => {
  const { requirePerm, useQuota, askJson } = require(`${__hooks}/lib/ai.js`);
  requirePerm(e, "ai");
  requirePerm(e, "outfits");
  const image = String(e.requestInfo().body.image || "");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new BadRequestError("사진 형식을 읽을 수 없어요. JPG나 PNG로 골라 주세요.");
  if (image.length > 3 * 1024 * 1024) throw new BadRequestError("사진이 너무 커요.");
  useQuota(e.app, e.auth.id, "avatar");
  const person = {
    type: "object", additionalProperties: false, required: ["position", "body", "build", "hair", "hairColor", "skin", "summary"],
    properties: {
      position: { type: "integer", description: "1 = leftmost person" },
      body: { type: "string", enum: ["m", "f"] },
      build: { type: "string", enum: ["slim", "avg", "broad"] },
      hair: { type: "string", enum: ["short", "bob", "long", "tied"] },
      hairColor: { type: "string", enum: ["#1f1b1a", "#3b2a22", "#6b4630", "#a87b4f"] },
      skin: { type: "string", enum: ["#f6dcc8", "#f3d3bd", "#e3b796", "#c99673"] },
      summary: { type: "string", description: "짧은 한국어 설명, 예: 남자, 보통 체격, 짧은 검은 머리" },
    },
  };
  // the photo is only sent to the model; nothing is stored
  const result = askJson(
    "사진 속 사람(최대 2명)의 겉모습을 만화 아바타용으로만 요약해. 성별처럼 보이는 모습, 체격, 머리 모양과 색, 피부 톤만 고르고, 누구인지 추측하거나 다른 정보는 말하지 마.",
    [{ type: "input_text", text: "왼쪽부터 번호를 매겨 줘." }, { type: "input_image", image_url: image }],
    "people", { type: "object", additionalProperties: false, required: ["people"], properties: { people: { type: "array", items: person } } },
  );
  return e.json(200, { people: (result.people || []).slice(0, 2) });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/ai/clothes", (e) => {
  const { requirePerm, useQuota, askJson } = require(`${__hooks}/lib/ai.js`);
  requirePerm(e, "ai");
  const lines = (e.requestInfo().body.lines || []).map((l) => String(l).slice(0, 80)).filter(Boolean).slice(0, 12);
  const types = (e.requestInfo().body.types || []).map(String).slice(0, 60);
  const colors = (e.requestInfo().body.colors || []).map(String).slice(0, 40);
  if (!lines.length) return e.json(200, { items: [] });
  useQuota(e.app, e.auth.id, "clothes");
  const result = askJson(
    "옷 이름을 아바타가 그릴 수 있는 종류와 색으로 바꿔. 목록에 딱 맞는 게 없으면 가장 비슷한 걸 고르고, 옷이 아니면 type을 none으로 해.",
    [{ type: "input_text", text: "옷: " + JSON.stringify(lines) }],
    "clothes", {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["text", "type", "color"],
        properties: { text: { type: "string" }, type: { type: "string", enum: types.concat(["none"]) }, color: { type: "string", enum: colors } },
      } } },
    },
  );
  return e.json(200, { items: result.items || [] });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/ai/coord", (e) => {
  const { requirePerm, useQuota, askJson } = require(`${__hooks}/lib/ai.js`);
  requirePerm(e, "ai");
  requirePerm(e, "outfits");
  const body = e.requestInfo().body;
  const dayId = String(body.day || "");
  const day = e.app.findRecordById("days", dayId);
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: day.getString("trip"), u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 할 수 있어요."); }
  const looks = e.app.findRecordsByFilter("outfits", "day = {:d}", "", 0, 0, { d: dayId }).map((o) => {
    const m = e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: day.getString("trip"), u: o.getString("user") });
    return { who: m.getString("displayName"), clothes: (o.get("items") || []).map((i) => i.text) };
  });
  if (!looks.length) throw new BadRequestError("아직 정한 코디가 없어요.");
  useQuota(e.app, e.auth.id, "coord");
  const result = askJson(
    "커플 여행 코디를 보고 두세 문장으로 짧게 조언해. 날씨에 맞는지(비, 추위), 둘의 색이 잘 어울리는지만 말하고, 바꾸면 좋을 것 하나를 구체적으로 제안해. 다정하고 담백한 존댓말로.",
    [{ type: "input_text", text: `${day.getInt("n")}일차 ${day.getString("city")} 일정 "${day.getString("title")}". 날씨: ${String(body.weather || "모름").slice(0, 200)}. 코디: ${JSON.stringify(looks)}` }],
    "coord", { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
  );
  return e.json(200, { text: String(result.text || "").slice(0, 400) });
}, $apis.requireAuth("users"));

cronAdd("ai_usage_cleanup", "40 4 * * *", () => {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().replace("T", " ");
  $app.db().newQuery("DELETE FROM ai_usage WHERE created < {:c}").bind({ c: cutoff }).execute();
});
