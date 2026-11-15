/// <reference path="../pb_data/types.d.ts" />

// Entry by shared code. The code lives only in the TRIP_GATE_CODE env var, never in the repo.
// Both routes are rate limited by rules added in the init migration.

routerAdd("POST", "/api/gate/check", (e) => {
  const expected = $os.getenv("TRIP_GATE_CODE");
  const code = String(e.requestInfo().body.code || "");
  if (!expected || !$security.equal(code, expected)) {
    throw new BadRequestError("코드가 맞지 않아요.");
  }
  return e.json(200, { ok: true });
});

routerAdd("POST", "/api/gate/enter", (e) => {
  const expected = $os.getenv("TRIP_GATE_CODE");
  const body = e.requestInfo().body;
  const code = String(body.code || "");
  if (!expected || !$security.equal(code, expected)) {
    throw new BadRequestError("코드가 맞지 않아요.");
  }
  let user;
  try {
    user = $app.findFirstRecordByData("users", "name", String(body.who || ""));
  } catch (_) {
    throw new BadRequestError("누구인지 다시 골라 주세요.");
  }
  return $apis.recordAuthResponse(e, user, "gate");
});
