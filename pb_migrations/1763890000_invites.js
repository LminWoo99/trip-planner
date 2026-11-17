/// <reference path="../pb_data/types.d.ts" />

// Invite links and join requests. Only custom routes touch these (all rules locked).
migrate((app) => {
  const trips = app.findCollectionByNameOrId("trips");
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "trip_invites",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "trip", type: "relation", required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
      // only the SHA-256 of the link token is stored
      { name: "tokenHash", type: "text", required: true, max: 64 },
      { name: "expires", type: "date", required: true },
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_trip_invites_hash ON trip_invites (tokenHash)"],
  }));
  app.save(new Collection({
    type: "base",
    name: "join_requests",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "trip", type: "relation", required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "status", type: "select", required: true, values: ["pending", "approved", "rejected"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_join_requests_trip_user ON join_requests (trip, user)"],
  }));
}, (app) => {
  for (const n of ["join_requests", "trip_invites"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) { /* gone */ }
  }
});
