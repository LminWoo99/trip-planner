/// <reference path="../pb_data/types.d.ts" />

// Ticket images on bookings (kept on the phone for offline use) and an optional item → booking link.
migrate((app) => {
  const bookings = app.findCollectionByNameOrId("bookings");
  bookings.fields.add(new FileField({
    name: "files",
    maxSelect: 6,
    maxSize: 10 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    thumbs: ["240x240"],
    protected: true,
  }));
  app.save(bookings);

  const items = app.findCollectionByNameOrId("items");
  items.fields.add(new RelationField({ name: "booking", collectionId: bookings.id, maxSelect: 1, cascadeDelete: false }));
  app.save(items);
}, (app) => {
  const items = app.findCollectionByNameOrId("items");
  items.fields.removeByName("booking");
  app.save(items);
  const bookings = app.findCollectionByNameOrId("bookings");
  bookings.fields.removeByName("files");
  app.save(bookings);
});
