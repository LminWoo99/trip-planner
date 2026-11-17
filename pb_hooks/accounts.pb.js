/// <reference path="../pb_data/types.d.ts" />

// Sign-up, sign-in history and the admin API. Login itself is PocketBase's password auth on "username".

routerAdd("POST", "/api/signup", (e) => {
  const { logAuth } = require(`${__hooks}/lib/audit.js`);
  const body = e.requestInfo().body;
  const username = String(body.username || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  if (!/^[a-z0-9_]{4,20}$/.test(username)) throw new BadRequestError("아이디는 영문 소문자, 숫자, 밑줄로 4~20자여야 해요.");
  if (name.length < 1 || name.length > 20) throw new BadRequestError("이름은 1~20자로 써 주세요.");
  if (password.length < 8) throw new BadRequestError("비밀번호는 8자 이상이어야 해요.");
  if (/^\d+$/.test(password)) throw new BadRequestError("숫자만으로 된 비밀번호는 쓸 수 없어요. 영문이나 기호를 섞어 주세요.");
  if (password.length > 72) throw new BadRequestError("비밀번호는 72자까지 쓸 수 있어요.");
  try {
    e.app.findFirstRecordByData("users", "username", username);
    throw new BadRequestError("이미 쓰는 아이디예요.");
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }
  const user = new Record(e.app.findCollectionByNameOrId("users"));
  // the account has no real email; a unique placeholder satisfies the auth collection
  user.set("email", `${username}@users.trip.local`);
  user.set("emailVisibility", false);
  user.set("username", username);
  user.set("name", name);
  user.set("role", "member");
  user.set("perms", []);
  user.setPassword(password);
  e.app.save(user);
  logAuth(e.app, e, "signup", user, username);
  return $apis.recordAuthResponse(e, user, "password");
});

onRecordAuthWithPasswordRequest((e) => {
  const { logAuth, touchLastSeen } = require(`${__hooks}/lib/audit.js`);
  const identity = String(e.identity || "");
  try {
    e.next();
  } catch (err) {
    logAuth(e.app, e, "login_fail", null, identity);
    // one message for unknown id and wrong password alike
    throw new BadRequestError("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  logAuth(e.app, e, "login_ok", e.record, identity);
  touchLastSeen(e.app, e.record);
}, "users");

onRecordAuthRefreshRequest((e) => {
  e.next();
  const { touchLastSeen } = require(`${__hooks}/lib/audit.js`);
  touchLastSeen(e.app, e.record);
}, "users");

// ---- admin ----

routerAdd("GET", "/api/admin/overview", (e) => {
  const { isAdmin } = require(`${__hooks}/lib/audit.js`);
  if (!isAdmin(e.auth)) throw new ForbiddenError("관리자만 볼 수 있어요.");
  const users = e.app.findRecordsByFilter("users", "", "created", 500, 0);
  const tripCount = {};
  for (const m of e.app.findAllRecords("trip_members")) {
    const u = m.getString("user");
    tripCount[u] = (tripCount[u] || 0) + 1;
  }
  const events = e.app.findRecordsByFilter("auth_events", "", "-created", 100, 0);
  const names = {};
  for (const u of users) names[u.id] = u.getString("name");
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const aiUsage = {};
  for (const k of ["plan", "clothes", "avatar", "face", "render"]) {
    aiUsage[k] = e.app.countRecords("ai_usage", $dbx.exp("kind = {:k} AND created >= {:s}", { k, s: monthStart.toISOString().replace("T", " ") }));
  }
  return e.json(200, {
    users: users.map((u) => ({
      id: u.id,
      username: u.getString("username"),
      name: u.getString("name"),
      role: u.getString("role") || "member",
      perms: u.get("perms") || [],
      created: u.getString("created"),
      lastSeen: u.getString("lastSeen"),
      trips: tripCount[u.id] || 0,
    })),
    aiUsage,
    events: events.map((ev) => ({
      id: ev.id,
      kind: ev.getString("kind"),
      user: ev.getString("user"),
      name: names[ev.getString("user")] || "",
      username: ev.getString("username"),
      ip: ev.getString("ip"),
      country: ev.getString("country"),
      ua: ev.getString("ua"),
      created: ev.getString("created"),
    })),
  });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/admin/users/{id}/perms", (e) => {
  const { isAdmin } = require(`${__hooks}/lib/audit.js`);
  if (!isAdmin(e.auth)) throw new ForbiddenError("관리자만 바꿀 수 있어요.");
  const allowed = ["outfits", "ai"];
  const perms = (e.requestInfo().body.perms || []).filter((p) => allowed.includes(p));
  const user = e.app.findRecordById("users", e.request.pathValue("id"));
  user.set("perms", perms);
  e.app.saveNoValidate(user);
  return e.json(200, { id: user.id, perms });
}, $apis.requireAuth("users"));

// keep sign-in history to 90 days
cronAdd("auth_events_cleanup", "30 4 * * *", () => {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().replace("T", " ");
  $app.db().newQuery("DELETE FROM auth_events WHERE created < {:c}").bind({ c: cutoff }).execute();
});
