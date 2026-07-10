import { vi } from "vitest";

/** jsdom은 matchMedia 미구현 — standalone 판정 등 마운트 시 필요한 스텁(App.test.tsx·goldenPath.test.tsx·
 *  OnboardingScreen.test.tsx 중복 통합, Stage1-R T2). */
export function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
