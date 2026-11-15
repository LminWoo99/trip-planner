import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "web",
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
        // fonts are split into ~90 unicode-range chunks; cache the ones actually used instead of all of them
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/,
            handler: "NetworkFirst",
            options: { cacheName: "weather", networkTimeoutSeconds: 6 },
          },
          {
            // map tiles: keep what was seen so the trekking map works without signal
            urlPattern: /^https:\/\/[abc]?\.?tile\.(openstreetmap|opentopomap)\.org\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "tiles", expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  test: { root: ".", include: ["web/src/**/*.test.ts"] },
});
