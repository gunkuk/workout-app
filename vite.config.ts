/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: 기본 "./"(로컬 dev/build 무변경). GitHub Pages 배포 시 VITE_BASE 환경변수로
// "/저장소명/"을 오버라이드(CI 워크플로가 저장소명으로 자동 설정 — docs/deploy.md 참고).
// vite.config.ts는 Node에서 실행되므로 process.env 접근 가능(브라우저 번들과 무관).
export default defineConfig({
  base: process.env.VITE_BASE ?? "./",
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
