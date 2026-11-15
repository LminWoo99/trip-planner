import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "web",
  // shown in 더보기 so a phone can tell whether it already runs the latest deploy
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")) },
  envDir: "..", // VITE_GOOGLE_MAPS_KEY lives in the repo-root .env (not in git)
  build: { outDir: "../pb_public", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8090", changeOrigin: false } },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered in app/updater.ts (update checks + safe reload)
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "답답해서 직접 만든다",
        short_name: "우❤️리오 여행",
        description: "둘이 같이 채우는 여행 일정",
        lang: "ko",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // take over open tabs as soon as a new version is installed; app/updater.ts reloads safely
        skipWaiting: true,
        clientsClaim: true,
        // fonts are split into ~90 unicode-range chunks; cache the ones actually used instead of all of them
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          // protected photos: the token in the query changes, so match on the path only.
          // thumbnails and full size share a path, so each size gets its own cache.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/files/items/") && url.searchParams.get("thumb") === "240x240",
            handler: "CacheFirst",
            options: { cacheName: "photos-thumb", matchOptions: { ignoreSearch: true }, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/files/items/") && url.searchParams.get("thumb") !== "240x240",
            handler: "CacheFirst",
            options: { cacheName: "photos-full", matchOptions: { ignoreSearch: true }, expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/,
            handler: "NetworkFirst",
            options: { cacheName: "weather", networkTimeoutSeconds: 6 },
          },
        ],
      },
    }),
  ],
  test: { root: ".", include: ["web/src/**/*.test.ts"] },
});
