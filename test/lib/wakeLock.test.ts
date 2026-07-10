import { describe, it, expect, vi, afterEach } from "vitest";
import { acquireWakeLock } from "../../src/lib/wakeLock";

afterEach(() => {
  // @ts-expect-error 테스트 간 navigator.wakeLock 스텁 정리
  delete navigator.wakeLock;
  vi.restoreAllMocks();
});

describe("acquireWakeLock", () => {
  it("① navigator.wakeLock 미지원 환경에서 크래시 없이 unsupported 플래그 반환", async () => {
    // jsdom 기본값 — navigator.wakeLock 자체가 없음(위 afterEach가 보장하지만 명시적으로도 확인).
    expect((navigator as { wakeLock?: unknown }).wakeLock).toBeUndefined();

    const handle = await acquireWakeLock();

    expect(handle.unsupported).toBe(true);
    expect(() => handle.release()).not.toThrow();
  });

  it("② visibilitychange(visible) 시 재획득 요청", async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
    });

    const handle = await acquireWakeLock();
    expect(handle.unsupported).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
    handle.release();
  });
});
