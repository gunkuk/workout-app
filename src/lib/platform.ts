/** iOS(iPhone/iPad) UA 판정 — OnboardingScreen/backup.ts의 중복 UA sniff를 통합(Stage1-R T1). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return ua.includes("iPhone") || ua.includes("iPad");
}
