/// <reference path="../pb_data/types.d.ts" />

// A full-body drawing in plain clothes per person and trip, shown on days without an outfit drawing.
// It lives on the trip membership so the other people in the trip can see it (users are private).
migrate((app) => {
  const members = app.findCollectionByNameOrId("trip_members");
  members.fields.add(new FileField({ name: "base", maxSelect: 1, maxSize: 4 * 1024 * 1024, mimeTypes: ["image/webp", "image/png", "image/jpeg"], protected: true }));
  app.save(members);

  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.concat([{ label: "POST /api/ai/base", audience: "", duration: 60, maxRequests: 6 }]);
  app.save(settings);
}, (app) => {
  const members = app.findCollectionByNameOrId("trip_members");
  members.fields.removeByName("base");
  app.save(members);
});
