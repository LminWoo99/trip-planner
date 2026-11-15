/// <reference path="../pb_data/types.d.ts" />

// Initial schema. Every trip-scoped collection is visible only to members of that trip (deny by default).
migrate((app) => {
  // ---- users: no self sign-up, no password login (entry goes through the /api/gate route) ----
  const users = app.findCollectionByNameOrId("users");
  users.createRule = null;
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.updateRule = null;
  users.deleteRule = null;
  users.passwordAuth.enabled = false;
  users.authToken.duration = 60 * 60 * 24 * 30;
  app.save(users);

  const member = '@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
  const memberUpdate = member + " && @request.body.trip:isset = false";

  const save = (data) => {
    const c = new Collection(data);
    app.save(c);
    return c;
  };

  const trips = save({
    type: "base",
    name: "trips",
    // rules are set after trip_members exists (they use its back-relation)
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "title", type: "text", required: true, max: 100 },
      { name: "start", type: "date", required: true },
      { name: "end", type: "date", required: true },
      { name: "vndKrw", type: "number", min: 0 },
      { name: "usdKrw", type: "number", min: 0 },
      { name: "budget", type: "number", min: 0 },
    ],
  });

  const tripRel = () => ({ name: "trip", type: "relation", required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true });
  const autodate = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];

  const members = save({
    type: "base",
    name: "trip_members",
    listRule: member,
    viewRule: member,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      tripRel(),
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "displayName", type: "text", required: true, max: 30 },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["owner", "member"] },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_trip_members_trip_user ON trip_members (trip, user)"],
  });

  const tripMember = '@request.auth.id != "" && trip_members_via_trip.user ?= @request.auth.id';
  trips.listRule = tripMember;
  trips.viewRule = tripMember;
  trips.updateRule = tripMember; // rates, budget
  app.save(trips);

  const tripScoped = (name, fields, extra = {}) => save({
    type: "base",
    name,
    listRule: member,
    viewRule: member,
    createRule: member,
    updateRule: memberUpdate,
    deleteRule: member,
    fields: [tripRel(), ...fields, ...autodate],
    ...extra,
  });

  const CUR = ["VND", "KRW", "USD"];
  const BRANCH = ["A", "B", "C", "D"];

  const days = tripScoped("days", [
    { name: "n", type: "number", required: true, onlyInt: true, min: 1 },
    { name: "date", type: "date", required: true },
    { name: "city", type: "text", max: 100 },
    { name: "title", type: "text", max: 100 },
    { name: "stay", type: "text", max: 100 },
    { name: "memo", type: "text", max: 5000 },
  ], { indexes: ["CREATE UNIQUE INDEX idx_days_trip_n ON days (trip, n)"] });

  const dayRel = (required) => ({ name: "day", type: "relation", required, collectionId: days.id, maxSelect: 1, cascadeDelete: true });

  const groups = tripScoped("groups", [
    dayRel(true),
    { name: "order", type: "number", required: true },
    { name: "title", type: "text", required: true, max: 100 },
    { name: "decideAt", type: "text", max: 100 },
    // [{ key: "A", label, condition }]
    { name: "branches", type: "json", maxSize: 20000 },
    { name: "selected", type: "select", maxSelect: 1, values: BRANCH },
    { name: "selectedBy", type: "relation", collectionId: members.id, maxSelect: 1, cascadeDelete: false },
    { name: "selectedAt", type: "date" },
  ]);

  tripScoped("items", [
    dayRel(true),
    { name: "order", type: "number", required: true },
    { name: "time", type: "text", max: 5, pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    { name: "cat", type: "select", required: true, maxSelect: 1, values: ["flight", "move", "stay", "food", "cafe", "sight", "trek", "shop", "etc"] },
    { name: "title", type: "text", required: true, max: 200 },
    { name: "place", type: "text", max: 200 },
    { name: "lat", type: "number" },
    { name: "lng", type: "number" },
    { name: "memo", type: "text", max: 5000 },
    { name: "cost", type: "number", min: 0 },
    { name: "cur", type: "select", maxSelect: 1, values: CUR },
    { name: "link", type: "url" },
    { name: "done", type: "bool" },
    { name: "group", type: "relation", collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
    { name: "branch", type: "select", maxSelect: 1, values: BRANCH },
  ], { indexes: ["CREATE INDEX idx_items_day ON items (day)"] });

  tripScoped("places", [
    { name: "name", type: "text", required: true, max: 200 },
    { name: "city", type: "text", max: 100 },
    { name: "type", type: "text", max: 30 },
    { name: "q", type: "text", max: 200 },
    { name: "lat", type: "number" },
    { name: "lng", type: "number" },
    { name: "price", type: "text", max: 100 },
    { name: "memo", type: "text", max: 5000 },
    { name: "link", type: "url" },
    { name: "visited", type: "bool" },
  ]);

  tripScoped("expenses", [
    { name: "title", type: "text", required: true, max: 200 },
    { name: "amount", type: "number", required: true, min: 0 },
    { name: "cur", type: "select", required: true, maxSelect: 1, values: CUR },
    { name: "payer", type: "relation", required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false },
    { name: "split", type: "select", required: true, maxSelect: 1, values: ["half", "payer", "other"] },
    { name: "cat", type: "text", max: 30 },
    dayRel(false),
    { name: "memo", type: "text", max: 2000 },
  ]);

  tripScoped("checklist", [
    { name: "text", type: "text", required: true, max: 200 },
    { name: "cat", type: "text", max: 30 },
    { name: "who", type: "text", max: 30 },
    { name: "memo", type: "text", max: 2000 },
    { name: "done", type: "bool" },
    { name: "order", type: "number" },
  ]);

  tripScoped("bookings", [
    { name: "type", type: "select", required: true, maxSelect: 1, values: ["flight", "stay", "move", "tour", "etc"] },
    { name: "title", type: "text", required: true, max: 200 },
    { name: "when", type: "text", max: 100 },
    { name: "code", type: "text", max: 100 },
    { name: "memo", type: "text", max: 5000 },
    { name: "link", type: "url" },
  ]);

  tripScoped("notes", [
    { name: "text", type: "text", max: 20000 },
  ]);

  // ---- rate limit for the entry code ----
  const settings = app.settings();
  settings.rateLimits.enabled = true;
  // exact paths: a "/api/gate/" prefix label did not match custom routes in v0.40
  const gateRules = ["POST /api/gate/check", "POST /api/gate/enter"];
  settings.rateLimits.rules = [
    ...settings.rateLimits.rules.filter((r) => !gateRules.includes(r.label)),
    ...gateRules.map((label) => ({ label, audience: "", duration: 60, maxRequests: 5 })),
  ];
  app.save(settings);
}, (app) => {
  for (const name of ["notes", "bookings", "checklist", "expenses", "places", "items", "groups", "days", "trip_members", "trips"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* already gone */ }
  }
});
