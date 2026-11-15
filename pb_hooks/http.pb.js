/// <reference path="../pb_data/types.d.ts" />

// Compress responses (JS bundle, API JSON). Cloudflare also compresses, this covers direct access too.
routerUse($apis.gzip());

// Hashed build assets never change: let phones keep them.
routerUse((e) => {
  if (e.request.url.path.startsWith("/assets/")) {
    e.response.header().set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return e.next();
});
