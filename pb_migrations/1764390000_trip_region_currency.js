/// <reference path="../pb_data/types.d.ts" />

// Domestic or abroad trips, and the local money of each trip (it used to be Vietnamese dong only).
migrate((app) => {
  const CUR = ["KRW", "USD", "VND", "JPY", "THB", "TWD", "CNY", "HKD", "SGD", "PHP", "IDR", "MYR", "LAK", "EUR", "GBP", "AUD"];
  const trips = app.findCollectionByNameOrId("trips");
  trips.fields.add(new SelectField({ name: "region", maxSelect: 1, values: ["abroad", "domestic"] }));
  trips.fields.add(new SelectField({ name: "currency", maxSelect: 1, values: CUR }));
  trips.fields.add(new NumberField({ name: "localKrw", min: 0 }));
  // where a trip is and its money are fixed when it is made (places and amounts depend on them)
  if (trips.updateRule !== null) trips.updateRule = `(${trips.updateRule}) && @request.body.region:isset = false && @request.body.currency:isset = false`;
  app.save(trips);
  for (const t of app.findAllRecords("trips")) {
    t.set("region", "abroad");
    t.set("currency", "VND");
    t.set("localKrw", t.getFloat("vndKrw") || 0.053);
    app.saveNoValidate(t);
  }
  for (const name of ["items", "expenses"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.getByName("cur").values = CUR;
    app.save(c);
  }
}, (app) => {
  const trips = app.findCollectionByNameOrId("trips");
  for (const n of ["region", "currency", "localKrw"]) trips.fields.removeByName(n);
  if (trips.updateRule) trips.updateRule = trips.updateRule.replace(/^\((.*)\) && @request\.body\.region:isset = false && @request\.body\.currency:isset = false$/, "$1");
  app.save(trips);
});
