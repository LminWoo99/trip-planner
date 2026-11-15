/// <reference path="../pb_data/types.d.ts" />

// Compress responses (JS bundle, API JSON). Cloudflare also compresses, this covers direct access too.
routerUse($apis.gzip());

// Hashed build assets never change: let phones keep them.
// The app shell and service worker must always be re-checked so a deploy reaches phones quickly.
routerUse((e) => {
  const path = e.request.url.path;
  if (path.startsWith("/assets/")) {
    e.response.header().set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (path === "/" || path === "/index.html" || path === "/sw.js" || path.startsWith("/workbox-") || path === "/manifest.webmanifest") {
    e.response.header().set("Cache-Control", "no-cache");
  }
  return e.next();
});
