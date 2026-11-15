/// <reference path="../pb_data/types.d.ts" />

// Ordered waypoints for one schedule item (e.g. a trekking course): [{ name, placeId, lat, lng }]
migrate((app) => {
  const c = app.findCollectionByNameOrId("items");
  c.fields.add(new JSONField({ name: "stops", maxSize: 50000 }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("items");
  c.fields.removeByName("stops");
  app.save(c);
});
