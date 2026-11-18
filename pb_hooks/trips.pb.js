/// <reference path="../pb_data/types.d.ts" />

// Trip lifecycle that plain collection rules can't express safely:
// creating a trip also adds both people and one day per date; changing dates never drops days that have plans.
// (Each handler runs in its own VM, so helpers live inside the handlers.)

routerAdd("POST", "/api/trips", (e) => {
  const body = e.requestInfo().body;
  const title = String(body.title || "").trim();
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(body.start || "");
  const end = String(body.end || "");
  if (!title || title.length > 100) throw new BadRequestError("여행 이름을 1~100자로 적어 주세요.");
  if (!DAY.test(start) || !DAY.test(end)) throw new BadRequestError("날짜를 다시 골라 주세요.");
  const a = new Date(start + "T00:00:00Z");
  const b = new Date(end + "T00:00:00Z");
  const count = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (!(count >= 1 && count <= 60)) throw new BadRequestError("여행 기간은 1일에서 60일 사이로 정해 주세요.");
  const domestic = body.region === "domestic";
  const currency = domestic ? "KRW" : String(body.currency || "VND");
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError("나라를 다시 골라 주세요.");
  // rates come from the phone (today's rate); keep them sane, they can be fixed later in settings
  const rate = (v, d, lo, hi) => { const n = Number(v); return n > lo && n < hi ? n : d; };
  const localKrw = domestic ? 1 : rate(body.localKrw, 0, 0, 100000);
  const usdKrw = rate(body.usdKrw, 1395, 100, 100000);

  let tripId = "";
  $app.runInTransaction((tx) => {
    const trip = new Record(tx.findCollectionByNameOrId("trips"));
    trip.set("title", title);
    trip.set("start", start + " 00:00:00.000Z");
    trip.set("end", end + " 00:00:00.000Z");
    trip.set("region", domestic ? "domestic" : "abroad");
    trip.set("currency", currency);
    trip.set("localKrw", localKrw);
    trip.set("usdKrw", usdKrw);
    trip.set("budget", 0);
    tx.save(trip);
    tripId = trip.id;

    // only the creator joins; others come in through an invite link and the owner's approval
    const m = new Record(tx.findCollectionByNameOrId("trip_members"));
    m.set("trip", trip.id);
    m.set("user", e.auth.id);
    m.set("displayName", e.auth.getString("name") || e.auth.getString("username"));
    m.set("role", "owner");
    tx.save(m);

    const daysCol = tx.findCollectionByNameOrId("days");
    for (let i = 0; i < count; i++) {
      const d = new Date(a.getTime() + i * 86400000).toISOString().slice(0, 10);
      const day = new Record(daysCol);
      day.set("trip", trip.id);
      day.set("n", i + 1);
      day.set("date", d + " 00:00:00.000Z");
      tx.save(day);
    }

    const note = new Record(tx.findCollectionByNameOrId("notes"));
    note.set("trip", trip.id);
    note.set("text", "");
    tx.save(note);
  });
  return e.json(200, { id: tripId });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/trips/{id}/dates", (e) => {
  const id = e.request.pathValue("id");
  try {
    e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: id, u: e.auth.id });
  } catch (_) {
    throw new NotFoundError("여행을 찾을 수 없어요.");
  }
  const body = e.requestInfo().body;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(body.start || "");
  const end = String(body.end || "");
  if (!DAY.test(start) || !DAY.test(end)) throw new BadRequestError("날짜를 다시 골라 주세요.");
  const a = new Date(start + "T00:00:00Z");
  const b = new Date(end + "T00:00:00Z");
  const count = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (!(count >= 1 && count <= 60)) throw new BadRequestError("여행 기간은 1일에서 60일 사이로 정해 주세요.");
  const wanted = [];
  for (let i = 0; i < count; i++) wanted.push(new Date(a.getTime() + i * 86400000).toISOString().slice(0, 10));

  $app.runInTransaction((tx) => {
    const days = tx.findRecordsByFilter("days", "trip = {:t}", "date", 0, 0, { t: id });
    const byDate = {};
    for (const d of days) byDate[d.getString("date").slice(0, 10)] = d;

    // a day that falls outside the new range is removed only if nothing is planned on it
    for (const date of Object.keys(byDate)) {
      if (wanted.indexOf(date) >= 0) continue;
      const day = byDate[date];
      const used = tx.findRecordsByFilter("items", "day = {:d}", "", 1, 0, { d: day.id }).length
        + tx.findRecordsByFilter("groups", "day = {:d}", "", 1, 0, { d: day.id }).length;
      if (used > 0) throw new BadRequestError(`${date.slice(5).replace("-", "/")}에 일정이 있어서 그 날짜는 뺄 수 없어요. 일정을 먼저 옮겨 주세요.`);
    }
    for (const date of Object.keys(byDate)) {
      if (wanted.indexOf(date) < 0) tx.delete(byDate[date]);
    }
    // renumber in two passes so the unique (trip, n) index never collides
    const daysCol = tx.findCollectionByNameOrId("days");
    const kept = wanted.filter((d) => byDate[d]);
    kept.forEach((d, i) => { byDate[d].set("n", 1000 + i); tx.save(byDate[d]); });
    wanted.forEach((d, i) => {
      const day = byDate[d] || new Record(daysCol);
      if (!byDate[d]) { day.set("trip", id); day.set("date", d + " 00:00:00.000Z"); }
      day.set("n", i + 1);
      tx.save(day);
    });

    const trip = tx.findRecordById("trips", id);
    trip.set("start", start + " 00:00:00.000Z");
    trip.set("end", end + " 00:00:00.000Z");
    tx.save(trip);
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

routerAdd("DELETE", "/api/trips/{id}", (e) => {
  const id = e.request.pathValue("id");
  try {
    e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: id, u: e.auth.id });
  } catch (_) {
    throw new NotFoundError("여행을 찾을 수 없어요.");
  }
  // everything in the trip goes with it (cascadeDelete on every trip relation)
  $app.delete($app.findRecordById("trips", id));
  return e.noContent(204);
}, $apis.requireAuth("users"));
