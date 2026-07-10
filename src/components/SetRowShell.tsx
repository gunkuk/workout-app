import type { ReactNode } from "react";

export type SetRowShellProps = {
  /** 결정론적 SetRecord id — data-testid 조합에 사용 */
  id: string;
  onClick: () => void;
  children: ReactNode;
};

/**
 * FreeInputSetRow·SteppedSetRow가 공유하는 바깥 셸(role/tabIndex/data-testid/최소높이 스타일) —
 * 두 분기가 byte-identical하게 반복하던 wrapper div를 추출(Stage1-R T5). 클릭 시맨틱·자식 마크업은
 * 각 leaf 컴포넌트 책임.
 */
export function SetRowShell({ id, onClick, children }: SetRowShellProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`setrow-${id}`}
      onClick={onClick}
      style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}
    >
      {children}
    </div>
  );
}
