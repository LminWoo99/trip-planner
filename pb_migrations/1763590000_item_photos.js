/// <reference path="../pb_data/types.d.ts" />

// Photos attached to a schedule item's memo. Protected: only signed-in members can fetch them (file token).
migrate((app) => {
  const c = app.findCollectionByNameOrId("items");
  c.fields.add(new FileField({
    name: "photos",
    maxSelect: 6,
    maxSize: 8 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    thumbs: ["240x240", "1200x0"],
    protected: true,
  }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("items");
  c.fields.removeByName("photos");
  app.save(c);
});
