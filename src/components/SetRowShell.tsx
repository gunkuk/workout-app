import type { ReactNode } from "react";

export type SetRowShellProps = {
  /** 결정론적 SetRecord id — data-testid 조합에 사용 */
  id: string;
  onClick: () => void;
  children: ReactNode;
  /** 완료 상태 표시(성공 색 좌측 보더) — 순수 스타일용, 시맨틱 무관 */
  completed?: boolean;
};

/**
 * FreeInputSetRow·SteppedSetRow가 공유하는 바깥 셸(role/tabIndex/data-testid/최소높이 스타일) —
 * 두 분기가 byte-identical하게 반복하던 wrapper div를 추출(Stage1-R T5). 클릭 시맨틱·자식 마크업은
 * 각 leaf 컴포넌트 책임.
 */
export function SetRowShell({ id, onClick, children, completed }: SetRowShellProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`setrow-${id}`}
      onClick={onClick}
      className={`set-row-shell${completed ? " is-completed" : ""}`}
    >
      {children}
    </div>
  );
}
