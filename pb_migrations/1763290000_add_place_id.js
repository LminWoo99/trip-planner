/// <reference path="../pb_data/types.d.ts" />

// Google Places id for items and places (exact place for links; stored per Google's terms).
migrate((app) => {
  for (const name of ["items", "places"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.add(new TextField({ name: "placeId", max: 300 }));
    app.save(c);
  }
}, (app) => {
  for (const name of ["items", "places"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.removeByName("placeId");
    app.save(c);
  }
});
