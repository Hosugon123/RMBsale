import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

const buildId = process.env.BUILD_ID || `${pkg.version}-${Date.now()}`;

function buildMetaPlugin(id: string) {
  return {
    name: "build-meta",
    closeBundle() {
      writeFileSync(resolve("dist", "build-meta.json"), JSON.stringify({ buildId: id }, null, 0));
    }
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId)
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      },
      "/health": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    buildMetaPlugin(buildId),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.png", "apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        runtimeCaching: []
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
