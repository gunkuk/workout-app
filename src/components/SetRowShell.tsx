import type { ReactNode } from "react";

export type SetRowShellProps = {
  /** 결정론적 SetRecord id — data-testid 조합에 사용 */
  id: string;
  onClick: () => void;
  /** 목표 셀 + 조정 셀(leaf가 순서대로 2개 요소를 렌더 — 4열 그리드의 2·3번 트랙과 매칭) */
  children: ReactNode;
  /** 완료 상태 표시(체크 원 채움 + aria-label="완료됨") — 순수 스타일용, 시맨틱은 이 prop 하나로 유지 */
  completed?: boolean;
  /** 1열(배지) — 세트번호 muted 텍스트 / AMRAP "F" / 워밍업 "W" (호출부가 완성된 노드로 전달) */
  badge: ReactNode;
};

/**
 * FreeInputSetRow·SteppedSetRow가 공유하는 바깥 셸(role/tabIndex/data-testid/최소높이 스타일) —
 * 두 분기가 byte-identical하게 반복하던 wrapper div를 추출(Stage1-R T5).
 * UI v2(Boostcamp 클론) — 4열 그리드[배지|목표|조정|체크원]로 재구성(Stage1-UI2). 완료 표시(구 별도
 * "완료" pill)를 체크 원 하나로 통합해 aria-label="완료됨"을 그대로 이 위치에서 낸다 — 기존 테스트가
 * `row.querySelector('[aria-label="완료됨"]')`로 찾는 대상은 요소 위치가 바뀌어도 동일하게 성립.
 * 클릭 시맨틱·자식 마크업(목표/조정 내부)은 각 leaf 컴포넌트 책임.
 */
export function SetRowShell({ id, onClick, children, completed, badge }: SetRowShellProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`setrow-${id}`}
      onClick={onClick}
      className={`set-row-shell${completed ? " is-completed" : ""}`}
    >
      {badge}
      {children}
      <span className={`set-check${completed ? " is-checked" : ""}`} aria-label={completed ? "완료됨" : undefined}>
        {completed ? "✓" : ""}
      </span>
    </div>
  );
}
