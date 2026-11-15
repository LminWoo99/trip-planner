/// <reference path="../pb_data/types.d.ts" />

// Shared wallet: deposits into it (kind=deposit) and spending from it (fromPool, no personal payer).
migrate((app) => {
  const c = app.findCollectionByNameOrId("expenses");
  c.fields.add(new SelectField({ name: "kind", maxSelect: 1, values: ["spend", "deposit"] }));
  c.fields.add(new BoolField({ name: "fromPool" }));
  const payer = c.fields.getByName("payer");
  payer.required = false;
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("expenses");
  c.fields.removeByName("kind");
  c.fields.removeByName("fromPool");
  app.save(c);
});
