import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "RYTC Photo Card",
        short_name: "RYTC Photo",
        description: "สร้างโปสการ์ดภาพถ่าย วิทยาลัยเทคนิคระยอง",
        theme_color: "#17804a",
        background_color: "#fffdf4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html"
      }
    })
  ]
});