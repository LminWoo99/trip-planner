/// <reference path="../pb_data/types.d.ts" />

// Accounts: username + password login replaces the shared-code gate.
// 민우 and 려진 keep their existing records (and trips); their current sessions stay valid.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "username", max: 20, pattern: "^[a-z0-9_]{4,20}$" }));
  users.fields.add(new SelectField({ name: "role", values: ["admin", "member"], maxSelect: 1 }));
  // features the admin turns on per person
  users.fields.add(new SelectField({ name: "perms", values: ["outfits", "ai"], maxSelect: 2 }));
  users.fields.add(new DateField({ name: "lastSeen" }));
  users.addIndex("idx_users_username", true, "username", "username != ''");
  // the two existing accounts use a 4-digit password; new sign-ups get a stricter rule in /api/signup
  users.fields.getByName("password").min = 4;
  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ["username"];
  users.authToken.duration = 60 * 60 * 24 * 90;
  app.save(users);

  // Existing people get a login from ACCOUNT_SETUP in the server's .env (never in the repo):
  //   ACCOUNT_SETUP=email:username:role:password,email:username:role:password
  const setup = String($os.getenv("ACCOUNT_SETUP") || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const entry of setup) {
    const [email, username, role, ...rest] = entry.split(":");
    const password = rest.join(":");
    if (!email || !username || !password) continue;
    let u;
    try { u = app.findAuthRecordByEmail("users", email); } catch (_) { continue; }
    // keep the signing key so tokens already on their phones remain valid
    const key = u.tokenKey();
    u.set("username", username);
    u.set("role", role === "admin" ? "admin" : "member");
    u.set("perms", ["outfits", "ai"]);
    u.setPassword(password);
    app.save(u);
    // saving a new password rotates the signing key; put the old one back in a second save
    u.setTokenKey(key);
    app.save(u);
  }

  // sign-in and sign-up history for the admin page (written by hooks only)
  app.save(new Collection({
    type: "base",
    name: "auth_events",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "username", type: "text", max: 40 },
      { name: "kind", type: "select", values: ["login_ok", "login_fail", "signup"], maxSelect: 1, required: true },
      { name: "ip", type: "text", max: 64 },
      { name: "country", type: "text", max: 8 },
      { name: "ua", type: "text", max: 300 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_auth_events_created ON auth_events (created)"],
  }));

  // the shared-code gate is gone; rate-limit login and sign-up instead
  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules
    .filter((r) => !r.label.startsWith("POST /api/gate/"))
    .concat([
      { label: "POST /api/collections/users/auth-with-password", audience: "", duration: 60, maxRequests: 5 },
      { label: "POST /api/signup", audience: "", duration: 60, maxRequests: 5 },
    ]);
  settings.rateLimits.enabled = true;
  app.save(settings);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const n of ["username", "role", "perms", "lastSeen"]) users.fields.removeByName(n);
  users.removeIndex("idx_users_username");
  users.passwordAuth.enabled = false;
  app.save(users);
  try { app.delete(app.findCollectionByNameOrId("auth_events")); } catch (_) { /* already gone */ }
});
