import type { CorrectionRecord, SessionCompleted } from "../domain/types.ts";
import { sortByAtId } from "../domain/order";

/**
 * 진행 위치 뒤로 이동(Stage1-UI9) — SessionCompleted는 삭제하지 않고(append-only + 백업
 * id-union 병합 계약 보존) CorrectionRecord.supersedes로 "취소(revoked)" 표시해 역방향 이동을
 * 구현한다. 이 파일은 store 계층 전용 최소 판정 — src/domain/corrections.ts의
 * winnersByRoot(정정 체인까지 따라가는 범용 로직)와 달리, 여기선 "그 세션 id를 직접 supersedes한
 * 정정들" 중 (at, id) 최신 1건만 본다(체인 없음, 스펙에 맞춘 단순화).
 *
 * Latest-wins: 같은 세션을 대상으로 한 정정이 여럿이면 가장 최신(sortByAtId 기준) 것의
 * revoked 값이 승리 — 즉 나중 정정이 revoked:true 없이 오면 그 이전 취소를 되돌린다(un-revoke).
 *
 * 알려진 한계 — fold/analytics(동결 도메인, src/domain/fold.ts·analytics.ts)는 이 취소를 모른다.
 * 즉 revoked된 세션도 fold 타임라인·analytics 집계에 그대로 남는다. fast-forward가 만든 빈
 * 완료 마커(SetRecord 없음)를 되돌리는 경우는 무해하다(세트가 없으니 판정도 없음). 하지만 실제
 * 기록이 있던 세션을 취소하면 그 세션이 이미 반영한 TM 판정·analytics 기여는 그대로 남는다 —
 * 필요하면 사용자가 설정 화면에서 TM을 수동으로 맞춰야 한다.
 */
export function revokedSessionIds(
  sessions: SessionCompleted[],
  corrections: CorrectionRecord[],
): Set<string> {
  const sessionIds = new Set(sessions.map((s) => s.id));
  const bySession = new Map<string, CorrectionRecord[]>();
  for (const c of corrections) {
    if (!sessionIds.has(c.supersedes)) continue;
    const list = bySession.get(c.supersedes);
    if (list) list.push(c);
    else bySession.set(c.supersedes, [c]);
  }

  const revoked = new Set<string>();
  for (const [sessionId, list] of bySession) {
    const latest = sortByAtId(list).at(-1)!;
    if (latest.revoked === true) revoked.add(sessionId);
  }
  return revoked;
}

/** revokedSessionIds에 해당하지 않는 세션만 남긴다 — 순서·나머지 필드는 원본 그대로. */
export function activeSessions(
  sessions: SessionCompleted[],
  corrections: CorrectionRecord[],
): SessionCompleted[] {
  const revoked = revokedSessionIds(sessions, corrections);
  return sessions.filter((s) => !revoked.has(s.id));
}
