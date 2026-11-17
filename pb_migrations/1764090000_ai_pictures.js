/// <reference path="../pb_data/types.d.ts" />

// AI pictures: a face per person (the base for drawings) and a full-body drawing per outfit.
// Files live next to the database under pb_data/storage; only the file names are in the records.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new FileField({ name: "face", maxSelect: 1, maxSize: 3 * 1024 * 1024, mimeTypes: ["image/webp", "image/png", "image/jpeg"], protected: true }));
  app.save(users);

  const outfits = app.findCollectionByNameOrId("outfits");
  outfits.fields.add(new FileField({ name: "render", maxSelect: 1, maxSize: 4 * 1024 * 1024, mimeTypes: ["image/webp", "image/png", "image/jpeg"], protected: true }));
  // the clothes the drawing was made with; when items change the drawing is out of date
  outfits.fields.add(new TextField({ name: "renderFor", max: 4000 }));
  // drawings are made on the server only
  outfits.updateRule += " && @request.body.render:isset = false && @request.body.renderFor:isset = false";
  outfits.createRule += " && @request.body.render:isset = false && @request.body.renderFor:isset = false";
  app.save(outfits);

  const usage = app.findCollectionByNameOrId("ai_usage");
  const kind = usage.fields.getByName("kind");
  kind.values = ["plan", "clothes", "coord", "avatar", "face", "render"];
  app.save(usage);

  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.concat([
    { label: "POST /api/ai/face", audience: "", duration: 60, maxRequests: 6 },
    { label: "POST /api/ai/render", audience: "", duration: 60, maxRequests: 6 },
  ]);
  app.save(settings);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("face");
  app.save(users);
  const outfits = app.findCollectionByNameOrId("outfits");
  outfits.fields.removeByName("render");
  outfits.fields.removeByName("renderFor");
  const suffix = " && @request.body.render:isset = false && @request.body.renderFor:isset = false";
  outfits.updateRule = outfits.updateRule.replace(suffix, "");
  outfits.createRule = outfits.createRule.replace(suffix, "");
  app.save(outfits);
});
