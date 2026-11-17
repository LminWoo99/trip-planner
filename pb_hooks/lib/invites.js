// Shared by the invite routes (route handlers run in separate VMs, so they require() this).

/** The caller must own the trip. Returns the trip record. */
function ownTrip(e, tripId) {
  const trip = e.app.findRecordById("trips", tripId);
  try {
    e.app.findFirstRecordByFilter("trip_members", "trip = {:t} && user = {:u} && role = 'owner'", { t: trip.id, u: e.auth.id });
  } catch (_) {
    throw new ForbiddenError("여행을 만든 사람만 할 수 있어요.");
  }
  return trip;
}

function inviteByToken(e, token) {
  const hash = $security.sha256(String(token || ""));
  let inv;
  try { inv = e.app.findFirstRecordByData("trip_invites", "tokenHash", hash); } catch (_) {
    throw new NotFoundError("초대 링크가 바뀌었거나 없어요. 초대한 사람에게 새 링크를 받아 주세요.");
  }
  if (new Date(inv.getString("expires").replace(" ", "T")).getTime() < Date.now()) {
    throw new NotFoundError("초대 링크 기간(1주)이 지났어요. 초대한 사람에게 새 링크를 받아 주세요.");
  }
  return inv;
}

module.exports = { ownTrip, inviteByToken };
