import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.jpg", "robots.txt"],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,gif,webp,woff,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "subday — specialty coffee subscriptions",
        short_name: "subday",
        description: "Specialty coffee & HoReCa subscriptions. Grab your drinks fast and save more.",
        theme_color: "#f5f0e8",
        background_color: "#FAF9F6",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/favicon.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor-split: стабильные библиотеки уезжают в отдельные чанки —
        // грузятся параллельно и кэшируются между релизами (assets immutable),
        // так что при деплое пользователь перекачивает только код приложения.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          // Тяжёлые либы, нужные только на отдельных lazy-страницах, НЕ кладём в
          // общий vendor (иначе они грузились бы при старте) — Rollup сам оставит
          // их в чанке той страницы, которая их импортирует.
          if (/node_modules[\\/](html5-qrcode|@dnd-kit|qrcode\.react|react-day-picker|input-otp|cmdk|vaul|react-resizable-panels|embla-carousel)/.test(id)) return;
          // Отдельно выносим ТОЛЬКО библиотеки без зависимости от React —
          // React и все react-зависимые либы обязаны жить в одном чанке,
          // иначе interop ломается («Cannot read forwardRef of undefined»).
          if (id.includes("@supabase")) return "vendor-supabase";
          if (/node_modules[\\/](@firebase|firebase)[\\/]/.test(id)) return "vendor-firebase";
          if (/node_modules[\\/]lottie-web[\\/]/.test(id)) return "vendor-lottie";
          return "vendor";
        },
      },
    },
  },
}));
