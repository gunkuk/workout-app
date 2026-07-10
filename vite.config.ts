/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" — GitHub Pages 저장소 이름이 아직 확정되지 않아 상대 경로로 둔다.
// Plan C2 배포 단계에서 실제 repo명이 정해지면 "/repo-name/"으로 재검토할 것.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "운동 추적기",
        short_name: "운동추적기",
        theme_color: "#111111",
        icons: [
          {
            // TODO: 실제 아이콘 파일 아직 없음 — public/icon-192.png 추가 시 유효해짐 (Plan C2 또는 이전 태스크에서 처리).
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["fake-indexeddb/auto"],
  },
});
