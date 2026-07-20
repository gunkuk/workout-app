/** 초 단위 값을 "mm:ss"로 포맷(UI11) — ActivityTimer/SetRow duration 표시/HistoryScreen breakdown 공용.
 * 음수·NaN은 0으로 방어(외부에서 잘못된 타임스탬프 차가 들어와도 화면이 깨지지 않게). */
export function formatDuration(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
