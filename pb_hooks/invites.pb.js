/// <reference path="../pb_data/types.d.ts" />

// Invite flow: owner makes a link → invitee signs in and asks to join → owner approves.

routerAdd("POST", "/api/trips/{id}/invite", (e) => {
  const { ownTrip } = require(`${__hooks}/lib/invites.js`);
  const trip = ownTrip(e, e.request.pathValue("id"));
  // one live link per trip: making a new one blocks the old one
  for (const old of e.app.findRecordsByFilter("trip_invites", "trip = {:t}", "", 0, 0, { t: trip.id })) e.app.delete(old);
  const token = $security.randomString(24);
  const expires = new Date(Date.now() + 7 * 86400000);
  const inv = new Record(e.app.findCollectionByNameOrId("trip_invites"));
  inv.set("trip", trip.id);
  inv.set("tokenHash", $security.sha256(token));
  inv.set("expires", expires.toISOString().replace("T", " "));
  inv.set("createdBy", e.auth.id);
  e.app.save(inv);
  return e.json(200, { token, expires: expires.toISOString() });
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/invites/{token}", (e) => {
  const { inviteByToken } = require(`${__hooks}/lib/invites.js`);
  const inv = inviteByToken(e, e.request.pathValue("token"));
  const trip = e.app.findRecordById("trips", inv.getString("trip"));
  const members = e.app.findRecordsByFilter("trip_members", "trip = {:t}", "", 0, 0, { t: trip.id });
  const owner = members.find((m) => m.getString("role") === "owner");
  let status = "none";
  if (members.some((m) => m.getString("user") === e.auth.id)) status = "member";
  else {
    try {
      status = e.app.findFirstRecordByFilter("join_requests", "trip = {:t} && user = {:u}", { t: trip.id, u: e.auth.id }).getString("status");
    } catch (_) { /* no request yet */ }
  }
  const cities = [];
  for (const d of e.app.findRecordsByFilter("days", "trip = {:t}", "n", 0, 0, { t: trip.id })) {
    for (const c of d.getString("city").split("→").map((x) => x.trim()).filter(Boolean)) if (!cities.includes(c)) cities.push(c);
  }
  return e.json(200, {
    tripId: trip.id,
    title: trip.getString("title"),
    start: trip.getString("start").slice(0, 10),
    end: trip.getString("end").slice(0, 10),
    cities: cities.slice(0, 4),
    members: members.map((m) => m.getString("displayName")),
    inviter: owner ? owner.getString("displayName") : "",
    status,
  });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/invites/{token}/request", (e) => {
  const { inviteByToken } = require(`${__hooks}/lib/invites.js`);
  const inv = inviteByToken(e, e.request.pathValue("token"));
  const tripId = inv.getString("trip");
  try {
    e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id });
    return e.json(200, { status: "member" });
  } catch (_) { /* not a member yet */ }
  let req;
  try {
    req = e.app.findFirstRecordByFilter("join_requests", "trip = {:t} && user = {:u}", { t: tripId, u: e.auth.id });
  } catch (_) {
    req = new Record(e.app.findCollectionByNameOrId("join_requests"));
    req.set("trip", tripId);
    req.set("user", e.auth.id);
  }
  // a fresh link lets someone who was turned down ask again
  req.set("status", "pending");
  e.app.save(req);
  return e.json(200, { status: "pending" });
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/trips/{id}/requests", (e) => {
  const { ownTrip } = require(`${__hooks}/lib/invites.js`);
  const trip = ownTrip(e, e.request.pathValue("id"));
  const reqs = e.app.findRecordsByFilter("join_requests", "trip = {:t} && status = 'pending'", "created", 0, 0, { t: trip.id });
  e.app.expandRecords(reqs, ["user"], null);
  return e.json(200, reqs.map((r) => {
    const u = r.expandedOne("user");
    return { id: r.id, name: u ? u.getString("name") : "", username: u ? u.getString("username") : "", created: r.getString("created") };
  }));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/requests/{id}/decide", (e) => {
  const { ownTrip } = require(`${__hooks}/lib/invites.js`);
  const req = e.app.findRecordById("join_requests", e.request.pathValue("id"));
  ownTrip(e, req.getString("trip"));
  if (req.getString("status") !== "pending") throw new BadRequestError("이미 처리한 요청이에요.");
  const approve = !!e.requestInfo().body.approve;
  e.app.runInTransaction((tx) => {
    req.set("status", approve ? "approved" : "rejected");
    tx.save(req);
    if (approve) {
      const u = tx.findRecordById("users", req.getString("user"));
      const m = new Record(tx.findCollectionByNameOrId("trip_members"));
      m.set("trip", req.getString("trip"));
      m.set("user", u.id);
      m.set("displayName", u.getString("name") || u.getString("username"));
      m.set("role", "member");
      tx.save(m);
    }
  });
  return e.json(200, { status: approve ? "approved" : "rejected" });
}, $apis.requireAuth("users"));

/** For the trip list: my pending asks, and how many people wait on the trips I own. */
routerAdd("GET", "/api/me/invites", (e) => {
  const mine = e.app.findRecordsByFilter("join_requests", "user = {:u} && status = 'pending'", "-created", 0, 0, { u: e.auth.id });
  e.app.expandRecords(mine, ["trip"], null);
  const owned = e.app.findRecordsByFilter("trip_members", "user = {:u} && role = 'owner'", "", 0, 0, { u: e.auth.id }).map((m) => m.getString("trip"));
  const waiting = {};
  for (const t of owned) {
    const n = e.app.countRecords("join_requests", $dbx.hashExp({ trip: t, status: "pending" }));
    if (n) waiting[t] = n;
  }
  return e.json(200, {
    pending: mine.map((r) => { const t = r.expandedOne("trip"); return { tripId: r.getString("trip"), title: t ? t.getString("title") : "" }; }),
    waiting,
  });
}, $apis.requireAuth("users"));
