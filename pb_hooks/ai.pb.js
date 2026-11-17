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
    people.push({ user: u.id, name: m.getString("displayName"), avatar: u.get("look") || null, face: u.getString("face") });
  }
  return e.json(200, people);
}, $apis.requireAuth("users"));

/** Saves an avatar look for yourself, or for a trip partner who also uses outfits (photo with both). */
routerAdd("POST", "/api/avatar", (e) => {
  const { personYouCanEdit } = require(`${__hooks}/lib/ai.js`);
  const body = e.requestInfo().body;
  const u = personYouCanEdit(e, String(body.user || e.auth.id));
  const l = body.look || {};
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d);
  const look = {
    body: l.body === "f" ? "f" : "m",
    build: ["slim", "avg", "broad"].includes(l.build) ? l.build : "avg",
    height: Math.max(140, Math.min(200, Math.round(Number(l.height) || (l.body === "f" ? 162 : 175)))),
    hairStyle: /^[a-z_]{2,20}$/.test(String(l.hairStyle)) ? String(l.hairStyle) : (l.body === "f" ? "straight" : "dandy"),
    glasses: l.glasses === "round" || l.glasses === "square" ? l.glasses : "",
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
  const styles = (e.requestInfo().body.hairStyles || []).map(String).filter((x) => /^[a-z_]{2,20}$/.test(x)).slice(0, 40);
  if (!styles.length) throw new BadRequestError("머리 스타일 목록이 필요해요.");
  const person = {
    type: "object", additionalProperties: false, required: ["position", "body", "build", "hairStyle", "glasses", "hairColor", "skin", "summary"],
    properties: {
      position: { type: "integer", description: "1 = leftmost person" },
      body: { type: "string", enum: ["m", "f"] },
      build: { type: "string", enum: ["slim", "avg", "broad"] },
      hairStyle: { type: "string", enum: styles },
      glasses: { type: "string", enum: ["none", "round", "square"], description: "look carefully at the eyes; any visible frame counts" },
      hairColor: { type: "string", enum: ["#1f1b1a", "#3b2a22", "#6b4630", "#a87b4f"] },
      skin: { type: "string", enum: ["#f6dcc8", "#f3d3bd", "#e3b796", "#c99673"] },
      summary: { type: "string", description: "짧은 한국어 설명, 예: 남자, 보통 체격, 쉼표머리, 동그란 안경" },
    },
  };
  // the photo is only sent to the model; nothing is stored
  const result = askJson(
    "사진 속 사람(최대 2명, 왼쪽부터)의 겉모습을 만화 아바타용 값으로만 골라. 누구인지 추측하거나 다른 정보는 말하지 마. "
      + "안경은 눈 주변을 꼼꼼히 보고 테가 조금이라도 보이면 있다고 해. 머리 스타일은 앞머리 모양(내린 앞머리, 가르마, 올린 머리), 옆머리 길이, 뒷머리 길이, 컬을 보고 목록에서 가장 가까운 것을 골라. "
      + "목록 뜻: dandy 댄디컷, twoblock 투블럭, comma 쉼표머리, partperm 가르마펌, leaf 리프컷, azperm 애즈펌, crop 크롭컷, pomade 포마드, wolf 장발·울프컷, hippie_m 짧은 히피펌, "
      + "tassel 태슬컷, cbob C컬 단발, hush 허쉬컷, layered 레이어드컷, straight 긴 생머리, build 빌드펌, hippie_f 히피펌, pony 포니테일, bun 똥머리, half 반묶음.",
    [{ type: "input_text", text: "왼쪽부터 번호를 매겨 줘." }, { type: "input_image", image_url: image }],
    "people", { type: "object", additionalProperties: false, required: ["people"], properties: { people: { type: "array", items: person } } },
  );
  return e.json(200, { people: (result.people || []).slice(0, 2) });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/ai/clothes", (e) => {
  const { requirePerm, useQuota, askJson } = require(`${__hooks}/lib/ai.js`);
  requirePerm(e, "ai");
  const body = e.requestInfo().body;
  const lines = (body.lines || []).map((l) => String(l).slice(0, 80)).filter(Boolean).slice(0, 12);
  const colors = (body.colors || []).map(String).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 40);
  if (!lines.length) return e.json(200, { items: [] });
  useQuota(e.app, e.auth.id, "clothes");
  const en = (vals, desc) => ({ type: "string", enum: ["-"].concat(vals), description: desc + " (해당 없으면 -)" });
  const item = {
    type: "object", additionalProperties: false,
    required: ["text", "slot", "label", "color", "sleeve", "length", "fit", "neck", "closure", "texture", "pattern", "shape", "detail", "style"],
    properties: {
      text: { type: "string" },
      slot: { type: "string", enum: ["outer", "top", "bottom", "dress", "shoes", "hat", "acc", "none"], description: "옷이 아니면 none" },
      label: { type: "string", description: "짧은 한국어 이름, 예: 조끼 원피스" },
      color: { type: "string", enum: colors.length ? colors : ["#9ba0a7"] },
      sleeve: en(["none", "short", "long"], "상의·겉옷·원피스 소매"),
      length: en(["crop", "waist", "hip", "thigh", "knee", "ankle"], "기장"),
      fit: en(["slim", "regular", "wide"], "핏"),
      neck: en(["crew", "v", "collar", "turtle", "hood"], "목 모양"),
      closure: en(["none", "zip", "buttons", "open"], "여밈"),
      texture: en(["plain", "quilted", "rib", "denim", "fleece", "leather"], "질감"),
      pattern: en(["none", "stripe", "check", "dot", "floral"], "무늬"),
      shape: en(["pants", "skirt"], "하의 모양"),
      detail: en(["none", "cargo", "cuff", "crease"], "하의 디테일"),
      style: en(["sneaker", "runner", "boot", "trek", "sandal", "slipper", "loafer", "clog", "heel", "cap", "beanie", "bucket", "scarf", "crossbag", "backpack", "sunglasses"], "신발·모자·소품 종류"),
    },
  };
  const result = askJson(
    "옷 표현을 만화 아바타가 그릴 수 있는 특징값으로 바꿔. 색은 목록에서 가장 가까운 것을 고르고, 표현에 색이 없으면 그 옷의 흔한 색을 골라. 특징은 그 옷의 보통 모양대로 채워.",
    [{ type: "input_text", text: "옷: " + JSON.stringify(lines) }],
    "clothes", { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: item } } },
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

// ---- AI pictures: a face from a photo, then full-body drawings in each day's clothes ----

/** Makes a 3D emoji-style face of one person in the photo. Nothing is stored; the client shows it and saves it if liked. */
routerAdd("POST", "/api/ai/face", (e) => {
  const { requirePerm, useQuota } = require(`${__hooks}/lib/ai.js`);
  const { picture, editImage } = require(`${__hooks}/lib/image.js`);
  requirePerm(e, "ai");
  requirePerm(e, "outfits");
  const body = e.requestInfo().body;
  const photo = picture(body.image, 3 * 1024 * 1024);
  const count = Math.max(1, Math.min(2, Number(body.count) || 1));
  const position = Math.max(1, Math.min(count, Number(body.position) || 1));
  const hint = String(body.summary || "").slice(0, 200);
  const note = String(body.note || "").slice(0, 200);
  useQuota(e.app, e.auth.id, "face");
  const who = count > 1 ? (position === 1 ? "the person on the left" : "the person on the right") : "the person";
  const image = editImage([photo],
    `Create a cute 3D emoji-style avatar head of ${who} in this photo${hint ? ` (${hint})` : ""}, in the style of a smartphone 3D emoji avatar `
      + "(glossy soft 3D render, big rounded head, simple friendly features, soft studio lighting). Keep their real hairstyle, face shape and "
      + "glasses only if they actually wear glasses, so it resembles them. Front view, friendly natural smile, head and neck only, "
      + `on a plain solid white background, no text.${note ? ` Also: ${note}` : ""}`,
    "1024x1024");
  return e.json(200, { image });
}, $apis.requireAuth("users"));

/** Saves a face made by /api/ai/face for yourself or your trip partner. */
routerAdd("POST", "/api/avatar/face", (e) => {
  const { personYouCanEdit } = require(`${__hooks}/lib/ai.js`);
  const { picture, fileFromDataUrl } = require(`${__hooks}/lib/image.js`);
  const body = e.requestInfo().body;
  const u = personYouCanEdit(e, String(body.user || e.auth.id));
  u.set("face", fileFromDataUrl(picture(body.image), "face.webp"));
  e.app.saveNoValidate(u);
  return e.json(200, { face: u.getString("face") });
}, $apis.requireAuth("users"));

/** Draws a person's full body in their outfit for that day, from their saved face. */
routerAdd("POST", "/api/ai/render", (e) => {
  const { requirePerm, useQuota } = require(`${__hooks}/lib/ai.js`);
  const { editImage, fileFromDataUrl, recordFileDataUrl } = require(`${__hooks}/lib/image.js`);
  requirePerm(e, "ai");
  requirePerm(e, "outfits");
  let outfit;
  try { outfit = e.app.findRecordById("outfits", String(e.requestInfo().body.outfit || "")); } catch (_) { throw new NotFoundError("코디를 찾지 못했어요."); }
  try { e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: outfit.getString("trip"), u: e.auth.id }); } catch (_) { throw new ForbiddenError("이 여행의 일행만 그릴 수 있어요."); }
  const items = JSON.parse(outfit.getString("items") || "[]").filter((g) => g && g.text).map((g) => String(g.text).slice(0, 60)).slice(0, 12);
  if (!items.length) throw new BadRequestError("입을 옷을 먼저 정해 주세요.");
  const person = e.app.findRecordById("users", outfit.getString("user"));
  const face = recordFileDataUrl(e.app, person, "face");
  if (!face) throw new BadRequestError("얼굴을 먼저 만들어 주세요.");
  useQuota(e.app, e.auth.id, "render");
  const look = JSON.parse(person.getString("look") || "{}") || {};
  const build = { slim: "slim", broad: "broad-shouldered" }[look.build] || "average";
  const image = editImage([face],
    "Full-body 3D emoji-style avatar of this exact person (same face, hair and glasses as the reference picture), natural adult body proportions "
      + `with the head about one sixth of the height, ${build} build, standing straight, front view, arms relaxed at the sides, wearing exactly: ${items.join(", ")}. `
      + "Soft glossy 3D render like a smartphone emoji avatar, soft studio light, plain solid white background, "
      + "the whole body from hair to shoes visible and centered with a small margin, no text.",
    "1024x1536");
  outfit.set("render", fileFromDataUrl(image, "render.webp"));
  outfit.set("renderFor", items.join("\n"));
  e.app.saveNoValidate(outfit);
  return e.json(200, { render: outfit.getString("render"), renderFor: outfit.getString("renderFor") });
}, $apis.requireAuth("users"));
