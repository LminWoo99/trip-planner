// Small helpers shared by hooks (each hook runs in its own VM, so they require() this file).

/** Writes one sign-in / sign-up event for the admin page. Never throws. */
function logAuth(app, req, kind, user, username) {
  try {
    const col = app.findCollectionByNameOrId("auth_events");
    const r = new Record(col);
    if (user) r.set("user", user.id);
    r.set("username", String(username || (user ? user.getString("username") : "")).slice(0, 40));
    r.set("kind", kind);
    // record events carry the HTTP request on requestEvent; router events have it directly
    const http = req.request || (req.requestEvent && req.requestEvent.request);
    const header = (k) => (http ? String(http.header.get(k) || "") : "");
    r.set("ip", maskIp(req.realIP()));
    r.set("country", header("CF-IPCountry").slice(0, 8));
    r.set("ua", header("User-Agent").slice(0, 300));
    app.save(r);
  } catch (err) {
    console.log("auth event not saved:", err);
  }
}

/** 121.134.5.67 → 121.134.5.x, IPv6 keeps the first four groups. */
function maskIp(ip) {
  ip = String(ip || "");
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".x";
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + ":…";
  return ip;
}

/** Remembers when someone last used the app, at most every 10 minutes. */
function touchLastSeen(app, user) {
  try {
    const last = user.getDateTime("lastSeen");
    if (!last.isZero() && Date.now() - new Date(last.string().replace(" ", "T")).getTime() < 10 * 60 * 1000) return;
    const fresh = app.findRecordById("users", user.id);
    fresh.set("lastSeen", new Date().toISOString().replace("T", " "));
    app.saveNoValidate(fresh);
  } catch (err) {
    console.log("lastSeen not saved:", err);
  }
}

function isAdmin(auth) {
  return !!auth && auth.collection().name === "users" && auth.getString("role") === "admin";
}

module.exports = { logAuth, maskIp, touchLastSeen, isAdmin };
