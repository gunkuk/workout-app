import { isIOS } from "./platform";

export type WakeLockHandle = {
  /** 획득한 wake lock 해제 + visibilitychange 재획득 리스너 제거. */
  release: () => void;
  /** navigator.wakeLock API 자체가 없는 환경(구형 브라우저 등). */
  unsupported: boolean;
  /** iOS인데 Wake Lock API를 지원하는 18.4 미만 버전 — 스펙 §7 사전 안내 대상. */
  iosTooOld: boolean;
};

/** UA의 "OS 17_5" 형태에서 (major, minor)를 파싱. 실패 시 null(안내 미표시 — 과도한 경고 방지). */
function parseIOSVersion(ua: string): { major: number; minor: number } | null {
  const m = /OS (\d+)_(\d+)/.exec(ua);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

function isIOSTooOld(): boolean {
  if (!isIOS()) return false;
  const v = parseIOSVersion(navigator.userAgent);
  if (!v) return false;
  return v.major < 18 || (v.major === 18 && v.minor < 4);
}

/**
 * 화면 유지(Wake Lock) 획득 — 미지원 환경에서도 조용히 no-op(스펙 §7). visibilitychange로 탭이
 * 다시 보일 때 재획득(브라우저가 백그라운드 진입 시 잠금을 자동 해제하기 때문).
 */
export async function acquireWakeLock(): Promise<WakeLockHandle> {
  const iosTooOld = isIOSTooOld();
  const wakeLockApi = navigator.wakeLock;

  if (!wakeLockApi) {
    return { release: () => {}, unsupported: true, iosTooOld };
  }

  let sentinel: WakeLockSentinel | null = null;

  async function request(): Promise<void> {
    try {
      sentinel = (await wakeLockApi!.request("screen")) as WakeLockSentinel;
    } catch {
      // 권한 거부·미지원 등 — silent(스펙 §7).
    }
  }

  await request();

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      void request();
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    release: () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
      sentinel = null;
    },
    unsupported: false,
    iosTooOld,
  };
}
