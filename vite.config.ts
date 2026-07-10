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
            // 스크립트 생성(단색 배경+원, 신규 devDep 없이 Node zlib로 직접 PNG 인코딩) — Stage1-C3 T5.
            // 생성 스크립트는 스크래치에서 1회 실행 후 산출물만 커밋(디자인 자산 아님, 실물 존재 확보가 목적).
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
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
