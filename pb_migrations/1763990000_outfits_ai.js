/// <reference path="../pb_data/types.d.ts" />

// Couple outfits, AI usage records, and restore points taken before AI changes a schedule.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  // how someone's avatar looks: { body, build, hair, hairColor, skin }
  users.fields.add(new JSONField({ name: "look", maxSize: 2000 }));
  app.save(users);

  const trips = app.findCollectionByNameOrId("trips");
  const days = app.findCollectionByNameOrId("days");
  const member = '@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
  const canOutfit = member + ' && @request.auth.perms ~ "outfits"';

  app.save(new Collection({
    type: "base",
    name: "outfits",
    listRule: canOutfit,
    viewRule: canOutfit,
    // only your own outfit; the trip and day must not be swapped later
    createRule: canOutfit + " && user = @request.auth.id",
    updateRule: canOutfit + " && (user = @request.auth.id || (@request.body.items:isset = false && @request.body.user:isset = false)) && @request.body.trip:isset = false && @request.body.day:isset = false",
    deleteRule: canOutfit + " && user = @request.auth.id",
    fields: [
      { name: "trip", type: "relation", required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
      { name: "day", type: "relation", required: true, collectionId: days.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "items", type: "json", maxSize: 20000 },
      // user ids who said the pair goes well together
      { name: "likedBy", type: "json", maxSize: 2000 },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_outfits_day_user ON outfits (day, user)"],
  }));

  app.save(new Collection({
    type: "base",
    name: "ai_usage",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "kind", type: "select", required: true, values: ["plan", "clothes", "coord", "avatar"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_ai_usage_user_created ON ai_usage (user, created)"],
  }));

  app.save(new Collection({
    type: "base",
    name: "trip_snapshots",
    listRule: member,
    viewRule: member,
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "trip", type: "relation", required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "label", type: "text", max: 200 },
      // { days: [{ day, items: [...], groups: [...] }] } — photos are not part of it
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_trip_snapshots_trip ON trip_snapshots (trip, created)"],
  }));

  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.concat([
    { label: "POST /api/ai/plan", audience: "", duration: 60, maxRequests: 5 },
    { label: "POST /api/ai/avatar", audience: "", duration: 60, maxRequests: 5 },
  ]);
  app.save(settings);
}, (app) => {
  for (const n of ["trip_snapshots", "ai_usage", "outfits"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) { /* gone */ }
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("look");
  app.save(users);
});
