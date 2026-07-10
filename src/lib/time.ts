/** ISO 8601 타임스탬프 생성 — ProposalCard/OnboardingScreen/TodayScreen의 중복 정의를 통합(Stage1-R T1). */
export function nowISO(): string {
  return new Date().toISOString();
}
