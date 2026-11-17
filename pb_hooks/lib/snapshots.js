// Restore points: the items and forks of some days, saved before AI changes them.

const ITEM_FIELDS = ["order", "time", "cat", "title", "place", "placeId", "lat", "lng", "memo", "cost", "cur", "link", "done", "group", "branch", "stops", "booking"];
const GROUP_FIELDS = ["order", "title", "decideAt", "branches", "selected", "selectedBy", "selectedAt"];

function pick(rec, fields) {
  const o = { id: rec.id };
  for (const f of fields) o[f] = rec.get(f);
  return o;
}

function takeSnapshot(app, tripId, byId, label, dayIds) {
  const days = dayIds.map((d) => ({
    day: d,
    items: app.findRecordsByFilter("items", "day = {:d}", "order", 0, 0, { d }).map((r) => pick(r, ITEM_FIELDS)),
    groups: app.findRecordsByFilter("groups", "day = {:d}", "order", 0, 0, { d }).map((r) => pick(r, GROUP_FIELDS)),
  }));
  const s = new Record(app.findCollectionByNameOrId("trip_snapshots"));
  s.set("trip", tripId);
  if (byId) s.set("by", byId);
  s.set("label", label.slice(0, 200));
  s.set("data", { days });
  app.save(s);
  // keep the latest 30 per trip
  const all = app.findRecordsByFilter("trip_snapshots", "trip = {:t}", "-created", 0, 0, { t: tripId });
  for (const old of all.slice(30)) app.delete(old);
  return s;
}

/** Puts the saved items and forks of each day back, replacing what is there now. */
function restoreDays(app, tripId, data) {
  for (const d of data.days || []) {
    for (const r of app.findRecordsByFilter("items", "day = {:d}", "", 0, 0, { d: d.day })) app.delete(r);
    for (const r of app.findRecordsByFilter("groups", "day = {:d}", "", 0, 0, { d: d.day })) app.delete(r);
    const groupIds = {};
    const gCol = app.findCollectionByNameOrId("groups");
    for (const g of d.groups || []) {
      const r = new Record(gCol);
      r.set("trip", tripId);
      r.set("day", d.day);
      for (const f of GROUP_FIELDS) r.set(f, g[f]);
      app.save(r);
      groupIds[g.id] = r.id;
    }
    const iCol = app.findCollectionByNameOrId("items");
    for (const it of d.items || []) {
      const r = new Record(iCol);
      r.set("trip", tripId);
      r.set("day", d.day);
      for (const f of ITEM_FIELDS) r.set(f, it[f]);
      r.set("group", it.group ? groupIds[it.group] || "" : "");
      app.saveNoValidate(r);
    }
  }
}

/** Name with the right subject particle: 민우 → 민우가, 려진 → 려진이. */
function subj(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 && code % 28 > 0;
  return name + (batchim ? "이" : "가");
}

module.exports = { takeSnapshot, restoreDays, subj };
